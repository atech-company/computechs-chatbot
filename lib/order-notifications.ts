import { isValidEmail } from "@/lib/email-utils";

export type OrderNotifyResult = {
  emailToCustomer: boolean;
  emailToStore: boolean;
  whatsappToCustomer: boolean;
  whatsappToStore: boolean;
  errors: string[];
};

function siteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Store";
}

/** Business WhatsApp for order alerts (server env preferred so Hostinger doesn’t rely on NEXT_PUBLIC at build time). */
function resolveStoreWhatsAppNumber(): string {
  return (
    process.env.WHATSAPP_STORE_RECIPIENT?.trim() ||
    process.env.STORE_WHATSAPP_NUMBER?.trim() ||
    process.env.WASENDER_STORE_WHATSAPP?.trim() ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() ||
    ""
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pause between two Wasender sends (ms). Too short and the 2nd message is often dropped. */
function wasenderBetweenMessagesMs(): number {
  const n = Number(process.env.WASENDER_BETWEEN_MESSAGES_MS ?? "3500");
  if (!Number.isFinite(n) || n < 0) return 3500;
  return Math.min(Math.floor(n), 20000);
}

function wasenderRetryDelayMs(): number {
  const n = Number(process.env.WASENDER_RETRY_DELAY_MS ?? process.env.WASENDER_CUSTOMER_RETRY_DELAY_MS ?? "3500");
  if (!Number.isFinite(n) || n < 0) return 3500;
  return Math.min(Math.floor(n), 20000);
}

function storeBaseUrl(): string {
  return (process.env.WOOCOMMERCE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

type OrderNotifyInput = {
  orderId: number;
  orderNumber: string;
  productName: string;
  quantity: number;
  firstName: string;
  lastName: string;
  phone: string;
  customerEmail?: string;
};

/** E.164 for display / Wasender (`+` + digits). */
function toE164Phone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d) return "";
  return `+${d}`;
}

/** Short message for the customer (WhatsApp + email) — no internal ops wording. */
function formatCustomerOrderMessage(input: OrderNotifyInput): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || "Customer";
  const first = name.split(/\s+/)[0] ?? "";
  const greeting = first && first !== "Customer" ? `Hi ${first}, thanks for your order!` : "Thank you for your order!";
  const lines = [
    greeting,
    "",
    `Order #${input.orderNumber}`,
    `${input.productName} × ${input.quantity}`,
    "",
    "Our team will contact you shortly to confirm payment and delivery.",
    `— ${siteName()}`,
  ];
  return lines.join("\n");
}

/**
 * Full ops message for the store (WhatsApp + store email) — customer phone first for quick callback.
 */
function formatStoreOrderMessage(input: OrderNotifyInput): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || "Customer";
  const phoneRaw = input.phone.trim();
  const phoneE164 = toE164Phone(phoneRaw);
  const phoneLine = phoneE164.length >= 10 ? phoneE164 : phoneRaw;
  const base = storeBaseUrl();

  const lines = [
    `🛒 NEW ORDER (AI chat) — ${siteName()}`,
    "",
    "📞 CUSTOMER NUMBER (call / WhatsApp):",
    phoneLine,
    "",
    `Order #${input.orderNumber} · WooCommerce id: ${input.orderId}`,
    `Customer name: ${name}`,
  ];
  if (input.customerEmail?.trim()) {
    lines.push(`Email: ${input.customerEmail.trim()}`);
  }
  lines.push(`Product: ${input.productName} × ${input.quantity}`);
  if (base) lines.push(`Store: ${base}`);
  lines.push("", "Status: Pending payment — please confirm with the customer.");
  return lines.join("\n");
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
}

async function sendWhatsAppCloudText(toDigits: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  const version = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v21.0";
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4096) },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`WhatsApp API ${res.status}: ${t.slice(0, 200)}`);
  }
}

/**
 * WasenderAPI (https://wasenderapi.com) — REST API with Bearer token.
 * @see https://wasenderapi.com/api-docs/messages/send-text-message
 */
