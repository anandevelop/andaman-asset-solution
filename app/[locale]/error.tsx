"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, RotateCw, Database } from "lucide-react";
import { ROUTE_ERROR_COPY, localeFromPathname } from "@/lib/error-copy";

/**
 * Route-level error boundary for everything under /[locale].
 *
 * Note it deliberately does NOT use next-intl: if the failure happened while
 * the layout was loading messages, useTranslations() would throw inside the
 * boundary itself. Copy comes from lib/error-copy.ts, which imports nothing
 * — see its header for why that matters.
 */

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function LocaleError({ error, reset }: Props) {
  const isDbError =
    error.name === "DatabaseUnavailableError" ||
    error.message.includes("DATABASE_UNAVAILABLE") ||
    error.message.includes("Can't reach database server");

  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  /*
    The locale segment isn't available inside an error boundary's props, so
    it is read off the path.

    usePathname() rather than window.location: it returns the right value
    during the boundary's server render too, where a `typeof window` guard
    can only return the fallback and then disagree with the client — this
    used to serve a flash of English before hydration corrected it. Same
    reasoning as not-found.tsx, which has run this way in production.
  */
  const t = ROUTE_ERROR_COPY[localeFromPathname(usePathname())];

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
        <div className="mt-12 w-full rounded-xs border border-amber-500/30 bg-amber-500/6 p-6 text-left">
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
              <pre className="mt-3 overflow-x-auto rounded-xs bg-primary-900/6 p-4 text-xs leading-relaxed text-ink/80">
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
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xs bg-primary-900/6 p-4 text-xs leading-relaxed text-ink/80">
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
