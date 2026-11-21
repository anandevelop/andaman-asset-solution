/**
 * lib/mcp/safe-fetch.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Downloads a file from an address somebody else chose — here, an image URL
 * handed over by an AI client — without letting that address point back
 * into our own network.
 *
 * The danger is the server fetching on a stranger's behalf: a URL such as
 * http://169.254.169.254/ (the cloud's credentials service), localhost, or
 * a database on the private network would be fetched from *inside*, where
 * those answer. So:
 *
 *   - https only, default port only, no user:password in the URL.
 *   - The host is resolved first and every address it has must be public.
 *   - The connection is then made to that vetted address and no other: the
 *     same lookup result is handed to the socket, so a DNS answer that
 *     changes between the check and the connection gains nothing.
 *   - Redirects are followed by hand, at most three, each one vetted again.
 *   - The body is cut off at the size limit while it streams; nothing is
 *     trusted about Content-Length.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import https from "node:https";
import net from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

export class UnsafeUrlError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
];

/** True for an address that is safe to connect to from inside our network. */
export function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const value = ipv4ToInt(address);
    return !V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    // IPv4 carried inside IPv6 (::ffff:10.0.0.1) is judged as the IPv4 it is.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]);
    if (lower === "::" || lower === "::1") return false;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return false; // multicast
    if (lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

/** Parses and checks the shape of a URL; does not resolve it. */
export function parsePublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL_INVALID");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("URL_NOT_HTTPS");
  if (url.username || url.password) throw new UnsafeUrlError("URL_HAS_CREDENTIALS");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("URL_PORT_NOT_ALLOWED");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("URL_HOST_NOT_ALLOWED");
  }
  if (net.isIP(host) && !isPublicAddress(host)) throw new UnsafeUrlError("URL_HOST_NOT_ALLOWED");
  return url;
}

export type Resolved = { address: string; family: 4 | 6 };

async function resolvePublic(hostname: string): Promise<Resolved> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return { address: host, family: net.isIPv4(host) ? 4 : 6 };
  let found: { address: string; family: number }[];
  try {
    found = await dnsLookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("URL_HOST_NOT_FOUND");
  }
  // Every address, not just the first: a name with one public and one
  // private record is not a name to trust.
  if (found.length === 0 || found.some((entry) => !isPublicAddress(entry.address))) {
    throw new UnsafeUrlError("URL_HOST_NOT_ALLOWED");
  }
  return { address: found[0].address, family: found[0].family === 6 ? 6 : 4 };
}

export type Downloaded = { body: Buffer; contentType: string; finalUrl: string };

type LookupCallback = (error: null, address: string | { address: string; family: number }[], family?: number) => void;

/**
 * One GET to `url`, connected to `target` and nowhere else. Exported for
 * tests/mcp-safe-fetch.test.ts, which points it at a local server; nothing
 * else should call it — downloadPublicFile is what vets the address.
 */
export function getPinned(
  url: URL,
  target: Resolved,
  maxBytes: number,
  timeoutMs: number,
  tls: { rejectUnauthorized?: boolean } = {},
  accept = "image/*",
): Promise<{ status: number; location: string | null; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        ...tls,
        // The vetted address, whatever DNS says by now. Node asks either for
        // one address or (when it races IPv4 and IPv6) for a list; answered
        // in the other shape, the connection fails with "Invalid IP address".
        lookup: (_host, options, callback) => {
          const done = callback as unknown as LookupCallback;
          if (typeof options === "object" && options && (options as { all?: boolean }).all) {
            done(null, [{ address: target.address, family: target.family }]);
          } else {
            done(null, target.address, target.family);
          }
        },
        headers: { "User-Agent": "AndamanAssetSolution/1.0", Accept: accept },
        timeout: timeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = typeof response.headers.location === "string" ? response.headers.location : null;
        const contentType = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, location, contentType, body: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy(new UnsafeUrlError("FILE_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, location, contentType, body: Buffer.concat(chunks) }));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new UnsafeUrlError("DOWNLOAD_TIMEOUT")));
    request.on("error", reject);
  });
}

export async function downloadPublicFile(
  raw: string,
  { maxBytes, timeoutMs = 20_000, maxRedirects = 3, accept = "image/*" }: { maxBytes: number; timeoutMs?: number; maxRedirects?: number; accept?: string },
): Promise<Downloaded> {
  let url = parsePublicHttpsUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = await resolvePublic(url.hostname);
    const answer = await getPinned(url, target, maxBytes, timeoutMs, {}, accept);
    if (answer.status >= 300 && answer.status < 400) {
      if (!answer.location) throw new UnsafeUrlError("DOWNLOAD_FAILED:redirect without a location");
      url = parsePublicHttpsUrl(new URL(answer.location, url).toString());
      continue;
    }
    if (answer.status !== 200) throw new UnsafeUrlError(`DOWNLOAD_FAILED:the server answered ${answer.status}`);
    return { body: answer.body, contentType: answer.contentType, finalUrl: url.toString() };
  }
  throw new UnsafeUrlError("DOWNLOAD_FAILED:too many redirects");
}
