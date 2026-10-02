/**
 * components/admin/ui/StatusPill.tsx — the mockup's `.pill`: 22px, a 6px
 * dot, the colour from a status token, its background the same colour at
 * 13%. `tone` names the token; the label carries the meaning, the colour
 * only reinforces it.
 */

export type PillTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

const TONE: Record<PillTone, string> = {
  success: "text-adm-success bg-adm-success/13",
  warning: "text-adm-warning bg-adm-warning/13",
  danger: "text-adm-danger bg-adm-danger/13",
  info: "text-adm-status-info bg-adm-status-info/13",
  neutral: "text-adm-neutral bg-adm-neutral/13",
  accent: "text-adm-accent-ink bg-adm-fill/20",
};

export default function StatusPill({
  tone,
  label,
  dot = true,
  className = "",
}: {
  tone: PillTone;
  label: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] text-[11.5px] font-medium ${TONE[tone]} ${className}`}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
