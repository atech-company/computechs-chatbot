import {
  APPROVAL_INVOICE_META_KEY,
  fetchOrderById,
  isWooConfigured,
  upsertOrderMeta,
  type WooOrderDetail,
} from "@/lib/wooCommerce";
import { isValidEmail } from "@/lib/email-utils";
import {
  deliverOrderWhatsApp,
  getStoreWhatsAppDeliverTarget,
  getWasender429RetryMs,
  sendTransactionalResend,
} from "@/lib/order-notifications";

function siteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Store";
}

function toE164Phone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d) return "";
  return `+${d}`;
}

function configuredWasenderGapMs(): number {
  const n = Number(process.env.WASENDER_BETWEEN_MESSAGES_MS ?? "3500");
  if (!Number.isFinite(n) || n < 0) return 3500;
  return Math.min(Math.floor(n), 20000);
}

function approvalStatusSet(): Set<string> {
  const raw =
    process.env.ORDER_APPROVAL_NOTIFY_STATUSES?.trim() ||
    process.env.WOOCOMMERCE_APPROVAL_NOTIFY_STATUS?.trim() ||
    "processing";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function approvalAlreadySent(order: WooOrderDetail): boolean {
  const raw = order.meta_data?.find((m) => m.key === APPROVAL_INVOICE_META_KEY)?.value;
  const s = raw == null ? "" : typeof raw === "string" ? raw : String(raw);
  return s === "1" || s.toLowerCase() === "yes" || s.toLowerCase() === "true";
}

function paymentInstructionBlock(): string {
  const num =
    process.env.ORDER_APPROVAL_PAYMENT_MOBILE?.replace(/\D/g, "").trim() ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "").trim() ||
    "";
  const whish = process.env.ORDER_APPROVAL_WHISH_LINK?.trim();
  const omt = process.env.ORDER_APPROVAL_OMT_LINK?.trim();
  const displayNum = num ? `+${num}` : "the number we message you from";

  const lines = [
    "Payment options:",
    "• Cash on delivery — you can pay when your order arrives.",
  ];
  if (whish) lines.push(`• Whish Money: ${whish}`);
  else lines.push(`• Whish Money — send to ${displayNum} (use your order number as reference if asked).`);
  if (omt) lines.push(`• OMT: ${omt}`);
  else lines.push(`• OMT — send to ${displayNum} (use your order number as reference if asked).`);
  lines.push(
    "",
    "After we confirm payment, your invoice is sent by email and a copy goes to our team.",
  );
  const extra = process.env.ORDER_APPROVAL_EXTRA_NOTE?.trim();
  if (extra) lines.push("", extra);
  return lines.join("\n");
}

function lineItemsPlain(order: WooOrderDetail): string {
  return order.line_items
    .map((li) => `${li.quantity}× ${li.name} — ${order.currency} ${li.total}`)
    .join("\n");
}

function orderSummaryPlain(order: WooOrderDetail): string {
  const lines = [
    `Order #${order.number ?? order.id}`,
    `Status: ${order.status}`,
    `Total: ${order.currency} ${order.total}`,
  ];
  if (order.shipping_total && Number(order.shipping_total) > 0) {
    lines.push(`Shipping: ${order.currency} ${order.shipping_total}`);
  }
  if (order.payment_method_title) {
    lines.push(`Payment method (WooCommerce): ${order.payment_method_title}`);
  }
  lines.push("", "Items:", lineItemsPlain(order));
  return lines.join("\n");
}

