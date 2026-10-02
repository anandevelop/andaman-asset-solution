"use client";

/**
 * components/admin/AccountMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The signed-in person, at the foot of the rail, as a menu: their account,
 * screen density, language and sign out.
 *
 * Those four used to be spread over the rail (a sign-out row) and the
 * topbar (a density toggle and a TH ▾ menu). The v4 mockup keeps the
 * topbar for the work — search, live visitors, notifications, theme — and
 * puts settings about *you* behind your name, which is where people look
 * for them.
 *
 * Fixed-position, from the button's own rectangle: the rail clips its
 * overflow (so only the link list scrolls), and a menu inside it would be
 * cut off. Opens upward beside an expanded rail, to the right of a
 * collapsed one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, LogOut, UserCog } from "lucide-react";
import type { Role } from "@prisma/client";
import { adminLocales, type Locale } from "@/i18n";
import { applyDisplayPref, useDisplayPref } from "@/lib/admin/use-display-pref";
import Avatar from "@/components/admin/ui/Avatar";
import Segmented from "@/components/admin/ui/Segmented";

const LOCALE_LABELS: Record<Locale, string> = { en: "English", th: "ไทย", zh: "中文", ru: "Русский" };

export default function AccountMenu({
  locale,
  user,
  compactCapable,
  onNavigate,
}: {
  locale: string;
  user: { id: string; name: string; email: string; role: Role };
  /** True on the desktop rail, which can collapse to icons. */
  compactCapable: boolean;
  /** Close the phone drawer after following a link. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("admin");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const density = useDisplayPref("density");
  const rail = useDisplayPref("rail");
  const collapsed = compactCapable && rail === "collapsed";
  const [box, setBox] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = box !== null;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setBox(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBox(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pathWithout = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "");
  const localizedPath = (target: Locale) => `/${target}${pathWithout}`;

  const position = box
    ? collapsed
      ? { left: box.right + 8, bottom: window.innerHeight - box.bottom }
      : { left: box.left, bottom: window.innerHeight - box.top + 8, width: Math.max(box.width, 240) }
    : undefined;

  const item =
    "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] text-adm-text transition-colors hover:bg-adm-text/6 focus:bg-adm-text/6 focus:outline-hidden";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("account.menu")}
        title={collapsed ? user.name : undefined}
        onClick={() => setBox(open ? null : (buttonRef.current?.getBoundingClientRect() ?? null))}
        className={[
          "flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors hover:bg-adm-rail-hover",
          compactCapable ? "rail-collapsed:justify-center" : "",
        ].join(" ")}
      >
        <Avatar id={user.id} name={user.name} />
        <span className={["min-w-0 flex-1", compactCapable ? "rail-collapsed:hidden" : ""].join(" ")}>
          <span className="block truncate text-[12.5px] leading-tight text-adm-rail-hi">{user.name}</span>
          <span className="block truncate text-[11px] leading-tight text-adm-rail-text">
            {t(`roles.${user.role}` as never)}
          </span>
        </span>
        <ChevronsUpDown
          size={14}
          aria-hidden
          className={["shrink-0 text-adm-rail-dim", compactCapable ? "rail-collapsed:hidden" : ""].join(" ")}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("account.menu")}
          style={position}
          className="fixed z-[70] min-w-60 rounded-[14px] border border-adm-line bg-adm-solid p-1.5 shadow-[var(--adm-shadow-float)]"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-[13px] font-medium text-adm-text">{user.name}</p>
            <p className="truncate text-xs text-adm-muted">{user.email}</p>
          </div>

          <Link
            role="menuitem"
            href={`/${locale}/admin/account`}
            onClick={() => {
              setBox(null);
              onNavigate?.();
            }}
            className={item}
          >
            <UserCog size={15} aria-hidden className="text-adm-muted" />
            {t("account.title")}
          </Link>

          <div className="my-1 border-t border-adm-line" />

          <div className="px-2.5 py-1.5">
            <p className="mb-1.5 text-[11.5px] text-adm-muted">{t("topbar.density")}</p>
            <Segmented
              label={t("topbar.density")}
              active={density}
              onSelect={(value) => applyDisplayPref("density", value as "comfortable" | "compact")}
              items={[
                { key: "comfortable", label: t("account.densityComfortable") },
                { key: "compact", label: t("account.densityCompact") },
              ]}
            />
          </div>

          <div className="px-2.5 py-1.5">
            <p className="mb-1 text-[11.5px] text-adm-muted">{t("topbar.language")}</p>
          </div>
          {adminLocales.map((code) => (
            <Link
              key={code}
              role="menuitemradio"
              aria-checked={code === locale}
              href={localizedPath(code)}
              onClick={() => setBox(null)}
              className={item}
            >
              <span className="w-6 font-mono text-[11px] uppercase text-adm-muted">{code}</span>
              <span className="flex-1">{LOCALE_LABELS[code]}</span>
              {code === locale && <Check size={14} aria-hidden className="text-adm-info" />}
            </Link>
          ))}

          <div className="my-1 border-t border-adm-line" />

          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
            className={`${item} text-adm-danger`}
          >
            <LogOut size={15} aria-hidden />
            {tAuth("signOut")}
          </button>
        </div>
      )}
    </>
  );
}
