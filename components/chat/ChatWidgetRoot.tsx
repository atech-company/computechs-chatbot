"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const ChatWidget = dynamic(() => import("@/components/chat/ChatWidget"), {
  ssr: false,
  loading: () => null,
});

export function ChatWidgetRoot({ siteName }: { siteName: string }) {
  const pathname = usePathname();
  const wordpressEmbed =
    pathname === "/wordpress-embed" || (pathname ?? "").startsWith("/wordpress-embed/");
  return <ChatWidget siteName={siteName} wordpressEmbed={wordpressEmbed} />;
}