function orderSummaryHtml(order: WooOrderDetail): string {
  const rows = order.line_items
    .map(
      (li) =>
        `<tr><td>${escapeHtml(li.name)}</td><td>${li.quantity}</td><td>${escapeHtml(order.currency)} ${escapeHtml(li.total)}</td></tr>`,
    )
    .join("");
  const ship =
    order.shipping_total && Number(order.shipping_total) > 0
      ? `<p><strong>Shipping:</strong> ${escapeHtml(order.currency)} ${escapeHtml(String(order.shipping_total))}</p>`
      : "";
  return `
  <h2>Order #${escapeHtml(String(order.number ?? order.id))}</h2>
  <p><strong>Total:</strong> ${escapeHtml(order.currency)} ${escapeHtml(order.total)}</p>
  ${ship}
  <table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Item</th><th>Qty</th><th>Line total</th></tr></thead><tbody>${rows}</tbody></table>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCustomerWhatsappBody(order: WooOrderDetail): string {
  const name = `${order.billing.first_name} ${order.billing.last_name}`.trim() || "Customer";
  const phoneLine = order.billing.phone?.trim() || "your number on file";
  const parts = [
    `Hi ${name},`,
    "",
    `${siteName()} has approved your order.`,
    "",
    orderSummaryPlain(order),
    "",
    `Our delivery team will contact you on ${phoneLine} to arrange delivery.`,
    "",
    paymentInstructionBlock(),
    "",
    `— ${siteName()}`,
  ];
  return parts.join("\n").slice(0, 4090);
}

function buildStoreWhatsappBody(order: WooOrderDetail): string {
  const parts = [
    `📋 Invoice / approval copy — Order #${order.number ?? order.id}`,
    "",
    orderSummaryPlain(order),
    "",
    `Customer: ${order.billing.first_name} ${order.billing.last_name}`.trim(),
    `Phone: ${order.billing.phone || "—"}`,
    `Email: ${order.billing.email || "—"}`,
    "",
    "Customer was notified with payment options (COD / Whish / OMT) and delivery contact info.",
  ];
  return parts.join("\n").slice(0, 4090);
}

function buildEmailBodies(order: WooOrderDetail): { text: string; html: string } {
  const name = `${order.billing.first_name} ${order.billing.last_name}`.trim() || "Customer";
  const text = [
    `Hi ${name},`,
    "",
    `${siteName()} has approved your order.`,
    "",
    orderSummaryPlain(order),
    "",
    `Our delivery team will contact you on ${order.billing.phone || "your phone"} to arrange delivery.`,
    "",
    paymentInstructionBlock(),
    "",
    `— ${siteName()}`,
  ].join("\n");

  const html = `
  <p>Hi ${escapeHtml(name)},</p>
  <p><strong>${escapeHtml(siteName())}</strong> has approved your order.</p>
  ${orderSummaryHtml(order)}
  <p>Our delivery team will contact you on <strong>${escapeHtml(order.billing.phone || "your phone")}</strong> to arrange delivery.</p>
  <pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(paymentInstructionBlock())}</pre>
  <p>— ${escapeHtml(siteName())}</p>
  `;
  return { text, html };
}

