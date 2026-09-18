"use client";

/**
 * components/admin/ProjectContentEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The 4-language content editor (Content.dc.html) — the source language on
 * the left, the one being written on the right, field by field, with the
 * public page beside them.
 *
 * WHY UNSAVED WORK GOES TO localStorage AND NOT TO THE DATABASE.
 *
 * The brief asked for an autosave, because closing the tab currently loses
 * everything. But ProjectTranslation rows are the live content — saving
 * one on a published project changes the public site (see this route's
 * actions.ts). An autosave would therefore quietly republish a
 * half-written paragraph every thirty seconds, which is a worse failure
 * than losing a draft.
 *
 * So the in-progress edit is kept in the browser instead: it survives a
 * closed tab, a crash and a navigation, and it reaches visitors only when
 * someone presses Save. The beforeunload prompt stays as the last warning
 * for the case localStorage cannot cover (a different machine).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Monitor,
  RotateCcw,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { saveProjectContent } from "@/app/[locale]/admin/(catalog)/projects/[id]/content/actions";
import { CONTENT_FIELDS, META_LIMITS, type ContentField } from "@/lib/project-content";

export type ContentValues = Record<ContentField, string>;

export type LanguageTab = {
  locale: string;
  label: string;
  /** How much of the source language's copy exists here, 0–100. */
  percent: number;
  isSource: boolean;
};

type Props = {
  adminLocale: string;
  projectId: string;
  projectSlug: string;
  /** Which language is being written. */
  target: string;
  /** The language shown on the left, read-only, as the thing to translate. */
  source: string;
  sourceValues: ContentValues;
  targetValues: ContentValues;
  languages: LanguageTab[];
  /** Public origin for the preview iframe, e.g. https://andamanassetsolution.com */
  siteOrigin: string;
  isPublished: boolean;
  labels: {
    sectionTitle: string;
    sourceNote: string;
    targetNote: string;
    compareWith: string;
    fields: Record<ContentField, string>;
    required: string;
    untranslated: string;
    copyFromSource: string;
    copyAllFromSource: string;
    unsavedHint: string;
    discard: string;
    save: string;
    saveGoesLive: string;
    saving: string;
    savedJustNow: string;
    restoredNotice: string;
    previewTitle: string;
    previewDesktop: string;
    previewMobile: string;
    previewUnpublished: string;
    previewNote: string;
    error: string;
    confirmDiscard: string;
  };
};

/** Fields shown as a textarea rather than a single line. */
const MULTILINE: ContentField[] = ["description", "conceptDesign", "aboutThisProject", "metaDescription"];

/** Viewport the preview renders at, and how far it is scaled to fit the
 *  panel. Widths are real device widths, not guesses. */
const FRAME = {
  desktop: { width: 1280, height: 1800, scale: 0.3 },
  mobile: { width: 390, height: 780, scale: 0.85 },
} as const;

const isMeta = (field: ContentField): field is "metaTitle" | "metaDescription" =>
  field === "metaTitle" || field === "metaDescription";

