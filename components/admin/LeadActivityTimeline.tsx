/**
 * components/admin/LeadActivityTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Renders the merged feed from lib/lead-timeline.ts. Plain presentational
 * — no client-side state, no "use client" needed — every string and date
 * is already formatted by the page (a Server Component) before it gets
 * here, the same division of labour the dashboard's chart components use.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  CalendarClock,
  Mail,
  MessageSquare,
  Phone,
  Radio,
  RefreshCw,
} from "lucide-react";

export type TimelineItem = {
  id: string;
  icon: "note" | "call" | "email" | "system" | "appointment" | "entered";
  title: string;
  /** The note/call/email body, when this entry has one. */
  body?: string;
  /** Secondary context (who did it, which channel) — omitted when the
   *  title already names the actor, so the line doesn't repeat itself. */
  meta?: string;
  timeLabel: string;
};

const ICONS: Record<TimelineItem["icon"], typeof MessageSquare> = {
  note: MessageSquare,
  call: Phone,
  email: Mail,
  system: RefreshCw,
  appointment: CalendarClock,
  entered: Radio,
};

const ICON_TONE: Record<TimelineItem["icon"], string> = {
  note: "bg-primary/10 text-primary",
  call: "bg-emerald-100 text-emerald-700",
  email: "bg-sky-100 text-sky-700",
  system: "bg-accent/20 text-accent-700",
  appointment: "bg-emerald-100 text-emerald-700",
  entered: "bg-surface-muted text-ink-muted",
};

export default function LeadActivityTimeline({
  items,
  emptyLabel,
}: {
  items: TimelineItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <li key={item.id} className="flex gap-3">
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ICON_TONE[item.icon]}`}
            >
              <Icon size={14} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm leading-relaxed text-ink">
                <span className="font-medium text-primary">{item.title}</span>
                {item.body && <> — &ldquo;{item.body}&rdquo;</>}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {item.meta ? `${item.meta} · ${item.timeLabel}` : item.timeLabel}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
