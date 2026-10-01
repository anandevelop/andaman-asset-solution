"use client";

/**
 * components/admin/UndoToast.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The one toast every tier-1 action uses: a small change applied at once,
 * with eight seconds to take it back, instead of a confirm dialog before
 * it. "Mark as visited", "take this lead", "move to Negotiating" are each
 * one click to do and one click to undo; a dialog on every one of them
 * trains people to click OK without reading, which is how the dialogs
 * that matter stop being read too.
 *
 * A module-level store rather than a context: an action handler anywhere
 * in the back office calls showUndoToast() without being inside a
 * provider, and <UndoToaster /> is mounted once in the admin layout.
 * One toast at a time — a second action replaces the first, whose change
 * then simply stands, as it would have when its timer ran out.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

export const UNDO_WINDOW_MS = 8000;

type Toast = {
  id: number;
  message: string;
  /** Absent for a plain notice ("Undone", or an error). */
  onUndo?: () => void | Promise<void>;
};

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showUndoToast(toast: Omit<Toast, "id">) {
  current = { ...toast, id: nextId++ };
  emit();
}

function dismiss(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function UndoToaster() {
  const t = useTranslations("admin.toast");
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dismiss(toast.id), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const undo = async () => {
    if (!toast.onUndo || busy) return;
    setBusy(true);
    try {
      await toast.onUndo();
      showUndoToast({ message: t("undone") });
    } catch {
      showUndoToast({ message: t("undoFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4 print:hidden"
    >
      {/* Navy in both themes, like the rail: a toast is chrome, not page. */}
      <div
        key={toast.id}
        className="relative flex max-w-[min(520px,100%)] items-center gap-4 overflow-hidden rounded-[12px] bg-adm-band py-2.5 pl-4 pr-2 text-[13px] text-white shadow-[var(--adm-shadow-float)] motion-safe:animate-[toast-in_.2s_ease-out]"
      >
        <span className="min-w-0 flex-1 truncate">{toast.message}</span>
        {toast.onUndo && (
          <button
            type="button"
            onClick={undo}
            disabled={busy}
            className="shrink-0 rounded-[8px] px-2.5 py-1 text-[13px] font-semibold text-adm-fill transition-colors hover:bg-white/10 disabled:opacity-60"
          >
            {t("undo")}
          </button>
        )}
        {/* How long is left to undo, drawn rather than counted. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-adm-fill/70 motion-safe:animate-[toast-timer_8s_linear_forwards]"
        />
      </div>
    </div>
  );
}
