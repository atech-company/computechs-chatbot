export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-black">
      <header className="border-b border-zinc-200/80 bg-white/70 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">ComputechsLeb</p>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">WooCommerce + OpenAI assistant demo</p>
          </div>
          <span className="hidden rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 sm:inline">
            Chat online
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
        <section className="max-w-2xl space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            Shop smarter with an on-site AI assistant.
          </h1>
          <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
            Use the floating chat to browse recommendations from your live WooCommerce catalog, request structured quotations
            (with PDF export), get policy-safe support answers, or start an order flow — without inventing products or prices.
          </p>
          <ul className="grid gap-3 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
            <li className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              Sales recommendations (max 3) pulled from REST search results.
            </li>
            <li className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              Quotations with chat formatting + optional PDF export.
            </li>
            <li className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              FAQ-grounded support responses (no hallucinated policies).
            </li>
            <li className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              Local chat history with JSON/TXT exports.
            </li>
          </ul>
        </section>

        <section className="rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white p-8 dark:border-violet-900/40 dark:from-violet-950/40 dark:to-zinc-950">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Try it</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Click the purple chat bubble in the bottom-right corner. Configure <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs dark:bg-zinc-900/80">.env.local</code> with{" "}
            <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs dark:bg-zinc-900/80">OPENAI_API_KEY</code> and WooCommerce REST keys so catalog data stays live.
          </p>
        </section>
      </main>

      <footer className="border-t border-zinc-200/80 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        Built with Next.js App Router — catalog and prices always served from WooCommerce on the server.
      </footer>
    </div>
  );
}
