import type { ChatSession } from "@/types/chat";

const KEY = "computechsleb-chat-sessions-v1";

export function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(data)) return [];
    return data.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    /* quota */
  }
}

export function newSession(): ChatSession {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = Date.now();
  return {
    id,
    title: "New chat",
    messages: [
      {
        id: `m-${now}`,
        role: "assistant",
        content:
          "Hi — I'm the ComputechsLeb assistant. Tell me what you're looking for (laptop, parts, bulk quote, or order help) and I'll guide you.",
        createdAt: now,
      },
    ],
    updatedAt: now,
  };
}
