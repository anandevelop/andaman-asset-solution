/**
 * components/admin/DailyBrief.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The navy band the dashboard opens with: a greeting, how many things want
 * doing first, one sentence built from today's real counts, and a tile per
 * backlog that opens the list already filtered to it.
 *
 * The sentence is a template filled with numbers, not generated text, and
 * the chip says "today's summary", not "AI" — the v4 mockup's AI brief is
 * a later phase with a model behind it. Anything written here has to be
 * checkable against the tiles directly beneath it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type BriefTile = {
  key: string;
  href: string | null;
  label: string;
  value: string;
  /** Muted after the value — "/1" of "0/1". */
  valueSuffix?: string;
  hint: string;
  /** The number's colour, as in the mockup: sand gradient for leads, the
   *  light sand for overdue appointments, ocean for events. */
  tone: "lead" | "overdue" | "event";
};

const TONE: Record<BriefTile["tone"], string> = {
  lead: "admin-grad-text",
  overdue: "text-adm-sand-hi",
  event: "text-adm-ocean-hi",
};

/** Numbers in the sentence in white, so the counts are what the eye finds
 *  — split out here rather than marked up in four locales' messages. */
function emphasiseNumbers(sentence: string) {
  return sentence.split(/(\d[\d,.]*)/).map((part, index) =>
    index % 2 === 1 ? (
      <b key={index} className="font-medium text-white">
        {part}
      </b>
    ) : (
      part
    ),
  );
}

export default function DailyBrief({
  chip,
  dateLabel,
  greeting,
  headline,
  headlineHasWork,
  sentence,
  tiles,
}: {
  chip: string;
  dateLabel: string;
  greeting: string;
  /** "วันนี้มี 5 เรื่องที่ควรทำก่อน", or the all-clear line. */
  headline: string;
  /** Drawn in the sand gradient only when there is something to do. */
  headlineHasWork: boolean;
  sentence: string;
  tiles: BriefTile[];
}) {
  return (
    <section className="admin-brief overflow-hidden px-5 py-6 text-white sm:px-7 sm:py-[26px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-[22px] items-center rounded-full border border-adm-ocean-hi/40 px-2.5 text-[11.5px] text-adm-ocean-hi">
          {chip}
        </span>
        <span className="inline-flex h-[22px] items-center rounded-full border border-white/15 px-2.5 text-[11.5px] text-adm-brief-text">
          {dateLabel}
        </span>
      </div>

      <h1 className="mt-3 text-[26px] font-semibold leading-tight text-white sm:text-[30px]">
        {greeting} — <span className={headlineHasWork ? "admin-grad-text" : undefined}>{headline}</span>
      </h1>
      <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-adm-brief-text">
        {emphasiseNumbers(sentence)}
      </p>

      {tiles.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => {
            const body = (
              <>
                <span className={`min-w-[34px] text-[28px] font-semibold leading-none tabular-nums ${TONE[tile.tone]}`}>
                  {tile.value}
                  {tile.valueSuffix && <span className="text-[13px] font-normal text-adm-brief-dim">{tile.valueSuffix}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-white">{tile.label}</span>
                  <span className="block truncate text-[11.5px] text-adm-brief-dim">{tile.hint}</span>
                </span>
                {tile.href && <ArrowRight size={16} aria-hidden className="shrink-0 text-adm-brief-dim" />}
              </>
            );
            const className =
              "flex items-center gap-3.5 rounded-[14px] border border-white/14 bg-adm-band/45 px-4 py-3.5";
            return (
              <li key={tile.key}>
                {tile.href ? (
                  <Link
                    href={tile.href}
                    className={`${className} transition-[transform,border-color] hover:-translate-y-px hover:border-adm-fill/45 motion-reduce:hover:translate-y-0`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={className}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
