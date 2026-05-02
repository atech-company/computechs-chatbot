"use client";

import { useEffect } from "react";

/** Full-viewport iframe shell: transparent + click-through so the parent WP page stays usable outside the bubble. */
export function WordPressEmbedShell() {
  useEffect(() => {
    document.documentElement.classList.add("wp-chat-embed");
    document.body.classList.add("wp-chat-embed");
    return () => {
      document.documentElement.classList.remove("wp-chat-embed");
      document.body.classList.remove("wp-chat-embed");
    };
  }, []);

  return null;
}
