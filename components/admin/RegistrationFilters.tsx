"use client";

/**
 * components/admin/RegistrationFilters.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Search, status and language filters for one event's registration list,
 * plus the export.
 *
 * Query-string driven like every other filter bar in this admin, so a
 * filtered list is linkable and survives the refresh that follows every
 * check-in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EventStatus } from "@prisma/client";
import { Download, Loader2, Search } from "lucide-react";
import { locales } from "@/i18n";

type Props = {
  basePath: string;
  /** API route the export downloads from. */
  exportPath: string;
  activeSearch: string;
  activeStatus: string;
  activeLocale: string;
  statusLabels: Record<string, string>;
  labels: {
    searchPlaceholder: string;
    status: string;
    language: string;
    all: string;
    exportCsv: string;
  };
};

const SEARCH_DEBOUNCE_MS = 300;

export default function RegistrationFilters({
  basePath,
  exportPath,
  activeSearch,
  activeStatus,
  activeLocale,
  statusLabels,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(activeSearch);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setSearch(activeSearch);
  }, [activeSearch]);

  useEffect(() => {
    setPending(false);
  }, [activeSearch, activeStatus, activeLocale]);

  /* Held in a ref for the same reason as ProjectFilters': the debounce
     below must fire the newest query string without restarting its timer
     on every keystroke. */
  const push = useRef<(updates: Record<string, string>) => void>(() => undefined);
  // eslint-disable-next-line react-hooks/refs -- the latest-ref idiom: the debounce below must call the newest closure, and an effect-assigned ref would hand it a stale query string.
  push.current = (updates) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === "" || value === "ALL") params.delete(key);
      else params.set(key, value);
    }
    // Any filter change invalidates the page number.
    if (!("page" in updates)) params.delete("page");

    const query = params.toString();
    setPending(true);
    router.replace(`${basePath}${query ? `?${query}` : ""}`);
  };

  useEffect(() => {
    if (search === activeSearch) return;
    const timer = setTimeout(() => push.current({ q: search }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, activeSearch]);

  const exportHref = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const query = params.toString();
    return `${exportPath}${query ? `?${query}` : ""}`;
  };

  const selectClass = "admin-input w-auto! max-w-[200px] py-2! text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative flex min-w-[240px] flex-1 items-center sm:max-w-sm">
        <Search size={15} className="absolute left-3 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="admin-input py-2! pl-9! text-sm"
        />
      </div>

      <select
        aria-label={labels.status}
        value={activeStatus}
        onChange={(event) => push.current({ status: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">
          {labels.status}: {labels.all}
        </option>
        {Object.values(EventStatus).map((status) => (
          <option key={status} value={status}>
            {labels.status}: {statusLabels[status]}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.language}
        value={activeLocale}
        onChange={(event) => push.current({ lang: event.target.value })}
        className={selectClass}
      >
        <option value="ALL">
          {labels.language}: {labels.all}
        </option>
        {locales.map((code) => (
          <option key={code} value={code}>
            {labels.language}: {code.toUpperCase()}
          </option>
        ))}
      </select>

      <a href={exportHref()} className="admin-btn-ghost ml-auto py-2! text-xs">
        <Download size={13} aria-hidden />
        {labels.exportCsv}
      </a>

      {pending && <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />}
    </div>
  );
}
