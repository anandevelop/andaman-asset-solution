/**
 * components/admin/ui/Avatar.tsx — initials on one of five CI gradients,
 * chosen by a hash of the id so a person keeps their colour everywhere
 * (the mockup's `.av`). 30px; sm 22, lg 44, xl 72.
 */

const GRADIENTS = [
  "bg-[linear-gradient(135deg,var(--adm-av-sand-1),var(--adm-av-sand-2))] text-adm-on-fill",
  "bg-[linear-gradient(135deg,var(--adm-av-ocean-1),var(--adm-av-ocean-2))] text-adm-on-fill",
  "bg-[linear-gradient(135deg,var(--adm-av-deep-1),var(--adm-av-deep-2))] text-white",
  "bg-[linear-gradient(135deg,var(--adm-av-peach-1),var(--adm-av-peach-2))] text-adm-on-fill",
  "bg-[linear-gradient(135deg,var(--adm-av-mist-1),var(--adm-av-mist-2))] text-adm-on-fill",
] as const;

const SIZE = {
  sm: "h-[22px] w-[22px] text-[10px]",
  md: "h-[30px] w-[30px] text-xs",
  lg: "h-11 w-11 text-base",
  xl: "h-[72px] w-[72px] text-2xl",
} as const;

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  const first = [...parts[0]][0] ?? "";
  const second = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? "") : "";
  return (first + second).toUpperCase();
}

export default function Avatar({
  id,
  name,
  size = "md",
  className = "",
}: {
  /** What the colour is keyed on — a user or lead id, so it is stable. */
  id: string;
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE[size]} ${GRADIENTS[hash(id) % GRADIENTS.length]} ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
