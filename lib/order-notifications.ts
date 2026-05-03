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

function storeBaseUrl(): string {
  return (process.env.WOOCOMMERCE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

function formatOrderBody(input: {
  orderNumber: string;
  productName: string;
  quantity: number;
  firstName: string;
  lastName: string;
  phone: string;
  customerEmail?: string;
}): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || "Customer";
  const lines = [
    `Order #${input.orderNumber}`,
    `Product: ${input.productName} × ${input.quantity}`,
    `Customer: ${name}`,
    `Phone: ${input.phone}`,
  ];
  if (input.customerEmail?.trim()) lines.push(`Email: ${input.customerEmail.trim()}`);
  const base = storeBaseUrl();
  if (base) lines.push(`Store: ${base}`);
  lines.push("Status: pending payment — please confirm with the customer.");
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

/** E.164 for Wasender (`+` + digits). */
function toE164Phone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d) return "";
  return `+${d}`;
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

  const body = formatOrderBody({
    orderNumber: input.orderNumber,
    productName: input.productName,
    quantity: input.quantity,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    customerEmail: input.customerEmail,
  });

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
          text: `Thank you — we received your order.\n\n${body}`,
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
          text: `New order from AI chat (WooCommerce #${input.orderNumber}, id ${input.orderId}).\n\n${body}`,
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
    const storePhone =
      process.env.WHATSAPP_STORE_RECIPIENT?.trim() || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() || "";

    const customerOk = useWasender ? toE164Phone(customerPhone).length >= 10 : customerPhone.replace(/\D/g, "").length >= 8;
    const storeOk = useWasender ? toE164Phone(storePhone).length >= 10 : storePhone.replace(/\D/g, "").length >= 8;

    if (notifyCustomer && customerOk) {
      try {
        await sendOutgoingWhatsApp(customerPhone, body);
        out.whatsappToCustomer = true;
      } catch (e) {
        out.errors.push(`WhatsApp (customer): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (storeOk) {
      try {
        await sendOutgoingWhatsApp(
          storePhone,
          `New order #${input.orderNumber} (${siteName()})\n${body}`,
        );
        out.whatsappToStore = true;
      } catch (e) {
        out.errors.push(`WhatsApp (store): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return out;
}
