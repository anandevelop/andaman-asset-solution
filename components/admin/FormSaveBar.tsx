"use client";

/**
 * components/admin/FormSaveBar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The save/cancel row of a long form, pinned to the bottom of the screen
 * so "Save" is reachable from the first field as well as the last.
 *
 * It also says when there is something to save. The forms here are
 * uncontrolled (see ProjectForm's header), so "dirty" is simply "an input
 * or change event bubbled up from inside the form since it last rendered
 * or was submitted" — the parent passes `dirty` in and resets it itself.
 * While dirty, leaving the page asks first: a project form is long enough
 * that losing it to a stray sidebar click is a real afternoon lost.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";

export default function FormSaveBar({
  dirty,
  unsavedLabel,
  children,
}: {
  dirty: boolean;
  unsavedLabel: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-[8px] border border-primary/10 bg-surface-raised/95 px-4 py-2.5 shadow-[0_8px_24px_-12px_rgba(8,53,81,0.35)] backdrop-blur print:hidden">
      <span
        className={[
          "flex items-center gap-2 text-xs transition-opacity",
          dirty ? "text-accent-700 opacity-100" : "opacity-0",
        ].join(" ")}
        aria-live="polite"
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-accent-500" />
        {dirty ? unsavedLabel : ""}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
