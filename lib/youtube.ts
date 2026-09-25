/**
 * lib/youtube.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turns an admin-pasted YouTube link (ProjectProgress.videoUrl, filled in
 * at /admin/projects/[id]/progress — drone footage or a site walkthrough for
 * that month) into a URL an <iframe> can actually render, on the project
 * detail page's Construction Progress section
 * (components/ProgressGallery.tsx).
 *
 * Unlike lib/google-maps.ts's resolveMapEmbedSrc, this needs no network
 * round trip: every shape YouTube hands out — a shared "youtu.be/<id>"
 * link, the full "watch?v=<id>" page, a Shorts or Live link, an
 * already-embedded URL — carries the video id directly in its path or
 * query string, so a plain synchronous parse is enough. Safe to call from
 * either a server or a client component; used from lib/projects.ts's
 * getProjectProgress() so ProgressGallery receives an embed src that's
 * already resolved.
 * ─────────────────────────────────────────────────────────────────────────
 */

const YOUTUBE_COM_HOSTS = /^(www\.|m\.)?youtube(-nocookie)?\.com$/i;

/** YouTube's own id shape — 11 URL-safe base64 characters. Anything else
 *  found where an id is expected is treated as "not a real video" rather
 *  than passed through to a broken embed. */
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/** youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>, /live/<id> — the
 *  id is either the `v` query param or the path's second segment. */
function idFromYouTubeCom(url: URL): string | null {
  const fromQuery = url.searchParams.get("v");
  if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;

  const segments = url.pathname.split("/").filter(Boolean);
  const hasKnownPrefix = ["embed", "shorts", "live"].includes(segments[0] ?? "");
  const candidate = hasKnownPrefix ? segments[1] : null;
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/**
 * Returns a `https://www.youtube-nocookie.com/embed/<id>` URL for an
 * <iframe> (the privacy-enhanced domain — no tracking cookie until the
 * visitor actually presses play), or null when `videoUrl` is empty, isn't
 * a recognizable YouTube link, or no id could be pulled out of it — null
 * means "don't render a player," never a broken embed.
 */
export function getYouTubeEmbedUrl(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null;

  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();

  let id: string | null = null;
  if (host === "youtu.be") {
    const candidate = url.pathname.slice(1).split("/")[0];
    id = candidate && VIDEO_ID.test(candidate) ? candidate : null;
  } else if (YOUTUBE_COM_HOSTS.test(host)) {
    id = idFromYouTubeCom(url);
  }

  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