async function sendWasenderText(apiKey: string, toRaw: string, body: string): Promise<void> {
  const endpoint =
    process.env.WASENDER_API_URL?.trim() || "https://www.wasenderapi.com/api/send-message";
  const to = toE164Phone(toRaw);
  if (to.length < 10) {
    throw new Error("Phone number is too short for Wasender (use country code).");
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      text: body.slice(0, 4096),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Wasender HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
  if (json && json.success === false) {
    throw new Error("Wasender returned success: false");
  }
}

async function sendOutgoingWhatsApp(toRaw: string, body: string): Promise<void> {
  const wasenderKey = process.env.WASENDER_API_KEY?.trim();
  if (wasenderKey) {
    await sendWasenderText(wasenderKey, toRaw, body);
    return;
  }
  await sendWhatsAppCloudText(toRaw.replace(/\D/g, ""), body);
}

/**
 * After a WooCommerce order is created from chat, notify customer + store by email (Resend) and
 * optionally by WhatsApp (WasenderAPI preferred if WASENDER_API_KEY is set, else Meta Cloud API).
 * All steps are best-effort: failures are collected, not thrown.
 */
export async function notifyChatOrderCreated(input: {
  orderId: number;
  orderNumber: string;
  productName: string;
  quantity: number;
  firstName: string;
  lastName: string;
  phone: string;
  customerEmail?: string;
}): Promise<OrderNotifyResult> {
  const out: OrderNotifyResult = {
    emailToCustomer: false,
    emailToStore: false,
    whatsappToCustomer: false,
    whatsappToStore: false,
    errors: [],
  };

  const payload: OrderNotifyInput = {
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    productName: input.productName,
    quantity: input.quantity,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    customerEmail: input.customerEmail,
  };
  const customerMsg = formatCustomerOrderMessage(payload);
  const storeMsg = formatStoreOrderMessage(payload);

  const subjectCustomer = `Order #${input.orderNumber} — ${siteName()}`;
  const subjectStore = `New chat order #${input.orderNumber} — ${siteName()}`;

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.ORDER_NOTIFY_FROM_EMAIL?.trim();
  const fromName = process.env.ORDER_NOTIFY_FROM_NAME?.trim() || siteName();
  const from = fromEmail ? `${fromName} <${fromEmail}>` : "";

  if (resendKey && fromEmail && isValidEmail(fromEmail)) {
    const storeInbox =
      process.env.ORDER_NOTIFY_STORE_EMAIL?.trim() || process.env.WOOCOMMERCE_CHAT_ORDER_EMAIL?.trim() || "";

    if (input.customerEmail && isValidEmail(input.customerEmail)) {
      try {
        await sendResendEmail({
          apiKey: resendKey,
          from,
          to: input.customerEmail.trim(),
          subject: subjectCustomer,
          text: `${customerMsg}\n\nIf anything looks wrong, reply to this email or contact us with your order number.`,
        });
        out.emailToCustomer = true;
      } catch (e) {
        out.errors.push(`Email (customer): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (storeInbox && isValidEmail(storeInbox)) {
      try {
        await sendResendEmail({
          apiKey: resendKey,
          from,
          to: storeInbox,
          subject: subjectStore,
          text: storeMsg,
        });
        out.emailToStore = true;
      } catch (e) {
        out.errors.push(`Email (store): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else if (resendKey || fromEmail) {
    out.errors.push(
      "Email notifications skipped: set RESEND_API_KEY and ORDER_NOTIFY_FROM_EMAIL (verified sender in Resend).",
    );
  }

  const useWasender = Boolean(process.env.WASENDER_API_KEY?.trim());
  const waMetaConfigured =
    Boolean(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim()) &&
    Boolean(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim());
  const waConfigured = useWasender || waMetaConfigured;

  if (waConfigured) {
    const notifyCustomer = process.env.WHATSAPP_NOTIFY_CUSTOMER !== "false";
    const customerPhone = input.phone.trim();
    const storePhone = resolveStoreWhatsAppNumber();

    const customerOk = useWasender ? toE164Phone(customerPhone).length >= 10 : customerPhone.replace(/\D/g, "").length >= 8;
    const storeOk = useWasender ? toE164Phone(storePhone).length >= 10 : storePhone.replace(/\D/g, "").length >= 8;

    if (!storePhone.trim()) {
      out.errors.push(
        "Store WhatsApp skipped: set WHATSAPP_STORE_RECIPIENT or STORE_WHATSAPP_NUMBER (business number, country code) on the server.",
      );
    } else if (!storeOk) {
      out.errors.push(
        "Store WhatsApp skipped: business number looks invalid — use full international digits (e.g. 96171234567).",
      );
    }

    const sendStore = async () => {
      if (!storeOk) return;
      const attempt = async () => {
        await sendOutgoingWhatsApp(storePhone, storeMsg);
        out.whatsappToStore = true;
      };
      try {
        await attempt();
      } catch (e) {
        out.errors.push(`WhatsApp (store): ${e instanceof Error ? e.message : String(e)}`);
        if (useWasender) {
          await delay(wasenderRetryDelayMs());
          try {
            await attempt();
          } catch (e2) {
            out.errors.push(`WhatsApp (store retry): ${e2 instanceof Error ? e2.message : String(e2)}`);
          }
        }
      }
    };

    const sendCustomer = async (opts?: { wasenderRetry: boolean }) => {
      if (!notifyCustomer || !customerOk) return;
      const attempt = async () => {
        await sendOutgoingWhatsApp(customerPhone, customerMsg);
        out.whatsappToCustomer = true;
      };
      try {
        await attempt();
      } catch (e) {
        out.errors.push(`WhatsApp (customer): ${e instanceof Error ? e.message : String(e)}`);
        if (opts?.wasenderRetry && useWasender) {
          await delay(wasenderRetryDelayMs());
          try {
            await attempt();
          } catch (e2) {
            out.errors.push(`WhatsApp (customer retry): ${e2 instanceof Error ? e2.message : String(e2)}`);
          }
        }
      }
    };

    /*
     * Wasender: store alert first, then a longer pause, then customer (with one retry if customer fails).
     * Many sessions rate-limit or drop the second message if the gap is only a few hundred ms.
     * Meta Cloud: customer first, then store (unchanged).
     */
    if (useWasender) {
      await sendStore();
      if (storeOk && notifyCustomer && customerOk) {
        await delay(wasenderBetweenMessagesMs());
      } else if (!storeOk && notifyCustomer && customerOk) {
        await delay(500);
      }
      await sendCustomer({ wasenderRetry: true });
    } else {
      await sendCustomer({ wasenderRetry: false });
      await sendStore();
    }
  }

  return out;
}
