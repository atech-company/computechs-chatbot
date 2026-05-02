"use client";

export function ChatBubble({
  open,
  onClick,
  label,
  className = "",
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-600/30 ring-4 ring-white/40 transition hover:scale-105 hover:shadow-2xl sm:h-14 sm:w-14 dark:ring-zinc-900/40 ${open ? "scale-95 opacity-90" : ""} pointer-events-auto ${className}`}
    >
      <span className="text-lg sm:text-xl" aria-hidden>
        💬
      </span>
      {!open ? (
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-emerald-400 ring-2 ring-white dark:ring-zinc-950" />
      ) : null}
    </button>
  );
}
