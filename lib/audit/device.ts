/**
 * lib/audit/device.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Chrome · Mac" from a User-Agent header, for the activity page.
 *
 * Deliberately coarse: a browser family and a platform, which is what
 * answers "was that me on my phone?". Versions are noise in a table and
 * the header lies about them anyway. Order matters — Edge and Opera say
 * "Chrome", Chrome says "Safari", and every iPhone says "Mac OS X".
 * ─────────────────────────────────────────────────────────────────────────
 */

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Line\//, "LINE"],
  [/FBAN|FBAV/, "Facebook"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const PLATFORMS: [RegExp, string][] = [
  [/iPhone|iPod/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function deviceLabel(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? "").trim();
  if (!ua) return null;

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const platform = PLATFORMS.find(([pattern]) => pattern.test(ua))?.[1];
  const parts = [browser, platform].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
