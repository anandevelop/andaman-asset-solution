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
 *
 * WHY SAVING LOOKED BROKEN, AND THE TWO PARTS OF THE FIX
 *
 * Every save looked as if it had not happened: the placement was stored
 * and the site changed, but the table went straight back to the old
 * choices until a reload. React 19 resets a form after its `action` prop
 * runs; the reset puts each <select> on its *default* option, and React
 * applies a select's defaultValue only when it mounts, so the value the
 * server sent back never reached it.
 *
 * So the form is submitted by hand (no reset), and the choices are held in
 * state, taking over the server's values whenever those change.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { startTransition, useActionState, useState, type FormEvent } from "react";
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
  "/agent/register": "agentRegister",
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

function SaveButton({ pending }: { pending: boolean }) {
  const t = useTranslations("admin.common");

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
  const [state, formAction, pending] = useActionState(action, INITIAL);

  const fallback = blocks.find((block) => block.isDefault && block.isActive);

  /* Submitted by hand, not through <form action>: React 19 resets a form
     after an `action` prop runs, and the reset moves every <select> in the
     DOM back to its first-render option behind React's back — controlled
     or not — so the table showed the old placements after every save. */
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  const fromServer = (list: PlacementRow[]) => Object.fromEntries(list.map((row) => [row.path, row.value]));
  const [values, setValues] = useState<Record<string, string>>(() => fromServer(rows));
  // Compared by content, not identity: a refresh that changes nothing must
  // not throw away a choice that has not been saved yet.
  const serverKey = rows.map((row) => `${row.path}=${row.value}`).join("|");
  const [seenKey, setSeenKey] = useState(serverKey);
  // New values from the server (after a save, or someone else's): adopt
  // them. Adjusted during render rather than in an effect, as React
  // recommends for state derived from props.
  if (serverKey !== seenKey) {
    setSeenKey(serverKey);
    setValues(fromServer(rows));
  }

  return (
    <form onSubmit={submit} className="space-y-5">
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
        <p className="flex items-start gap-2 rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {tc("noDefaultWarning")}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-adm-line text-left text-xs uppercase tracking-widest text-adm-muted">
              <th className="pb-2.5 font-medium">{tc("pageColumn")}</th>
              <th className="pb-2.5 font-medium">{tc("showsColumn")}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-adm-line">
            {rows.map((row) => {
              const key = PATH_KEYS[row.path];
              const name = key ? tc(`paths.${key}`) : row.path;

              return (
                <tr key={row.path}>
                  <td className="py-2.5 pr-4 align-middle">
                    <span className="font-medium text-adm-text">{name}</span>
                    <span className="ml-2 text-xs text-adm-muted">{row.path}</span>
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
                      value={values[row.path] ?? row.value}
                      onChange={(event) => {
                        const next = event.target.value;
                        setValues((prev) => ({ ...prev, [row.path]: next }));
                      }}
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

      <SaveButton pending={pending} />
    </form>
  );
}
