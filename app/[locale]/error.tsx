"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, Database } from "lucide-react";

/**
 * Route-level error boundary for everything under /[locale].
 *
 * Note it deliberately does NOT use next-intl: if the failure happened while
 * the layout was loading messages, useTranslations() would throw inside the
 * boundary itself. Copy is inlined per locale instead.
 */

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

const COPY = {
  th: {
    title: "ขออภัย เกิดข้อผิดพลาด",
    body: "เราไม่สามารถแสดงหน้านี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หรือติดต่อเราโดยตรง",
    dbTitle: "เชื่อมต่อฐานข้อมูลไม่ได้",
    dbBody: "ข้อมูลโครงการยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกสักครู่",
    retry: "ลองใหม่อีกครั้ง",
  },
  en: {
    title: "Something went wrong",
    body: "We couldn't load this page right now. Please try again, or contact us directly.",
    dbTitle: "Database unavailable",
    dbBody: "Project data isn't reachable at the moment. Please try again shortly.",
    retry: "Try again",
  },
} as const;

export default function LocaleError({ error, reset }: Props) {
  const isDbError =
    error.name === "DatabaseUnavailableError" ||
    error.message.includes("DATABASE_UNAVAILABLE") ||
    error.message.includes("Can't reach database server");

  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  // The locale segment isn't available inside an error boundary's props,
  // so read it off the URL.
  const locale =
    typeof window !== "undefined" && window.location.pathname.startsWith("/th")
      ? "th"
      : "en";
  const t = COPY[locale];

  return (
    <section className="container-luxe flex min-h-[70vh] max-w-2xl flex-col items-center justify-center py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent-700">
        {isDbError ? <Database size={22} /> : <AlertTriangle size={22} />}
      </span>

      <h1 className="mt-6 text-3xl font-light text-primary sm:text-4xl">
        {isDbError ? t.dbTitle : t.title}
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/70">
        {isDbError ? t.dbBody : t.body}
      </p>

      <button type="button" onClick={reset} className="btn-primary mt-8 inline-flex">
        <RotateCw size={15} />
        {t.retry}
      </button>

      {/* Developer-only guidance — stripped from production bundles. */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-12 w-full rounded-sm border border-amber-500/30 bg-amber-500/[0.06] p-6 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
            Development only
          </p>

          {isDbError ? (
            <>
              <p className="mt-3 text-sm text-ink/70">
                Postgres isn&apos;t reachable on the host in{" "}
                <code className="text-ink">DATABASE_URL</code>. Start it and load
                the seed data:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-sm bg-primary-900/[0.06] p-4 text-xs leading-relaxed text-ink/80">
                {`npm run db:up
npm run prisma:migrate
npm run prisma:seed`}
              </pre>
              <p className="mt-3 text-sm text-ink/70">
                Still failing? Run{" "}
                <code className="text-ink">npm run db:check</code> for a
                point-by-point diagnosis.
              </p>
            </>
          ) : (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-sm bg-primary-900/[0.06] p-4 text-xs leading-relaxed text-ink/80">
              {error.message}
            </pre>
          )}

          {error.digest && (
            <p className="mt-3 text-xs text-ink/65">digest: {error.digest}</p>
          )}
        </div>
      )}
    </section>
  );
}
