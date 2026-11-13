/**
 * lib/report-client-error.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Tell the server an error boundary was shown (POST /api/client-error),
 * so it lands in the site's error log and on LINE — lib/system-errors.ts.
 *
 * An error carrying a `digest` was thrown on the server and has been
 * recorded there already, with its real message; the browser only holds a
 * redacted copy, so it is not sent again.
 *
 * Imports nothing, like lib/error-copy.ts: it runs inside boundaries that
 * exist because something else failed to load.
 * ─────────────────────────────────────────────────────────────────────────
 */

export function reportClientError(error: (Error & { digest?: string }) | null | undefined): void {
  try {
    if (!error || error.digest || typeof window === "undefined") return;

    const payload = JSON.stringify({
      name: String(error.name || "Error").slice(0, 120),
      message: String(error.message || "unknown error").slice(0, 600),
      path: window.location.pathname,
    });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/client-error", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
  } catch {
    // Reporting a failure must never be a second one.
  }
}
