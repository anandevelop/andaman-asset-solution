/**
 * tests/leads-spam-signals.test.ts
 * What a test or made-up enquiry looks like — and what it must not catch.
 */

import { describe, expect, it } from "vitest";
import { isSuspect, spamSignals } from "@/lib/leads/spam-signals";

const real = { name: "Somchai Jaidee", email: "somchai.j@gmail.com", phone: "+66812749031" };
const signals = (over: Partial<Parameters<typeof spamSignals>[0]>) => spamSignals({ ...real, ...over });

describe("spamSignals", () => {
  it("passes an ordinary enquiry", () => {
    expect(signals({})).toEqual([]);
    expect(signals({ name: "นายสมชาย ใจดี", message: "สนใจบ้าน 3 ห้องนอน ขอราคาด้วยครับ" })).toEqual([]);
    expect(signals({ name: "Nikolai Petrov", email: "contest.winner@mail.ru", phone: "+79161234589" })).toEqual([]);
  });

  it("flags the enquiry that started this", () => {
    const found = signals({ name: "Nikolai", email: "nikolai.tester79@gmail.com", phone: "+66998877665" });
    expect(found).toEqual(expect.arrayContaining(["email_test", "phone_pattern"]));
    expect(isSuspect(found)).toBe(true);
  });

  it.each([
    ["Test", "name_test"],
    ["mr tester", "name_test"],
    ["ทดสอบ ระบบ", "name_test"],
    ["เทส", "name_test"],
    ["asdf", "name_mash"],
    ["qwerty", "name_mash"],
    ["ฟหกด", "name_mash"],
    ["aaaa", "name_mash"],
    ["12345", "name_mash"],
    ["John Doe", "name_placeholder"],
    ["admin", "name_placeholder"],
  ])("name %s → %s", (name, signal) => {
    expect(signals({ name })).toContain(signal);
  });

  it("does not read a test word inside another word", () => {
    expect(signals({ name: "Celestine Attestor" })).toEqual([]);
    expect(signals({ name: "Testa" })).toEqual([]);
  });

  it.each([
    ["test@gmail.com", "email_test"],
    ["demo123@hotmail.com", "email_test"],
    ["asdfgh@gmail.com", "email_test"],
    ["somchai@example.com", "email_placeholder"],
    ["a@a.com", "email_placeholder"],
    ["aaaa@gmail.com", "email_placeholder"],
    ["somchai@gmial.com", "email_typo"],
  ])("email %s → %s", (email, signal) => {
    expect(signals({ email })).toContain(signal);
  });

  it("does not flag latest@ or contest@", () => {
    expect(signals({ email: "latest.news@company.co.th" })).toEqual([]);
  });

  it.each([
    ["+66812345678", "phone_sequence"],
    ["+66987654321", "phone_sequence"],
    ["+66800000000", "phone_repeat"],
    ["+66899999999", "phone_repeat"],
    ["+66998877665", "phone_pattern"],
    ["+66811223344", "phone_pattern"],
    ["+66812121212", "phone_pattern"],
  ])("phone %s → %s", (phone, signal) => {
    expect(signals({ phone })).toContain(signal);
  });

  it("treats a test message and a mistyped domain as weak on their own", () => {
    const weak = signals({ message: "test", email: "somchai@gmial.com" });
    expect(weak).toEqual(["message_test", "email_typo"]);
    expect(isSuspect(weak)).toBe(false);
    expect(isSuspect(signals({ message: "hi" }))).toBe(false);
  });

  it("flags the third enquiry in a day from the same sender", () => {
    expect(signals({ recentSubmissions: 1 })).toEqual([]);
    expect(signals({ recentSubmissions: 2 })).toEqual(["repeat_submit"]);
  });
});
