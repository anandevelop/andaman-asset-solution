"use client";

/**
 * components/forms/use-keep-values-on-error.ts
 * ─────────────────────────────────────────────────────────────────────────
 * React 19 resets a <form action={…}> once its action has run — on success
 * and on failure alike. After a server-side validation error that wipes
 * everything the person typed, and the error message then points at an
 * empty field.
 *
 * CtaPlacementTable gets round it by submitting by hand, but that also
 * switches off useFormStatus, which nearly every form here uses for its
 * button. This keeps <form action> and puts the values back instead:
 *
 *   const keep = useKeepValuesOnError(state, !state.ok);
 *   <form ref={keep} action={formAction}>
 *
 * The values are read at submit and written back in the commit that
 * carries the action's result — the same one the reset happens in, so
 * nothing flickers. A success is left alone: there the reset (an emptied
 * create form, an edit form back on the saved values) is what is wanted.
 * File inputs cannot be refilled by script and are skipped.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useLayoutEffect, useRef } from "react";

type Saved = { el: Element; value: string | string[] | boolean };

function capture(form: HTMLFormElement): Saved[] {
  const saved: Saved[] = [];
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement) {
      if (!el.name || el.type === "file" || el.type === "submit" || el.type === "button") continue;
      saved.push({ el, value: el.type === "checkbox" || el.type === "radio" ? el.checked : el.value });
    } else if (el instanceof HTMLSelectElement) {
      if (!el.name) continue;
      saved.push({ el, value: el.multiple ? Array.from(el.selectedOptions, (o) => o.value) : el.value });
    } else if (el instanceof HTMLTextAreaElement) {
      if (!el.name) continue;
      saved.push({ el, value: el.value });
    }
  }
  return saved;
}

function restore(saved: Saved[]) {
  for (const { el, value } of saved) {
    if (!el.isConnected) continue;
    if (el instanceof HTMLInputElement) {
      if (typeof value === "boolean") el.checked = value;
      else if (typeof value === "string") el.value = value;
    } else if (el instanceof HTMLSelectElement) {
      if (Array.isArray(value)) for (const o of Array.from(el.options)) o.selected = value.includes(o.value);
      else el.value = value as string;
    } else if (el instanceof HTMLTextAreaElement) {
      el.value = value as string;
    }
  }
}

export function useKeepValuesOnError(state: unknown, failed: boolean) {
  const saved = useRef<Saved[] | null>(null);

  const ref = useCallback((form: HTMLFormElement | null) => {
    if (!form) return;
    const onSubmit = () => {
      saved.current = capture(form);
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, []);

  useLayoutEffect(() => {
    const values = saved.current;
    saved.current = null;
    if (values && failed) restore(values);
    // `failed` is derived from `state`; the new state is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return ref;
}
