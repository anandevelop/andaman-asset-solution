import { describe, expect, it } from "vitest";
import { openingWindowFrom } from "@/lib/map-places";

/* The map's open/closed badge read a hard-coded 09:00 while Settings said
   08:00–18:00, so the office showed as closed from eight to nine. */
const FALLBACK = { open: "09:00", close: "18:00", timeZone: "Asia/Bangkok" };

describe("openingWindowFrom", () => {
  it.each([
    ["Daily 08:00–18:00 (GMT+7)", "08:00", "18:00"],
    ["ทุกวัน 08.00 - 18.00 น.", "08:00", "18:00"],
    ["每日 8:30–17:30（GMT+7）", "08:30", "17:30"],
    ["Ежедневно 08:00 до 18:00", "08:00", "18:00"],
    ["Mon–Sat 10:00 to 19:00", "10:00", "19:00"],
  ])("reads %j", (text, open, close) => {
    expect(openingWindowFrom([text], FALLBACK)).toEqual({ open, close, timeZone: "Asia/Bangkok" });
  });

  it("falls back when no text has a time range", () => {
    expect(openingWindowFrom(["By appointment", "", undefined], FALLBACK)).toBe(FALLBACK);
  });

  it("takes the first text that has one", () => {
    expect(openingWindowFrom(["Call us", "08:00–17:00"], FALLBACK).open).toBe("08:00");
  });
});
