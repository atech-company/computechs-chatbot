"use client";

import { useEffect, useLayoutEffect } from "react";

const useIsoLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

/** Full-viewport iframe shell: transparent + click-through so the parent WP page stays usable outside the bubble. */
export function WordPressEmbedShell() {
  useIsoLayoutEffect(() => {
    document.documentElement.classList.add("wp-chat-embed");
    document.body.classList.add("wp-chat-embed");
    return () => {
      document.documentElement.classList.remove("wp-chat-embed");
      document.body.classList.remove("wp-chat-embed");
    };
  }, []);

  return null;
}
