import { isValidEmail } from "@/lib/email-utils";

/** Thrown only from Wasender REST calls; carries rate-limit backoff when status === 429. */
class WasenderHTTPError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = "WasenderHTTPError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type OrderNotifyResult = {
  emailToCustomer: boolean;
  emailToStore: boolean;
  whatsappToCustomer: boolean;
  whatsappToStore: boolean;
  /** Shop Wasender queued after 429 so the HTTP request does not block ~60s (trial limits). */
  whatsappToStoreDeferred?: boolean;
  errors: string[];
};

function siteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Store";
}

/** Panels sometimes add quotes or encode @ as %40; some truncate at `@` unless quoted. */
function normalizeWasenderToEnv(raw: string | undefined): string {
  if (raw == null) return "";
  let s = raw.trim();
  if (!s) return "";
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/%40/gi, "@");
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

/**
 * Where to send *shop* order alerts via Wasender: optional raw `to` (another E.164 phone) or WhatsApp group/community JID.
 * Use when the linked Wasender session cannot DM the business handset (same number).
 */
function resolveStoreWhatsAppTarget(): string {
  const storeTo = normalizeWasenderToEnv(process.env.WASENDER_STORE_TO);
  if (storeTo) return storeTo;
  const groupRaw = process.env.WHATSAPP_STORE_GROUP_JID;
  const group = normalizeWasenderToEnv(groupRaw);
  // JID must contain @; if the panel stripped everything from @ onward, fall back to phone (and we record an error below).
  if (groupRaw?.trim() && group.includes("@")) return group;
  return resolveStoreWhatsAppNumber();
}

function isWaJidRecipient(raw: string): boolean {
  return raw.trim().includes("@");
}

function storeRecipientValidForWasender(raw: string): boolean {
  if (!raw.trim()) return false;
  if (isWaJidRecipient(raw)) return raw.trim().length >= 8;
  return toE164Phone(raw).length >= 10;
}

