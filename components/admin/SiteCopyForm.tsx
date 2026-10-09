"use client";

/**
 * components/admin/SiteCopyForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The grid of /admin/pages/copy: one row per message key, one cell per
 * language (Thai, English, Chinese, Russian), side by side.
 *
 * Every cell shows the text the site actually prints — the saved edit, or
 * else the built-in copy — never a grey placeholder. Under it, one line of
 * status: default / edited / unsaved / "check against the Thai". "Use
 * default" puts the built-in text back in the cell; like any other change
 * it takes effect on save.
 *
 * Controlled, and only changed cells are posted (as hidden inputs named
 * `copy:<locale>:<key>`), so a save of a 150-row section sends the three
 * cells that moved. Placeholders are checked as you type with the same
 * validateCopy the action runs, so a broken {km} is caught before Save.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react";
import SaveToast from "@/components/admin/SaveToast";
import FormSaveBar from "@/components/admin/FormSaveBar";
import CopyValueField from "@/components/copy/CopyValueField";
import type { SiteCopyFormState } from "@/app/[locale]/admin/(content)/pages/copy/actions";
import { validateCopy, type CopyProblem } from "@/lib/site-copy-core";
import type { CopyKind } from "@/lib/site-copy-meta";

export type SiteCopyCell = {
  locale: string;
  /** The copy in messages/<locale>.json. */
  fallback: string;
  /** The stored override, or null when the site uses the fallback. */
  saved: string | null;
  /** Thai was edited after this language last was. */
  stale: boolean;
};

export type SiteCopyRow = {
  key: string;
  kind: CopyKind;
  /** False for content/*.ts text, which is never parsed as ICU. */
  icu: boolean;
  /** Written per case ({count, plural, …}): drawn as one box per case. */
  counted: boolean;
  /** Placeholders the copy may use, e.g. ["km"]. */
  args: string[];
  tags: string[];
  cells: SiteCopyCell[];
};

export type SiteCopyGroup = { id: string; title: string; rows: SiteCopyRow[] };

type Props = {
  action: (state: SiteCopyFormState, formData: FormData) => Promise<SiteCopyFormState>;
  groups: SiteCopyGroup[];
  /** A row to scroll to and highlight (?key=). */
  focusKey: string | null;
  /** "Translations checked" for a flagged row; null for read-only viewers. */
  markReviewed: ((key: string) => Promise<{ ok: boolean }>) | null;
};

/** Native names: the same in every back-office language. */
const LANGUAGE_NAMES: Record<string, string> = { th: "ไทย", en: "English", zh: "中文", ru: "Русский" };

const INITIAL: SiteCopyFormState = { ok: false };

const cellId = (locale: string, key: string) => `${locale}:${key}`;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations("admin");
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("common.saving")}
        </>
      ) : (
        t("pages.copy.saveAndPublish")
      )}
    </button>
  );
}

/** Rows to open a cell at: a button label is one line, a paragraph more. */
function rowsFor(text: string): number {
  const n = text.length;
  return n > 400 ? 6 : n > 200 ? 4 : n > 60 ? 2 : 1;
}

