import OpenAI from "openai";
import { faqBlob } from "@/lib/faq";
import {
  createOrderFromChat,
  fetchCategories,
  fetchProducts,
  isWooConfigured,
} from "@/lib/wooCommerce";
import type {
  GeneralInfoItem,
  Intent,
  QuotationLine,
  QuotationPayload,
  WooProductSummary,
} from "@/types/chat";

const MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  return new OpenAI({ apiKey: key });
}

export async function classifyIntent(params: {
  lastUserMessage: string;
  conversationSnippet: string;
}): Promise<{ intent: Intent; searchQuery: string }> {
  const client = getClient();
  const sys = `You classify customer messages for ComputechsLeb (computer/ecommerce).
Return compact JSON only: {"intent":"SALES"|"SUPPORT"|"QUOTATION"|"ACTION","searchQuery":"short optional product search string"}
Rules:
- QUOTATION if user asks for quotation, quote, price list, invoice-like offer, formal estimate, proforma, bulk pricing sheet.
- ACTION if user clearly wants to place/track/cancel an order or buy now with details (order placement flow).
- SUPPORT if troubleshooting, returns, warranty, shipping policy questions, account/help (no product browse).
- SALES for product recommendations, comparisons, "what should I buy", specs, general shopping.
searchQuery: keywords useful for WooCommerce product search (English or Arabic transliteration OK), else "".`;

  const user = `Last message: ${params.lastUserMessage}\nRecent thread:\n${params.conversationSnippet}`;

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  let parsed: { intent?: string; searchQuery?: string };
  try {
    parsed = JSON.parse(raw) as { intent?: string; searchQuery?: string };
  } catch {
    parsed = {};
  }

  const intent = normalizeIntent(parsed.intent, params.lastUserMessage);
  const searchQuery = typeof parsed.searchQuery === "string" ? parsed.searchQuery.trim() : "";
  return { intent, searchQuery };
}

function normalizeIntent(value: string | undefined, lastUser: string): Intent {
  const v = (value ?? "").toUpperCase();
  if (v === "SALES" || v === "SUPPORT" || v === "QUOTATION" || v === "ACTION") return v;

  const t = lastUser.toLowerCase();
  if (/\b(quote|quotation|price list|proforma|invoice|offer|estimate)\b/i.test(t)) return "QUOTATION";
  if (/\b(order|checkout|buy now|purchase|cod|cash on delivery)\b/i.test(t)) return "ACTION";
  if (/\b(return|warranty|shipping|delivery|support|help|broken|not working)\b/i.test(t)) return "SUPPORT";
  return "SALES";
}

async function loadCatalogContext(intent: Intent, searchQuery: string, lastUser: string) {
  let products: WooProductSummary[] = [];
  let categories: { id: number; name: string }[] = [];

  if (!isWooConfigured()) {
    return {
      products,
      categories,
      wooNote:
        "WooCommerce is not configured on the server — politely ask the shopper to browse the live catalog link from the site or contact staff; do NOT invent SKUs or prices.",
    };
  }

  try {
    if (intent === "SALES" || intent === "QUOTATION" || intent === "ACTION") {
      const q = searchQuery || lastUser;
      products = await fetchProducts({ search: q, per_page: intent === "QUOTATION" ? 24 : 12 });
      if (products.length === 0 && q) {
        products = await fetchProducts({ per_page: 12 });
      }
    }
    if (intent === "SALES") {
      categories = (await fetchCategories(40)).map((c) => ({ id: c.id, name: c.name }));
    }
  } catch {
    return {
      products,
      categories,
      wooNote:
        "Product lookup temporarily failed — apologize briefly and invite the customer to retry or share an exact model name.",
    };
  }

  return { products, categories, wooNote: "" };
}

function pickProductsForCards(intent: Intent, products: WooProductSummary[]): WooProductSummary[] {
  if (intent !== "SALES") return [];
  return products.slice(0, 3);
}

