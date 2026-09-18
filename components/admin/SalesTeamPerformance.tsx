/**
 * components/admin/SalesTeamPerformance.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "เปรียบเทียบผลงาน" — the same reps side by side over the reporting
 * window, and the one observation worth surfacing from it.
 *
 * A server component: nothing here is interactive, and every value arrives
 * already computed and formatted.
 *
 * The note under the table is generated, not written — see `hint` in the
 * page that renders this. It only appears when the gap between the slowest
 * responder and the rest is large enough to be worth acting on, because a
 * banner that is always there is a banner nobody reads.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { initialsFrom } from "@/lib/format";

export type PerformanceRow = {
  id: string;
  name: string;
  projects: string[];
  leadsReceived: number;
  /** Percentage answered inside the fast-response threshold, or null when
   *  nothing has been answered at all. */
  fastResponseRate: number | null;
  viewings: number;
  closed: number;
  conversionRate: number | null;
};

type Props = {
  rows: PerformanceRow[];
  /** Already-composed sentence, or null when there is nothing to say. */
  hint: string | null;
  /** Below this, the response bar is drawn as a problem. */
  slowThreshold: number;
  labels: {
    title: string;
    sourceNote: string;
    member: string;
    projects: string;
    leadsReceived: string;
    fastResponse: string;
    viewings: string;
    closed: string;
    conversion: string;
    noProjects: string;
    noData: string;
    empty: string;
  };
};

export default function SalesTeamPerformance({ rows, hint, slowThreshold, labels }: Props) {
  return (
    <section className="admin-card space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary">{labels.title}</h2>
        <p className="text-xs text-ink-muted">{labels.sourceNote}</p>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="border-b border-primary/10">
              <tr>
                <th className="admin-th">{labels.member}</th>
                <th className="admin-th">{labels.projects}</th>
                <th className="admin-th">{labels.leadsReceived}</th>
                <th className="admin-th">{labels.fastResponse}</th>
                <th className="admin-th">{labels.viewings}</th>
                <th className="admin-th">{labels.closed}</th>
                <th className="admin-th">{labels.conversion}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {rows.map((row) => {
                const slow = row.fastResponseRate !== null && row.fastResponseRate < slowThreshold;

                return (
                  <tr key={row.id}>
                    <td className="admin-td">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
                          {initialsFrom(row.name)}
                        </span>
                        <span className="font-medium text-primary">{row.name}</span>
                      </span>
                    </td>

                    <td className="admin-td max-w-[200px] truncate text-ink-muted" title={row.projects.join(", ")}>
                      {row.projects.length > 0 ? row.projects.join(", ") : labels.noProjects}
                    </td>

                    <td className="admin-td tabular-nums text-ink-muted">{row.leadsReceived}</td>

                    <td className="admin-td">
                      {row.fastResponseRate === null ? (
                        <span className="text-xs text-ink-muted/70">{labels.noData}</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted">
                            <span
                              className={`block h-full ${slow ? "bg-red-500" : "bg-emerald-500"}`}
                              style={{ width: `${row.fastResponseRate}%` }}
                            />
                          </span>
                          <span
                            className={`text-xs font-semibold tabular-nums ${slow ? "text-red-700" : "text-ink-muted"}`}
                          >
                            {row.fastResponseRate}%
                          </span>
                        </span>
                      )}
                    </td>

                    <td className="admin-td tabular-nums text-ink-muted">{row.viewings}</td>
                    <td className="admin-td tabular-nums text-ink-muted">{row.closed}</td>

                    <td className="admin-td tabular-nums font-semibold text-emerald-700">
                      {row.conversionRate === null ? (
                        <span className="font-normal text-ink-muted/70">{labels.noData}</span>
                      ) : (
                        `${row.conversionRate}%`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hint && (
        <p className="rounded-xs border border-accent/30 bg-accent-50/70 px-4 py-2.5 text-sm text-accent-900">
          {hint}
        </p>
      )}
    </section>
  );
}
