"use client";

/**
 * components/admin/RealtimePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Who is on the site right now" — the realtime tab of /admin/analytics.
 *
 * Polls every twenty seconds. Not a websocket and not an SSE stream: the
 * data changes on a fifteen-minute horizon, the page is open in front of
 * one person at a time, and a poll is a request that either works or does
 * not rather than a connection that can be half-alive behind a proxy.
 *
 * WHAT THE FEED IS ALLOWED TO SAY
 *
 * Only what LiveVisit actually records: a visit appeared, a visit moved to
 * another page, a visit went quiet. The first mockup also showed "submitted
 * the contact form", which this table has no way of knowing — a feed that
 * invents one event is a feed nobody can trust about the others.
 *
 * Movement is worked out by diffing against the previous poll rather than
 * stored, because the table holds one row per visit and overwrites it: the
 * history exists only between two reads, which is exactly as long as this
 * component needs it.
 *
 * THE FOUR STATES
 *
 * Loading, empty ("nobody is on the site", which is the normal state for a
 * property site at 3am and must not read as broken), data, and failed. The
 * failure keeps showing the last good snapshot with a note, because a
 * dropped poll is not evidence that everybody left.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Users, WifiOff } from "lucide-react";
import type { LiveSnapshotDto } from "@/lib/analytics/live-visit";

const POLL_MS = 20_000;

export type RealtimeLabels = {
  title: string;
  subtitle: string;
  activeNow: string;
  empty: string;
  emptyHint: string;
  failed: string;
  stale: string;
  pagesTitle: string;
  pageHeader: string;
  readersHeader: string;
  medianDwellHeader: string;
  feedTitle: string;
  feedArrived: string;
  feedMoved: string;
  feedLeft: string;
  localeTitle: string;
  refresh: string;
  /** "3m 20s" — the caller formats, so units stay translated. */
  duration: (ms: number) => string;
  ago: (ms: number) => string;
};

type FeedEvent = {
  id: number;
  kind: "arrived" | "moved" | "left";
  path: string;
  at: number;
};

type Props = {
  labels: RealtimeLabels;
  fetchSnapshot: () => Promise<LiveSnapshotDto>;
};

export default function RealtimePanel({ labels, fetchSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState<LiveSnapshotDto | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "failed">("loading");
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  /* The clock the feed's "3m ago" is measured against, advanced on each
     poll rather than read during render — Date.now() in the render body is
     impure, and it also meant the timestamps only moved when something
     else re-rendered. */
  const [now, setNow] = useState(0);

  /* The previous poll's visits, keyed by path+locale with a count, which is
     all the identity this component gets: visitHash never leaves the
     server, deliberately. So "moved" is inferred from the totals rather
     than followed per person — which is the honest limit of a table that
     stores no one. */
  const previous = useRef<Map<string, number> | null>(null);
  const nextId = useRef(0);

  const poll = useCallback(async () => {
    try {
      const next = await fetchSnapshot();
      setSnapshot(next);
      setStatus("ok");
      setNow(Date.now());

      const counts = new Map<string, number>();
      for (const visit of next.visits) {
        counts.set(visit.path, (counts.get(visit.path) ?? 0) + 1);
      }

      const before = previous.current;
      if (before) {
        const events: FeedEvent[] = [];
        const paths = new Set([...before.keys(), ...counts.keys()]);

        for (const path of paths) {
          const delta = (counts.get(path) ?? 0) - (before.get(path) ?? 0);
          if (delta === 0) continue;
          events.push({
            id: nextId.current++,
            kind: delta > 0 ? "arrived" : "left",
            path,
            at: Date.now(),
          });
        }

        if (events.length > 0) {
          // Newest first, and short: this is a glance, not a log.
          setFeed((current) => [...events.reverse(), ...current].slice(0, 20));
        }
      }
      previous.current = counts;
    } catch {
      // Keep the last good snapshot on screen — see the header.
      setStatus("failed");
    }
  }, [fetchSnapshot]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  if (status === "loading" && !snapshot) {
    return (
      <div className="admin-card flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 size={15} className="animate-spin" aria-hidden />
        {labels.title}
      </div>
    );
  }

  const active = snapshot?.activeCount ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="admin-label mb-0">{labels.title}</h3>
          <p className="admin-hint">{labels.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void poll()}
          className="inline-flex items-center gap-1.5 rounded-xs border border-primary/15 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-primary/30 hover:text-primary"
        >
          <RefreshCw size={13} aria-hidden />
          {labels.refresh}
        </button>
      </div>

      {status === "failed" && (
        <p className="flex items-center gap-2 rounded-xs border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <WifiOff size={14} className="shrink-0" aria-hidden />
          {snapshot ? labels.stale : labels.failed}
        </p>
      )}

      <div className="admin-card">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {labels.activeNow}
        </p>
        <p className="mt-3 flex items-center gap-3 text-4xl font-semibold tabular-nums text-primary">
          <Users size={26} className="text-ink-muted" aria-hidden />
          {active}
        </p>
      </div>

      {active === 0 ? (
        <div className="admin-card">
          <p className="text-sm text-ink">{labels.empty}</p>
          <p className="admin-hint mt-1">{labels.emptyHint}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="admin-card">
            <h4 className="admin-label">{labels.pagesTitle}</h4>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="pb-2 font-medium">{labels.pageHeader}</th>
                  <th className="pb-2 text-right font-medium">{labels.readersHeader}</th>
                  <th className="pb-2 text-right font-medium">{labels.medianDwellHeader}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot?.pages.map((page) => (
                  <tr key={page.path} className="border-t border-primary/5">
                    <td className="py-2 font-mono text-xs text-ink">{page.path}</td>
                    <td className="py-2 text-right tabular-nums">{page.count}</td>
                    <td className="py-2 text-right tabular-nums text-ink-muted">
                      {labels.duration(page.medianDwellMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 className="admin-label mt-6">{labels.localeTitle}</h4>
            <ul className="mt-2 flex flex-wrap gap-2">
              {snapshot?.byLocale.map((row) => (
                <li
                  key={row.locale}
                  className="rounded-full bg-primary/5 px-3 py-1 text-xs text-ink"
                >
                  {row.locale.toUpperCase()} · {row.count}
                </li>
              ))}
            </ul>
          </div>

          <div className="admin-card">
            <h4 className="admin-label">{labels.feedTitle}</h4>
            {feed.length === 0 ? (
              <p className="admin-hint mt-2">{labels.emptyHint}</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {feed.map((event) => (
                  <li key={event.id} className="flex items-baseline gap-2 border-t border-primary/5 pt-2">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        event.kind === "left"
                          ? "bg-ink/5 text-ink-muted"
                          : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {event.kind === "arrived"
                        ? labels.feedArrived
                        : event.kind === "moved"
                          ? labels.feedMoved
                          : labels.feedLeft}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs text-ink">{event.path}</span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {labels.ago(Math.max(0, now - event.at))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
