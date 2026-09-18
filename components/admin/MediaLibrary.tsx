"use client";

/**
 * components/admin/MediaLibrary.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The library's whole interactive surface: search, tag/type filters, the
 * thumbnail grid, and a detail panel for the selected file (alt text in 4
 * languages, where it's used, delete).
 *
 * Search and tag/type filtering run entirely client-side against the
 * initial list — see lib/media.ts's header for why that's the right
 * trade-off at this library's realistic scale. Usage is the one thing
 * fetched on demand per selection (getMediaUsage), because finding it
 * means scanning every image/document column across the schema — cheap
 * for one file on click, wasteful for the whole grid on every load.
 *
 * `onSelect` switches this into a picker: components/admin/
 * InsertImageModal.tsx renders it inside a modal with no delete/usage
 * detail panel, a tile click resolves the pick instead of opening that
 * panel, and an upload updates `items` in place rather than reloading the
 * page — a picker sits inside NewsForm's in-progress draft, and reloading
 * would discard it. The standalone /admin/media page (no `onSelect`)
 * behaves exactly as before.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { locales, LOCALE_DISPLAY_ORDER } from "@/i18n";
import { deleteMedia, getMediaUsage, updateMediaMeta } from "@/app/[locale]/admin/(content)/media/actions";
import MediaUploadButton from "@/components/admin/MediaUploadButton";
import type { MediaUsageRef } from "@/lib/media-usage";

export type MediaItem = {
  id: string;
  url: string;
  key: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  tags: string[];
  altText: Partial<Record<string, string>>;
  createdAt: string;
  uploaderName: string | null;
  usageCount: number;
  isLegacyHost: boolean;
};

type Props = {
  locale: string;
  initialItems: MediaItem[];
  tagCounts: { tag: string; count: number }[];
  missingAltCount: number;
  unusedCount: number;
  legacyHostCount: number;
  truncated: boolean;
  /** Picker mode — see the file header. */
  onSelect?: (item: MediaItem) => void;
};

function isDocument(mimeType: string | null): boolean {
  return mimeType === "application/pdf";
}

