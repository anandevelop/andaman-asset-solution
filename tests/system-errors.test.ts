import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const upsert = vi.fn();
const count = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { systemError: { upsert: (a: unknown) => upsert(a), count: (a: unknown) => count(a), update: (a: unknown) => update(a) } },
}));
vi.mock("@/lib/audit/context", () => ({ withoutAudit: <T>(fn: () => T) => fn() }));

const pushLineAlert = vi.fn();
vi.mock("@/lib/line", () => ({ pushLineAlert: (a: unknown) => pushLineAlert(a) }));

const isEnabled = vi.fn();
const notifyAdmins = vi.fn();
vi.mock("@/lib/notifications", () => ({
  isEnabled: (...a: unknown[]) => isEnabled(...a),
  notifyAdmins: (a: unknown) => notifyAdmins(a),
}));

import { recordSystemError } from "@/lib/system-errors";

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ count: 1, lastAlertAt: null });
  count.mockResolvedValue(0);
  update.mockResolvedValue({});
  isEnabled.mockResolvedValue(true);
  notifyAdmins.mockResolvedValue(1);
  pushLineAlert.mockResolvedValue(undefined);
});

describe("recordSystemError", () => {
  it("writes a new failure and tells the team on LINE and in the bell", async () => {
    await recordSystemError(new TypeError("first failure"), { kind: "server", path: "/th/admin/leads?x=1" });

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].create).toMatchObject({ kind: "server", name: "TypeError", place: "/admin/leads" });
    expect(update).toHaveBeenCalledOnce();
    expect(pushLineAlert).toHaveBeenCalledOnce();
    expect(pushLineAlert.mock.calls[0][0]).toMatchObject({ kind: "error" });
    expect(pushLineAlert.mock.calls[0][0].url).toMatch(/\/th\/admin\/settings\/system$/);
    expect(notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ event: "systemError" }));
  });

  it("counts a repeat without another message", async () => {
    upsert.mockResolvedValue({ count: 7, lastAlertAt: new Date() });
    await recordSystemError(new Error("repeat failure"), { kind: "server", path: "/api/leads" });

    expect(upsert).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(pushLineAlert).not.toHaveBeenCalled();
  });

  it("stays quiet once the hour's messages are spent", async () => {
    count.mockResolvedValue(5);
    await recordSystemError(new Error("sixth failure"), { kind: "server", path: "/a" });
    expect(pushLineAlert).not.toHaveBeenCalled();
  });

  it("records nothing for a redirect or a missing page", async () => {
    await recordSystemError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/th" }), { kind: "server" });
    await recordSystemError(new Error("NEXT_NOT_FOUND"), { kind: "server" });
    expect(upsert).not.toHaveBeenCalled();
    expect(pushLineAlert).not.toHaveBeenCalled();
  });

  it("still alerts when the database is what broke, once", async () => {
    upsert.mockRejectedValue(new Error("Can't reach database server"));
    isEnabled.mockRejectedValue(new Error("offline"));

    await recordSystemError(new Error("Can't reach database server at db:5432"), { kind: "server", path: "/projects" });
    await recordSystemError(new Error("Can't reach database server at db:5432"), { kind: "server", path: "/projects" });

    expect(pushLineAlert).toHaveBeenCalledOnce();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("respects the LINE switch", async () => {
    isEnabled.mockImplementation(async (_event: string, channel: string) => channel !== "line");
    await recordSystemError(new Error("switched off failure"), { kind: "client", path: "/contact" });
    expect(pushLineAlert).not.toHaveBeenCalled();
    expect(notifyAdmins).toHaveBeenCalledOnce();
  });

  it("never throws", async () => {
    pushLineAlert.mockRejectedValue(new Error("LINE is down"));
    await expect(recordSystemError(new Error("unlucky failure"), { kind: "server", path: "/x" })).resolves.toBeUndefined();
  });
});