function extractProductIdsLine(text: string): number[] {
  const lines = text.split("\n");
  const row = [...lines].reverse().find((l) => /PRODUCT_IDS:\s*\[/.test(l));
  if (!row) return [];
  const m = row.match(/PRODUCT_IDS:\s*\[([\s\d,]*)\]/);
  if (!m?.[1]) return [];
  return m[1]
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

function stripProductIdsLine(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("PRODUCT_IDS:"))
    .join("\n")
    .trimEnd();
}

function pickProductsByIds(catalog: WooProductSummary[], ids: number[]): WooProductSummary[] {
  const map = new Map(catalog.map((p) => [p.id, p]));
  const out: WooProductSummary[] = [];
  for (const id of ids.slice(0, 3)) {
    const p = map.get(id);
    if (p) out.push(p);
  }
  return out;
}

export async function runAssistantTurn(params: {
  intent: Intent;
  messages: { role: "user" | "assistant"; content: string }[];
  searchQuery: string;
  lastUserMessage: string;
}): Promise<{
  text: string;
  products?: WooProductSummary[];
  quotation?: QuotationPayload | null;
  orderCreated?: { id: number; number: string } | null;
  generalInfo?: GeneralInfoItem[];
}> {
  const infoKinds = detectGeneralInfoRequests(params.lastUserMessage);
  if (infoKinds.length > 0) {
    return buildGeneralInfoResponse(infoKinds);
  }

  const client = getClient();
  const { products, categories, wooNote } = await loadCatalogContext(
    params.intent,
    params.searchQuery,
    params.lastUserMessage,
  );

  const productJson = JSON.stringify(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      permalink: p.permalink,
      short: (p.short_description ?? "").slice(0, 240),
    })),
  );

  const categoryJson = JSON.stringify(categories.slice(0, 40));

  const faq = faqBlob();

  const baseRules = `You are ComputechsLeb's concise ecommerce assistant.
Tone: helpful, short paragraphs, sales-aware but not pushy.
Never invent products, prices, SKUs, stock, coupons, or policies.
Only use catalog JSON for product facts when provided. If catalog empty, ask clarifying questions (budget, use-case) and suggest visiting product pages — no fake items.
Always steer toward a clear next step: answer → question → add-to-cart / contact / quotation / order details.
If unsure, ask one focused question.
${wooNote ? `\nSYSTEM NOTE: ${wooNote}` : ""}`;

  let instruction = "";

  if (params.intent === "SUPPORT") {
    instruction = `Intent: SUPPORT.
Answer using ONLY this FAQ knowledge (paraphrase OK). If the question is outside FAQ, say you cannot confirm policy and ask them to share order ID or contact human support — do not guess.
FAQ:
${faq}`;
  } else if (params.intent === "SALES") {
    instruction = `Intent: SALES.
Recommend at most 3 items from catalog JSON by id — reference exact names/prices from JSON only.
Ask one clarifying question about budget or primary use if needed.
Categories available (for filtering suggestions only, still verify via catalog): ${categoryJson}
After your reply, add exactly one final line: PRODUCT_IDS:[id1,id2,id3] using only numeric ids from catalog JSON (0–3 ids). If none fit, use PRODUCT_IDS:[].`;
  } else if (params.intent === "QUOTATION") {
    instruction = `Intent: QUOTATION.
The UI will show a formal quotation card with WhatsApp + PDF actions — still write a SHORT reply above it.
Use this outline in your reply (plain text / monospace ok): title line with store name, "Quotation", reference hint, date, "Bill to" (customer name — ask if missing), table-like rows for each line "qty × unit price = line total", subtotal line, optional notes, one line "Subject to confirmation."
Use ONLY catalog JSON items when naming products and prices; match productId when possible. If catalog empty or items unclear, ask which products/qty before fabricating numbers.
Always end with EXACTLY one machine-readable line (no markdown fences):
QUOTATION_JSON:{"customerName":string|null,"currency":"USD"|"EUR"|"LBP"|string,"lines":[{"name":string,"quantity":number,"unitPrice":number,"lineTotal":number,"productId":number|undefined}],"notes":string,"subtotal":number}
Compute lineTotal = quantity*unitPrice and subtotal = sum(lineTotal). Use WooCommerce prices from catalog when productId matches. If unknown customer name use null.`;
  } else {
    instruction = `Intent: ACTION (place order in WooCommerce).
Guide step-by-step: which product (must match catalog JSON by id + name), quantity, customer full name (split into first/last if known), phone (with country code when possible).
Ask one missing field per turn. Use only real product ids from catalog JSON.
When—and only when—you have productId, quantity (1–50), firstName, lastName (use "" if unknown), and phone, finish with a short thank-you line and add EXACTLY one final machine-readable line (no markdown fences):
ORDER_JSON:{"productId":number,"quantity":number,"firstName":string,"lastName":string,"phone":string}
The server will create a **pending** WooCommerce order; mention that payment is still required. Do not output ORDER_JSON until all fields are confirmed.`;
  }

  const sys = `${baseRules}\n\n${instruction}\nCatalog JSON:\n${productJson}`;

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    messages: [{ role: "system", content: sys }, ...params.messages.slice(-14)],
  });

  let text = res.choices[0]?.message?.content ?? "Sorry — I could not generate a reply. Please try again.";
  let quotation: QuotationPayload | null = null;
  let orderCreated: { id: number; number: string } | null = null;

  if (params.intent === "QUOTATION") {
    const parsed = extractQuotationJson(text);
    text = stripQuotationJsonLine(text);
    if (parsed) {
      quotation = buildQuotationPayload(parsed, products);
    }
  }

  if (params.intent === "ACTION") {
    const orderPayload = extractOrderJson(text);
    text = stripOrderJsonLine(text);
    if (orderPayload && isWooConfigured()) {
      const pid = Number(orderPayload.productId);
      let qty = Number(orderPayload.quantity);
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      const firstName = typeof orderPayload.firstName === "string" ? orderPayload.firstName : "";
      const lastName = typeof orderPayload.lastName === "string" ? orderPayload.lastName : "";
      const phone = typeof orderPayload.phone === "string" ? orderPayload.phone : "";
      if (Number.isFinite(pid) && pid > 0 && Number.isFinite(qty) && firstName.trim() && phone.trim()) {
        try {
          orderCreated = await createOrderFromChat({
            productId: pid,
            quantity: qty,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
          });
          text += `\n\n✅ WooCommerce **order #${orderCreated.number}** was created (pending payment). Our team may contact you to confirm.`;
        } catch (e) {
          const hint = e instanceof Error ? e.message : "Error";
          text += `\n\n⚠️ Could not create the order automatically (${hint}). Please check out on the website or call the store.`;
        }
      }
    } else if (orderPayload && !isWooConfigured()) {
      text += `\n\n⚠️ Orders cannot be created automatically because WooCommerce API is not configured on the server.`;
    }
  }

  if (params.intent === "SALES") {
    const ids = extractProductIdsLine(text);
    text = stripProductIdsLine(text);
    const picked = pickProductsByIds(products, ids);
    return {
      text,
      products: picked.length ? picked : pickProductsForCards(params.intent, products),
      orderCreated,
    };
  }

  const cards = pickProductsForCards(params.intent, products);

  return {
    text,
    products: cards.length ? cards : undefined,
    quotation,
    orderCreated,
  };
}

