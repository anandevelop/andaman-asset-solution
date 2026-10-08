/**
 * components/club/ClubLogo.tsx — the company logo as a CSS mask
 * (`logo-mask` in app/club.css), so it can be champagne on black and ink
 * on white without a second image. Decorative: pages carry their own
 * heading, so the mask is aria-hidden unless a label is given.
 */
type Props = {
  className?: string;
  /** Background for the mask; the default is the champagne gradient. */
  tone?: "champagne" | "ink" | "titanium";
  label?: string;
};

const TONES = {
  champagne: "bg-[linear-gradient(90deg,#f4e9d4,#d9c4a1_60%,#b89a6c)]",
  ink: "bg-club-text",
  titanium: "bg-[linear-gradient(90deg,#f0f0f1,#9a9ca1)]",
} as const;

export default function ClubLogo({ className = "w-[120px]", tone = "champagne", label }: Props) {
  return (
    <span
      className={`logo-mask block ${TONES[tone]} ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
