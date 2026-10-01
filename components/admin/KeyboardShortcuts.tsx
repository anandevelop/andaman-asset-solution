"use client";

/**
 * components/admin/KeyboardShortcuts.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The back office's single-key shortcuts, in one listener:
 *
 *   /            open the search palette (as ⌘K does — CommandK owns that)
 *   g then d|l|p|n|s|a   go to dashboard, leads, projects, news, SEO,
 *                analytics — within 900ms, as in the v4 mockup
 *   t            light ↔ dark
 *
 * The others live with what they act on: `[` in AdminSidebar, `.` in
 * CopilotPanel, ⌘S in FormSaveBar.
 *
 * Every one is ignored while typing (lib/admin/keyboard.ts) and with a
 * modifier held, so ⌘G, Ctrl+T and friends stay the browser's.
 *
 * A jump goes only where the sidebar would: the target is looked up in
 * visibleNav for this role, so `g l` does nothing for an editor rather
 * than sending them to a page that turns them away.
 *
 * No `c` for "new lead": leads are not created in the back office (the
 * public form and its consent record are the only way in — see
 * leads/actions.ts), so there is nothing for it to open.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { visibleNav } from "@/lib/admin/nav";
import { isTypingTarget } from "@/lib/admin/keyboard";
import { applyDisplayPref } from "@/lib/admin/use-display-pref";

/** Second key of a `g` chord → nav item key. */
export const GO_KEYS: Record<string, string> = {
  d: "dashboard",
  l: "leads",
  p: "projects",
  n: "news",
  s: "seo",
  a: "analytics",
};

const CHORD_WINDOW_MS = 900;

export default function KeyboardShortcuts({ locale, role }: { locale: string; role: Role }) {
  const router = useRouter();

  const hrefFor = useMemo(() => {
    const items = new Map(
      visibleNav(role)
        .flatMap((group) => group.items)
        .map((item) => [item.key, item.href]),
    );
    return (key: string) => {
      const href = items.get(key);
      return href === undefined ? null : `/${locale}/admin${href}`;
    };
  }, [locale, role]);

  useEffect(() => {
    let chordUntil = 0;

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();

      if (Date.now() < chordUntil) {
        chordUntil = 0;
        const target = GO_KEYS[key] ? hrefFor(GO_KEYS[key]) : null;
        if (target) {
          event.preventDefault();
          router.push(target);
        }
        return;
      }

      if (key === "g") {
        chordUntil = Date.now() + CHORD_WINDOW_MS;
      } else if (key === "/") {
        event.preventDefault();
        window.dispatchEvent(new Event("admin:open-search"));
      } else if (key === "t") {
        const dark = document.documentElement.dataset.adminTheme === "dark";
        applyDisplayPref("theme", dark ? "light" : "dark");
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hrefFor, router]);

  return null;
}
