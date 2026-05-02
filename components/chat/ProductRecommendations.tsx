import type { WooProductSummary } from "@/types/chat";

function formatPrice(p: WooProductSummary): string {
  const raw = p.on_sale && p.sale_price ? p.sale_price : p.price;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return raw || "—";
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function ProductRecommendations({ products }: { products: WooProductSummary[] }) {
  if (!products.length) return null;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-1">
      {products.map((p) => (
        <a
          key={p.id}
          href={p.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-3 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 p-3 shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-violet-500"
        >
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">No image</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{p.name}</p>
            <p className="mt-1 text-sm font-semibold text-violet-700 dark:text-violet-300">{formatPrice(p)}</p>
            <span className="mt-2 inline-flex rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white">
              View product
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