function isVideo(mimeType: string | null): boolean {
  return Boolean(mimeType?.startsWith("video/"));
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(url: string): string {
  try {
    return decodeURIComponent(url.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

function altComplete(altText: Partial<Record<string, string>>): boolean {
  return locales.every((l) => (altText[l] ?? "").trim().length > 0);
}

type TypeFilter = "all" | "image" | "document" | "missingAlt" | "unused" | "legacy";
type SortKey = "newest" | "oldest" | "name" | "largest";

export default function MediaLibrary({
  locale,
  initialItems,
  tagCounts,
  missingAltCount,
  unusedCount,
  legacyHostCount,
  truncated,
  onSelect,
}: Props) {
  const t = useTranslations("admin.media");
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter === "document" && !isDocument(item.mimeType)) return false;
      if (typeFilter === "image" && (isDocument(item.mimeType) || isVideo(item.mimeType))) return false;
      if (typeFilter === "missingAlt" && altComplete(item.altText)) return false;
      if (typeFilter === "unused" && item.usageCount > 0) return false;
      if (typeFilter === "legacy" && !item.isLegacyHost) return false;
      if (activeTag && !item.tags.includes(activeTag)) return false;
      if (q) {
        const haystack = [
          fileName(item.url),
          ...item.tags,
          ...Object.values(item.altText),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, activeTag, typeFilter]);

  const visible = useMemo(() => {
    const rows = [...filtered];
    switch (sort) {
      case "oldest":
        return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case "name":
        return rows.sort((a, b) => fileName(a.url).localeCompare(fileName(b.url)));
      case "largest":
        return rows.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
      case "newest":
      default:
        // The server already returns newest-first; keep that exact order
        // rather than re-sorting equal timestamps into a different one.
        return rows;
    }
  }, [filtered, sort]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  function handleUploaded(item?: MediaItem) {
    if (onSelect && item) {
      // Picker mode: a page reload here would discard whatever the
      // surrounding editor has unsaved. Prepending the new item is enough
      // for it to show up and be pickable immediately.
      setItems((prev) => [item, ...prev]);
      return;
    }

    // The action already revalidates the server page; a full reload of
    // this client list happens on next navigation. For the immediate
    // feedback of "it's there", a soft refresh is enough here — the admin
    // can search/filter what already appears without waiting on a
    // round-trip that would otherwise reset scroll and selection.
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="admin-input pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("searchPlaceholder")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-primary"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        <MediaUploadButton locale={locale} label={t("upload")} onUploaded={handleUploaded} />
      </div>

      {/* Health banners and the "unused" filter are maintenance tools for
          the standalone library page — noise inside a picker whose only
          job is finding an image to insert. */}
      {!onSelect && missingAltCount > 0 && (
        <button
          type="button"
          onClick={() => setTypeFilter("missingAlt")}
          className="flex w-full items-center gap-3 rounded-xs border border-red-200 bg-red-50 px-4 py-2.5 text-left text-sm text-red-800 transition-colors hover:bg-red-100"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          <span className="flex-1">{t("missingAltBanner", { count: missingAltCount })}</span>
          <span className="shrink-0 text-xs font-semibold underline">{t("missingAltBannerCta")}</span>
        </button>
      )}

      {/* Not a "migrate everything" button: scripts/media-legacy-check.ts
          is deliberately report-only, because what to do with a row on the
          dead host is a content decision (re-shoot, replace, or delete the
          record). This filters the grid to them so a person can work
          through the list. */}
      {!onSelect && legacyHostCount > 0 && (
        <button
          type="button"
          onClick={() => setTypeFilter("legacy")}
          className="flex w-full items-center gap-3 rounded-xs border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          <span className="flex-1">{t("legacyHostBanner", { count: legacyHostCount })}</span>
          <span className="shrink-0 text-xs font-semibold underline">{t("legacyHostBannerCta")}</span>
        </button>
      )}

      {truncated && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {t("truncatedNotice")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "image", "document"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            className={`rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors ${
              typeFilter === key
                ? "border-primary bg-primary text-white"
                : "border-primary/15 bg-white text-ink-muted hover:border-primary/30"
            }`}
          >
            {t(`typeFilter.${key}`)}
            <span className="ml-1.5 opacity-70">
              {key === "all"
                ? items.length
                : key === "document"
                  ? items.filter((i) => isDocument(i.mimeType)).length
                  : items.filter((i) => !isDocument(i.mimeType) && !isVideo(i.mimeType)).length}
            </span>
          </button>
        ))}
        {tagCounts.map(({ tag, count }) => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            className={`rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTag === tag
                ? "border-primary bg-primary text-white"
                : "border-primary/15 bg-white text-ink-muted hover:border-primary/30"
            }`}
          >
            {tag}
            <span className="ml-1.5 opacity-70">{count}</span>
          </button>
        ))}

        {/* Files nothing references — the answer to "what can I clear
            out", and the one filter that needs the usage pass. */}
        {!onSelect && (
          <button
            type="button"
            onClick={() => setTypeFilter(typeFilter === "unused" ? "all" : "unused")}
            className={`rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors ${
              typeFilter === "unused"
                ? "border-primary bg-primary text-white"
                : "border-primary/15 bg-white text-ink-muted hover:border-primary/30"
            }`}
          >
            {t("typeFilter.unused")}
            <span className="ml-1.5 opacity-70">{unusedCount}</span>
          </button>
        )}

        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-muted">
          {t("sortLabel")}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="admin-input w-auto! py-1! text-xs"
          >
            <option value="newest">{t("sort.newest")}</option>
            <option value="oldest">{t("sort.oldest")}</option>
            <option value="name">{t("sort.name")}</option>
            <option value="largest">{t("sort.largest")}</option>
          </select>
        </label>
      </div>

      <div className={onSelect ? "" : "grid gap-4 lg:grid-cols-[1fr_320px]"}>
        {visible.length === 0 ? (
          <div className="admin-card flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-ink-muted">
            <p>{items.length === 0 ? t("emptyLibrary") : t("emptyFiltered")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" style={{ alignContent: "start" }}>
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => (onSelect ? onSelect(item) : setSelectedId(item.id))}
                className={`overflow-hidden rounded-xs border bg-white text-left transition-shadow ${
                  selectedId === item.id ? "border-primary shadow-[0_0_0_2px_rgba(8,53,81,0.16)]" : "border-primary/10 hover:shadow-card"
                }`}
              >
                <div className="relative h-28 bg-surface-muted">
                  {isDocument(item.mimeType) ? (
                    <div className="flex h-full items-center justify-center text-ink-muted">
                      <FileText size={30} strokeWidth={1.4} aria-hidden />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  <TileBadges item={item} />
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-[11px] font-medium text-ink">{fileName(item.url)}</p>
                  <p className="text-[10px] text-ink-muted">
                    {item.width && item.height ? `${item.width} × ${item.height} · ` : ""}
                    {formatBytes(item.sizeBytes)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!onSelect && (
          <aside className="admin-card p-0! lg:sticky lg:top-4 lg:self-start">
            <div className="border-b border-primary/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-primary">{t("detailTitle")}</h2>
            </div>

            {!selected ? (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">{t("detailEmpty")}</p>
            ) : (
              <MediaDetail
                key={selected.id}
                locale={locale}
                item={selected}
                copied={copied}
                onCopied={() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                onSaved={(patch) =>
                  setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, ...patch } : i)))
                }
                onDeleted={() => {
                  setItems((prev) => prev.filter((i) => i.id !== selected.id));
                  setSelectedId(null);
                }}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * A tile carries two independent facts, so it gets two badges.
 *
 * The mockup shows one, chosen by priority — which works when problems are
 * rare. They are not rare here: every file seeded before the move to
 * Spaces is on the old host, so a single prioritised badge hid the usage
 * count on the entire library and the page's most useful number
 * disappeared behind a maintenance flag.
 *
 * Left is the mockup's badge and its primary content: how many places use
 * this file, which is what decides whether it can be deleted. Right is the
 * problem flag, when there is one. Both facts also have their own banner
 * and filter tab for working through systematically.
 */
function TileBadges({ item }: { item: MediaItem }) {
  const t = useTranslations("admin.media");

  const missingAlt = !altComplete(item.altText) && !isDocument(item.mimeType);

  return (
    <>
      <span className="absolute left-1.5 top-1.5 rounded-xs bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-ink shadow-xs">
        {item.usageCount === 0 ? t("unusedTag") : t("usedInTag", { count: item.usageCount })}
      </span>

      {missingAlt ? (
        <span className="absolute right-1.5 top-1.5 rounded-xs bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {t("noAltTag")}
        </span>
      ) : item.isLegacyHost ? (
        <span className="absolute right-1.5 top-1.5 rounded-xs bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {t("legacyHostTag")}
        </span>
      ) : null}
    </>
  );
}

function MediaDetail({
  locale,
  item,
  copied,
  onCopied,
  onSaved,
  onDeleted,
}: {
  locale: string;
  item: MediaItem;
  copied: boolean;
  onCopied: () => void;
  onSaved: (patch: Partial<MediaItem>) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("admin.media");
  const [alt, setAlt] = useState<Record<string, string>>(() =>
    Object.fromEntries(locales.map((l) => [l, item.altText[l] ?? ""])),
  );
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  const [usage, setUsage] = useState<MediaUsageRef[] | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    getMediaUsage(item.id)
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch(() => {
        if (!cancelled) setUsage([]);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  function saveAlt() {
    startSaving(async () => {
      const result = await updateMediaMeta(locale, { id: item.id, altText: alt, tags: item.tags });
      if (result.ok) {
        onSaved({ altText: alt });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startDeleting(async () => {
      const result = await deleteMedia(locale, { id: item.id });
      if (result.ok) {
        onDeleted();
      } else {
        setDeleteError(result.error === "IN_USE" ? t("deleteBlockedRace") : t("deleteFailed"));
      }
    });
  }

  const inUse = (usage?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="h-32 overflow-hidden rounded-xs bg-surface-muted">
        {isDocument(item.mimeType) ? (
          <div className="flex h-full items-center justify-center text-ink-muted">
            <FileText size={32} strokeWidth={1.4} aria-hidden />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-primary">{fileName(item.url)}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {[
            item.width && item.height ? `${item.width} × ${item.height}` : null,
            formatBytes(item.sizeBytes),
            item.mimeType,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {t("uploadedBy", {
            date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
              new Date(item.createdAt),
            ),
            name: item.uploaderName ?? t("unknownUploader"),
          })}
        </p>
      </div>

      {!isDocument(item.mimeType) && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("altTextLabel")}</p>
          <div className="space-y-1.5">
            {LOCALE_DISPLAY_ORDER.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <span
                  className={`flex h-[18px] w-7 shrink-0 items-center justify-center rounded-xs text-[8px] font-bold ${
                    alt[l] ? "bg-primary text-white" : "bg-surface-muted text-ink-muted"
                  }`}
                >
                  {l.toUpperCase()}
                </span>
                <input
                  value={alt[l]}
                  onChange={(e) => setAlt((prev) => ({ ...prev, [l]: e.target.value }))}
                  placeholder={t("altTextPlaceholder")}
                  className="admin-input py-1.5 text-xs"
                />
              </div>
            ))}
          </div>
          <button type="button" onClick={saveAlt} disabled={saving} className="admin-btn mt-2 w-full justify-center py-1.5 text-xs">
            {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : saved ? <Check size={13} aria-hidden /> : null}
            {t("saveAltText")}
          </button>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("usedInLabel")}</p>
        {usageLoading ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            {t("usageLoading")}
          </p>
        ) : usage && usage.length > 0 ? (
          <ul className="space-y-1">
            {usage.map((ref, idx) => (
              <li key={idx} className="flex items-center gap-1.5 text-xs">
                {ref.href ? (
                  <Link href={`/${locale}/admin${ref.href}`} className="truncate font-medium text-accent-700 hover:underline">
                    {ref.label}
                  </Link>
                ) : (
                  <span className="truncate text-ink">{ref.label}</span>
                )}
                <span className="shrink-0 text-ink-muted">· {t(`usageKind.${ref.kind}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-muted">{t("usageEmpty")}</p>
        )}
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(item.url).then(onCopied).catch(() => {});
          }}
          className="admin-btn-ghost flex-1 justify-center py-1.5 text-xs"
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? t("copied") : t("copyLink")}
        </button>
      </div>

      {inUse ? (
        <div className="flex items-center gap-2 rounded-xs border border-primary/10 bg-surface-muted px-2.5 py-2 text-[11px] text-ink-muted">
          <Trash2 size={13} className="shrink-0" aria-hidden />
          {t("deleteBlockedInUse", { count: usage!.length })}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || usageLoading}
          className="admin-btn-danger justify-center py-1.5 text-xs"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Trash2 size={13} aria-hidden />}
          {t("delete")}
        </button>
      )}
      {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
    </div>
  );
}
