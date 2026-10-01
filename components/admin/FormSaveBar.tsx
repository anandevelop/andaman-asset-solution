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
 *
 * ⌘S / Ctrl+S submits the form the bar sits in — the browser's own "save
 * page as" is never what someone pressing it in a form meant. Unlike the
 * single-key shortcuts it works while typing, since that is exactly when
 * people press it. requestSubmit, not submit: it runs validation and the
 * form's action as the Save button would.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";

export default function FormSaveBar({
  dirty,
  unsavedLabel,
  children,
}: {
  dirty: boolean;
  unsavedLabel: string;
  children: React.ReactNode;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      const form = barRef.current?.closest("form");
      if (!form) return;
      event.preventDefault();
      form.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div
      ref={barRef}
      className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-[12px] border border-adm-line bg-adm-solid/95 px-4 py-2.5 shadow-[var(--adm-shadow-float)] backdrop-blur print:hidden"
    >
      <span
        className={[
          "flex items-center gap-2 text-xs transition-opacity",
          dirty ? "text-adm-accent-ink opacity-100" : "opacity-0",
        ].join(" ")}
        aria-live="polite"
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-adm-fill" />
        {dirty ? unsavedLabel : ""}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <kbd className="hidden rounded-[6px] border border-adm-line-strong px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted sm:inline">
          ⌘S
        </kbd>
        {children}
      </div>
    </div>
  );
}