export default function ProjectContentEditor({
  adminLocale,
  projectId,
  projectSlug,
  target,
  source,
  sourceValues,
  targetValues,
  languages,
  siteOrigin,
  isPublished,
  labels,
}: Props) {
  const router = useRouter();
  // The only string here whose number is not known until you type.
  const tContent = useTranslations("admin.projectContent");

  const storageKey = `andaman:project-content:${projectId}:${target}`;

  const [values, setValues] = useState<ContentValues>(targetValues);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [pending, startTransition] = useTransition();

  // What was last written to the database, so "dirty" survives a save
  // without needing the server to re-render the whole page.
  const savedValues = useRef<ContentValues>(targetValues);

  const dirtyFields = useMemo(
    // eslint-disable-next-line react-hooks/refs -- comparing against the last saved values, which is a ref precisely because changing it must not re-render.
    () => CONTENT_FIELDS.filter((field) => values[field] !== savedValues.current[field]),
    [values],
  );
  const isDirty = dirtyFields.length > 0;

  /*
    Restore an edit left behind by a closed tab. Only when it actually
    differs from what is in the database — otherwise every visit would open
    with a "restored" notice for a draft identical to the saved copy.
  */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as ContentValues;
      const differs = CONTENT_FIELDS.some((field) => (parsed[field] ?? "") !== targetValues[field]);
      if (differs) {
        setValues({ ...targetValues, ...parsed });
        setRestored(true);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // A corrupt or unreadable entry is not worth reporting: the database
      // copy is already on screen, which is the safe state.
    }
  }, [storageKey, targetValues]);

  // Keep the browser copy in step with every keystroke.
  useEffect(() => {
    try {
      if (isDirty) window.localStorage.setItem(storageKey, JSON.stringify(values));
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Private browsing, or a full quota — the editor still works, it just
      // loses the safety net, and the beforeunload prompt below covers it.
    }
  }, [values, isDirty, storageKey]);

  // The last line of defence, for a machine the localStorage copy is not on.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const setField = useCallback((field: ContentField, value: string) => {
    setError(false);
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  const save = () => {
    setError(false);
    startTransition(async () => {
      const result = await saveProjectContent(adminLocale, { projectId, locale: target, values });

      if (!result.ok) {
        setError(true);
        return;
      }

      savedValues.current = { ...values };
      setSavedAt(new Date(result.savedAt));
      setRestored(false);
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* nothing to clean up if storage is unavailable */
      }
      // Reload the preview so it shows what was just saved, and refresh the
      // page so the language percentages recount.
      setPreviewNonce((value) => value + 1);
      router.refresh();
    });
  };

  const discard = () => {
    if (!window.confirm(labels.confirmDiscard)) return;
    setValues({ ...savedValues.current });
    setRestored(false);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* see above */
    }
  };

  const copyField = (field: ContentField) => setField(field, sourceValues[field]);

  const copyAll = () => {
    setError(false);
    setValues((current) => {
      const next = { ...current };
      // Only the empty ones: this is a starting point for untranslated
      // fields, not something that should overwrite finished copy.
      for (const field of CONTENT_FIELDS) {
        if (next[field].trim().length === 0) next[field] = sourceValues[field];
      }
      return next;
    });
  };

  /* Same-origin and relative: the preview must show *this* deployment —
     in development that is localhost, not the production host the URL bar
     below displays. The nonce busts the iframe cache after a save. */
  const previewSrc = `/${target}/projects/${projectSlug}?v=${previewNonce}`;

  return (
    <div className="space-y-4">
      {/* ── Unsaved-work bar ─────────────────────────────────────────── */}
      {isDirty && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xs bg-primary px-4 py-3 text-white shadow-card">
          <TriangleAlert size={16} className="shrink-0 text-accent-200" aria-hidden />
          <span className="text-sm font-medium">
            {tContent("unsavedBar", { count: dirtyFields.length })}
          </span>
          <span className="hidden text-xs text-white/70 sm:inline">{labels.unsavedHint}</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={discard}
              disabled={pending}
              className="text-sm text-white/80 transition-colors hover:text-white disabled:opacity-50"
            >
              {labels.discard}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-xs bg-white px-3.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-white/90 disabled:opacity-60"
            >
              {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {/* On a live project this button changes the public site, so
                  it says that rather than "save draft". */}
              {isPublished ? labels.saveGoesLive : labels.save}
            </button>
          </div>
        </div>
      )}

      {restored && (
        <p className="flex items-center gap-2 rounded-xs border border-accent/30 bg-accent-50/70 px-4 py-2.5 text-sm text-accent-800">
          <RotateCcw size={15} className="shrink-0" aria-hidden />
          {labels.restoredNotice}
        </p>
      )}

      {error && (
        <p className="flex items-center gap-2 rounded-xs border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" aria-hidden />
          {labels.error}
        </p>
      )}

      {/* ── Language row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs text-ink-muted">{labels.compareWith}</span>

        {languages.map((language) => {
          const isTarget = language.locale === target;
          return (
            <span key={language.locale} className="flex items-center gap-2.5">
              <a
                href={`?lang=${language.locale}`}
                aria-current={isTarget ? "page" : undefined}
                className={[
                  "flex items-center gap-2 rounded-xs border px-3 py-1.5 text-sm font-medium transition-colors",
                  isTarget
                    ? "border-primary bg-primary text-white"
                    : language.isSource
                      ? "border-primary/25 bg-surface-raised text-primary"
                      : "border-primary/15 bg-surface-raised text-ink-muted hover:border-primary/30",
                ].join(" ")}
              >
                {language.label}
                <span
                  className={[
                    "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    language.isSource
                      ? "bg-primary/10 text-primary"
                      : language.percent >= 90
                        ? "bg-emerald-100 text-emerald-800"
                        : language.percent >= 50
                          ? "bg-accent/20 text-accent-800"
                          : "bg-red-100 text-red-700",
                    isTarget ? "bg-white/20! text-white!" : "",
                  ].join(" ")}
                >
                  {language.isSource ? labels.sourceNote : `${language.percent}%`}
                </span>
              </a>
              {language.isSource && <ArrowRight size={14} className="text-ink-muted" aria-hidden />}
            </span>
          );
        })}

        <button
          type="button"
          onClick={copyAll}
          className="admin-btn-ghost ml-auto py-2! text-xs"
        >
          <Copy size={13} aria-hidden />
          {labels.copyAllFromSource}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── Field pairs ────────────────────────────────────────────── */}
        <section className="admin-card p-0!">
          <div className="grid grid-cols-2 gap-4 border-b border-primary/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-primary">{labels.sectionTitle}</h2>
            <p className="text-xs text-ink-muted">
              {languages.find((l) => l.locale === target)?.label} · {labels.targetNote}
            </p>
          </div>

          <div className="space-y-5 p-4">
            {CONTENT_FIELDS.map((field) => {
              const sourceText = sourceValues[field];
              const targetText = values[field];
              const missing = sourceText.trim().length > 0 && targetText.trim().length === 0;

              return (
                <div key={field}>
                  <label
                    htmlFor={`content-${field}`}
                    className="admin-label flex items-center gap-1"
                  >
                    {labels.fields[field]}
                    {field === "name" && <span className="text-red-600">*</span>}
                  </label>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Source: read-only on purpose — this pane is the thing
                        being translated from, and editing it here would be
                        editing a different language than the one selected. */}
                    {MULTILINE.includes(field) ? (
                      <textarea
                        readOnly
                        value={sourceText}
                        rows={field === "description" ? 4 : 3}
                        aria-label={`${labels.fields[field]} (${source})`}
                        className="admin-textarea min-h-0! cursor-default bg-surface-muted/60 text-ink-muted"
                      />
                    ) : (
                      <input
                        readOnly
                        value={sourceText}
                        aria-label={`${labels.fields[field]} (${source})`}
                        className="admin-input cursor-default bg-surface-muted/60 text-ink-muted"
                      />
                    )}

                    <div>
                      {MULTILINE.includes(field) ? (
                        <textarea
                          id={`content-${field}`}
                          value={targetText}
                          onChange={(event) => setField(field, event.target.value)}
                          rows={field === "description" ? 4 : 3}
                          className={`admin-textarea min-h-0! ${missing ? "border-red-300" : ""}`}
                        />
                      ) : (
                        <input
                          id={`content-${field}`}
                          value={targetText}
                          onChange={(event) => setField(field, event.target.value)}
                          className={`admin-input ${missing ? "border-red-300" : ""}`}
                        />
                      )}

                      <div className="mt-1 flex items-start justify-between gap-3">
                        {missing ? (
                          <button
                            type="button"
                            onClick={() => copyField(field)}
                            className="text-left text-xs text-red-700 hover:underline"
                          >
                            {labels.untranslated} — {labels.copyFromSource}
                          </button>
                        ) : (
                          <span />
                        )}

                        {isMeta(field) && (
                          <span
                            className={`shrink-0 text-xs tabular-nums ${
                              targetText.length > META_LIMITS[field]
                                ? "font-semibold text-red-700"
                                : "text-ink-muted"
                            }`}
                          >
                            {targetText.length} / {META_LIMITS[field]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-primary/10 px-4 py-3">
            <button
              type="button"
              onClick={save}
              disabled={pending || !isDirty}
              className="admin-btn py-2! text-sm"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Check size={14} aria-hidden />
              )}
              {isPublished ? labels.saveGoesLive : labels.save}
            </button>

            {savedAt && !isDirty && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                <Check size={13} aria-hidden />
                {labels.savedJustNow}
              </span>
            )}
          </div>
        </section>

        {/* ── Live preview ───────────────────────────────────────────── */}
        <section className="admin-card p-0! xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center justify-between border-b border-primary/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-primary">{labels.previewTitle}</h2>
            <div className="flex items-center gap-1">
              {(["desktop", "mobile"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDevice(option)}
                  aria-pressed={device === option}
                  className={`flex items-center gap-1 rounded-xs border px-2 py-1 text-[11px] font-medium transition-colors ${
                    device === option
                      ? "border-primary bg-primary text-white"
                      : "border-primary/15 text-ink-muted hover:text-primary"
                  }`}
                >
                  {option === "desktop" ? <Monitor size={12} aria-hidden /> : <Smartphone size={12} aria-hidden />}
                  {option === "desktop" ? labels.previewDesktop : labels.previewMobile}
                </button>
              ))}
            </div>
          </div>

          {!isPublished ? (
            /* An unpublished project 404s on the public site, so an iframe
               would show an error page rather than a preview. Say why. */
            <p className="px-4 py-10 text-center text-sm text-ink-muted">{labels.previewUnpublished}</p>
          ) : (
            <div className="space-y-2 p-3">
              <p className="truncate rounded-xs bg-surface-muted px-2.5 py-1.5 font-mono text-[11px] text-ink-muted">
                {`${siteOrigin}/${target}/projects/${projectSlug}`}
              </p>
              {/* The iframe renders at a real viewport width so the page's
                  own breakpoints behave as a visitor's browser would, then
                  is scaled down to fit. The wrapper carries the *scaled*
                  size — without it the layout box stays full-size and
                  leaves a screen of empty space under the preview. */}
              <div
                className="overflow-hidden rounded-xs border border-primary/10 bg-white"
                style={{ width: FRAME[device].width * FRAME[device].scale, height: FRAME[device].height * FRAME[device].scale }}
              >
                <iframe
                  key={previewNonce}
                  src={previewSrc}
                  title={labels.previewTitle}
                  className="block border-0 bg-white"
                  style={{
                    width: FRAME[device].width,
                    height: FRAME[device].height,
                    transform: `scale(${FRAME[device].scale})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-ink-muted">{labels.previewNote}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
