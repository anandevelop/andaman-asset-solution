"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Menu, X, Phone, Globe, Check, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { siteConfig } from "@/config/site";
import { locales, type Locale } from "@/i18n";

type Props = {
  /** Live values from lib/settings.ts, passed down by (site)/layout.tsx. */
  phone: string;
  phoneDisplay: string;
  /** Raw contact number — digits stripped and built into a wa.me link the
   *  same way Footer.tsx/SalesTeamSection.tsx/contact/page.tsx already do. */
  whatsapp: string;
  /** Admin-editable brand logo, config/site.ts behind it. */
  logoUrl: string;
};

const MOBILE_MENU_ID = "mobile-nav";

/** Everything the browser will focus, in document order. */
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Native-script names, not translated — "English"/"ไทย"/"中文"/"Русский" read
 * the same regardless of which locale's messages/*.json is active, same
 * convention as Award.organization in schema.prisma ("an organization's
 * name doesn't get translated"). Order matches i18n.ts's `locales` tuple.
 */
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  th: "ไทย",
  zh: "中文",
  ru: "Русский",
};

export default function Navbar({ phone, phoneDisplay, whatsapp, logoUrl }: Props) {
  const t = useTranslations("nav");
  const tChat = useTranslations("chatButtons");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  /** Scroll-direction header visibility — see the effect below. */
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);

  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const langButtonRef = useRef<HTMLButtonElement | null>(null);
  /** One entry per locale option, in `locales` order — used for arrow-key roving focus. */
  const langOptionRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const first = menuRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      /*
        Unshift, not push. The toggle button lives in <header>, before the
        panel in DOM order — it is the one focusable element outside
        menuRef that this trap still needs to hold onto, and it is where
        Shift+Tab from the first link should land.

        Appending it here instead made it the array's *last* element
        without making it the page's last-in-tab-order element, so the
        boundary check below — "forward-Tab from the last node wraps to
        the first" — was comparing against a node nobody forward-tabs
        into from inside the panel. The panel's real last element (the
        phone button) had no wrap at all, and Tab from there walked
        straight into the page underneath: the exact bug this trap exists
        to prevent.
      */
      if (toggleRef.current) nodes.unshift(toggleRef.current);
      if (nodes.length === 0) return;

      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && active === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    setOpen(false);
    setLangOpen(false);
  }, [pathname]);

  // Click-outside + Escape + arrow-key roving focus for the language
  // dropdown — a lighter-weight version of the mobile menu's focus trap
  // above, since this one is a small listbox popover rather than a
  // full-screen panel.
  useEffect(() => {
    if (!langOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (langMenuRef.current?.contains(target) || langButtonRef.current?.contains(target)) return;
      setLangOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setLangOpen(false);
        langButtonRef.current?.focus();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();

      const options = langOptionRefs.current.filter((el): el is HTMLAnchorElement => el !== null);
      if (options.length === 0) return;

      const activeIndex = options.findIndex((el) => el === document.activeElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        activeIndex === -1
          ? event.key === "ArrowDown"
            ? 0
            : options.length - 1
          : (activeIndex + delta + options.length) % options.length;

      options[nextIndex]?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [langOpen]);

  // Standard listbox behaviour: opening the menu (click or keyboard) moves
  // focus straight to the current locale's option, so arrow keys work
  // immediately without an extra Tab.
  useEffect(() => {
    if (!langOpen) return;

    const options = langOptionRefs.current.filter((el): el is HTMLAnchorElement => el !== null);
    const current = options.find((el) => el.getAttribute("aria-selected") === "true");
    (current ?? options[0])?.focus();
  }, [langOpen]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Hide the header on scroll-down, reveal it on scroll-up — a "come back
  // when you want it" header instead of one that permanently eats screen
  // space on mobile. rAF-throttled so the scroll listener never runs more
  // than once per frame, and a small delta tolerance absorbs trackpad/
  // inertia jitter that would otherwise flip direction every frame.
  //
  // Skipped entirely while the mobile menu is open. Body scroll is
  // "locked" via overflow:hidden then, but that lock doesn't stop iOS
  // Safari's rubber-band overscroll from still firing `scroll` events on
  // window — so without this guard, a swipe against the top/bottom of the
  // full-screen menu could hide the header (and its only close button)
  // right along with it, with no way back short of scrolling around
  // blind. The menu forces the header to `fixed` (see the comment above
  // <header>) precisely so it can act as this panel's anchor, so it needs
  // to just stay put, full stop, for as long as `open` is true.
  useEffect(() => {
    if (open) {
      setHeaderHidden(false);
      return;
    }

    lastScrollY.current = window.scrollY;
    let ticking = false;

    const update = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      // Always visible near the top — hiding it there just to show it
      // again a moment later reads as flicker, not a feature.
      if (currentY < 80) {
        setHeaderHidden(false);
      } else if (Math.abs(delta) > 4) {
        const scrollingDown = delta > 0;
        setHeaderHidden(scrollingDown);
        // Close any open popover before it scrolls off with a header
        // that's no longer there to anchor it.
        if (scrollingDown) {
          setLangOpen(false);
        }
      }

      lastScrollY.current = currentY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  const pathnameWithoutLocale = pathname.replace(
    new RegExp(`^/${locale}(/|$)`),
    (_, slash) => slash ?? "/",
  );

  /** Same page, different locale prefix — used by every item in the dropdown. */
  const localizedPath = (target: Locale) =>
    `/${target}${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`;

  // Same wa.me construction as Footer.tsx/SalesTeamSection.tsx/contact
  // page — the site-wide sales number, greeted with the shared opener.
  const whatsappUrl = `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
    tChat("whatsappGreeting"),
  )}`;

  const isActive = (href: string) => {
    const target = `/${locale}${href === "/" ? "" : href}`;
    if (href === "/") return pathname === `/${locale}` || pathname === target;
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  const linkClass = (active: boolean) => {
    return [
      // Uppercase and letterspaced on the bar itself; the accent underline
      // on the active item is drawn as an absolute span below.
      "relative py-1 text-xs uppercase tracking-[0.18em] transition-colors",
      active ? "text-white" : "text-white/75 hover:text-white",
    ].join(" ");
  };

  /** Just the label — the mobile menu's numbered rows carry the number
   *  and trailing chevron/dot as siblings, not part of this text itself. */
  const mobileLinkClass = (active: boolean) => {
    return [
      "text-lg sm:text-xl transition-colors",
      active ? "font-medium text-white" : "font-light text-white/70",
    ].join(" ");
  };

  return (
    <>
      {/*
        `print:hidden` lives on this element itself, not a wrapping <div> in
        (site)/layout.tsx as it used to — a sticky element's "stuck" range is
        bounded by its own parent's box, and that wrapper had no height
        beyond the header it contained (parent height == header height, a
        wrapper added purely to carry one utility class with no other
        children). That collapsed the range to zero: computed style still
        said `position: sticky`, but there was no room to ever engage it, so
        the header scrolled away with the page like a static element from
        the very first pixel of scroll instead of sticking to the top. Only
        visible by actually scrolling and comparing scrollY to the header's
        own boundingClientRect — everything else about it looked correct.
        Now the header's parent is <body> itself, which is always taller
        than one header, so the range is never zero.
      */}
      {/*
        `fixed` instead of `sticky` while the mobile menu is open. The menu
        panel below scrolls internally (overflow-y-auto, for menus taller
        than the viewport), and on mobile browsers that internal touch-
        scroll can drag a `sticky` ancestor's positioning context along
        with it — the header (and the close button inside it) scrolls up
        and off-screen with the rest of the page, which is the bug being
        fixed here. `fixed` is pinned to the viewport itself and can't be
        dragged by a child's scroll, regardless of browser quirks. No
        visual difference the rest of the time: body scroll is locked
        while the menu is open, so both positioning modes render
        identically at scroll position 0.
      */}
      {/* Navy on every page, not just the home page's hero.

          The bar carries the brand's own colour rather than borrowing the
          page's background, which means one header instead of two — and
          the light variant that used to render everywhere else is gone
          along with the pathname check that chose between them. The mobile
          menu panel below is still light: a dark header above a light
          sheet is the ordinary arrangement, and matching them would have
          left the header invisible against the panel it sits on.

          `bg-primary`, at full opacity, and not `bg-primary-800/95`.

          The two tokens hold the same hex today, but the CI navy is
          `primary` — naming the numbered step instead meant the header
          would quietly stop being the brand colour the day the scale was
          retuned. The opacity mattered more: 95% over a light page
          rendered #153f5a rather than #083551, and over the home page's
          hero photograph it rendered whatever the photograph happened to
          be, so the header was a slightly different colour on almost every
          page. `backdrop-blur-md` went with it — with nothing showing
          through, it was buying a compositing layer and no effect. */}
      <header
        className={[
          open ? "fixed" : "sticky",
          "inset-x-0 top-0 z-50 border-b border-white/10 bg-primary print:hidden",
          "transition-all duration-300 ease-in-out",
          headerHidden && !open ? "-translate-y-full" : "translate-y-0",
        ].join(" ")}
      >
        {/* Three tracks rather than `justify-between`: the nav is centred
            on the bar, not on whatever space the logo and the buttons
            happen to leave, so adding a menu item does not shift it. */}
        <div className="container-luxe flex h-16 items-center justify-between gap-6 sm:h-18 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          
          {/* Logo Section */}
          <Link
            href={`/${locale}`}
            className="flex shrink-0 items-center relative z-50"
            aria-label="Andaman Asset Solution — Home"
          >
            {/* The intrinsic 180×36 stays whatever gets uploaded: it
                reserves the right space before the file loads, and the
                admin hint asks for that shape. */}
            {/* `brightness-0 invert` only for the committed dark artwork,
                the same rule the footer applies for the same reason: an
                uploaded logo is the uploader's business, and inverting a
                light one would make it vanish with nothing on screen to
                explain why. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={siteConfig.legalName}
              width={180}
              height={36}
              className={`h-6 w-auto sm:h-7 ${
                logoUrl === siteConfig.branding.logo ? "brightness-0 invert" : ""
              }`}
            />
          </Link>

          {/* Desktop Navigation */}
          <nav
            aria-label={t("mainMenu")}
            className="hidden items-center justify-center gap-7 lg:flex xl:gap-9"
          >
            {siteConfig.nav.main.map((item) => {
              const active = isActive(item.href);

              return (
                <Link
                  key={item.key}
                  href={`/${locale}${item.href}`}
                  aria-current={active ? "page" : undefined}
                  className={linkClass(active)}
                >
                  {t(item.key as any)}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -bottom-1 left-0 h-px w-full bg-accent"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions Section */}
          <div className="relative z-50 flex shrink-0 items-center justify-end gap-4 sm:gap-5">
            
            {/* ตัวเปลี่ยนภาษา */}
            <div className="relative">
              <button
                ref={langButtonRef}
                type="button"
                aria-label={t("language")}
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                onClick={() => setLangOpen((v) => !v)}
                onKeyDown={(event) => {
                  // Standard listbox trigger behaviour — Down/Enter/Space
                  // opens and hands focus to the dropdown (see the
                  // langOpen focus effect above); Escape/click-outside
                  // close it elsewhere.
                  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setLangOpen(true);
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-white/80 transition-colors hover:text-white sm:text-sm"
              >
                <Globe size={16} strokeWidth={1.5} aria-hidden />
                {/* The code on the bar, the language's own name in the
                    menu below: "Русский" is eleven characters of a header
                    that has seven menu items to fit beside it. */}
                <span className="uppercase">{locale}</span>
                <span className="sr-only">{LOCALE_LABELS[locale as Locale]}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                  className={`shrink-0 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {langOpen && (
                  <motion.div
                    ref={langMenuRef}
                    role="listbox"
                    aria-label={t("language")}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-50 mt-2 min-w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-ink/10 bg-surface py-1 shadow-card"
                  >
                    {locales.map((code, index) => (
                      <Link
                        key={code}
                        ref={(el) => {
                          langOptionRefs.current[index] = el;
                        }}
                        href={localizedPath(code)}
                        hrefLang={code}
                        lang={code}
                        role="option"
                        aria-selected={code === locale}
                        onClick={() => setLangOpen(false)}
                        className={[
                          "flex min-h-11 items-center justify-between gap-3 whitespace-nowrap px-4 py-2.5 text-sm transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-hidden",
                          code === locale ? "text-primary font-medium" : "text-ink/70",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-2.5">
                          <Globe size={14} strokeWidth={1.5} className="shrink-0 text-ink/40" aria-hidden />
                          {LOCALE_LABELS[code]}
                        </span>
                        {code === locale && <Check size={14} strokeWidth={2} aria-hidden />}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ปุ่มโทรศัพท์ (เดสก์ท็อป) */}
            <a
              href={`tel:${phone}`}
              className="hidden items-center gap-2 whitespace-nowrap border border-white/45 px-5 py-2.5 text-sm font-medium tracking-wide text-white transition-all hover:border-white hover:bg-white/10 lg:flex"
            >
              <Phone size={16} strokeWidth={1.5} aria-hidden />
              {phoneDisplay}
            </a>

            {/* แฮมเบอร์เกอร์ (มือถือ) */}
            <button
              ref={toggleRef}
              type="button"
              aria-label={open ? t("closeMenu") : t("openMenu")}
              aria-expanded={open}
              aria-controls={MOBILE_MENU_ID}
              onClick={() => setOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-end text-white/85 transition-colors hover:text-white lg:hidden"
            >
              {open ? <X size={24} strokeWidth={1.5} aria-hidden /> : <Menu size={24} strokeWidth={1.5} aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav - Full Screen */}
      <AnimatePresence>
        {open && (
          <motion.nav
            ref={menuRef}
            id={MOBILE_MENU_ID}
            aria-label={t("mobileMenu")}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-primary pt-16 sm:pt-18 lg:hidden"
          >
            <div className="container-luxe flex min-h-full flex-col px-6 pb-8 pt-6 sm:pb-12 sm:pt-8">
              {/* Menu list — numbered rows on a hairline divider, a
                  trailing chevron promising "go here", the active row
                  swapping that chevron for a plain dot since it has
                  nowhere further to go. */}
              <div className="flex flex-col">
                {siteConfig.nav.main.map((item, i) => {
                  const active = isActive(item.href);

                  const motionProps = {
                    initial: { opacity: 0, y: 30 },
                    animate: { opacity: 1, y: 0 },
                    exit: { opacity: 0, y: 10 },
                    transition: {
                      delay: i * 0.06 + 0.1,
                      duration: 0.4,
                      ease: [0.25, 0.1, 0.25, 1] as const,
                    },
                  };

                  return (
                    <motion.div
                      key={item.key}
                      {...motionProps}
                      className="border-b border-white/10 first:border-t"
                    >
                      <Link
                        href={`/${locale}${item.href}`}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className="flex items-center gap-4 py-4"
                      >
                        <span className="text-xs tabular-nums text-white/60" aria-hidden>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className={mobileLinkClass(active)}>{t(item.key as any)}</span>
                        {active ? (
                          <span
                            aria-hidden
                            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          />
                        ) : (
                          <ChevronRight
                            size={18}
                            strokeWidth={1.5}
                            className="ml-auto shrink-0 text-white/30"
                            aria-hidden
                          />
                        )}
                      </Link>
                    </motion.div>
                  );
                })}
              </div>

              {/* Language + contact — pushed to the bottom of the panel
                  (mt-auto on the flex-col above) rather than sitting right
                  under the menu list, so the two groups read as separate
                  concerns even on a tall phone screen with room to spare. */}
              <motion.div
                className="mt-auto flex flex-col gap-6 pt-10 sm:pt-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                    {t("language")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {locales.map((code) => (
                      <Link
                        key={code}
                        href={localizedPath(code)}
                        hrefLang={code}
                        lang={code}
                        onClick={() => setOpen(false)}
                        aria-current={code === locale ? "true" : undefined}
                        className={[
                          "rounded-full border px-4 py-2 text-sm transition-colors",
                          code === locale
                            ? "border-accent text-white"
                            : "border-white/20 text-white/70 hover:border-white/40 hover:text-white",
                        ].join(" ")}
                      >
                        {LOCALE_LABELS[code]}
                      </Link>
                    ))}
                  </div>
                </div>

                <a
                  href={`tel:${phone}`}
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-white py-3.5 text-[15px] font-medium text-primary shadow-xs transition-colors active:bg-white/90 sm:py-4 sm:text-base"
                >
                  <Phone size={18} strokeWidth={1.5} aria-hidden />
                  {phoneDisplay}
                </a>

                {/* A darkened WhatsApp green, not the brand's own #25D366
                    (used elsewhere on the site as a small icon/wash accent,
                    e.g. contact/page.tsx) — white text on that neon green
                    measures 1.98:1, well under WCAG AA's 4.5:1 floor for
                    normal-size text. #188640/#136c34 keep the same hue and
                    still read unmistakably as "WhatsApp green" at 4.6:1 and
                    6.5:1. Caught by an axe-core scan of this exact panel,
                    not a hunch — see PR notes for the numbers. */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-[#188640] py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-[#136c34] sm:py-4 sm:text-base"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {tChat("whatsappLabel")}
                </a>
              </motion.div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}