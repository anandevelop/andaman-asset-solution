/**
 * components/admin/ui/LocaleFlags.tsx — TH EN ZH RU as 24×18 chips: green
 * when that language is written, amber when partly, struck through when
 * missing (the mockup's `.flags`). The state is the caller's; this only
 * draws it, with the state in the title for anyone not reading colour.
 */

export type LocaleState = "complete" | "partial" | "missing";

const TONE: Record<LocaleState, string> = {
  complete: "bg-adm-success-bg text-adm-success",
  partial: "bg-adm-warning-bg text-adm-warning",
  missing: "bg-adm-text/6 text-adm-muted line-through",
};

export default function LocaleFlags({
  locales,
  titles,
}: {
  locales: { locale: string; state: LocaleState }[];
  /** Words for each state, for the title — the colour is not the only cue. */
  titles?: Partial<Record<LocaleState, string>>;
}) {
  return (
    <span className="inline-flex gap-1">
      {locales.map(({ locale, state }) => (
        <span
          key={locale}
          title={titles?.[state] ? `${locale.toUpperCase()} · ${titles[state]}` : undefined}
          className={`inline-flex h-[18px] w-6 items-center justify-center rounded-[5px] font-mono text-[10px] font-semibold uppercase ${TONE[state]}`}
        >
          {locale}
        </span>
      ))}
    </span>
  );
}
