"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Menu, X, Phone, Globe, Check, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { siteConfig } from "@/config/site";
import { locales, type Locale } from "@/i18n";

type NavProject = { slug: string; name: string };

type Props = {
  /** Live values from lib/settings.ts, passed down by (site)/layout.tsx. */
  phone: string;
  phoneDisplay: string;
  /** Published projects, curated order — for the "Projects" dropdown.
   *  Fetched server-side by (site)/layout.tsx (getPublishedProjects) since
   *  this component is a client component. */
  projects: NavProject[];
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

export default function Navbar({ phone, phoneDisplay, projects }: Props) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [mobileProjectsOpen, setMobileProjectsOpen] = useState(false);

  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const langButtonRef = useRef<HTMLButtonElement | null>(null);
  /** One entry per locale option, in `locales` order — used for arrow-key roving focus. */
  const langOptionRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const projectsMenuRef = useRef<HTMLDivElement | null>(null);
  const projectsButtonRef = useRef<HTMLButtonElement | null>(null);

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
      if (toggleRef.current) nodes.push(toggleRef.current);
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
    setProjectsOpen(false);
    setMobileProjectsOpen(false);
  }, [pathname]);

  // Click-outside + Escape for the "Projects" dropdown — same shape as the
  // language dropdown's effect below, minus arrow-key roving: this one is
  // a plain link list, not a listbox with a "current selection" concept.
  useEffect(() => {
    if (!projectsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        projectsMenuRef.current?.contains(target) ||
        projectsButtonRef.current?.contains(target)
      ) {
        return;
      }
      setProjectsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setProjectsOpen(false);
      projectsButtonRef.current?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [projectsOpen]);

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

  const pathnameWithoutLocale = pathname.replace(
    new RegExp(`^/${locale}(/|$)`),
    (_, slash) => slash ?? "/",
  );
  /** Same page, different locale prefix — used by every item in the dropdown. */
  const localizedPath = (target: Locale) =>
    `/${target}${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`;

  const isActive = (href: string) => {
    const target = `/${locale}${href === "/" ? "" : href}`;
    if (href === "/") return pathname === `/${locale}` || pathname === target;
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  /** ปรับขนาดฟอนต์ให้ Responsive: จอเล็กสุดใช้ text-lg, จอกลาง text-xl, จอใหญ่ text-2xl */
  const linkClass = (active: boolean, mobile = false) =>
    [
      mobile
        ? "block py-2.5 sm:py-3 text-lg sm:text-xl md:text-2xl font-light tracking-wide transition-colors"
        : "relative text-sm transition-colors",
      active
        ? "text-primary font-medium"
        : "text-ink/60 hover:text-primary",
    ].join(" ");

  return (
    <>
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
      <header
        className={`${open ? "fixed" : "sticky"} inset-x-0 top-0 z-50 border-b border-ink/5 bg-surface/95 backdrop-blur-md transition-all`}
      >
        <div className="container-luxe flex h-16 items-center justify-between sm:h-18">
          
          {/* Logo Section */}
          <Link
            href={`/${locale}`}
            className="flex flex-shrink-0 items-center relative z-50"
            aria-label="Andaman Asset Solution — Home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Andaman Asset Solution Co., Ltd."
              width={180}
              height={36}
              className="h-6 w-auto sm:h-7"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav aria-label={t("mainMenu")} className="hidden items-center gap-8 lg:flex xl:gap-10">
            {siteConfig.nav.main.map((item) => {
              const active = isActive(item.href);

              // "Projects" gets a dropdown listing each published project —
              // everything else stays a plain link. Falls back to the plain
              // link when there are zero published projects, same
              // graceful-empty philosophy as SalesTeamSection.
              if (item.key === "projects" && projects.length > 0) {
                return (
                  <div key={item.key} className="relative">
                    <button
                      ref={projectsButtonRef}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={projectsOpen}
                      onClick={() => setProjectsOpen((v) => !v)}
                      className={`flex items-center gap-1 ${linkClass(active)}`}
                    >
                      {t(item.key as any)}
                      <ChevronDown
                        size={13}
                        strokeWidth={2}
                        aria-hidden
                        className={`shrink-0 transition-transform duration-200 ${projectsOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    <AnimatePresence>
                      {projectsOpen && (
                        <motion.div
                          ref={projectsMenuRef}
                          role="menu"
                          aria-label={t(item.key as any)}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 top-full z-50 mt-2 min-w-[16rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-ink/10 bg-surface py-1 shadow-card"
                        >
                          {projects.map((project) => (
                            <Link
                              key={project.slug}
                              href={`/${locale}/projects/${project.slug}`}
                              role="menuitem"
                              onClick={() => setProjectsOpen(false)}
                              className="block whitespace-nowrap px-4 py-2.5 text-sm text-ink/70 transition-colors hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/5 focus-visible:outline-none"
                            >
                              {project.name}
                            </Link>
                          ))}

                          <div className="my-1 border-t border-ink/10" />

                          <Link
                            href={`/${locale}${item.href}`}
                            role="menuitem"
                            onClick={() => setProjectsOpen(false)}
                            className="block whitespace-nowrap px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none"
                          >
                            {t("viewAllProjects")}
                          </Link>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              return (
                <Link
                  key={item.key}
                  href={`/${locale}${item.href}`}
                  aria-current={active ? "page" : undefined}
                  className={linkClass(active)}
                >
                  {t(item.key as any)}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions Section */}
          <div className="flex flex-shrink-0 items-center gap-4 sm:gap-5 relative z-50">
            
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
                className="flex items-center gap-1.5 text-[15px] font-medium text-ink/70 transition-colors hover:text-primary sm:text-sm"
              >
                <Globe size={18} strokeWidth={1.5} className="sm:h-4 sm:w-4" aria-hidden />
                <span>{LOCALE_LABELS[locale as Locale]}</span>
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
                    className="absolute right-0 top-full z-50 mt-2 min-w-[12rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-ink/10 bg-surface py-1 shadow-card"
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
                          "flex min-h-11 items-center justify-between gap-3 whitespace-nowrap px-4 py-2.5 text-sm transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none",
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
              className="hidden items-center gap-2 rounded-full bg-[#111827] px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#1f2937] hover:shadow-md lg:flex"
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
              className="flex h-10 w-10 items-center justify-end text-ink/80 transition-colors hover:text-primary lg:hidden"
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
            className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-surface pt-16 sm:pt-18 lg:hidden"
          >
            {/* ปรับ Padding ให้พอดีกับจอเล็ก */}
            <div className="container-luxe flex min-h-full flex-col px-6 pb-8 pt-6 sm:pb-12 sm:pt-8">
              
              {/* รายการเมนู ปรับระยะห่าง gap-4 ถึง gap-6 ตามขนาดหน้าจอ */}
              <div className="flex flex-1 flex-col justify-center gap-4 sm:gap-6">
                {siteConfig.nav.main.map((item, i) => {
                  const active = isActive(item.href);

                  const motionProps = {
                    initial: { opacity: 0, y: 30 },
                    animate: { opacity: 1, y: 0 },
                    exit: { opacity: 0, y: 10 },
                    transition: {
                      delay: i * 0.06 + 0.1, // ปรับ delay เล็กน้อยให้ลื่นขึ้น
                      duration: 0.4,
                      ease: [0.25, 0.1, 0.25, 1] as const,
                    },
                  };

                  // "Projects" expands in place instead of navigating
                  // straight away — same reasoning as the desktop dropdown,
                  // just an accordion instead of a popover since this menu
                  // is already full-screen.
                  if (item.key === "projects" && projects.length > 0) {
                    return (
                      <motion.div key={item.key} {...motionProps}>
                        <button
                          type="button"
                          aria-expanded={mobileProjectsOpen}
                          onClick={() => setMobileProjectsOpen((v) => !v)}
                          className={`flex w-full items-center justify-between gap-3 ${linkClass(active, true)}`}
                        >
                          {t(item.key as any)}
                          <ChevronDown
                            size={20}
                            strokeWidth={1.5}
                            aria-hidden
                            className={`shrink-0 transition-transform duration-200 ${mobileProjectsOpen ? "rotate-180" : ""}`}
                          />
                        </button>

                        <AnimatePresence>
                          {mobileProjectsOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden pl-4"
                            >
                              {projects.map((project) => (
                                <Link
                                  key={project.slug}
                                  href={`/${locale}/projects/${project.slug}`}
                                  onClick={() => setOpen(false)}
                                  className="block py-2 text-base font-light text-ink/60 transition-colors hover:text-primary sm:text-lg"
                                >
                                  {project.name}
                                </Link>
                              ))}
                              <Link
                                href={`/${locale}${item.href}`}
                                onClick={() => setOpen(false)}
                                className="block py-2 text-base font-medium text-primary sm:text-lg"
                              >
                                {t("viewAllProjects")}
                              </Link>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div key={item.key} {...motionProps}>
                      <Link
                        href={`/${locale}${item.href}`}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={linkClass(active, true)}
                      >
                        {t(item.key as any)}
                      </Link>
                    </motion.div>
                  );
                })}
              </div>

              {/* ปุ่มโทรศัพท์ล่างสุด ปรับระยะห่างให้พอดีกับจอเล็ก */}
              <motion.div 
                className="mt-8 flex flex-col pt-6 border-t border-ink/5 sm:mt-12 sm:pt-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <a 
                  href={`tel:${phone}`} 
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-[#111827] py-3.5 sm:py-4 text-[15px] sm:text-[16px] font-medium text-white shadow-sm transition-all active:bg-[#1f2937]"
                > 
                  <Phone size={18} strokeWidth={1.5} className="sm:h-5 sm:w-5" aria-hidden /> 
                  {phoneDisplay}
                </a>
              </motion.div>

            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}