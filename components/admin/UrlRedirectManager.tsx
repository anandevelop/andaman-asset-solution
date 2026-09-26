"use client";

/**
 * components/admin/UrlRedirectManager.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "URL และการเปลี่ยนเส้นทาง" (Urls.dc.html) — the redirect table, the 404
 * worklist beside it, and the broken links underneath.
 *
 * The three tabs are three views of one page's data rather than three
 * routes, because the work moves between them constantly: a 404 becomes a
 * redirect, a redirect's destination turns up in the broken-link list. The
 * counts in the tab labels are the reason to look at the other two.
 *
 * Every row that can be acted on carries the action next to it. There is
 * no bulk-select: the decisions here are one-at-a-time judgements about
 * where a particular URL should go, and a checkbox column would invite
 * "apply to all", which is how a site ends up redirecting eighty dead URLs
 * to its home page — the thing Google calls a soft 404 and ignores.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Download,
  EyeOff,
  FileWarning,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createRedirect,
  deleteRedirect,
  hideNotFound,
  importRedirectsCsv,
  redirectNotFound,
  setRedirectActive,
  unhideAllNotFound,
  updateRedirect,
} from "@/app/[locale]/admin/(growth)/seo/urls/actions";
import type { BrokenLink, NotFoundRow, RedirectRow } from "@/lib/admin/url-health";

type Tab = "redirects" | "notFound" | "brokenLinks";

type Labels = {
  tabs: Record<Tab, string>;
  add: string;
  importCsv: string;
  export: string;
  from: string;
  to: string;
  type: string;
  origin: string;
  hits30: string;
  hitsTotalShort: string;
  autoSlug: string;
  manual: string;
  note: string;
  notePlaceholder: string;
  expires: string;
  expiresOn: string;
  expired: string;
  inactive: string;
  activate: string;
  deactivate: string;
  edit: string;
  delete: string;
  confirmDelete: string;
  save: string;
  cancel: string;
  destinationMissing: string;
  destinationDraft: string;
  emptyRedirects: string;
  notFoundTitle: string;
  notFoundEmpty: string;
  hiddenCount: string;
  showHidden: string;
  publishRecord: string;
  create301: string;
  pointAtFile: string;
  hide: string;
  kindDraft: string;
  kindTypo: string;
  kindFile: string;
  kindBot: string;
  kindUnknown: string;
  fromReferer: string;
  brokenTitle: string;
  brokenEmpty: string;
  reasonMissing: string;
  reasonDraft: string;
  reasonLegacyHost: string;
  sourceHome: string;
  sourceNews: string;
  sourceFaq: string;
  sourceProject: string;
  sourceEvent: string;
  externalNote: string;
  seeAll: string;
  errors: Record<string, string>;
  importPrompt: string;
};

type Props = {
  locale: string;
  redirects: RedirectRow[];
  notFound: NotFoundRow[];
  notFoundTotal: number;
  hiddenCount: number;
  brokenLinks: BrokenLink[];
  externalLinkCount: number;
  csv: string;
  /** A path arriving from elsewhere in the admin — the indexing tab's
   *  "add a redirect" shortcut. Opens the form with it already filled in
   *  rather than making somebody retype a path they were just looking at. */
  prefillFrom?: string;
  labels: Labels;
};

type FormState = {
  id: string | null;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
  isActive: boolean;
  note: string;
  expiresAt: string;
};

const BLANK: FormState = {
  id: null,
  fromPath: "",
  toPath: "",
  statusCode: 301,
  isActive: true,
  note: "",
  expiresAt: "",
};