function detectGeneralInfoRequests(input: string): GeneralInfoItem["kind"][] {
  const text = input.toLowerCase();
  const wantsWhatsapp =
    /\b(whatsapp|wa\.me|phone|mobile|contact number)\b/.test(text) ||
    /(واتساب|واتس|رقم|تلفون|موبايل)/.test(text);
  const wantsEmail =
    /\b(email|e-mail|mail|contact email)\b/.test(text) || /(ايميل|بريد|البريد)/.test(text);
  const wantsLocation =
    /\b(location|address|map|google maps|directions|where)\b/.test(text) ||
    /(لوكيشن|موقع|عنوان|خريطة|وين)/.test(text);

  const kinds: GeneralInfoItem["kind"][] = [];
  if (wantsWhatsapp) kinds.push("whatsapp");
  if (wantsEmail) kinds.push("email");
  if (wantsLocation) kinds.push("location");
  return kinds;
}

function buildGeneralInfoResponse(kinds: GeneralInfoItem["kind"][]): {
  text: string;
  generalInfo: GeneralInfoItem[];
} {
  const whatsappDigits = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const whatsappUrl = whatsappDigits ? `https://wa.me/${whatsappDigits}` : "https://wa.me/";
  const email = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  const emailValue = email || "Email not configured yet";
  const emailUrl = email ? `mailto:${email}` : "mailto:";
  const mapUrl =
    (process.env.NEXT_PUBLIC_STORE_MAP_URL ?? "").trim() || "https://maps.google.com/?q=ComputechsLeb";
  const address = (process.env.NEXT_PUBLIC_STORE_ADDRESS ?? "").trim() || "Open map for store location";

  const cards: GeneralInfoItem[] = [];
  for (const kind of kinds) {
    if (kind === "whatsapp") {
      cards.push({
        kind,
        title: "WhatsApp",
        value: whatsappDigits || "Number not configured yet",
        url: whatsappUrl,
        ctaLabel: whatsappDigits ? "Open WhatsApp chat" : "Open WhatsApp",
      });
    } else if (kind === "email") {
      cards.push({
        kind,
        title: "Email",
        value: emailValue,
        url: emailUrl,
        ctaLabel: email ? "Send email" : "Email not configured",
      });
    } else if (kind === "location") {
      cards.push({
        kind,
        title: "Store location",
        value: address,
        url: mapUrl,
        ctaLabel: "Open map",
      });
    }
  }

  return {
    text: "Here are our contact details. Tap any card button to open WhatsApp, email, or map directions.",
    generalInfo: cards,
  };
}

