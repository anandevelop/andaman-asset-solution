/**
 * app/[locale]/not-found.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * 404 for everything under /[locale].
 *
 * Like error.tsx, this deliberately avoids next-intl. notFound() can be
 * thrown from generateMetadata before the i18n request config has resolved,
 * and useTranslations() would then throw inside the boundary itself,
 * turning a 404 into a 500. Copy is inlined per locale instead.
 *
 * A dead end is a bad 404. The links out are the point — most people who
 * land here followed a stale URL to a project or article that moved.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { headers } from "next/headers";
import { Building2, Compass, Home, Newspaper } from "lucide-react";
import { defaultLocale, locales } from "@/i18n";

const COPY = {
  th: {
    code: "404",
    title: "ไม่พบหน้าที่ค้นหา",
    body: "หน้านี้อาจถูกย้าย เปลี่ยนชื่อ หรือไม่มีอยู่แล้ว ลองเริ่มจากลิงก์ด้านล่างดูครับ",
    home: "หน้าแรก",
    projects: "โครงการทั้งหมด",
    news: "ข่าวสาร",
    contact: "ติดต่อทีมงาน",
  },
  en: {
    code: "404",
    title: "We couldn't find that page",
    body: "It may have moved, been renamed, or never existed. One of these should get you back on track.",
    home: "Home",
    projects: "All projects",
    news: "News",
    contact: "Talk to our team",
  },
} as const;

/**
 * The locale segment is not passed to a not-found boundary, so it is read
 * off the request path. headers() makes this route dynamic, which is
 * correct — a 404 should not be statically cached under one locale.
 */
function resolveLocale(): keyof typeof COPY {
  const path =
    headers().get("x-invoke-path") ??
    headers().get("x-matched-path") ??
    headers().get("referer") ??
    "";

  const match = locales.find((locale) => path.includes(`/${locale}`));
  return (match ?? defaultLocale) as keyof typeof COPY;
}

export default function LocaleNotFound() {
  const locale = resolveLocale();
  const t = COPY[locale];

  const links = [
    { href: `/${locale}`, label: t.home, icon: Home },
    { href: `/${locale}/projects`, label: t.projects, icon: Building2 },
    { href: `/${locale}/news`, label: t.news, icon: Newspaper },
  ];

  return (
    <section className="container-luxe flex min-h-[80vh] max-w-3xl flex-col items-center justify-center py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent-700">
        <Compass size={22} aria-hidden />
      </span>

      <p className="mt-8 font-sans text-6xl font-light tracking-tight text-primary/20 sm:text-7xl">
        {t.code}
      </p>

      <h1 className="mt-2 text-3xl font-light text-primary sm:text-4xl">{t.title}</h1>

      <div className="horizon-divider my-7" />

      <p className="max-w-md text-sm leading-relaxed text-ink/70">{t.body}</p>

      <nav className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="btn-outline">
            <Icon size={15} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
