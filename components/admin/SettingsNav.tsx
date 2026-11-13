"use client";

/**
 * components/admin/SettingsNav.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The tab strip of the settings workspace — the same rounded bar the
 * analytics and SEO hubs use, under the page title. It was a left rail,
 * which spent a 220px column on four links. Every entry is a real route,
 * so the highlighted one is read from the path rather than held in state.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { usePathname } from "next/navigation";
import { Bell, Database, Link2, ShieldCheck } from "lucide-react";
import AdminTabs from "@/components/admin/ui/AdminTabs";

type Key = "notifications" | "integrations" | "privacy" | "system";

/*
  Three entries left this strip and none of them were settings.

  "company" edited the About page's copy and "contact" edited the contact
  page's — both are tabs of /admin/pages now, beside the other sections of
  the pages they belong to. "seo" held the sitewide title template, the
  default OG image and the Search Console token, which are tabs of
  /admin/seo, beside the rest of the SEO work. next.config.js redirects all
  three old paths.

  What is left is what the word actually covers: how the system behaves,
  not what the website says.
*/
const ENTRIES: { key: Key; segment: string; icon: typeof Bell }[] = [
  { key: "notifications", segment: "notifications", icon: Bell },
  { key: "integrations", segment: "integrations", icon: Link2 },
  { key: "privacy", segment: "privacy", icon: ShieldCheck },
  { key: "system", segment: "system", icon: Database },
];

export default function SettingsNav({
  locale,
  label,
  labels,
}: {
  locale: string;
  /** What the strip is, for a screen reader ("ตั้งค่า"). */
  label: string;
  labels: Record<Key, string>;
}) {
  const pathname = usePathname();

  return (
    <AdminTabs
      variant="pill"
      label={label}
      tabs={ENTRIES.map(({ key, segment, icon }) => {
        const href = `/${locale}/admin/settings/${segment}`;
        return { key, href, label: labels[key], icon, active: pathname === href || pathname.startsWith(`${href}/`) };
      })}
    />
  );
}
