/**
 * tests/admin/lead-create.test.ts — the rules for a lead a rep enters by
 * hand (lib/admin/lead-create.ts): the public form's phone standard, no
 * invented consent, email optional.
 */

import { describe, expect, it } from "vitest";
import { parseAdminLead } from "@/lib/admin/lead-create";

const base = {
  name: "Somchai Jaidee",
  phone: "081 234 5678",
  phoneCountry: "TH",
  email: "",
  projectId: "",
  source: "OTHER",
  commsLanguage: "th",
  message: "",
  assignedToId: "",
  consent: "on",
};

describe("parseAdminLead", () => {
  it("turns a Thai national number into E.164", () => {
    const result = parseAdminLead(base);
    expect(result.ok && result.data.phone).toBe("+66812345678");
    expect(result.ok && result.data.phoneCountry).toBe("TH");
  });

  it("lets a typed international number override the selected country", () => {
    const result = parseAdminLead({ ...base, phone: "+7 912 345 67 89" });
    expect(result.ok && result.data.phoneCountry).toBe("RU");
  });

  it("refuses a number that is not dialable for its country", () => {
    expect(parseAdminLead({ ...base, phone: "12" })).toEqual({ ok: false, errors: { phone: "PHONE" } });
    expect(parseAdminLead({ ...base, phone: "0812" })).toMatchObject({ ok: false, errors: { phone: "PHONE" } });
  });

  it("refuses the lead without the customer's consent", () => {
    const { consent: _omit, ...withoutConsent } = base;
    expect(parseAdminLead(withoutConsent)).toMatchObject({ ok: false, errors: { consent: "CONSENT" } });
  });

  it("takes no email as none, and checks one that is given", () => {
    expect(parseAdminLead(base)).toMatchObject({ ok: true, data: { email: "" } });
    expect(parseAdminLead({ ...base, email: "not-an-email" })).toMatchObject({ ok: false, errors: { email: "EMAIL" } });
    expect(parseAdminLead({ ...base, email: "Somchai@Example.com" })).toMatchObject({
      ok: true,
      data: { email: "somchai@example.com" },
    });
  });

  it("falls back to OTHER for an unknown source and to none for a language", () => {
    expect(parseAdminLead({ ...base, source: "TELEPATHY", commsLanguage: "xx" })).toMatchObject({
      ok: true,
      data: { source: "OTHER", commsLanguage: null },
    });
  });

  it("keeps a known nationality as ISO2 and drops anything else", () => {
    const known = parseAdminLead({ ...base, nationality: "ru" });
    expect(known.ok && known.data.nationality).toBe("RU");
    const unknown = parseAdminLead({ ...base, nationality: "XX" });
    expect(unknown.ok && unknown.data.nationality).toBeNull();
    const none = parseAdminLead(base);
    expect(none.ok && none.data.nationality).toBeNull();
  });

  it("requires a name", () => {
    expect(parseAdminLead({ ...base, name: " " })).toMatchObject({ ok: false, errors: { name: "NAME" } });
  });
});
