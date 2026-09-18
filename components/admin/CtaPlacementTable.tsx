"use client";

/**
 * components/admin/CtaPlacementTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Which closing-CTA block each public page shows — one select per page,
 * saved as a set.
 *
 * A section prefix stands for everything under it: choosing a block for
 * "Projects" gives it to the list and to every project page, which is how
 * the band was gated before it became editable. There is deliberately no
 * row for an individual project — a table with one line per development
 * would grow every time one is published, and nobody was asking for a
 * different closing sentence on villa three than on villa two.
 *
 * "Use the default" is not the same as naming the default block: it
 * records that no decision was made for this page, so a later change of
 * default follows it. Naming a block pins the page to that block until
 * somebody changes it back.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import { PLACEMENT_DEFAULT, PLACEMENT_HIDDEN } from "@/lib/validations";
import type { SiteCtaFormState } from "@/app/[locale]/admin/(content)/pages/home/cta/actions";

/** Message keys for the paths in lib/public-paths.ts. A path with no entry
 *  falls back to showing itself, so adding a page cannot break this table
 *  — it just reads a little more technically until a label is written. */
const PATH_KEYS: Record<string, string> = {
  "/": "home",
  "/about": "about",
  "/achievements": "achievements",
  "/contact": "contact",
  "/e-brochure": "eBrochure",
  "/events": "events",
  "/news": "news",
  "/privacy-policy": "privacyPolicy",
  "/progress": "progress",
  "/projects": "projects",
  "/terms": "terms",
};

export type PlacementRow = {
  path: string;
  /** PLACEMENT_DEFAULT, PLACEMENT_HIDDEN, or a block id. */
  value: string;
};

export type PlacementBlockOption = {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
};

type Props = {
  rows: PlacementRow[];
  blocks: PlacementBlockOption[];
  action: (state: SiteCtaFormState, formData: FormData) => Promise<SiteCtaFormState>;
};

const INITIAL: SiteCtaFormState = { ok: false };

function SaveButton() {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        t("save")
      )}
    </button>
  );
}

export default function CtaPlacementTable({ rows, blocks, action }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("admin.cta");
  const [state, formAction] = useActionState(action, INITIAL);

  const fallback = blocks.find((block) => block.isDefault && block.isActive);

  return (
    <form action={formAction} className="space-y-5">
      {state.ok && (
        <SaveToast tone="success" token={state}>
          <CheckCircle2 size={15} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      {!state.ok && state.message === "SAVE_FAILED" && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={15} aria-hidden />
          {t("common.error")}
        </SaveToast>
      )}

      {/* Without an active default, every page left on "use the default"
          renders no CTA at all. That is a legal configuration — it is just
          never what somebody meant to do silently. */}
      {!fallback && (
        <p className="flex items-start gap-2 rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {tc("noDefaultWarning")}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-primary/10 text-left text-xs uppercase tracking-widest text-ink-muted">
              <th className="pb-2.5 font-medium">{tc("pageColumn")}</th>
              <th className="pb-2.5 font-medium">{tc("showsColumn")}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-primary/5">
            {rows.map((row) => {
              const key = PATH_KEYS[row.path];
              const name = key ? tc(`paths.${key}`) : row.path;

              return (
                <tr key={row.path}>
                  <td className="py-2.5 pr-4 align-middle">
                    <span className="font-medium text-ink">{name}</span>
                    <span className="ml-2 text-xs text-ink-muted">{row.path}</span>
                  </td>

                  <td className="py-2.5 align-middle">
                    <select
                      name={`path:${row.path}`}
                      /* The visible label for this control is the page name
                         in the cell beside it, which a screen reader reads
                         as a separate cell rather than as this select's
                         name. Eleven identically-labelled selects would be
                         eleven "Shows" with no way to tell them apart. */
                      aria-label={name}
                      defaultValue={row.value}
                      className="admin-input w-auto! max-w-[280px]"
                    >
                      <option value={PLACEMENT_DEFAULT}>
                        {fallback
                          ? tc("useDefaultNamed", { name: fallback.name })
                          : tc("useDefault")}
                      </option>
                      <option value={PLACEMENT_HIDDEN}>{tc("hideHere")}</option>

                      {blocks.map((block) => (
                        <option key={block.id} value={block.id}>
                          {block.isActive ? block.name : tc("blockOff", { name: block.name })}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SaveButton />
    </form>
  );
}
