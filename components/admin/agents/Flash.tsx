"use client";

/**
 * components/admin/agents/Flash.tsx — the mockup's toast: one short
 * line at the bottom of the screen after an inline save. Used by the agent
 * tables, which save on blur and have no form to show a message in.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type FlashTone = "ok" | "error";

export function useFlash() {
  const [message, setMessage] = useState<{ text: string; tone: FlashTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: FlashTone = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setMessage({ text, tone });
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const node = message ? (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed bottom-6 left-1/2 z-[70] max-w-[min(92vw,520px)] -translate-x-1/2 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-[var(--adm-shadow-float)]",
        message.tone === "error" ? "bg-adm-danger text-white" : "bg-adm-strong text-adm-on-strong",
      ].join(" ")}
    >
      {message.text}
    </div>
  ) : null;

  return [node, show] as const;
}
