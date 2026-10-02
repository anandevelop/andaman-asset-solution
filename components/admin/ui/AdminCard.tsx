/**
 * components/admin/ui/AdminCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The mockup's `.card` and `.ch`: 16px corners, 18px padding, a ring-shadow
 * instead of a border (softer in light), an optional hover lift and the
 * sand spotlight that follows the pointer (data-spot; the position is set
 * by SpotlightTracker, mounted once in the admin layout).
 *
 * `admin-card` (the utility) is the same look for markup that has not been
 * moved onto this component yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ElementType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function AdminCard({
  as: Tag = "section",
  pad = true,
  lift = false,
  spot = false,
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  /** false → no padding and overflow hidden, for tables and edge-to-edge lists. */
  pad?: boolean;
  lift?: boolean;
  spot?: boolean;
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Tag
      {...rest}
      data-spot={spot ? "" : undefined}
      className={[
        "admin-card",
        pad ? "" : "overflow-hidden p-0!",
        lift ? "admin-card-lift" : "",
        className,
      ].join(" ")}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  sub,
  right,
  className = "",
}: {
  icon?: LucideIcon;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3.5 flex items-center gap-2.5 ${className}`}>
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-adm-text">
        {Icon && <Icon size={16} aria-hidden className="shrink-0 text-adm-accent-ink" />}
        <span className="truncate">{title}</span>
      </h2>
      {sub && <span className="truncate text-xs text-adm-muted">{sub}</span>}
      {right && <div className="ml-auto flex shrink-0 items-center gap-1.5">{right}</div>}
    </div>
  );
}
