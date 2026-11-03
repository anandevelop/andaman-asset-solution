/**
 * tests/probe-paths.test.ts
 */

import { describe, expect, it } from "vitest";
import { isProbePath } from "@/lib/probe-paths";

describe("isProbePath", () => {
  it.each([
    "/.env",
    "/.env.production",
    "/.git/config",
    "/en/.git/HEAD",
    "/.ssh/id_rsa",
    "/id_rsa",
    "/backup/id_ed25519.pub",
    "/Dockerfile",
    "/docker-compose.prod.yml",
    "/proc/self/environ",
    "/etc/passwd",
    "/wp-login.php",
    "/wp-admin/setup-config.php",
    "/en/xmlrpc.php",
    "/phpmyadmin/",
    "/config.json",
    "/dump.sql",
    "/%2e%2e/%2e%2e/etc/passwd",
    "/.DS_Store",
  ])("%s is a probe", (path) => {
    expect(isProbePath(path)).toBe(true);
  });

  it.each([
    "/",
    "/en",
    "/th/projects/victory",
    "/en/news/phuket-market-2026",
    "/.well-known/security.txt",
    "/og-image.jpg",
    "/e-brochure/residence-prime",
    "/en/projects/env-friendly-villa",
    "/en/news/how-to-configure-your-home",
  ])("%s is a real path", (path) => {
    expect(isProbePath(path)).toBe(false);
  });
});
