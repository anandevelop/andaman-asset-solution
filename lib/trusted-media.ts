/**
 * lib/trusted-media.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which image URLs the server may fetch: our own media bucket, the legacy
 * host older uploads still live on, and this site's own paths. Nothing
 * else.
 *
 * WHY THIS EXISTS
 *
 * Two places fetch a URL an editor typed, server-side:
 * - the opengraph-image routes pass Project/NewsArticle/Event.ogImageUrl
 *   through to whoever asks;
 * - lib/floor-plan-images.ts downloads a floor's imageUrl and hands it to
 *   sharp.
 * Both accepted any URL. An EDITOR could point ogImageUrl at
 * http://169.254.169.254/metadata/v1/user-data, and anyone fetching the
 * project's public share image would read the droplet's metadata. Or they
 * could point it at an HTML page, served back from our own domain, where
 * it could act as a SUPER_ADMIN who opened it. The floor plan was a blind
 * version of the same, feeding attacker-chosen SVG to librsvg.
 *
 * So the check runs twice: when the URL is saved (lib/validations.ts), so
 * the editor hears why, and before every fetch, for rows saved before this
 * existed.
 *
 * Pure (no `server-only`): the validators import it too.
 * NEXT_PUBLIC_MEDIA_DOMAIN is read literally so it is inlined at build.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Where uploads lived before DigitalOcean Spaces. Kept in step with
 *  next.config.js `legacyMediaHosts` and lib/media.ts LEGACY_MEDIA_HOSTS. */
const LEGACY_HOSTS = ["nwgjexifvlryisfxhhxa.supabase.co", "nwgjexifvlryisfxhhxa.storage.supabase.co"];

function mediaHosts(): string[] {
  const domain = (process.env.NEXT_PUBLIC_MEDIA_DOMAIN ?? "")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  const hosts = [...LEGACY_HOSTS];
  if (domain) hosts.push(domain, domain.replace(".cdn.digitaloceanspaces.com", ".digitaloceanspaces.com"));
  return hosts;
}

/**
 * The URL to fetch for `value`, or null when it is not ours. A site path
 * ("/floor-plans/…") resolves against `origin`, the site's own address.
 */
export function trustedImageUrl(value: string, origin: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    try {
      const url = new URL(trimmed, origin);
      return url.origin === new URL(origin).origin ? url : null;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return mediaHosts().includes(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

/** For validators: empty is allowed (the field is optional), anything else
 *  must be ours. */
export function isTrustedImageValue(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  return trustedImageUrl(value, "https://placeholder.invalid") !== null;
}

export const TRUSTED_IMAGE_MESSAGE = "Upload the image here rather than linking to another site";

/** Image types worth passing on. Not SVG: served from our origin it can
 *  carry script. */
export const PASSTHROUGH_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
