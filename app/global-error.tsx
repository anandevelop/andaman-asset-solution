"use client";

/**
 * app/global-error.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The last boundary. Catches failures in the root layout itself — the ones
 * app/[locale]/error.tsx cannot, because by then the layout that renders it
 * has already thrown.
 *
 * Three constraints follow from that:
 *
 *  • It must supply its own <html> and <body>. The layout that normally
 *    provides them is the thing that failed.
 *  • It cannot use next-intl. The i18n provider lives in that same layout,
 *    so useTranslations() would throw inside the boundary. Copy is inlined
 *    per locale and the locale is read off the URL.
 *  • It cannot rely on the stylesheet having loaded. Styles are inline.
 *
 * This should essentially never render. When it does, something is badly
 * wrong, so it reports to Sentry before painting anything.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

const COPY = {
  th: {
    lang: "th",
    title: "ระบบขัดข้อง",
    body: "ขออภัย เกิดข้อผิดพลาดที่เราไม่ได้คาดไว้ ทีมงานได้รับแจ้งแล้ว กรุณาลองใหม่อีกครั้ง",
    retry: "ลองใหม่อีกครั้ง",
    home: "กลับหน้าแรก",
    reference: "รหัสอ้างอิง",
  },
  en: {
    lang: "en",
    title: "Something went badly wrong",
    body: "An unexpected error stopped this page from loading. Our team has been notified. Please try again.",
    retry: "Try again",
    home: "Back to home",
    reference: "Reference",
  },
} as const;

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // captureException, not captureMessage: the stack trace is the whole
    // point of an error this severe.
    Sentry.captureException(error);
    console.error("[global error]", error);
  }, [error]);

  const locale =
    typeof window !== "undefined" && window.location.pathname.startsWith("/en")
      ? "en"
      : "th";
  const t = COPY[locale];

  return (
    <html lang={t.lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          backgroundColor: "#083551",
          color: "#ffffff",
          // No webfont: next/font is configured in the layout that failed.
          fontFamily:
            "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          {/* Inline SVG rather than an icon component — the bundle that
              would provide one may be what failed to load. */}
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e8b384"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: "0 auto" }}
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>

          <h1
            style={{
              margin: "1.75rem 0 0",
              fontSize: "1.75rem",
              fontWeight: 300,
              letterSpacing: "-0.01em",
            }}
          >
            {t.title}
          </h1>

          {/* The horizon divider, hand-rolled. */}
          <div
            style={{
              width: "6rem",
              height: "1px",
              margin: "1.5rem auto",
              background:
                "linear-gradient(90deg, transparent 0%, #e8b384 50%, transparent 100%)",
            }}
          />

          <p
            style={{
              margin: 0,
              fontSize: "0.9rem",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {t.body}
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: "2.25rem",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                appearance: "none",
                border: "none",
                cursor: "pointer",
                padding: "0.875rem 1.75rem",
                fontSize: "0.8rem",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRadius: "2px",
                backgroundColor: "#e8b384",
                color: "#083551",
                fontFamily: "inherit",
              }}
            >
              {t.retry}
            </button>

            <a
              href={`/${locale}`}
              style={{
                padding: "0.875rem 1.75rem",
                fontSize: "0.8rem",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRadius: "2px",
                border: "1px solid rgba(255,255,255,0.3)",
                color: "#ffffff",
                textDecoration: "none",
              }}
            >
              {t.home}
            </a>
          </div>

          {/* The digest is what makes a support conversation actionable —
              it matches this render to the Sentry issue. */}
          {error.digest && (
            <p
              style={{
                marginTop: "2rem",
                fontSize: "0.7rem",
                color: "rgba(255,255,255,0.35)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {t.reference}: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
