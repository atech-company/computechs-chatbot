import { NextResponse } from "next/server";

/** Use GET /api/health to verify Hostinger reaches this Node app (JSON 200 vs HTML 503 from CDN). */
export async function GET() {
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasWoo = Boolean(
    process.env.WOOCOMMERCE_URL?.trim() &&
      process.env.WOOCOMMERCE_CONSUMER_KEY?.trim() &&
      process.env.WOOCOMMERCE_CONSUMER_SECRET?.trim(),
  );

  return NextResponse.json(
    {
      ok: true,
      service: "computechs-chatbot",
      uptimeNote: "If you see JSON here, Next.js is running behind the domain.",
      env: {
        openaiKeySet: hasOpenAi,
        wooCommerceSet: hasWoo,
      },
    },
    { status: 200 },
  );
}
