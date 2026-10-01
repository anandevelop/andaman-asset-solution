/**
 * tests/admin/copilot.test.ts — the Copilot shell's flag and prompts
 * (lib/admin/copilot.ts). Off unless asked for, and every screen it can
 * be opened on has suggestions that resolve to real messages.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPILOT_SUGGESTIONS, copilotContextFor, isCopilotEnabled } from "@/lib/admin/copilot";

afterEach(() => vi.unstubAllEnvs());

describe("the flag", () => {
  it("is off by default and for anything but 1", () => {
    vi.stubEnv("ADMIN_COPILOT", "");
    expect(isCopilotEnabled()).toBe(false);
    vi.stubEnv("ADMIN_COPILOT", "true");
    expect(isCopilotEnabled()).toBe(false);
  });

  it("is on for 1", () => {
    vi.stubEnv("ADMIN_COPILOT", "1");
    expect(isCopilotEnabled()).toBe(true);
  });

  it("decides whether the layout renders the panel at all", () => {
    const layout = readFileSync(join(process.cwd(), "app", "[locale]", "admin", "layout.tsx"), "utf8");
    expect(layout).toContain("isCopilotEnabled()");
    expect(layout).toMatch(/\{copilot && \(/);
  });
});

describe("the suggestions", () => {
  it("fall back to the default set off the known screens", () => {
    expect(copilotContextFor("leads")).toBe("leads");
    expect(copilotContextFor("media")).toBe("default");
    expect(copilotContextFor(null)).toBe("default");
  });

  it("all exist in every locale", () => {
    for (const locale of ["th", "en", "zh", "ru"]) {
      const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"));
      for (const [context, keys] of Object.entries(COPILOT_SUGGESTIONS)) {
        for (const key of keys) {
          expect(messages.admin.copilot.suggest[context]?.[key], `${locale} ${context}.${key}`).toBeTruthy();
        }
      }
    }
  });
});
