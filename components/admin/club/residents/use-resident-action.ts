"use client";

/**
 * Shared plumbing for the residents drawer's buttons and forms: run a
 * server action, toast its error key (clubResidents.errors.*) on failure.
 * The actions revalidate /admin/residents themselves, so success needs no
 * explicit refresh.
 */

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { showUndoToast } from "@/components/admin/UndoToast";
import type { ResidentActionResult } from "@/app/[locale]/admin/(club)/residents/actions";

export type FormAction = (prev: ResidentActionResult | null, form: FormData) => Promise<ResidentActionResult>;

type T = ReturnType<typeof useTranslations>;

export function errorText(t: T, key: string): string {
  const path = `errors.${key}`;
  return t.has(path) ? t(path) : t("errors.generic");
}

export function useRunAction() {
  const t = useTranslations("clubResidents");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ResidentActionResult>, onOk?: (result: ResidentActionResult & { ok: true }) => void) =>
    start(async () => {
      try {
        const result = await fn();
        if (result.ok) onOk?.(result);
        else showUndoToast({ message: errorText(t, result.error) });
      } catch {
        showUndoToast({ message: t("errors.generic") });
      }
    });
  return { pending, run, t };
}
