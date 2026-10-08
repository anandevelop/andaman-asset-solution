import { afterEach, describe, expect, it, vi } from "vitest";
import { cardUrl, DEFAULT_MEMBER_HOST, memberHost } from "@/lib/club/constants";

afterEach(() => vi.unstubAllEnvs());

describe("ANDAMAN CLUB member host", () => {
  it("is the production host when nothing is set", () => {
    vi.stubEnv("CLUB_MEMBER_HOST", "");
    vi.stubEnv("CLUB_SITE_URL", "");
    expect(memberHost()).toBe(DEFAULT_MEMBER_HOST);
    expect(cardUrl("rp", "abc")).toBe("https://member.andamanassetsolution.com/rp/abc");
  });

  it("follows CLUB_SITE_URL on staging", () => {
    vi.stubEnv("CLUB_MEMBER_HOST", "");
    vi.stubEnv("CLUB_SITE_URL", "https://168-144-240-9.sslip.io/");
    expect(memberHost()).toBe("member.168-144-240-9.sslip.io");
    expect(cardUrl("tv", "xyz")).toBe("https://member.168-144-240-9.sslip.io/tv/xyz");
  });

  it("lets CLUB_MEMBER_HOST win", () => {
    vi.stubEnv("CLUB_SITE_URL", "https://www.example.com");
    vi.stubEnv("CLUB_MEMBER_HOST", "https://Club.Example.com/");
    expect(memberHost()).toBe("club.example.com");
  });

  it("uses the admin's own host on a staging server with no settings", () => {
    vi.stubEnv("CLUB_MEMBER_HOST", "");
    vi.stubEnv("CLUB_SITE_URL", "");
    expect(memberHost("168-144-240-9.sslip.io")).toBe("168-144-240-9.sslip.io");
    expect(memberHost("168-144-240-9.sslip.io:443")).toBe("168-144-240-9.sslip.io");
    expect(cardUrl("rp", "abc", memberHost("168-144-240-9.sslip.io"))).toBe("https://168-144-240-9.sslip.io/rp/abc");
  });

  it("keeps the member host on the live site and on localhost", () => {
    vi.stubEnv("CLUB_MEMBER_HOST", "");
    vi.stubEnv("CLUB_SITE_URL", "");
    expect(memberHost("andamanassetsolution.com")).toBe(DEFAULT_MEMBER_HOST);
    expect(memberHost("www.andamanassetsolution.com")).toBe(DEFAULT_MEMBER_HOST);
    expect(memberHost("localhost:3000")).toBe(DEFAULT_MEMBER_HOST);
  });
});
