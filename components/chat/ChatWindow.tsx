"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatSession } from "@/types/chat";
import { ChatHistorySidebar } from "@/components/chat/ChatHistorySidebar";
import { QuotationCard } from "@/components/chat/QuotationCard";
import { ProductRecommendations } from "@/components/chat/ProductRecommendations";
import { TypingIndicator } from "@/components/chat/TypingIndicator";

export function ChatWindow({
  siteName,
  sessions,
  activeSession,
  loading,
  sidebarOpen,
  onSidebarOpenChange,
  fullscreen,
  onToggleFullscreen,
  minimized,
  onMinimize,
  onRestore,
  onClose,
  onNewChat,
  onSelectSession,
  onSend,
  onExportTxt,
  onExportJson,
}: {
  siteName: string;
  sessions: ChatSession[];
  activeSession: ChatSession;
  loading: boolean;
  sidebarOpen: boolean;
  onSidebarOpenChange: (v: boolean) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onSend: (text: string) => void;
  onExportTxt: () => void;
  onExportJson: () => void;
}) {
  const [text, setText] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession.messages, loading, minimized, fullscreen]);

  const submit = () => {
    const t = text.trim();
    if (!t || loading) return;
    setText("");
    onSend(t);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /** Docked default = former “expanded” large panel; fullscreen fills the overlay parent. */
  const dockedSize =
    "min-h-[min(560px,calc(100dvh-7rem))] max-h-[min(88dvh,calc(100dvh-5.5rem))] w-[min(96vw,560px)]";
  const fullscreenSize = "h-full min-h-0 w-full max-h-full rounded-none shadow-2xl sm:rounded-2xl md:rounded-3xl";

  if (minimized) {
    return (
      <div
        className={`pointer-events-auto flex max-h-14 items-center justify-between gap-2 rounded-2xl border border-zinc-200/90 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-950/95 w-[min(96vw,560px)]`}
      >
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{siteName}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRestore}
            className="rounded-full px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
          >
            Open
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto flex overflow-hidden border border-zinc-200/90 bg-white/95 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out dark:border-zinc-700 dark:bg-zinc-950/95 ${
        fullscreen ? fullscreenSize : `${dockedSize} rounded-3xl`
      }`}
    >
      <ChatHistorySidebar
        open={sidebarOpen}
        sessions={sessions}
        activeId={activeSession.id}
        onSelect={(id) => {
          onSelectSession(id);
          onSidebarOpenChange(false);
        }}
        onNew={() => {
          onNewChat();
          onSidebarOpenChange(false);
        }}
        onClose={() => onSidebarOpenChange(false)}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
          <button
            type="button"
            className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label="Open history"
            onClick={() => onSidebarOpenChange(true)}
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{siteName}</p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{activeSession.title}</p>
          </div>

          <div className="relative">
            <button
              type="button"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((v) => !v)}
              className="rounded-xl px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Export
            </button>
            {exportOpen ? (
              <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  onClick={() => {
                    onExportTxt();
                    setExportOpen(false);
                  }}
                >
                  Chat as .txt
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  onClick={() => {
                    onExportJson();
                    setExportOpen(false);
                  }}
                >
                  Chat as .json
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          >
            {fullscreen ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <polyline points="4 14 10 14 10 20" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="20 10 14 10 14 4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="14" y1="10" x2="21" y2="3" strokeLinecap="round" />
                <line x1="3" y1="21" x2="10" y2="14" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <polyline points="15 3 21 3 21 9" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="9 21 3 21 3 15" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="21" y1="3" x2="14" y2="10" strokeLinecap="round" />
                <line x1="3" y1="21" x2="10" y2="14" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label="Minimize chat"
          >
            ─
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label="Close chat"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {activeSession.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-zinc-200/80 bg-zinc-50 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                  <TypingIndicator />
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <footer className="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
            <div className="flex gap-2 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/50">
              <textarea
                ref={inputRef}
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask about products, support, or request a quotation…"
                className="max-h-28 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={submit}
                disabled={loading || !text.trim()}
                className="self-end rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
              Powered by ATECH TECHNOLOGYverify prices on the product page.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message: m }: { message: ChatMessage }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-md bg-violet-600 text-white"
            : "rounded-bl-md border border-zinc-200/80 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
        {!isUser && m.products?.length ? <ProductRecommendations products={m.products} /> : null}
        {!isUser && m.quotation ? <QuotationCard quotation={m.quotation} /> : null}
        {!isUser && m.orderCreated ? (
          <div className="mt-3 rounded-xl border border-emerald-300/90 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-50">
            WooCommerce order <span className="font-mono">#{m.orderCreated.number}</span> created (pending in admin).
          </div>
        ) : null}
      </div>
    </div>
  );
}
