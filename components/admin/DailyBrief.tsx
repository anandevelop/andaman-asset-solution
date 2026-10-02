/**
 * components/admin/DailyBrief.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The navy band the dashboard opens with: a greeting, one sentence built
 * from today's real counts, and a tile per backlog that opens the list
 * already filtered to it.
 *
 * The sentence is a template filled with numbers, not generated text, and
 * the chip says "today's summary", not "AI" — the v4 mockup's AI brief is
 * a later phase with a model behind it. Anything written here has to be
 * checkable against the tiles directly beneath it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type BriefTile = {
  key: string;
  href: string | null;
  label: string;
  value: string;
  hint: string;
  /** Something is overdue. Drawn in sand, not red: red on the navy band
   *  is under 3:1, and sand is the band's own attention colour. */
  alert?: boolean;
};

export default function DailyBrief({
  chip,
  greeting,
  sentence,
  tiles,
}: {
  chip: string;
  greeting: string;
  sentence: string;
  tiles: BriefTile[];
}) {
  return (
    <section className="overflow-hidden rounded-card bg-linear-to-br from-adm-band to-adm-band-2 p-5 text-white sm:p-6">
      <span className="inline-flex items-center rounded-full bg-adm-fill px-2.5 py-0.5 text-[11px] font-semibold text-adm-on-fill">
        {chip}
      </span>
      <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">{greeting}</h1>
      <p className="mt-1.5 max-w-3xl text-sm text-white/75">{sentence}</p>

      {tiles.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => {
            const body = (
              <>
                <span className="flex items-center justify-between gap-2 text-xs text-white/70">
                  <span className="truncate">{tile.label}</span>
                  {tile.href && <ArrowUpRight size={14} aria-hidden className="shrink-0 opacity-70" />}
                </span>
                <span
                  className={`mt-1 block text-[26px] font-semibold leading-tight tabular-nums ${
                    tile.alert ? "text-adm-fill" : "text-white"
                  }`}
                >
                  {tile.value}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-white/60">{tile.hint}</span>
              </>
            );
            const className = "block rounded-[12px] border border-white/10 bg-white/5 px-4 py-3";
            return (
              <li key={tile.key}>
                {tile.href ? (
                  <Link href={tile.href} className={`${className} transition-colors hover:border-white/25 hover:bg-white/10`}>
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