function scheduleDeferredWasender(
  ms: number,
  to: string,
  body: string,
  afterSuccess?: () => Promise<void>,
): void {
  const wait = Math.min(Math.max(ms, 500), 120_000);
  void (async () => {
    await new Promise((r) => setTimeout(r, wait));
    try {
      await deliverOrderWhatsApp(to, body);
      await afterSuccess?.();
      console.info("[order-approval] deferred WhatsApp succeeded.");
    } catch (e) {
      console.error(
        "[order-approval] deferred WhatsApp failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  })();
}

/**
 * Called from POST /api/webhooks/woocommerce when WooCommerce sends an order payload.
 * When status matches ORDER_APPROVAL_NOTIFY_STATUSES (default: processing) and we have not
 * yet marked the order meta, sends WhatsApp + email “invoice” to customer and copies to the store.
 */
export async function processWooCommerceOrderWebhookBody(raw: unknown): Promise<{
  ok: boolean;
  skippedReason?: string;
  orderId?: number;
}> {
  if (process.env.ORDER_APPROVAL_WEBHOOK_ENABLED === "false") {
    return { ok: true, skippedReason: "approval_webhook_disabled" };
  }
  if (!isWooConfigured()) {
    return { ok: false, skippedReason: "woocommerce_not_configured" };
  }

  if (!raw || typeof raw !== "object" || !("id" in raw)) {
    return { ok: true, skippedReason: "not_order_payload" };
  }
  const id = Number((raw as { id: unknown }).id);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: true, skippedReason: "invalid_order_id" };
  }

  const order = await fetchOrderById(id);
  const statuses = approvalStatusSet();
  if (!statuses.has(order.status.toLowerCase())) {
    return { ok: true, skippedReason: `status_${order.status}`, orderId: id };
  }
  if (approvalAlreadySent(order)) {
    return { ok: true, skippedReason: "already_notified", orderId: id };
  }

  const notifyCustomerWa = process.env.ORDER_APPROVAL_NOTIFY_CUSTOMER_WHATSAPP !== "false";
  const notifyStoreWa = process.env.ORDER_APPROVAL_NOTIFY_STORE_WHATSAPP !== "false";

  const customerPhone = order.billing.phone?.trim() || "";
  const customerE164 = toE164Phone(customerPhone);
  const customerWaOk = notifyCustomerWa && customerE164.length >= 10;

  const storeTarget = getStoreWhatsAppDeliverTarget().trim();
  const storeJid = storeTarget.includes("@");
  const storeWaOk =
    notifyStoreWa &&
    storeTarget.length > 0 &&
    (storeJid ? storeTarget.length >= 8 : toE164Phone(storeTarget).length >= 10);

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.ORDER_NOTIFY_FROM_EMAIL?.trim();
  const fromName = process.env.ORDER_NOTIFY_FROM_NAME?.trim() || siteName();
  const from = fromEmail && isValidEmail(fromEmail) ? `${fromName} <${fromEmail}>` : "";
  const customerEmail = order.billing.email?.trim() || "";
  const emailCustomerOk = Boolean(
    resendKey && from && customerEmail && isValidEmail(customerEmail),
  );
  const storeInbox =
    process.env.ORDER_NOTIFY_STORE_EMAIL?.trim() ||
    process.env.WOOCOMMERCE_CHAT_ORDER_EMAIL?.trim() ||
    "";
  const emailStoreOk = Boolean(resendKey && from && storeInbox && isValidEmail(storeInbox));

  if (!customerWaOk && !emailCustomerOk) {
    console.warn(
      "[order-approval] No customer channel (valid phone for WhatsApp or valid billing email + Resend).",
    );
    return { ok: false, skippedReason: "no_customer_channel", orderId: id };
  }

  const waCustomerBody = buildCustomerWhatsappBody(order);
  const waStoreBody = buildStoreWhatsappBody(order);
  const { text: emailText, html: emailHtml } = buildEmailBodies(order);
  const subject = `Order #${order.number ?? id} approved — ${siteName()}`;

  let metaMarked = false;
  const tryMarkComplete = async (): Promise<void> => {
    if (metaMarked) return;
    await upsertOrderMeta(id, APPROVAL_INVOICE_META_KEY, "1");
    metaMarked = true;
  };

  if (customerWaOk) {
    try {
      await deliverOrderWhatsApp(customerPhone, waCustomerBody);
      await tryMarkComplete();
    } catch (e) {
      const wait = getWasender429RetryMs(e);
      if (wait != null) {
        scheduleDeferredWasender(wait, customerPhone, waCustomerBody, tryMarkComplete);
        console.warn("[order-approval] customer WhatsApp deferred due to Wasender 429:", wait);
      } else {
        console.error("[order-approval] customer WhatsApp failed:", e);
      }
    }
  }

  if (storeWaOk) {
    await new Promise((r) => setTimeout(r, configuredWasenderGapMs()));
    try {
      await deliverOrderWhatsApp(storeTarget, waStoreBody);
    } catch (e) {
      const wait = getWasender429RetryMs(e);
      if (wait != null) {
        scheduleDeferredWasender(wait, storeTarget, waStoreBody);
        console.warn("[order-approval] store WhatsApp deferred due to Wasender 429:", wait);
      } else {
        console.error("[order-approval] store WhatsApp failed:", e);
      }
    }
  }

  if (emailCustomerOk) {
    try {
      await sendTransactionalResend({
        apiKey: resendKey!,
        from,
        to: customerEmail,
        subject,
        text: emailText,
        html: emailHtml,
      });
      await tryMarkComplete();
    } catch (e) {
      console.error("[order-approval] customer email failed:", e);
    }
  }

  if (emailStoreOk) {
    try {
      await sendTransactionalResend({
        apiKey: resendKey!,
        from,
        to: storeInbox,
        subject: `[Store copy] ${subject}`,
        text: `Store copy — same as sent to customer.\n\n${emailText}`,
        html: `<p><em>Store copy</em></p>${emailHtml}`,
      });
    } catch (e) {
      console.error("[order-approval] store email failed:", e);
    }
  }

  if (!metaMarked) {
    console.warn(
      "[order-approval] Order",
      id,
      "notifications attempted but Woo meta not marked (customer WA + email failed or still pending defer). Woo may retry on next save.",
    );
  }

  return { ok: true, orderId: id };
}
