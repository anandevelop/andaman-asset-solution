"use client";

/**
 * components/admin/SettingsNav.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The left rail of the settings workspace. Every entry is a real route, so
 * the highlighted one is read from the path rather than held in state —
 * there is nothing here that can disagree with what is on screen.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  Database,
  Link2,
  Phone,
  ShieldCheck,
} from "lucide-react";

type Key =
  | "company"
  | "contact"
  | "notifications"
  | "integrations"
  | "privacy"
  | "system";

const ENTRIES: { key: Key; segment: string; icon: typeof Bell }[] = [
  { key: "company", segment: "company", icon: Building2 },
  { key: "contact", segment: "contact", icon: Phone },
  /* No "seo" row: the sitewide title template, default OG image and
     Search Console token moved to /admin/seo/defaults, beside the rest of
     the SEO work. next.config.js redirects the old path. */
  { key: "notifications", segment: "notifications", icon: Bell },
  { key: "integrations", segment: "integrations", icon: Link2 },
  { key: "privacy", segment: "privacy", icon: ShieldCheck },
  { key: "system", segment: "system", icon: Database },
];

export default function SettingsNav({
  locale,
  labels,
}: {
  locale: string;
  labels: Record<Key, string>;
}) {
  const pathname = usePathname();

  return (
    <nav className="admin-card p-2!" aria-label={labels.company}>
      <ul className="space-y-1">
        {ENTRIES.map(({ key, segment, icon: Icon }) => {
          const href = `/${locale}/admin/settings/${segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-2.5 rounded-xs px-3.5 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary font-semibold text-white"
                    : "text-ink-muted hover:bg-surface-muted hover:text-primary",
                ].join(" ")}
              >
                <Icon size={15} aria-hidden />
                {labels[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