export default function UrlRedirectManager({
  locale,
  redirects,
  notFound,
  notFoundTotal,
  hiddenCount,
  brokenLinks,
  externalLinkCount,
  csv,
  labels,
  prefillFrom,
}: Props) {
  const router = useRouter();
  /* The two labels whose numbers are not known until an import has run.
     Everything else on this screen is counted before render and formatted
     on the server, where the number already exists. */
  const t = useTranslations("admin");
  /*
    Read once after mount, not during render.

    A redirect's "expired" badge is a comparison against the current time,
    and calling Date.now() while rendering made the answer depend on when
    the render happened: the server prerenders the row as live, the browser
    hydrates it a second later as expired, and React reports a mismatch —
    on a row that was correct both times. Holding the clock in state means
    the first paint matches the server exactly and the badge settles
    immediately afterwards.

    Null until then, which is what `expiredAt` below treats as "not yet
    known" rather than "not expired".
  */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const [tab, setTab] = useState<Tab>("redirects");
  /*
    Opened already filled in when a path arrived in the URL.

    The indexing tab lists dead ends a crawler found and offers to redirect
    one; retyping a path that was on screen a moment ago is both tedious
    and a way to introduce a typo into the one field that has to match
    exactly.
  */
  const [form, setForm] = useState<FormState | null>(
    prefillFrom ? { ...BLANK, fromPath: prefillFrom } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "UNKNOWN");
        return;
      }
      setForm(null);
      router.refresh();
    });
  };

  const save = () => {
    if (!form) return;
    const input = {
      fromPath: form.fromPath,
      toPath: form.toPath,
      statusCode: form.statusCode,
      isActive: form.isActive,
      note: form.note.trim() || null,
      expiresAt: form.expiresAt || null,
    };
    run(() => (form.id ? updateRedirect(locale, form.id, input) : createRedirect(locale, input)));
  };

  const exportCsv = () => {
    // A Blob rather than a server round-trip: the rows are already on this
    // page, and a download endpoint would be a second place for the
    // column order to drift from what the table shows.
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `redirects-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onFile = (file: File) => {
    setError(null);
    setNotice(null);
    file.text().then((text) => {
      startTransition(async () => {
        const result = await importRedirectsCsv(locale, text);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const parts = [t("urls.importDone", { count: result.created + result.updated })];
        if (result.flattened > 0) {
          parts.push(t("urls.importFlattened", { count: result.flattened }));
        }
        if (result.skipped.length > 0) {
          parts.push(t("urls.importSkipped", { count: result.skipped.length }));
        }
        setNotice(parts.join(" · "));
        router.refresh();
      });
    });
  };

  const counts = useMemo(
    () => ({ redirects: redirects.length, notFound: notFoundTotal, brokenLinks: brokenLinks.length }),
    [redirects.length, notFoundTotal, brokenLinks.length],
  );

  const kindLabel: Record<NotFoundRow["kind"], string> = {
    draft: labels.kindDraft,
    typo: labels.kindTypo,
    file: labels.kindFile,
    bot: labels.kindBot,
    unknown: labels.kindUnknown,
  };

  const sourceLabel: Record<BrokenLink["source"], string> = {
    home: labels.sourceHome,
    news: labels.sourceNews,
    faq: labels.sourceFaq,
    project: labels.sourceProject,
    event: labels.sourceEvent,
  };

  const reasonLabel: Record<BrokenLink["reason"], string> = {
    missing: labels.reasonMissing,
    draft: labels.reasonDraft,
    legacyHost: labels.reasonLegacyHost,
  };

  return (
    <div className="space-y-5">
      {/* ── Tabs + tools ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xs border border-primary/10 bg-white p-1">
          {(["redirects", "notFound", "brokenLinks"] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={[
                "flex items-center gap-2 rounded-xs px-3.5 py-2 text-sm transition-colors",
                tab === key
                  ? "bg-primary font-semibold text-white"
                  : "text-ink-muted hover:text-primary",
              ].join(" ")}
            >
              {labels.tabs[key]}
              <span
                className={[
                  "rounded-xs px-1.5 py-0.5 text-xs tabular-nums",
                  tab === key ? "bg-white/20" : "bg-surface-muted",
                ].join(" ")}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="admin-btn-ghost py-2! text-sm"
            title={labels.importPrompt}
          >
            <Upload size={14} aria-hidden />
            {labels.importCsv}
          </button>
          <button type="button" onClick={exportCsv} className="admin-btn-ghost py-2! text-sm">
            <Download size={14} aria-hidden />
            {labels.export}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(BLANK);
              setTab("redirects");
            }}
            className="admin-btn py-2! text-sm"
          >
            <Plus size={14} aria-hidden />
            {labels.add}
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xs border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={15} aria-hidden />
          {labels.errors[error] ?? labels.errors.UNKNOWN}
        </p>
      )}

      {notice && (
        <p className="flex items-center gap-2 rounded-xs border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Check size={15} aria-hidden />
          {notice}
        </p>
      )}

      {form && (
        <section className="admin-card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="admin-label" htmlFor="redirect-from">
                {labels.from}
              </label>
              <input
                id="redirect-from"
                value={form.fromPath}
                onChange={(event) => setForm({ ...form, fromPath: event.target.value })}
                placeholder="/promo"
                className="admin-input font-mono text-sm"
              />
            </div>
            <div>
              <label className="admin-label" htmlFor="redirect-to">
                {labels.to}
              </label>
              <input
                id="redirect-to"
                value={form.toPath}
                onChange={(event) => setForm({ ...form, toPath: event.target.value })}
                placeholder="/events/open-house"
                className="admin-input font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="admin-label" htmlFor="redirect-type">
                {labels.type}
              </label>
              <select
                id="redirect-type"
                value={form.statusCode}
                onChange={(event) =>
                  setForm({ ...form, statusCode: Number(event.target.value) as 301 | 302 })
                }
                className="admin-input py-2! text-sm"
              >
                <option value={301}>301</option>
                <option value={302}>302</option>
              </select>
            </div>
            <div>
              <label className="admin-label" htmlFor="redirect-expires">
                {labels.expires}
              </label>
              <input
                id="redirect-expires"
                type="date"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                className="admin-input py-2! text-sm"
              />
            </div>
            <div>
              <label className="admin-label" htmlFor="redirect-note">
                {labels.note}
              </label>
              <input
                id="redirect-note"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder={labels.notePlaceholder}
                className="admin-input py-2! text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={pending} className="admin-btn py-2! text-sm">
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
              {labels.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setError(null);
              }}
              className="admin-btn-ghost py-2! text-sm"
            >
              {labels.cancel}
            </button>
          </div>
        </section>
      )}

      {/* ── Redirects ─────────────────────────────────────────────────── */}
      {tab === "redirects" && (
        <section className="admin-card p-0!">
          {redirects.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">{labels.emptyRedirects}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-primary/10 bg-surface-muted/50 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-5 py-3 font-medium">{labels.from}</th>
                    <th className="px-4 py-3 font-medium">{labels.to}</th>
                    <th className="px-4 py-3 font-medium">{labels.type}</th>
                    <th className="px-4 py-3 font-medium">{labels.origin}</th>
                    <th className="px-4 py-3 text-right font-medium">{labels.hits30}</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {redirects.map((row) => (
                    <tr
                      key={row.id}
                      className={[
                        "border-b border-primary/5 last:border-0",
                        row.isActive ? "" : "text-ink-muted/60",
                      ].join(" ")}
                    >
                      <td className="px-5 py-3 font-mono text-[13px]">{row.fromPath}</td>

                      <td className="px-4 py-3 font-mono text-[13px]">
                        <span className={row.destination === "missing" ? "text-red-700" : ""}>
                          {row.toPath}
                        </span>
                        {row.destination === "missing" && (
                          <span className="mt-0.5 flex items-center gap-1 font-sans text-xs text-red-700">
                            <AlertTriangle size={11} aria-hidden />
                            {labels.destinationMissing}
                          </span>
                        )}
                        {row.destination === "draft" && (
                          <span className="mt-0.5 flex items-center gap-1 font-sans text-xs text-amber-700">
                            <AlertTriangle size={11} aria-hidden />
                            {labels.destinationDraft}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={[
                            "rounded-xs px-2 py-1 text-xs font-semibold",
                            row.statusCode === 301
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-amber-50 text-amber-800",
                          ].join(" ")}
                        >
                          {row.statusCode}
                        </span>
                        {!row.isActive && (
                          <span className="ml-2 text-xs">{labels.inactive}</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {row.source === "AUTO_SLUG" ? (
                          <>
                            {labels.autoSlug} ·{" "}
                            {new Date(row.createdAt).toLocaleDateString(locale === "th" ? "th-TH" : locale, {
                              day: "numeric",
                              month: "short",
                            })}
                          </>
                        ) : (
                          <>
                            {labels.manual}
                            {row.note && ` · ${row.note}`}
                          </>
                        )}
                        {row.expiresAt && (
                          <span className="mt-0.5 flex items-center gap-1">
                            <Clock size={11} aria-hidden />
                            {now !== null && new Date(row.expiresAt).getTime() <= now
                              ? labels.expired
                              : `${labels.expiresOn} ${new Date(row.expiresAt).toLocaleDateString(
                                  locale === "th" ? "th-TH" : locale,
                                  { day: "numeric", month: "short", year: "numeric" },
                                )}`}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold tabular-nums">
                          {row.hits30.toLocaleString()}
                        </span>
                        {row.hitsTotal > row.hits30 && (
                          <span className="block text-xs text-ink-muted tabular-nums">
                            {labels.hitsTotalShort} {row.hitsTotal.toLocaleString()}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                id: row.id,
                                fromPath: row.fromPath,
                                toPath: row.toPath,
                                statusCode: row.statusCode === 302 ? 302 : 301,
                                isActive: row.isActive,
                                note: row.note ?? "",
                                expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : "",
                              })
                            }
                            className="admin-btn-ghost px-2! py-1! text-xs"
                          >
                            {labels.edit}
                          </button>
                          <button
                            type="button"
                            onClick={() => run(() => setRedirectActive(locale, row.id, !row.isActive))}
                            className="admin-btn-ghost px-2! py-1! text-xs"
                            title={row.isActive ? labels.deactivate : labels.activate}
                          >
                            {row.isActive ? <X size={13} aria-hidden /> : <Check size={13} aria-hidden />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(labels.confirmDelete)) run(() => deleteRedirect(locale, row.id));
                            }}
                            className="admin-btn-ghost px-2! py-1! text-xs text-red-700"
                            title={labels.delete}
                          >
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── 404s ──────────────────────────────────────────────────────── */}
      {tab === "notFound" && (
        <section className="admin-card space-y-1">
          {notFound.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">{labels.notFoundEmpty}</p>
          ) : (
            notFound.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/5 py-3.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="truncate font-mono text-[13px] text-primary">{row.path}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-red-700">
                      {row.hits30.toLocaleString()}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {row.kind === "draft" && row.draftLabel
                      ? `${kindLabel.draft} · ${row.draftLabel}`
                      : kindLabel[row.kind]}
                    {row.refererHost && ` · ${labels.fromReferer} ${row.refererHost}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {row.kind === "draft" && row.draftAdminHref && (
                    <Link
                      href={`/${locale}${row.draftAdminHref}`}
                      className="admin-btn-ghost py-1.5! text-xs"
                    >
                      {labels.publishRecord}
                    </Link>
                  )}

                  {row.kind === "typo" && row.suggestedTarget && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => redirectNotFound(locale, row.id, row.suggestedTarget!))}
                      className="admin-btn-ghost py-1.5! text-xs"
                      title={`${row.path} → ${row.suggestedTarget}`}
                    >
                      {labels.create301}
                      <ArrowRight size={11} aria-hidden />
                      <span className="font-mono">{row.suggestedTarget}</span>
                    </button>
                  )}

                  {(row.kind === "unknown" || row.kind === "file") && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...BLANK, fromPath: row.path })
                      }
                      className="admin-btn-ghost py-1.5! text-xs"
                    >
                      {row.kind === "file" ? labels.pointAtFile : labels.create301}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => hideNotFound(locale, row.id))}
                    className="admin-btn-ghost px-2! py-1.5! text-xs"
                    title={labels.hide}
                  >
                    <EyeOff size={13} aria-hidden />
                  </button>
                </div>
              </div>
            ))
          )}

          {hiddenCount > 0 && (
            <p className="flex items-center justify-between gap-3 pt-3 text-xs text-ink-muted">
              <span>{labels.hiddenCount}</span>
              <button
                type="button"
                onClick={() => run(() => unhideAllNotFound(locale))}
                className="underline hover:text-primary"
              >
                {labels.showHidden}
              </button>
            </p>
          )}
        </section>
      )}

      {/* ── Broken internal links ─────────────────────────────────────── */}
      {tab === "brokenLinks" && (
        <section className="admin-card space-y-1">
          {brokenLinks.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">{labels.brokenEmpty}</p>
          ) : (
            brokenLinks.map((link) => (
              <div
                key={link.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/5 py-3.5 last:border-0"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-ink-muted">
                    {link.isImage ? <ImageIcon size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-primary">
                      {sourceLabel[link.source]}
                      {/* A quoted title for content, a bare "#2" for a hero
                          slide, which has no title of its own. */}
                      {link.sourceLabel &&
                        (link.sourceLabel.startsWith("#")
                          ? ` ${link.sourceLabel}`
                          : ` “${link.sourceLabel}”`)}
                      <span className="mx-1.5 text-ink-muted">→</span>
                      <span className="break-all font-mono text-[13px]">{link.target}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{reasonLabel[link.reason]}</p>
                  </div>
                </div>

                {link.adminHref && (
                  <Link href={`/${locale}${link.adminHref}`} className="admin-btn-ghost py-1.5! text-xs">
                    {labels.edit}
                  </Link>
                )}
              </div>
            ))
          )}

          <p className="flex items-center gap-1.5 pt-3 text-xs text-ink-muted">
            <FileWarning size={12} aria-hidden />
            {labels.externalNote}
          </p>
        </section>
      )}
    </div>
  );
}
