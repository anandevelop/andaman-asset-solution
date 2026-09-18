"use client";

/**
 * components/admin/ProgressWorkspace.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The monthly log and the editor beside it (Progress.dc.html) — one
 * component because publishing a card and writing the next entry share the
 * same list, and a card published on the left has to disappear from the
 * "unpublished" count on the right without a round trip through two
 * components that do not know about each other.
 *
 * The buyer-notification checkbox is deliberately dull when there is
 * nobody to notify: it says how many people it would actually reach and
 * disables itself at zero, rather than offering an action that silently
 * sends nothing. Who counts as a buyer — and why the number can be lower
 * than the count of sold units — is explained in
 * lib/admin/project-progress.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, ImagePlus, Loader2 } from "lucide-react";
import {
  saveProgressDetail,
  setProgressPublished,
} from "@/app/[locale]/admin/(catalog)/progress/actions";

export type ProgressCard = {
  id: string;
  monthLabel: string;
  percentComplete: number | null;
  summary: string | null;
  images: string[];
  isPublished: boolean;
  authorLine: string;
};

type Props = {
  locale: string;
  projectId: string;
  entries: ProgressCard[];
  buyerCount: number;
  /** Month the editor opens on, e.g. { month: 9, year: 2026 }. */
  nextPeriod: { month: number; year: number; label: string };
  labels: {
    logTitle: string;
    logCount: string;
    draftTag: string;
    published: string;
    addTitle: string;
    period: string;
    percent: string;
    summaryTh: string;
    summaryEn: string;
    summaryPlaceholder: string;
    notTranslated: string;
    images: string;
    imagesHint: string;
    imagesHelp: string;
    notifyNobody: string;
    saveDraft: string;
    publish: string;
    saved: string;
    error: string;
    empty: string;
  };
};