function storeRecipientValidForMeta(raw: string): boolean {
  if (!raw.trim() || isWaJidRecipient(raw)) return false;
  return raw.replace(/\D/g, "").length >= 8;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wasender429RetryDelayMs(error: unknown): number | null {
  if (!(error instanceof WasenderHTTPError) || error.status !== 429) return null;
  const raw = error.retryAfterMs;
  if (raw == null || !Number.isFinite(raw)) return 65_000;
  return Math.min(Math.max(Math.ceil(raw), 1000), 120_000);
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
  const t = toRaw.trim();
  const to = isWaJidRecipient(t)
    ? t
    : (() => {
        const e164 = toE164Phone(t);
        if (e164.length < 10) throw new Error("Phone number is too short for Wasender (use country code).");
        return e164;
      })();
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
    let retryAfterMs: number | undefined;
    if (res.status === 429) {
      try {
        const j = JSON.parse(t) as { retry_after?: unknown };
        if (
          typeof j.retry_after === "number" &&
          Number.isFinite(j.retry_after) &&
          j.retry_after >= 0
        ) {
          retryAfterMs = Math.min(Math.ceil(j.retry_after * 1000 + 750), 120_000);
        }
      } catch {
        /* ignore malformed body */
      }
      if (retryAfterMs === undefined) retryAfterMs = 65_000;
    }
    throw new WasenderHTTPError(
      `Wasender HTTP ${res.status}: ${t.slice(0, 300)}`,
      res.status,
      retryAfterMs,
    );
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

/** Sends after disconnecting from request (long-lived Node on Hostinger); avoids blocking chat during Wasender trial limits. */
function scheduleWasenderDelayedSend(delayMs: number, toRaw: string, body: string): void {
  const ms = Math.min(Math.max(delayMs, 500), 120_000);
  void (async () => {
    await delay(ms);
    try {
      await sendOutgoingWhatsApp(toRaw, body);
      console.info("[order-notifications] WhatsApp deferred send succeeded.");
    } catch (err) {
      console.error(
        "[order-notifications] WhatsApp deferred send failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  })();
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

  const groupJidEnvRaw = process.env.WHATSAPP_STORE_GROUP_JID?.trim() ?? "";
  if (groupJidEnvRaw && !normalizeWasenderToEnv(process.env.WHATSAPP_STORE_GROUP_JID).includes("@")) {
    out.errors.push(
      "WHATSAPP_STORE_GROUP_JID is set but has no @ (host may have truncated at @). Use a quoted value or suffix %40g.us (e.g. 120363…%40g.us), redeploy, restart.",
    );
  }

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
    const storeTarget = useWasender ? resolveStoreWhatsAppTarget() : resolveStoreWhatsAppNumber();

    const customerOk = useWasender ? toE164Phone(customerPhone).length >= 10 : customerPhone.replace(/\D/g, "").length >= 8;
    const storeOk = useWasender ? storeRecipientValidForWasender(storeTarget) : storeRecipientValidForMeta(storeTarget);

    if (!storeTarget.trim()) {
      out.errors.push(
        "Store WhatsApp skipped: set WHATSAPP_STORE_RECIPIENT or STORE_WHATSAPP_NUMBER (business number), or WASENDER_STORE_TO / WHATSAPP_STORE_GROUP_JID for Wasender.",
      );
    } else if (!useWasender && isWaJidRecipient(storeTarget)) {
      out.errors.push(
        "Store WhatsApp skipped: WhatsApp group JID works only with Wasender. Set WHATSAPP_STORE_RECIPIENT (digits + country code) for Meta Cloud, or use WASENDER.",
      );
    } else if (!storeOk) {
      out.errors.push(
        "Store WhatsApp skipped: invalid recipient — use E.164 phone (e.g. 96171234567) or a valid Wasender group JID.",
      );
    }

    const sendStore = async () => {
      if (!storeOk) return;
      const attempt = async () => {
        await sendOutgoingWhatsApp(storeTarget, storeMsg);
        out.whatsappToStore = true;
      };
      try {
        await attempt();
      } catch (e) {
        const rateMs = useWasender ? wasender429RetryDelayMs(e) : null;
        if (rateMs != null) {
          scheduleWasenderDelayedSend(rateMs, storeTarget, storeMsg);
          out.whatsappToStoreDeferred = true;
          const approxSec = Math.max(1, Math.round(rateMs / 1000));
          out.errors.push(
            `WhatsApp (store): Wasender rate limit — shop message will retry in ~${approxSec}s (trial: 1 message/minute).`,
          );
          console.warn(
            `[order-notifications] Store WhatsApp deferred ${rateMs}ms after Wasender 429 (trial or plan limit).`,
          );
          return;
        }

        const msg = e instanceof Error ? e.message : String(e);
        out.errors.push(`WhatsApp (store): ${msg}`);
        console.error("[order-notifications] WhatsApp store send failed:", msg);
        if (useWasender) {
          await delay(wasenderRetryDelayMs());
          try {
            await attempt();
          } catch (e2) {
            const rate2 = wasender429RetryDelayMs(e2);
            if (rate2 != null) {
              scheduleWasenderDelayedSend(rate2, storeTarget, storeMsg);
              out.whatsappToStoreDeferred = true;
              const s = Math.max(1, Math.round(rate2 / 1000));
              out.errors.push(
                `WhatsApp (store): Wasender rate limit on retry — shop message deferred ~${s}s.`,
              );
              console.warn("[order-notifications] Store WhatsApp deferred after failed inline retry:", rate2);
              return;
            }
            const msg2 = e2 instanceof Error ? e2.message : String(e2);
            out.errors.push(`WhatsApp (store retry): ${msg2}`);
            console.error("[order-notifications] WhatsApp store retry failed:", msg2);
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
     * Wasender: customer confirmation first (many sessions drop the *second* outbound; shop was getting
     * alerts while shoppers did not when store was sent first). Then pause, then store alert. Both paths retry once on failure.
     * Meta Cloud: customer first, then store (unchanged).
     */
    if (useWasender) {
      if (notifyCustomer && customerOk) {
        await sendCustomer({ wasenderRetry: true });
      }
      if (storeOk) {
        if (notifyCustomer && customerOk) {
          await delay(wasenderBetweenMessagesMs());
        }
        await sendStore();
      }
    } else {
      await sendCustomer({ wasenderRetry: false });
      await sendStore();
    }
  }

  return out;
}
