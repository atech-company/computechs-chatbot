import crypto from "node:crypto";

import { processWooCommerceOrderWebhookBody } from "@/lib/order-approval-notify";

export const dynamic = "force-dynamic";
/** Allow enough time for two WhatsApps + emails + pacing on slow Wasender tiers. */
export const maxDuration = 120;

function verifyWooCommerceWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.trim()) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader.trim());
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** WooCommerce pings the URL when saving a webhook; answer 200 without parsing JSON. */
export async function GET() {
  return new Response(JSON.stringify({ ok: true, service: "woocommerce-webhook" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * WooCommerce · Settings · Advanced · Webhooks — Topic **Order updated** (or Order status changed).
 * Delivery URL: `https://YOUR_DOMAIN/api/webhooks/woocommerce`
 * Secret: same value as env **WOOCOMMERCE_WEBHOOK_SECRET**.
 */
export async function POST(req: Request) {
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET?.trim();
  const allowUnsigned = process.env.ORDER_APPROVAL_ALLOW_UNSIGNED === "true";

  const rawBody = await req.text();

  if (secret) {
    const sig =
      req.headers.get("x-wc-webhook-signature") ??
      req.headers.get("X-WC-Webhook-Signature");
    if (!verifyWooCommerceWebhookSignature(rawBody, sig, secret)) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (!allowUnsigned) {
    return new Response(
      JSON.stringify({
        error: "misconfigured",
        hint: "Set WOOCOMMERCE_WEBHOOK_SECRET to match WooCommerce webhook secret, or ORDER_APPROVAL_ALLOW_UNSIGNED=true only for local tests.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await processWooCommerceOrderWebhookBody(body);
    return Response.json(result);
  } catch (e) {
    console.error("[woocommerce-webhook]", e);
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message.slice(0, 500) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
