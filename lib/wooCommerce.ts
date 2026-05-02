import type { WooProductSummary } from "@/types/chat";

const STORE = () => process.env.WOOCOMMERCE_URL?.replace(/\/$/, "") ?? "";
const KEY = () => process.env.WOOCOMMERCE_CONSUMER_KEY ?? "";
const SECRET = () => process.env.WOOCOMMERCE_CONSUMER_SECRET ?? "";

export function isWooConfigured(): boolean {
  return Boolean(STORE() && KEY() && SECRET());
}

interface WooImage {
  src?: string;
}

interface WooProductRaw {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  short_description: string;
  images?: WooImage[];
  stock_status?: string;
}

function buildUrl(path: string, params: Record<string, string | number | undefined>) {
  const base = STORE();
  const url = new URL(`${base}/wp-json/wc/v3/${path}`);
  url.searchParams.set("consumer_key", KEY());
  url.searchParams.set("consumer_secret", SECRET());
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function wooGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  if (!isWooConfigured()) {
    throw new Error("WooCommerce environment variables are not set.");
  }
  const res = await fetch(buildUrl(path, params), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WooCommerce HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function mapProduct(p: WooProductRaw): WooProductSummary {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    permalink: p.permalink,
    price: p.price,
    regular_price: p.regular_price,
    sale_price: p.sale_price,
    on_sale: p.on_sale,
    short_description: stripHtml(p.short_description ?? ""),
    image: p.images?.[0]?.src ?? null,
    stock_status: p.stock_status,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchProducts(params: {
  search?: string;
  category?: number;
  min_price?: number;
  max_price?: number;
  per_page?: number;
  page?: number;
}): Promise<WooProductSummary[]> {
  const raw = await wooGet<WooProductRaw[]>("products", {
    status: "publish",
    per_page: params.per_page ?? 12,
    page: params.page ?? 1,
    search: params.search,
    category: params.category,
    min_price: params.min_price,
    max_price: params.max_price,
  });
  return raw.map(mapProduct);
}

export async function fetchProductById(id: number): Promise<WooProductSummary | null> {
  try {
    const raw = await wooGet<WooProductRaw>(`products/${id}`, {});
    return mapProduct(raw);
  } catch {
    return null;
  }
}

export async function fetchCategories(limit = 50): Promise<{ id: number; name: string; slug: string }[]> {
  const rows = await wooGet<{ id: number; name: string; slug: string }[]>("products/categories", {
    per_page: limit,
    hide_empty: "true",
  });
  return rows;
}