export default function SiteCopyForm({ action, groups, focusKey, markReviewed }: Props) {
  const t = useTranslations("admin.pages.copy");
  const tAdmin = useTranslations("admin");
  const tCases = useTranslations("editMode.cases");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [state, formAction] = useActionState(async (previous: SiteCopyFormState, formData: FormData) => {
    const result = await action(previous, formData);
    // A save that went through re-renders the page with the new values;
    // the local edits are now the saved state.
    if (result.ok) setEdits({});
    return result;
  }, INITIAL);
  const focusRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [reviewing, startReviewing] = useTransition();
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const [reviewFailed, setReviewFailed] = useState<string | null>(null);

  const confirmReviewed = (key: string) => {
    if (!markReviewed) return;
    setReviewKey(key);
    setReviewFailed(null);
    startReviewing(async () => {
      const result = await markReviewed(key);
      if (result.ok) router.refresh();
      else setReviewFailed(key);
    });
  };

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const rowsByKey = useMemo(() => {
    const map = new Map<string, SiteCopyRow>();
    for (const group of groups) for (const row of group.rows) map.set(row.key, row);
    return map;
  }, [groups]);

  /** Changed cells, with what the site shows now for comparison. */
  const dirty = useMemo(() => {
    const out: { id: string; value: string }[] = [];
    for (const [id, value] of Object.entries(edits)) {
      const split = id.indexOf(":");
      const row = rowsByKey.get(id.slice(split + 1));
      const cell = row?.cells.find((c) => c.locale === id.slice(0, split));
      if (!cell) continue;
      if (value !== (cell.saved ?? cell.fallback)) out.push({ id, value });
    }
    return out;
  }, [edits, rowsByKey]);

  const localProblems = useMemo(() => {
    const out: Record<string, CopyProblem> = {};
    for (const { id, value } of dirty) {
      const split = id.indexOf(":");
      const row = rowsByKey.get(id.slice(split + 1));
      const cell = row?.cells.find((c) => c.locale === id.slice(0, split));
      if (!row?.icu || !cell || value.trim() === "") continue;
      const problem = validateCopy(cell.fallback, value);
      if (problem) out[id] = problem;
    }
    return out;
  }, [dirty, rowsByKey]);

  const hasProblems = Object.keys(localProblems).length > 0;

  const problemText = (problem: CopyProblem) =>
    problem.code === "SYNTAX"
      ? t("errors.syntax")
      : problem.code === "UNKNOWN_ARGUMENT"
        ? t("errors.unknownArgument", { name: problem.name })
        : t("errors.unknownTag", { name: problem.name });

  return (
    <form action={formAction} className="space-y-4">
      {state.ok && (
        <SaveToast tone="success" token={state}>
          <CheckCircle2 size={16} aria-hidden />
          {t("savedCount", { count: state.saved ?? 0 })}
        </SaveToast>
      )}
      {!state.ok && (state.message === "SAVE_FAILED" || state.fields) && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={16} aria-hidden />
          {state.fields ? t("errors.some") : tAdmin("common.error")}
        </SaveToast>
      )}

      {dirty.map(({ id, value }) => (
        <input key={id} type="hidden" name={`copy:${id}`} value={value} />
      ))}

      <section className="admin-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className="sticky top-0 z-10 grid grid-cols-4 gap-3 border-b border-adm-line bg-adm-text/4 px-5 py-2.5 text-xs text-adm-muted">
              {["th", "en", "zh", "ru"].map((l) => (
                <div key={l}>
                  <span className="font-semibold text-adm-text">{LANGUAGE_NAMES[l]}</span>
                  {l === "th" && <span className="ml-2">{t("primaryLanguage")}</span>}
                </div>
              ))}
            </div>

            {groups.map((group) => (
              <div key={group.id}>
                <h4 className="px-5 pb-1 pt-4 text-sm font-semibold text-adm-text">{group.title}</h4>
                {group.rows.map((row) => {
                  const rowStale = row.cells.some((c) => c.stale);
                  const focused = row.key === focusKey;
                  return (
                    <div
                      key={row.key}
                      id={`copy-row-${row.key}`}
                      ref={focused ? focusRef : undefined}
                      className={`border-b border-adm-line/70 px-5 pb-3.5 pt-2.5 last:border-b-0 ${
                        focused ? "bg-adm-fill/10" : ""
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-adm-muted">
                        <span className="rounded-full bg-adm-neutral-bg px-2 py-0.5 text-adm-neutral">
                          {t(`kinds.${row.kind}`)}
                        </span>
                        {row.counted && (
                          <span className="rounded-full bg-adm-status-info-bg px-2 py-0.5 text-adm-status-info">
                            {tCases("intro")} {tCases("pound")}
                          </span>
                        )}
                        {(row.args.length > 0 || row.tags.length > 0) && (
                          <span className="rounded-full bg-adm-status-info-bg px-2 py-0.5 text-adm-status-info">
                            {t("placeholders", {
                              list: [...row.args.map((a) => `{${a}}`), ...row.tags.map((g) => `<${g}>`)].join(" "),
                            })}
                          </span>
                        )}
                        {rowStale && (
                          <span className="rounded-full bg-adm-warning-bg px-2 py-0.5 text-adm-warning">
                            {t("reviewRow")}
                          </span>
                        )}
                        {/* The way out of the flag when the translations
                            need no change — see markCopyReviewed. Hidden
                            while the row has unsaved edits: saving those
                            clears the flag for the languages edited. */}
                        {rowStale && markReviewed && !row.cells.some((c) => cellId(c.locale, row.key) in edits) && (
                          <button
                            type="button"
                            onClick={() => confirmReviewed(row.key)}
                            disabled={reviewing}
                            title={t("markReviewedHint")}
                            className="inline-flex items-center gap-1 rounded-full border border-adm-warning/40 px-2 py-0.5 text-adm-warning hover:bg-adm-warning-bg disabled:opacity-60"
                          >
                            {reviewing && reviewKey === row.key ? (
                              <Loader2 size={12} className="animate-spin" aria-hidden />
                            ) : (
                              <Check size={12} aria-hidden />
                            )}
                            {t("markReviewed")}
                          </button>
                        )}
                        {reviewFailed === row.key && (
                          <span role="alert" className="text-adm-danger">
                            {tAdmin("common.error")}
                          </span>
                        )}
                        <span className="ml-auto break-all font-mono text-[11px] text-adm-muted/80">{row.key}</span>
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        {row.cells.map((cell) => {
                          const id = cellId(cell.locale, row.key);
                          const current = cell.saved ?? cell.fallback;
                          const value = edits[id] ?? current;
                          const isDirty = id in edits && edits[id] !== current;
                          const willDefault = isDirty && (value.trim() === "" || value.trim() === cell.fallback);
                          const overridden = cell.saved !== null;
                          const problem = localProblems[id] ?? (isDirty ? state.fields?.[id] : undefined);

                          let tone = "border-adm-line-strong bg-adm-panel";
                          let note = t("status.default");
                          let noteClass = "text-adm-muted";
                          if (overridden) {
                            tone = "border-adm-accent-ink/35 bg-adm-fill/8";
                            note = t("status.edited");
                            noteClass = "text-adm-accent-ink";
                          }
                          if (cell.stale && !isDirty) {
                            tone = "border-adm-warning/40 bg-adm-warning-bg/50";
                            note = t("status.review");
                            noteClass = "text-adm-warning";
                          }
                          if (isDirty) {
                            tone = "border-adm-ocean bg-adm-panel";
                            note = willDefault ? t("status.willReset") : t("status.unsaved");
                            noteClass = "text-adm-status-info";
                          }
                          if (problem) {
                            tone = "border-adm-danger bg-adm-panel";
                            noteClass = "text-adm-danger";
                          }

                          return (
                            <div key={cell.locale} className="flex min-w-0 flex-col gap-1">
                              <label htmlFor={`cell-${id}`} className="sr-only">
                                {`${row.key} — ${LANGUAGE_NAMES[cell.locale]}`}
                              </label>
                              <CopyValueField
                                id={`cell-${id}`}
                                lang={cell.locale}
                                value={value}
                                rows={rowsFor(current)}
                                onChange={(next) => setEdits((prev) => ({ ...prev, [id]: next }))}
                                invalid={Boolean(problem)}
                                describedBy={`note-${id}`}
                                fallback={cell.fallback}
                                compact
                                className={`w-full resize-y rounded-[8px] border px-2.5 py-2 text-sm leading-snug text-adm-text outline-none transition-colors focus:border-adm-ocean focus:ring-3 focus:ring-adm-ocean/20 ${tone}`}
                              />
                              <div id={`note-${id}`} className={`flex min-h-4 items-start gap-1.5 text-[11.5px] ${noteClass}`}>
                                {problem ? (
                                  <span role="alert">{problemText(problem)}</span>
                                ) : (
                                  <span title={overridden || isDirty ? `${t("defaultWas")} ${cell.fallback}` : undefined}>
                                    {note}
                                  </span>
                                )}
                                {(overridden || isDirty) && value !== cell.fallback && (
                                  <button
                                    type="button"
                                    onClick={() => setEdits((prev) => ({ ...prev, [id]: cell.fallback }))}
                                    className="ml-auto shrink-0 text-adm-ocean underline underline-offset-2 hover:text-adm-text"
                                  >
                                    {t("useDefault")}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <FormSaveBar dirty={dirty.length > 0} unsavedLabel={t("unsaved", { count: dirty.length })}>
        {dirty.length > 0 && (
          <button type="button" onClick={() => setEdits({})} className="admin-btn-ghost">
            {t("discard")}
          </button>
        )}
        <SubmitButton disabled={dirty.length === 0 || hasProblems} />
      </FormSaveBar>
    </form>
  );
}
