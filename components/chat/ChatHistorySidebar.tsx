import type { ChatSession } from "@/types/chat";

export function ChatHistorySidebar({
  open,
  sessions,
  activeId,
  onSelect,
  onNew,
  onClose,
}: {
  open: boolean;
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {/*
        Only mount the scrim while open. In WordPress iframe mode, globals use
        `body.wp-chat-embed .computechs-chat-scope * { pointer-events: auto !important }` so
        a closed scrim with `opacity-0` would still receive hits and block the whole chat panel.
      */}
      {open ? (
        <div
          className="pointer-events-auto absolute inset-0 z-20 bg-black/30 opacity-100 backdrop-blur-[2px] md:hidden"
          onClick={onClose}
          aria-hidden={false}
        />
      ) : null}
      <aside
        className={`absolute inset-y-0 left-0 z-30 flex w-[min(88%,280px)] shrink-0 flex-col border-r border-zinc-200/80 bg-white/95 shadow-xl transition-transform dark:border-zinc-700 dark:bg-zinc-950/95 md:static md:z-auto md:w-56 md:translate-x-0 md:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label="Chat history"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">History</p>
          <button
            type="button"
            onClick={onNew}
            className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    s.id === activeId
                      ? "bg-violet-100 font-medium text-violet-950 dark:bg-violet-950/50 dark:text-violet-50"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span className="line-clamp-2">{s.title}</span>
                  <span className="mt-0.5 block text-[11px] text-zinc-400 dark:text-zinc-500">
                    {new Date(s.updatedAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}
