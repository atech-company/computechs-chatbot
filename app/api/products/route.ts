import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchProducts, isWooConfigured } from "@/lib/wooCommerce";

export const runtime = "nodejs";

const querySchema = z.object({
  search: z.string().optional(),
  category: z.coerce.number().optional(),
  min_price: z.coerce.number().optional(),
  max_price: z.coerce.number().optional(),
  per_page: z.coerce.number().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  try {
    if (!isWooConfigured()) {
      return NextResponse.json(
        { error: "WooCommerce is not configured.", products: [] },
        { status: 503 },
      );
    }
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
    }
    const q = parsed.data;
    const products = await fetchProducts({
      search: q.search,
      category: q.category,
      min_price: q.min_price,
      max_price: q.max_price,
      per_page: q.per_page ?? 12,
    });
    return NextResponse.json({ products });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg, products: [] }, { status: 500 });
  }
}
