"use client";

import { useEffect } from "react";

/** Transparent chrome for iframe embeds on external sites (WordPress, etc.). */
export function ChatWidgetEmbedShell() {
  useEffect(() => {
    document.documentElement.classList.add("chat-widget-embed");
    document.body.classList.add("chat-widget-embed");
    return () => {
      document.documentElement.classList.remove("chat-widget-embed");
      document.body.classList.remove("chat-widget-embed");
    };
  }, []);

  return null;
}
