"use client";

/**
 * components/admin/PageSideNav.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A tab group drawn as a vertical list in a card — the v4 About hub's left
 * column: the rail's item style on a light surface, the active section in
 * a sand gradient with a bar, a count after each name.
 *
 * Same source as PageTabs (visibleTabs in lib/admin/nav.ts), so a role sees
 * the same sections either way; only the drawing differs. Used where a
 * second horizontal strip under the hub's own tabs read as two peer
 * levels, which they are not.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { tabBase, visibleTabs } from "@/lib/admin/nav";

export default function PageSideNav({
  locale,
  role,
  groupKey,
  baseHref,
  counts,
}: {
  locale: string;
  role: Role;
  groupKey: string;
  baseHref?: string;
  counts?: Partial<Record<string, number>>;
}) {
  const t = useTranslations("admin.tabs");
  const pathname = usePathname();
  const tabs = visibleTabs(role, groupKey);
  const base = baseHref ?? tabBase(groupKey) ?? "";

  return (
    <nav aria-label={t(`${groupKey}.label` as never)} className="admin-card p-2!">
      <ul className="space-y-0.5">
        {tabs.map(({ key, segment }) => {
          const href = `/${locale}/admin${base}${segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const count = counts?.[key];
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative flex h-9 items-center gap-2 rounded-[10px] px-3 text-[13px] transition-colors",
                  active
                    ? "bg-linear-to-r from-adm-fill/20 to-transparent font-medium text-adm-text before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-adm-fill"
                    : "text-adm-muted hover:bg-adm-text/5 hover:text-adm-text",
                ].join(" ")}
              >
                <span className="flex-1 truncate">{t(`${groupKey}.${key}` as never)}</span>
                {count !== undefined && count > 0 && (
                  <span className="admin-mono text-[11px] tabular-nums text-adm-muted">{count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