function stripOrderJsonLine(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("ORDER_JSON:"))
    .join("\n")
    .trimEnd();
}

function extractOrderJson(text: string): OrderJsonParsed | null {
  const lines = text.split("\n");
  const row = [...lines].reverse().find((l) => l.includes("ORDER_JSON:"));
  if (!row) return null;
  const idx = row.indexOf("ORDER_JSON:");
  const jsonPart = row.slice(idx + "ORDER_JSON:".length).trim();
  try {
    return JSON.parse(jsonPart) as OrderJsonParsed;
  } catch {
    return null;
  }
}

type OrderJsonParsed = {
  productId?: number;
  quantity?: number;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

function stripQuotationJsonLine(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("QUOTATION_JSON:"))
    .join("\n")
    .trimEnd();
}

function extractQuotationJson(text: string): QuotationJsonParsed | null {
  const lines = text.split("\n");
  const row = [...lines].reverse().find((l) => l.includes("QUOTATION_JSON:"));
  if (!row) return null;
  const idx = row.indexOf("QUOTATION_JSON:");
  const jsonPart = row.slice(idx + "QUOTATION_JSON:".length).trim();
  try {
    return JSON.parse(jsonPart) as QuotationJsonParsed;
  } catch {
    return null;
  }
}

type QuotationJsonParsed = {
  customerName?: string | null;
  currency?: string;
  lines?: {
    name?: string;
    quantity?: number;
    unitPrice?: number;
    lineTotal?: number;
    productId?: number;
  }[];
  notes?: string;
  subtotal?: number;
};

function buildQuotationPayload(parsed: QuotationJsonParsed, catalog: WooProductSummary[]): QuotationPayload {
  const storeName = process.env.NEXT_PUBLIC_SITE_NAME ?? "ComputechsLeb";
  const linesIn = parsed.lines ?? [];
  const lines: QuotationLine[] = linesIn.map((l) => {
    const qty = Number.isFinite(l.quantity) ? Number(l.quantity) : 1;
    const unit = Number.isFinite(l.unitPrice) ? Number(l.unitPrice) : 0;
    const total =
      Number.isFinite(l.lineTotal) && l.lineTotal !== undefined
        ? Number(l.lineTotal)
        : Math.round(qty * unit * 100) / 100;
    const fromCatalog =
      l.productId !== undefined ? catalog.find((c) => c.id === l.productId) : undefined;
    return {
      productId: fromCatalog?.id ?? l.productId,
      name: fromCatalog?.name ?? (l.name ?? "Item"),
      quantity: qty,
      unitPrice: unit,
      lineTotal: total,
    };
  });

  const sub =
    typeof parsed.subtotal === "number" && Number.isFinite(parsed.subtotal)
      ? parsed.subtotal
      : lines.reduce((s, x) => s + x.lineTotal, 0);

  return {
    customerName: parsed.customerName ?? null,
    storeName,
    reference: `QT-${Date.now().toString(36).toUpperCase()}`,
    currency: parsed.currency ?? "",
    lines,
    notes: parsed.notes ?? "",
    createdAt: new Date().toISOString(),
    subtotal: Math.round(sub * 100) / 100,
  };
}
