"use client";

/**
 * components/admin/LeadFilters.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Status filter and sort order, written straight into the query string so
 * the current view is linkable and survives a refresh.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LeadStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";

type Props = {
  locale: string;
  activeStatus: string;
  activeSort: "newest" | "oldest";
  statusLabels: Record<LeadStatus, string>;
  labels: {
    status: string;
    sort: string;
    all: string;
    newest: string;
    oldest: string;
  };
};

export default function LeadFilters({
  locale,
  activeStatus,
  activeSort,
  statusLabels,
  labels,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    // Keep the default out of the URL — a bare /admin/leads should stay bare.
    if (value === "ALL" || value === "newest") params.delete(key);
    else params.set(key, value);

    const query = params.toString();
    startTransition(() => {
      router.replace(`/${locale}/admin/leads${query ? `?${query}` : ""}`);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor="lead-status" className="admin-label">
          {labels.status}
        </label>
        <select
          id="lead-status"
          value={activeStatus}
          onChange={(event) => setParam("status", event.target.value)}
          className="admin-input min-w-[200px]"
        >
          <option value="ALL">{labels.all}</option>
          {Object.values(LeadStatus).map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="lead-sort" className="admin-label">
          {labels.sort}
        </label>
        <select
          id="lead-sort"
          value={activeSort}
          onChange={(event) => setParam("sort", event.target.value)}
          className="admin-input min-w-[180px]"
        >
          <option value="newest">{labels.newest}</option>
          <option value="oldest">{labels.oldest}</option>
        </select>
      </div>

      {pending && (
        <Loader2 size={16} className="mb-3 animate-spin text-ink-muted" aria-hidden />
      )}
    </div>
  );
}
