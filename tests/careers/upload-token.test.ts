import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/s3", () => ({}));

import { cleanFileName, issueUploadToken, verifyUploadToken } from "@/lib/careers/files";

const claim = { key: "careers/files/abc.pdf", name: "cv.pdf", contentType: "application/pdf", size: 1234 };
const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-upload-tokens";
});

describe("upload tokens", () => {
  it("round-trips what was signed", () => {
    const now = Date.now();
    expect(verifyUploadToken(issueUploadToken(claim, now), now)).toMatchObject(claim);
  });

  it("refuses a token whose contents were changed", () => {
    const token = issueUploadToken(claim);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), key: "careers/files/other.pdf" }),
    ).toString("base64url");
    expect(verifyUploadToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyUploadToken(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
  });

  it("refuses a token after it expires", () => {
    const now = Date.now();
    const token = issueUploadToken(claim, now);
    expect(verifyUploadToken(token, now + HOUR)).not.toBeNull();
    expect(verifyUploadToken(token, now + 3 * HOUR)).toBeNull();
  });

  it("refuses a token signed with another secret", () => {
    const token = issueUploadToken(claim);
    process.env.NEXTAUTH_SECRET = "a-different-secret";
    expect(verifyUploadToken(token)).toBeNull();
    process.env.NEXTAUTH_SECRET = "test-secret-for-upload-tokens";
  });

  it("refuses anything that is not a token", () => {
    for (const junk of ["", "abc", "a.b.c", "..", "e30.e30"]) expect(verifyUploadToken(junk), junk).toBeNull();
  });
});

describe("cleanFileName", () => {
  it("keeps a Thai name and fixes the extension", () => {
    expect(cleanFileName("เรซูเม่ สมชาย.PDF", "pdf")).toBe("เรซูเม่ สมชาย.pdf");
  });

  it("drops path parts and control characters", () => {
    const cleaned = cleanFileName("../../etc/pass\u0000wd\r\n.docx", "docx");
    expect(cleaned).not.toMatch(/[\\/\u0000-\u001f]/);
    expect(cleaned.endsWith(".docx")).toBe(true);
  });

  it("never returns an empty name", () => {
    expect(cleanFileName("///", "png")).toMatch(/\.png$/);
  });
});
