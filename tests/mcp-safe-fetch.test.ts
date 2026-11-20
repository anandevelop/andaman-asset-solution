/**
 * tests/mcp-safe-fetch.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The address checks in front of every download an AI client asks for.
 * A miss here is the server fetching its own network for a stranger.
 * ─────────────────────────────────────────────────────────────────────────
 */

import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPinned, isPublicAddress, parsePublicHttpsUrl } from "@/lib/mcp/safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1",
    "not-an-ip", "",
  ])("%s is refused", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("%s is allowed", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("parsePublicHttpsUrl", () => {
  it.each([
    ["http://example.com/a.jpg", "URL_NOT_HTTPS"],
    ["ftp://example.com/a.jpg", "URL_NOT_HTTPS"],
    ["file:///etc/passwd", "URL_NOT_HTTPS"],
    ["https://user:pass@example.com/a.jpg", "URL_HAS_CREDENTIALS"],
    ["https://example.com:8443/a.jpg", "URL_PORT_NOT_ALLOWED"],
    ["https://localhost/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["https://db.internal/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["https://printer.local/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["https://127.0.0.1/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["https://169.254.169.254/latest/meta-data/", "URL_HOST_NOT_ALLOWED"],
    ["https://[::1]/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["https://[fd00::1]/a.jpg", "URL_HOST_NOT_ALLOWED"],
    // Other spellings of 127.0.0.1 — the URL parser normalises them first.
    ["https://2130706433/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["https://0x7f.0.0.1/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["https://127.1/a.jpg", "URL_HOST_NOT_ALLOWED"],
    ["not a url", "URL_INVALID"],
  ])("%s → %s", (url, code) => {
    expect(() => parsePublicHttpsUrl(url)).toThrow(code);
  });

  it("accepts an ordinary public https address", () => {
    expect(parsePublicHttpsUrl("https://images.example.com/villa.jpg?w=1200").hostname).toBe("images.example.com");
    expect(parsePublicHttpsUrl("https://example.com:443/a.png").port).toBe("");
  });
});

/*
  The connection itself, against a local HTTPS server. The server is on
  127.0.0.1 — an address downloadPublicFile would refuse — so this calls
  the pinned GET directly, which is exactly the part that cannot be proven
  by looking at addresses: that the socket goes to the address it was given.
*/
describe("getPinned", () => {
  let server: https.Server;
  let port = 0;

  beforeAll(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcp-tls-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/k.pem`, "-out", `${dir}/c.pem`, "-days", "1", "-subj", "/CN=img.test"], { stdio: "ignore" });
    server = https.createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { Location: "https://169.254.169.254/latest/" }).end();
      } else if (request.url === "/big") {
        response.writeHead(200, { "Content-Type": "image/png" }).end(Buffer.alloc(64 * 1024, 1));
      } else {
        response.writeHead(200, { "Content-Type": "image/png; charset=binary" }).end("image-bytes");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const get = (pathname: string, maxBytes = 1024 * 1024) =>
    // The name does not resolve anywhere; only the pinned address is used.
    getPinned(new URL(`https://img.test:${port}${pathname}`), { address: "127.0.0.1", family: 4 }, maxBytes, 5_000, { rejectUnauthorized: false });

  it("connects to the address it was given, not to whatever the name resolves to", async () => {
    const answer = await get("/a.png");
    expect(answer).toMatchObject({ status: 200, contentType: "image/png" });
    expect(answer.body.toString()).toBe("image-bytes");
  });

  it("reports a redirect instead of following it, so the next address can be vetted", async () => {
    const answer = await get("/redirect");
    expect(answer).toMatchObject({ status: 302, location: "https://169.254.169.254/latest/" });
    expect(() => parsePublicHttpsUrl(answer.location!)).toThrow("URL_HOST_NOT_ALLOWED");
  });

  it("stops a body that outgrows the limit", async () => {
    await expect(get("/big", 1024)).rejects.toThrow("FILE_TOO_LARGE");
  });
});
