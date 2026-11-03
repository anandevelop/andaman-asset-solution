"use client";

/**
 * components/admin/LinkSuggestions.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The internal-link suggestions table on /admin/seo/links: one row per
 * "this article mentions that page but does not link to it", with
 * "ใส่ลิงก์" (splice the link in), "ข้าม" (hide it for good), a search box,
 * and "ใส่ทั้งหมด" for whatever the search leaves on screen.
 *
 * Every suggestion is recomputed on the server before it is applied
 * (lib/admin/link-opportunities.ts), so a stale row fails safely instead
 * of writing a link into text that has since changed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Search } from "lucide-react";
import type { LinkOpportunity } from "@/lib/admin/link-opportunities";
import type {
  addAllLinkOpportunities,
  addLinkOpportunity,
  dismissLinkOpportunity,
} from "@/app/[locale]/admin/(growth)/seo/links/actions";

export type LinkSuggestionRow = Pick<
  LinkOpportunity,
  "id" | "via" | "sourceId" | "sourceLocale" | "sourceTitle" | "targetType" | "targetId" | "targetTitle" | "targetPath" | "matchedText"
>;

type Labels = Record<
  | "title"
  | "subtitle"
  | "rules"
  | "search"
  | "applyAll"
  | "applyAllConfirm"
  | "appliedAll"
  | "colArticle"
  | "colAnchor"
  | "colTarget"
  | "apply"
  | "skip"
  | "keyword"
  | "empty"
  | "noMatch"
  | "error",
  string
>;

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

export default function LinkSuggestions({
  locale,
  rows,
  labels: l,
  addOne,
  addAll,
  dismiss,
}: {
  locale: string;
  rows: LinkSuggestionRow[];
  labels: Labels;
  addOne: typeof addLinkOpportunity;
  addAll: typeof addAllLinkOpportunities;
  dismiss: typeof dismissLinkOpportunity;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [bulk, startBulk] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        !gone.has(r.id) &&
        (!q || [r.sourceTitle, r.matchedText, r.targetTitle, r.targetPath].some((v) => v.toLowerCase().includes(q))),
    );
  }, [rows, gone, query]);

  async function act(row: LinkSuggestionRow, kind: "apply" | "skip") {
    setBusy(row.id);
    setMessage(null);
    const result =
      kind === "apply"
        ? await addOne(
            {
              sourceId: row.sourceId,
              sourceLocale: row.sourceLocale,
              targetType: row.targetType,
              targetId: row.targetId,
              targetPath: row.targetPath,
              via: row.via,
            },
            locale,
          )
        : await dismiss(row.id, locale);
    setBusy(null);
    if (result.ok) setGone((prev) => new Set(prev).add(row.id));
    else setMessage({ ok: false, text: l.error });
  }

  function applyAll() {
    if (!window.confirm(fill(l.applyAllConfirm, { count: visible.length }))) return;
    const ids = visible.map((r) => r.id);
    startBulk(async () => {
      setMessage(null);
      const result = await addAll(ids, locale);
      if (result.ok) {
        setMessage({ ok: true, text: fill(l.appliedAll, { applied: result.applied, failed: result.failed }) });
        router.refresh();
      } else setMessage({ ok: false, text: l.error });
    });
  }

  return (
    <section className="admin-card overflow-hidden p-0!">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-adm-text">
            {l.title} <span className="font-normal text-adm-muted">{l.subtitle}</span>
          </h2>
          <p className="mt-1 text-xs text-adm-muted">{l.rules}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-adm-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={l.search}
              aria-label={l.search}
              className="admin-input w-56! rounded-full! pl-8!"
            />
          </label>
          <button type="button" disabled={bulk || visible.length === 0} onClick={applyAll} className="admin-btn rounded-full! px-4">
            {bulk ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Link2 size={14} aria-hidden />}
            {fill(l.applyAll, { count: visible.length })}
          </button>
        </div>
      </div>
      {message && (
        <p className={`px-5 pb-3 text-xs ${message.ok ? "text-adm-success" : "text-adm-danger"}`}>{message.text}</p>
      )}

      {rows.length === 0 ? (
        <p className="border-t border-adm-line px-5 py-6 text-sm text-adm-muted">{l.empty}</p>
      ) : visible.length === 0 ? (
        <p className="border-t border-adm-line px-5 py-6 text-sm text-adm-muted">{l.noMatch}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-y border-adm-line text-left text-xs text-adm-muted">
                <th className="px-5 py-2.5 font-medium">{l.colArticle}</th>
                <th className="px-3 py-2.5 font-medium">{l.colAnchor}</th>
                <th className="px-3 py-2.5 font-medium">{l.colTarget}</th>
                <th className="px-5 py-2.5" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-adm-line last:border-b-0">
                  <td className="max-w-[420px] px-5 py-3">
                    <span className="mr-2 inline-block w-6 text-[11px] font-semibold uppercase text-adm-muted">{row.sourceLocale}</span>
                    <Link
                      href={`/${locale}/admin/news/${row.sourceId}/edit`}
                      className="text-adm-text hover:text-adm-accent-ink hover:underline"
                    >
                      {row.sourceTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <mark className="rounded-[4px] bg-[#fff3c4] px-1.5 py-0.5 text-adm-text">{row.matchedText}</mark>
                    {row.via === "keyword" && <span className="ml-1.5 text-[11px] text-adm-muted">{l.keyword}</span>}
                  </td>
                  <td className="max-w-[360px] px-3 py-3">
                    <p className="truncate text-adm-text">{row.targetTitle}</p>
                    <p className="truncate font-mono text-xs text-adm-muted">{row.targetPath}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy !== null || bulk}
                      onClick={() => act(row, "apply")}
                      className="admin-btn rounded-full! px-4 py-1.5!"
                    >
                      {busy === row.id ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
                      {l.apply}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null || bulk}
                      onClick={() => act(row, "skip")}
                      className="ml-2 px-2 py-1.5 text-sm text-adm-muted hover:text-adm-text"
                    >
                      {l.skip}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
