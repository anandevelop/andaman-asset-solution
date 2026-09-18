type Stat = {
  label: string;
  value: string;
};

type Props = {
  stats: Stat[];
  /**
   * "plain" (default) is the original flush, square-cornered strip used
   * on the About page — unchanged.
   * "elevated" is a rounded, shadowed white card meant to sit on top of a
   * photo (negative-margin overlap) — used by the project page's Hero.
   * No icons (tried, then asked to be removed) — just lighter, smaller
   * type than the plain tone so the card reads as understated rather than
   * shouting over the photo it's sitting on.
   */
  tone?: "plain" | "elevated";
};

export default function StatBar({ stats, tone = "plain" }: Props) {
  const elevated = tone === "elevated";

  return (
    <div
      className={
        elevated
          ? "grid grid-cols-2 divide-x divide-y divide-primary/10 rounded-xs bg-white shadow-cardHover sm:grid-cols-4 sm:divide-y-0"
          : "grid grid-cols-2 divide-x divide-primary/10 border border-primary/10 bg-white sm:grid-cols-4"
      }
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className={
            elevated
              ? "px-4 py-7 text-center sm:py-9"
              : "px-5 py-6 text-center sm:px-4"
          }
        >
          <p
            className={
              elevated
                ? "text-lg font-light tracking-tight text-primary sm:text-xl"
                : "text-xl font-semibold text-primary sm:text-2xl"
            }
          >
            {s.value}
          </p>
          <p
            className={
              elevated
                ? "mt-2 text-[10px] font-normal uppercase tracking-widest2 text-ink/45"
                : "mt-1 text-[11px] font-medium uppercase tracking-widest2 text-ink/65"
            }
          >
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}