export default function ProgressWorkspace({
  locale,
  projectId,
  entries,
  buyerCount,
  nextPeriod,
  labels,
}: Props) {
  const router = useRouter();
  // The three strings whose numbers are only known at render or after the
  // server answers; everything else is formatted once on the server.
  const tp = useTranslations("admin.progress");

  const [month, setMonth] = useState(nextPeriod.month);
  const [year, setYear] = useState(nextPeriod.year);
  const [percent, setPercent] = useState("");
  const [summaryTh, setSummaryTh] = useState("");
  const [summaryEn, setSummaryEn] = useState("");
  const [imageText, setImageText] = useState("");
  const [notify, setNotify] = useState(buyerCount > 0);

  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [notifiedCount, setNotifiedCount] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const images = imageText
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const save = (thenPublish: boolean) => {
    setStatus("idle");
    setNotifiedCount(null);

    startTransition(async () => {
      const result = await saveProgressDetail(locale, projectId, {
        month,
        year,
        percentComplete: percent.trim() === "" ? null : Number(percent),
        summaries: { th: summaryTh, en: summaryEn },
        images,
      });

      if (!result.ok) {
        setStatus("error");
        return;
      }

      if (thenPublish) {
        const published = await setProgressPublished(locale, projectId, result.id, true, notify);
        if (!published.ok) {
          setStatus("error");
          return;
        }
        setNotifiedCount(published.notified);
      }

      setStatus("saved");
      setPercent("");
      setSummaryTh("");
      setSummaryEn("");
      setImageText("");
      router.refresh();
    });
  };

  const togglePublished = (card: ProgressCard) => {
    setStatus("idle");
    setBusyId(card.id);

    startTransition(async () => {
      const result = await setProgressPublished(
        locale,
        projectId,
        card.id,
        !card.isPublished,
        // Only ever on the way to published, and only when there is
        // somebody to tell.
        !card.isPublished && notify && buyerCount > 0,
      );
      setBusyId(null);

      if (result.ok) {
        if (result.notified > 0) setNotifiedCount(result.notified);
        router.refresh();
      } else {
        setStatus("error");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* ── The log ──────────────────────────────────────────────────── */}
      <section className="admin-card space-y-4 lg:col-span-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-primary">{labels.logTitle}</h2>
          <p className="text-xs text-ink-muted">{labels.logCount}</p>
        </div>

        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{labels.empty}</p>
        ) : (
          <div className="space-y-3">
            {entries.map((card) => (
              <article
                key={card.id}
                className={`rounded-xs border p-3.5 ${
                  card.isPublished ? "border-primary/10" : "border-accent/40 bg-accent/4"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-primary">{card.monthLabel}</h3>

                  {card.percentComplete !== null && (
                    <span className="rounded-xs bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-primary">
                      {card.percentComplete}%
                    </span>
                  )}

                  <span className="text-xs text-ink-muted">
                    {card.isPublished ? card.authorLine : labels.draftTag}
                  </span>

                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-ink-muted">{labels.published}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={card.isPublished}
                      aria-label={`${labels.published}: ${card.monthLabel}`}
                      disabled={pending}
                      onClick={() => togglePublished(card)}
                      className={[
                        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                        card.isPublished ? "bg-emerald-500" : "bg-primary/20",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-flex h-3.5 w-3.5 transform items-center justify-center rounded-full bg-white shadow-xs transition-transform",
                          card.isPublished ? "translate-x-[18px]" : "translate-x-[3px]",
                        ].join(" ")}
                      >
                        {busyId === card.id && (
                          <Loader2 size={12} className="animate-spin text-primary" aria-hidden />
                        )}
                      </span>
                    </button>
                  </span>
                </div>

                {card.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-ink">{card.summary}</p>
                )}

                {card.images.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {card.images.slice(0, 4).map((url) => (
                      /* Plain <img>, like every other admin thumbnail. */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt=""
                        loading="lazy"
                        className="h-20 w-full rounded-xs bg-surface-muted object-cover"
                      />
                    ))}
                    {card.images.length > 4 && (
                      <span className="flex h-20 items-center justify-center rounded-xs bg-surface-muted text-sm font-medium text-ink-muted">
                        {tp("morePhotos", { count: card.images.length - 4 })}
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── The editor ───────────────────────────────────────────────── */}
      <section className="admin-card space-y-4 lg:col-span-2">
        <h2 className="text-sm font-semibold text-primary">{labels.addTitle}</h2>

        <div className="grid grid-cols-[1fr_90px] gap-3">
          <div>
            <label className="admin-label" htmlFor="progress-month">
              {labels.period}
            </label>
            <div className="flex gap-2">
              <select
                id="progress-month"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="admin-input py-2! text-sm"
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={year}
                min={2000}
                max={2100}
                onChange={(event) => setYear(Number(event.target.value))}
                aria-label={labels.period}
                className="admin-input py-2! text-sm"
              />
            </div>
          </div>

          <div>
            <label className="admin-label" htmlFor="progress-percent">
              {labels.percent}
            </label>
            <input
              id="progress-percent"
              type="number"
              min={0}
              max={100}
              value={percent}
              placeholder="—"
              onChange={(event) => setPercent(event.target.value)}
              className="admin-input py-2! text-sm"
            />
          </div>
        </div>

        <div>
          <label className="admin-label" htmlFor="progress-th">
            {labels.summaryTh}
          </label>
          <textarea
            id="progress-th"
            rows={3}
            value={summaryTh}
            onChange={(event) => setSummaryTh(event.target.value)}
            placeholder={labels.summaryPlaceholder}
            className="admin-textarea min-h-0!"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="progress-en">
            {labels.summaryEn}
          </label>
          <textarea
            id="progress-en"
            rows={3}
            value={summaryEn}
            onChange={(event) => setSummaryEn(event.target.value)}
            placeholder={labels.notTranslated}
            className="admin-textarea min-h-0!"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="progress-images">
            {labels.images}
          </label>
          <textarea
            id="progress-images"
            rows={2}
            value={imageText}
            onChange={(event) => setImageText(event.target.value)}
            placeholder={labels.imagesHint}
            className="admin-textarea min-h-0! font-mono text-xs"
          />
          <p className="admin-hint flex items-center gap-1.5">
            <ImagePlus size={12} aria-hidden />
            {labels.imagesHelp}
          </p>
        </div>

        <label
          className={`flex items-start gap-2 rounded-xs bg-surface-muted px-3 py-2.5 text-sm ${
            buyerCount === 0 ? "text-ink-muted" : "text-ink"
          }`}
        >
          <input
            type="checkbox"
            checked={notify && buyerCount > 0}
            disabled={buyerCount === 0}
            onChange={(event) => setNotify(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
          />
          <span>
            {buyerCount === 0
              ? labels.notifyNobody
              : tp("notify", { count: buyerCount })}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending}
            className="admin-btn-ghost py-2! text-sm"
          >
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {labels.saveDraft}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending}
            className="admin-btn py-2! text-sm"
          >
            {labels.publish}
          </button>
        </div>

        {status === "saved" && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check size={13} aria-hidden />
            {labels.saved}
            {notifiedCount !== null && notifiedCount > 0 &&
              ` · ${tp("notified", { count: notifiedCount })}`}
          </p>
        )}

        {status === "error" && (
          <p className="flex items-center gap-1.5 text-xs text-red-700">
            <AlertCircle size={13} aria-hidden />
            {labels.error}
          </p>
        )}
      </section>
    </div>
  );
}
