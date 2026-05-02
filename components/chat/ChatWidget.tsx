"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatApiResponse, ChatMessage, ChatSession } from "@/types/chat";
import { exportChatJson, exportChatTxt } from "@/lib/export-chat";
import { loadSessions, newSession, saveSessions } from "@/lib/chat-storage";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatWindow } from "@/components/chat/ChatWindow";

function makeId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function titleFromFirstUser(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  return t.length > 52 ? `${t.slice(0, 52)}…` : t;
}

export function ChatWidget({
  siteName,
  wordpressEmbed = false,
}: {
  siteName: string;
  /** True when rendered inside /wordpress-embed — click-through iframe on WordPress. */
  wordpressEmbed?: boolean;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>(() => []);
  const [activeId, setActiveId] = useState<string>("");
  const [open, setOpen] = useState(false);
  /** True = chat fills viewport (semi-fullscreen overlay). Default docked size is large (maximized-from-before). */
  const [fullscreen, setFullscreen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loaded = loadSessions();
    if (loaded.length === 0) {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
      saveSessions([s]);
    } else {
      setSessions(loaded);
      setActiveId(loaded[0]?.id ?? "");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSessions(sessions);
  }, [sessions, hydrated]);

  useEffect(() => {
    if (!open || !fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, fullscreen]);

  useEffect(() => {
    if (open && fullscreen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [open, fullscreen]);

  /** Keep side-effects out of `setOpen` updater (nested setState caused React warnings). */
  useEffect(() => {
    if (open) {
      setMinimized(false);
    } else {
      setFullscreen(false);
    }
  }, [open]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[0],
    [sessions, activeId],
  );

  const patchSession = useCallback((id: string, updater: (s: ChatSession) => ChatSession) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
  }, []);

  const handleNewChat = useCallback(() => {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!activeSession) return;
      const sid = activeSession.id;

      const userMsg: ChatMessage = {
        id: makeId("u"),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };

      patchSession(sid, (s) => {
        const nextTitle = s.title === "New chat" ? titleFromFirstUser(text) : s.title;
        return {
          ...s,
          title: nextTitle,
          updatedAt: Date.now(),
          messages: [...s.messages, userMsg],
        };
      });

      setLoading(true);
      try {
        const convo = [...activeSession.messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: convo }),
        });

        let data = { message: "", intent: "SUPPORT" as const } as ChatApiResponse & { error?: string };
        const rawBody = await res.text();
        try {
          if (rawBody) {
            data = JSON.parse(rawBody) as ChatApiResponse & { error?: string };
          }
        } catch {
          data = {
            message: `Chat request failed (HTTP ${res.status}). Server did not return JSON — often a Hostinger CDN/proxy issue. Redeploy and check runtime logs.`,
            intent: "SUPPORT",
          };
        }

        const content =
          data.message ||
          (data.error ? `Request failed (${res.status}): ${data.error}` : `Request failed (${res.status}).`) ||
          "Sorry — I could not complete that request. Please try again or contact the shop directly.";

        const assistantMsg: ChatMessage = {
          id: makeId("a"),
          role: "assistant",
          content,
          createdAt: Date.now(),
          products: data.products?.length ? data.products : undefined,
          quotation: data.quotation ?? undefined,
          orderCreated: data.orderCreated ?? undefined,
          intent: data.intent,
        };

        patchSession(sid, (s) => ({
          ...s,
          updatedAt: Date.now(),
          messages: [...s.messages, assistantMsg],
        }));
      } finally {
        setLoading(false);
      }
    },
    [activeSession, patchSession],
  );

  if (!hydrated || !activeSession) {
    return null;
  }

  const toggleOpen = () => {
    setOpen((v) => !v);
  };

  const zShell = wordpressEmbed ? "z-[2147483000]" : "z-[100]";
  const shellClass =
    open && fullscreen
      ? `fixed inset-0 ${zShell} flex flex-col bg-zinc-950/45 backdrop-blur-[2px] dark:bg-black/60`
      : `fixed bottom-6 right-6 ${zShell} flex flex-col items-end gap-3 bg-transparent`;

  return (
    <div className={[shellClass, wordpressEmbed ? "computechs-chat-scope" : ""].filter(Boolean).join(" ")}>
      {open ? (
        <div
          className={[
            "flex flex-col overflow-hidden",
            fullscreen
              ? "min-h-0 flex-1 justify-stretch px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(2.75rem,env(safe-area-inset-top))] sm:px-5 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-[max(1.25rem,env(safe-area-inset-top))]"
              : "origin-bottom-right pointer-events-auto w-full transition-all duration-300 ease-out",
          ]
            .join(" ")}
          style={!fullscreen ? { maxWidth: "min(96vw, 560px)" } : undefined}
        >
          <ChatWindow
            siteName={siteName}
            sessions={sessions}
            activeSession={activeSession}
            loading={loading}
            sidebarOpen={sidebarOpen}
            onSidebarOpenChange={setSidebarOpen}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((v) => !v)}
            minimized={minimized}
            onMinimize={() => setMinimized(true)}
            onRestore={() => setMinimized(false)}
            onClose={() => {
              setOpen(false);
              setMinimized(false);
              setFullscreen(false);
            }}
            onNewChat={handleNewChat}
            onSelectSession={setActiveId}
            onSend={handleSend}
            onExportTxt={() => exportChatTxt(activeSession)}
            onExportJson={() => exportChatJson(activeSession)}
          />
        </div>
      ) : null}

      <ChatBubble
        open={open}
        onClick={toggleOpen}
        label={open ? "Close chat assistant" : "Open chat assistant"}
        className={
          open && fullscreen
            ? `absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] shadow-2xl ${wordpressEmbed ? "z-[2147483010]" : "z-[102]"}`
            : undefined
        }
      />
    </div>
  );
}

export default ChatWidget;
