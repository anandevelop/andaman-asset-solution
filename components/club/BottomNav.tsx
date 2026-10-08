"use client";
/**
 * components/club/BottomNav.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The portal's floating tab bar: an Apple-style capsule with five tabs and
 * a pill that slides to the active one (framer-motion layoutId). Rendered
 * only by signed-in pages, so sign-in, scan and OTP screens never show it.
 *
 * `base` is "" on the member host and "/<locale>/club" elsewhere; usePathname
 * returns the address the resident sees, so matching on base-prefixed
 * hrefs works on both.
 * ─────────────────────────────────────────────────────────────────────────
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { CreditCard, Gift, House, Tag, UserRound, type LucideIcon } from "lucide-react";

type Labels = { home: string; benefits: string; card: string; partners: string; account: string; menu: string };

const TABS: { key: keyof Omit<Labels, "menu">; path: string; icon: LucideIcon }[] = [
  { key: "home", path: "", icon: House },
  { key: "benefits", path: "/benefits", icon: Gift },
  { key: "card", path: "/card", icon: CreditCard },
  { key: "partners", path: "/partners", icon: Tag },
  { key: "account", path: "/account", icon: UserRound },
];

export default function BottomNav({ base, labels }: { base: string; labels: Labels }) {
  const pathname = (usePathname() ?? "/").replace(/\/$/, "") || "/";
  const reduce = useReducedMotion();
  const home = base || "/";

  const isActive = (path: string) => {
    if (!path) return pathname === home || pathname === base;
    const href = `${base}${path}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3.5 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <nav
        aria-label={labels.menu}
        className="pointer-events-auto mx-auto flex h-[62px] max-w-md items-stretch rounded-[22px] border border-club-line bg-club-surface/85 px-1.5 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.45)] backdrop-blur-xl backdrop-saturate-150"
      >
        {TABS.map(({ key, path, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={key}
              href={path ? `${base}${path}` : home}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-club-accent ${
                active ? "text-club-accent" : "text-club-text-3 hover:text-club-text-2"
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="club-tab-pill"
                  className="absolute inset-y-1.5 inset-x-0.5 rounded-2xl bg-club-surface-2"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                  aria-hidden
                />
              ) : null}
              <Icon size={19} strokeWidth={active ? 1.9 : 1.5} className="relative" aria-hidden />
              <span className={`relative truncate text-[8.5px] leading-none tracking-[0.02em] ${active ? "font-semibold" : ""}`}>{labels[key]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
