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
import { isAltTextComplete } from "@/lib/media-alt";
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
import AdminImage from "@/components/admin/ui/AdminImage";

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

/** See lib/media-alt.ts — the same rule the server's count uses. */
function altComplete(altText: Partial<Record<string, string>>): boolean {
  return isAltTextComplete(altText, locales);
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
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-adm-muted" aria-hidden />
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-adm-muted hover:text-adm-text"
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
          className="flex w-full items-center gap-3 rounded-xs border border-adm-danger/30 bg-adm-danger-bg px-4 py-2.5 text-left text-sm text-adm-danger transition-colors hover:bg-adm-danger-bg"
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
          className="flex w-full items-center gap-3 rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-2.5 text-left text-sm text-adm-warning transition-colors hover:bg-adm-warning-bg"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          <span className="flex-1">{t("legacyHostBanner", { count: legacyHostCount })}</span>
          <span className="shrink-0 text-xs font-semibold underline">{t("legacyHostBannerCta")}</span>
        </button>
      )}

      {truncated && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-2.5 text-xs text-adm-warning">
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
                ? "border-adm-text bg-adm-strong text-adm-on-strong"
                : "border-adm-line-strong bg-adm-solid text-adm-muted hover:border-adm-line-strong"
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
                ? "border-adm-text bg-adm-strong text-adm-on-strong"
                : "border-adm-line-strong bg-adm-solid text-adm-muted hover:border-adm-line-strong"
            }`}
          >
            {tag}
            <span className="ml-1.5 opacity-70">{count}</span>
          </button>
        ))}

        {/* "ขาด ALT" as a chip of its own (v4), not only the banner's link:
            it is the filter somebody works through file by file. Counted
            with the same rule as the banner (lib/media-alt.ts). */}
        {!onSelect && (
          <button
            type="button"
            onClick={() => setTypeFilter(typeFilter === "missingAlt" ? "all" : "missingAlt")}
            aria-pressed={typeFilter === "missingAlt"}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              typeFilter === "missingAlt"
                ? "border-adm-warning bg-adm-warning-bg text-adm-warning"
                : "border-dashed border-adm-line-strong text-adm-muted hover:border-adm-warning hover:text-adm-warning"
            }`}
          >
            <AlertTriangle size={11} aria-hidden />
            {t("typeFilter.missingAlt")}
            <span className="ml-0.5 opacity-70">{missingAltCount}</span>
          </button>
        )}

        {/* Files nothing references — the answer to "what can I clear
            out", and the one filter that needs the usage pass. */}
        {!onSelect && (
          <button
            type="button"
            onClick={() => setTypeFilter(typeFilter === "unused" ? "all" : "unused")}
            className={`rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors ${
              typeFilter === "unused"
                ? "border-adm-text bg-adm-strong text-adm-on-strong"
                : "border-adm-line-strong bg-adm-solid text-adm-muted hover:border-adm-line-strong"
            }`}
          >
            {t("typeFilter.unused")}
            <span className="ml-1.5 opacity-70">{unusedCount}</span>
          </button>
        )}

        <label className="ml-auto flex items-center gap-1.5 text-xs text-adm-muted">
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

      {/* minmax(0, 1fr), not 1fr: a bare 1fr track never shrinks below its
          content's min-content width, and an <img> with width="1080" made
          the masonry column that wide — pushing the detail panel off the
          right edge of the screen. */}
      <div className={onSelect ? "" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"}>
        {visible.length === 0 ? (
          <div className="admin-card flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-adm-muted">
            <p>{items.length === 0 ? t("emptyLibrary") : t("emptyFiltered")}</p>
          </div>
        ) : (
          /* Masonry (v4): columns rather than a grid, so each image keeps
             its own proportions instead of being cropped to a square — a
             crop hides exactly the part of a photo the ALT should describe.
             The width/height attributes reserve the space before load. */
          <div className="columns-2 gap-3 sm:columns-3 xl:columns-4">
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => (onSelect ? onSelect(item) : setSelectedId(item.id))}
                className={`mb-3 block w-full break-inside-avoid overflow-hidden rounded-[12px] border bg-adm-solid p-2 text-left transition-shadow ${
                  selectedId === item.id ? "border-adm-info ring-2 ring-adm-info/30" : "border-adm-line hover:shadow-[var(--adm-card-shadow-hover)]"
                }`}
              >
                <div className={`relative overflow-hidden rounded-[8px] bg-adm-text/5 ${isDocument(item.mimeType) ? "h-28" : ""}`}>
                  {isDocument(item.mimeType) ? (
                    <div className="flex h-full items-center justify-center text-adm-muted">
                      <FileText size={30} strokeWidth={1.4} aria-hidden />
                    </div>
                  ) : (
                    <AdminImage
                      src={item.url}
                      width={item.width ?? undefined}
                      height={item.height ?? undefined}
                      // A floor plan is ten times taller than it is wide; past
                      // 360px it is cropped from the top, where its title is.
                      className="block h-auto max-h-[360px] min-h-16 w-full object-cover object-top"
                      loading="lazy"
                    />
                  )}
                  <TileBadges item={item} />
                </div>
                <div className="px-1 pb-0.5 pt-2">
                  <p className="admin-mono truncate text-[11px] text-adm-text">{fileName(item.url)}</p>
                  <p className="text-[10.5px] text-adm-muted">
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
            <div className="border-b border-adm-line px-4 py-3">
              <h2 className="text-sm font-semibold text-adm-text">{t("detailTitle")}</h2>
            </div>

            {!selected ? (
              <p className="px-4 py-6 text-center text-xs text-adm-muted">{t("detailEmpty")}</p>
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
      <span className="absolute left-1.5 top-1.5 rounded-xs bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-adm-text shadow-xs">
        {item.usageCount === 0 ? t("unusedTag") : t("usedInTag", { count: item.usageCount })}
      </span>

      {missingAlt ? (
        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-adm-warning-bg px-2 py-0.5 text-[10px] font-semibold text-adm-warning">
          <AlertTriangle size={10} aria-hidden />
          {t("noAltTag")}
        </span>
      ) : item.isLegacyHost ? (
        <span className="absolute right-1.5 top-1.5 rounded-xs bg-adm-warning px-1.5 py-0.5 text-[9px] font-semibold text-adm-on-strong">
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
      <div className="h-32 overflow-hidden rounded-xs bg-adm-text/4">
        {isDocument(item.mimeType) ? (
          <div className="flex h-full items-center justify-center text-adm-muted">
            <FileText size={32} strokeWidth={1.4} aria-hidden />
          </div>
        ) : (
          <AdminImage src={item.url} className="h-full w-full object-cover" />
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-adm-text">{fileName(item.url)}</p>
        <p className="mt-0.5 text-xs text-adm-muted">
          {[
            item.width && item.height ? `${item.width} × ${item.height}` : null,
            formatBytes(item.sizeBytes),
            item.mimeType,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-0.5 text-xs text-adm-muted">
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
          <p className="mb-1.5 text-[11px] font-medium text-adm-muted">{t("altTextLabel")}</p>
          <div className="space-y-1.5">
            {LOCALE_DISPLAY_ORDER.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <span
                  className={`flex h-[18px] w-7 shrink-0 items-center justify-center rounded-xs text-[8px] font-bold ${
                    alt[l] ? "bg-adm-strong text-adm-on-strong" : "bg-adm-text/4 text-adm-muted"
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
        <p className="mb-1.5 text-[11px] font-medium text-adm-muted">{t("usedInLabel")}</p>
        {usageLoading ? (
          <p className="flex items-center gap-1.5 text-xs text-adm-muted">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            {t("usageLoading")}
          </p>
        ) : usage && usage.length > 0 ? (
          <ul className="space-y-1">
            {usage.map((ref, idx) => (
              <li key={idx} className="flex items-center gap-1.5 text-xs">
                {ref.href ? (
                  <Link href={`/${locale}/admin${ref.href}`} className="truncate font-medium text-adm-accent-ink hover:underline">
                    {ref.label}
                  </Link>
                ) : (
                  <span className="truncate text-adm-text">{ref.label}</span>
                )}
                <span className="shrink-0 text-adm-muted">· {t(`usageKind.${ref.kind}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-adm-muted">{t("usageEmpty")}</p>
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
        <div className="flex items-center gap-2 rounded-xs border border-adm-line bg-adm-text/4 px-2.5 py-2 text-[11px] text-adm-muted">
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
      {deleteError && <p className="text-xs text-adm-danger">{deleteError}</p>}
    </div>
  );
}
