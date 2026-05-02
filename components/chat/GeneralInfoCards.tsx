"use client";

import type { GeneralInfoItem } from "@/types/chat";

function iconFor(kind: GeneralInfoItem["kind"]): string {
  if (kind === "whatsapp") return "📱";
  if (kind === "email") return "✉";
  return "📍";
}

export function GeneralInfoCards({ items }: { items: GeneralInfoItem[] }) {
  if (!items.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {items.map((item, i) => {
        const disabled = item.kind === "email" && item.url === "mailto:";
        return (
          <div
            key={`${item.kind}-${i}`}
            className="rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/60"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {item.title}
            </p>
            <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.value}</p>
            <a
              href={disabled ? undefined : item.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-disabled={disabled}
              className={`mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                disabled
                  ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300"
                  : "bg-violet-600 text-white hover:bg-violet-500"
              }`}
            >
              <span aria-hidden>{iconFor(item.kind)}</span>
              {item.ctaLabel}
            </a>
          </div>
        );
      })}
    </div>
  );
}
