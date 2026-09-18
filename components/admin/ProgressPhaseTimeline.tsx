/**
 * components/admin/ProgressPhaseTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The build programme across the top of the progress page — six-ish stages
 * with the overall figure beside them (Progress.dc.html).
 *
 * A server component: nothing here is interactive, and the phases arrive
 * already ordered and localised.
 *
 * The overall percentage is *not* an average of the phases. It is the
 * newest published monthly figure, because that is the number the site
 * publishes and the one a buyer would quote back; averaging six stages
 * would produce a different number nobody has agreed to. See
 * lib/admin/project-progress.ts.
 */

import { Check } from "lucide-react";
import type { PhaseView } from "@/lib/admin/project-progress";

type Props = {
  phases: PhaseView[];
  overallPercent: number | null;
  deltaPercent: number | null;
  /** Pre-formatted caption per phase, keyed by id — "Done · Jan 26". */
  captions: Record<string, string>;
  labels: {
    overall: string;
    delta: string;
    noData: string;
    empty: string;
  };
};

export default function ProgressPhaseTimeline({
  phases,
  overallPercent,
  deltaPercent,
  captions,
  labels,
}: Props) {
  return (
    <section className="admin-card">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="shrink-0 lg:w-48 lg:border-r lg:border-primary/10 lg:pr-6">
          <p className="text-xs text-ink-muted">{labels.overall}</p>
          <p className="mt-1 text-4xl font-semibold text-primary">
            {overallPercent === null ? "—" : `${overallPercent}%`}
          </p>
          {deltaPercent !== null && deltaPercent !== 0 && (
            <p
              className={`mt-1 text-xs font-medium ${
                deltaPercent > 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {labels.delta
                .replace("{delta}", `${deltaPercent > 0 ? "+" : ""}${deltaPercent}`)}
            </p>
          )}
          {overallPercent === null && (
            <p className="mt-1 text-xs text-ink-muted">{labels.noData}</p>
          )}
        </div>

        {phases.length === 0 ? (
          <p className="flex-1 text-sm text-ink-muted">{labels.empty}</p>
        ) : (
          <ol className="flex flex-1 items-start gap-0 overflow-x-auto">
            {phases.map((phase, index) => {
              const done = phase.status === "DONE";
              const active = phase.status === "IN_PROGRESS";

              return (
                <li key={phase.id} className="flex min-w-[130px] flex-1 flex-col items-center">
                  <div className="flex w-full items-center">
                    {/* The connecting rule is drawn by the markers, not
                        between them, so a phase can sit at either end
                        without a stub of line hanging off it. */}
                    <span
                      className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : done || active ? "bg-emerald-500" : "bg-primary/15"}`}
                      aria-hidden
                    />
                    <span
                      className={[
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        done
                          ? "bg-emerald-500 text-white"
                          : active
                            ? "bg-primary text-white"
                            : "border border-primary/20 bg-surface text-ink-muted",
                      ].join(" ")}
                    >
                      {done ? <Check size={15} aria-hidden /> : phase.percentComplete}
                    </span>
                    <span
                      className={`h-0.5 flex-1 ${index === phases.length - 1 ? "bg-transparent" : done ? "bg-emerald-500" : "bg-primary/15"}`}
                      aria-hidden
                    />
                  </div>

                  <p
                    className={`mt-2 px-1 text-center text-xs font-medium ${active ? "text-primary" : "text-ink-muted"}`}
                  >
                    {phase.name}
                  </p>
                  <p className="px-1 text-center text-[11px] text-ink-muted/80">
                    {captions[phase.id]}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
