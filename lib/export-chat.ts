import type { ChatSession } from "@/types/chat";

export function exportChatJson(session: ChatSession): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  downloadBlob(blob, `computechsleb-chat-${session.id}.json`);
}

export function exportChatTxt(session: ChatSession): void {
  const lines: string[] = [];
  lines.push(`ComputechsLeb — Chat export`);
  lines.push(`Session: ${session.title}`);
  lines.push(`Updated: ${new Date(session.updatedAt).toISOString()}`);
  lines.push("");
  for (const m of session.messages) {
    lines.push(`[${m.role.toUpperCase()}] ${new Date(m.createdAt).toISOString()}`);
    lines.push(m.content);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `computechsleb-chat-${session.id}.txt`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
