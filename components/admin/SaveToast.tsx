"use client";

/**
 * components/admin/SaveToast.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Floating save/error feedback for admin forms — replaces the inline
 * banner (a <p> sitting in the document flow above the form) that every
 * admin form used to render directly. Same green-success / red-error
 * visual language as before (emerald/red border+background+text, an icon
 * passed in as a child alongside the message), just repositioned as a
 * fixed top-right toast that dismisses itself instead of permanently
 * pushing form content down.
 *
 * Usage — drop-in replacement for the old <p className="...">:
 *
 *   {state.ok && state.message === "SAVED" && (
 *     <SaveToast tone="success" token={state}>
 *       <CheckCircle2 size={16} aria-hidden />
 *       {t("common.saved")}
 *     </SaveToast>
 *   )}
 *
 * `token` — pass the useFormState `state` object itself. React does not
 * remount a component just because its enclosing condition was already
 * true on the previous render (e.g. saving twice in a row both times
 * yield state.ok===true / state.message==="SAVED"), so a mount-once timer
 * would only ever fire for the FIRST save. useFormState returns a new
 * object reference on every submit regardless of whether the field values
 * changed, so keying the re-arm effect off that reference makes the toast
 * reappear on every save, not just the first one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  tone: "success" | "error";
  token: unknown;
  children: React.ReactNode;
  /** ms before auto-dismiss. */
  duration?: number;
};

export default function SaveToast({ tone, token, children, duration = 4000 }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [token, duration]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={[
            "fixed right-6 top-6 z-[100] flex items-center gap-2 rounded-sm border px-4 py-3",
            "text-sm shadow-lg",
            tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          ].join(" ")}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
