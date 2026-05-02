"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("@/components/chat/ChatWidget"), {
  ssr: false,
  loading: () => null,
});

export function ChatWidgetRoot({ siteName }: { siteName: string }) {
  return <ChatWidget siteName={siteName} />;
}
