/**
 * tests/lib/validations.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The schemas in lib/validations.ts are the only thing standing between a
 * form post and the database, and they run in two places at once: the
 * client for instant feedback, the server as the actual boundary. A schema
 * that is merely *nearly* right therefore fails silently — the browser
 * accepts something the server rejects, or worse, both accept something the
 * column cannot hold.
 *
 * What is tested here is the behaviour that is easy to get wrong and
 * invisible when it is:
 *
 *   • the empty-string-to-null transforms, where the alternative is 0 or
 *     NaN and "unknown price" quietly becomes "free"
 *   • `z.literal(true)` on consent, which is a legal record under the Thai
 *     PDPA, not a checkbox
 *   • the honeypot's `max(0)`, whose entire job is to reject non-empty
 *   • coercions on FormData, where everything arrives as a string
 *
 * Happy paths get one case each. The interesting assertions are the edges.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  FAQ_CATEGORIES,
  PASSWORD_MIN,
  changePasswordSchema,
  eventRegistrationSchema,
  eventRegistrationServerSchema,
  eventSchema,
  faqSchema,
  fieldErrors,
  leadInquirySchema,
  leadInquiryServerSchema,
  linesToArray,
  newsArticleSchema,
  projectSchema,
  setPasswordSchema,
  tagsToArray,
  userCreateSchema,
} from "@/lib/validations";

/** A minimal lead that every field-level test starts from. */
const VALID_LEAD = {
  name: "Somchai Prasert",
  email: "somchai@example.com",
  phone: "+66 81 234 5678",
  consentGiven: true as const,
};

/** Assert failure and return the message on `path`, for readable tests. */
function messageFor(schema: { safeParse: (v: unknown) => any }, value: unknown, path: string) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return fieldErrors(result.error)[path];
}

// ─────────────────────────────────────────────────────────────────────────
// LEADS
// ─────────────────────────────────────────────────────────────────────────

describe("leadInquirySchema", () => {
  it("accepts a well-formed enquiry", () => {
    const result = leadInquirySchema.safeParse(VALID_LEAD);
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace rather than rejecting it", () => {
    // Autofill and copy-paste both introduce trailing spaces. Rejecting a
    // name for that would be indefensible; storing it is merely untidy.
    const result = leadInquirySchema.parse({ ...VALID_LEAD, name: "  Somchai  " });
    expect(result.name).toBe("Somchai");
  });

  it("rejects a one-character name", () => {
    expect(messageFor(leadInquirySchema, { ...VALID_LEAD, name: "A" }, "name")).toBe(
      "Name is too short",
    );
  });

  it("rejects a name that is only whitespace", () => {
    // .trim() runs before .min(), so "   " has length 0 — this would pass
    // if the order were reversed.
    expect(leadInquirySchema.safeParse({ ...VALID_LEAD, name: "    " }).success).toBe(false);
  });

  it.each([
    "not-an-email",
    "missing@tld",
    "@example.com",
    "spaces in@example.com",
  ])("rejects the malformed address %s", (email) => {
    expect(leadInquirySchema.safeParse({ ...VALID_LEAD, email }).success).toBe(false);
  });

  it.each([
    "081-234-5678",
    "+66 (0) 81 234 5678",
    "6681234567",
  ])("accepts the phone format %s", (phone) => {
    expect(leadInquirySchema.safeParse({ ...VALID_LEAD, phone }).success).toBe(true);
  });

  it.each([
    ["letters", "call me maybe"],
    ["an extension marker", "081234567 ext 12"],
    ["too short", "0812"],
  ])("rejects a phone number with %s", (_label, phone) => {
    expect(leadInquirySchema.safeParse({ ...VALID_LEAD, phone }).success).toBe(false);
  });

  it("requires consent to be exactly true", () => {
    // The PDPA consent record is the point. `false` and `undefined` must
    // both fail, and an unchecked box submits neither `true` nor `"true"`.
    for (const consentGiven of [false, undefined, "true", 1, null]) {
      expect(
        leadInquirySchema.safeParse({ ...VALID_LEAD, consentGiven }).success,
      ).toBe(false);
    }
  });

  it("gives consent a human error message, not Zod's default", () => {
    expect(
      messageFor(leadInquirySchema, { ...VALID_LEAD, consentGiven: false }, "consentGiven"),
    ).toBe("Consent is required to submit this form");
  });

  it("treats an empty optional field as absent", () => {
    const result = leadInquirySchema.parse({
      ...VALID_LEAD,
      nationality: "",
      message: "",
    });

    expect(result.nationality).toBe("");
    expect(result.message).toBe("");
  });

  it("rejects a message past the column limit", () => {
    expect(
      leadInquirySchema.safeParse({ ...VALID_LEAD, message: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("leadInquiryServerSchema", () => {
  it("accepts an empty honeypot", () => {
    expect(
      leadInquiryServerSchema.safeParse({ ...VALID_LEAD, company: "" }).success,
    ).toBe(true);
  });

  it("accepts a missing honeypot", () => {
    // A human's browser omits it only if the field were removed; but a
    // stale cached page could, and a real enquiry must not be lost to that.
    expect(leadInquiryServerSchema.safeParse(VALID_LEAD).success).toBe(true);
  });

  it("accepts a filled honeypot rather than rejecting it", () => {
    /*
      Not the schema's job. This used to be `company: z.string().max(0)`,
      which made a filled honeypot a 422 before the request ever reached
      app/api/leads/route.ts's own `if (data.company)` — the line written
      to accept it silently ("bots fill every field they can see", and
      telling one it was caught only teaches it which field to leave
      blank) was dead code, and a real submission with something typed
      into a field a browser autofilled or a screen reader user's virtual
      cursor landed on got a validation error instead of the silent
      success it was supposed to get.

      The schema's part is just not to stand in the route handler's way —
      it must parse successfully so `data.company` reaches the `if`.
    */
    expect(
      leadInquiryServerSchema.safeParse({ ...VALID_LEAD, company: "Acme Ltd" }).success,
    ).toBe(true);
  });

  it("rejects a source outside the enum", () => {
    expect(
      leadInquiryServerSchema.safeParse({ ...VALID_LEAD, source: "TIKTOK" }).success,
    ).toBe(false);
  });

  it("accepts every declared source", () => {
    for (const source of [
      "PROJECT_PAGE",
      "CONTACT_PAGE",
      "EVENT_PAGE",
      "BLOG_ARTICLE",
      "LINE_OA",
      "REFERRAL",
      "OTHER",
    ]) {
      expect(
        leadInquiryServerSchema.safeParse({ ...VALID_LEAD, source }).success,
      ).toBe(true);
    }
  });

  it("caps the reCAPTCHA token", () => {
    // Real v3 tokens run to a few hundred characters. The cap exists so an
    // attacker cannot post a megabyte of base64 and make us hash it.
    expect(
      leadInquiryServerSchema.safeParse({
        ...VALID_LEAD,
        recaptchaToken: "t".repeat(4001),
      }).success,
    ).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("keys messages by field path", () => {
    const result = leadInquirySchema.safeParse({ name: "A", email: "nope", phone: "1" });
    expect(result.success).toBe(false);

    const errors = fieldErrors(result.error!);
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(["name", "email", "phone", "consentGiven"]),
    );
  });

  it("files a root-level issue under 'form'", () => {
    // A .refine() on the object has an empty path; without the fallback it
    // would key on "" and never render.
    const result = eventSchema.safeParse({
      locale: "en",
      slug: "open-house",
      title: "Open house",
      description: "",
      location: "",
      startsAt: "2026-09-01T18:00",
      endsAt: "2026-09-01T17:00", // before the start
      coverImageUrl: "",
      capacity: "",
      isPublished: "",
    });

    expect(result.success).toBe(false);
    // This particular refine declares path: ["endsAt"], so it lands there.
    expect(fieldErrors(result.error!).endsAt).toBe(
      "The end time must be after the start time",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// EVENT RSVP
// ─────────────────────────────────────────────────────────────────────────

describe("eventRegistrationSchema", () => {
  const VALID_RSVP = {
    name: "Anna Lindqvist",
    agencyName: "Lindqvist Realty",
    email: "Anna@Example.COM",
    phone: "0812345678",
    consentGiven: true as const,
  };

  it("lowercases the email", () => {
    // The unique constraint is (eventId, email). Without normalisation the
    // same person books twice by capitalising differently, and the second
    // booking silently consumes another seat.
    expect(eventRegistrationSchema.parse(VALID_RSVP).email).toBe("anna@example.com");
  });

  it("requires an agency / company name", () => {
    // Added in the agent-partner RSVP redesign — every registrant is
    // expected to be a partner agent, not a walk-in.
    const { agencyName, ...withoutAgency } = VALID_RSVP;
    expect(eventRegistrationSchema.safeParse(withoutAgency).success).toBe(false);
  });

  it("accepts an optional WhatsApp number", () => {
    expect(
      eventRegistrationSchema.safeParse({ ...VALID_RSVP, whatsapp: "0898887777" })
        .success,
    ).toBe(true);
  });

  it("allows WhatsApp to be omitted entirely", () => {
    // Not every agent has a separate WhatsApp number from their phone.
    expect(eventRegistrationSchema.safeParse(VALID_RSVP).success).toBe(true);
  });

  it("rejects a malformed WhatsApp number", () => {
    expect(
      eventRegistrationSchema.safeParse({ ...VALID_RSVP, whatsapp: "not-a-number!" })
        .success,
    ).toBe(false);
  });

  it("accepts a filled honeypot on the server schema rather than rejecting it", () => {
    // Same fix as leadInquiryServerSchema, same reason: the honeypot check
    // belongs to app/api/events/[id]/register/route.ts's `if (data.company)`,
    // not to a schema constraint that would 422 before that line ever runs.
    expect(
      eventRegistrationServerSchema.safeParse({ ...VALID_RSVP, company: "x" }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN — FormData coercions
// ─────────────────────────────────────────────────────────────────────────

describe("linesToArray", () => {
  it("splits, trims and drops blank lines", () => {
    expect(linesToArray.parse("Clubhouse\n  Fitness  \n\n\nSecurity\n")).toEqual([
      "Clubhouse",
      "Fitness",
      "Security",
    ]);
  });

  it("turns an empty textarea into an empty array, not [\"\"]", () => {
    // `"".split("\n")` is `[""]`, so the filter is load-bearing: without
    // it every project would ship one blank facility bullet.
    expect(linesToArray.parse("")).toEqual([]);
    expect(linesToArray.parse("\n\n  \n")).toEqual([]);
  });
});

describe("tagsToArray", () => {
  it("splits on commas and de-duplicates", () => {
    expect(tagsToArray.parse("phuket, investment ,phuket,  ,villa")).toEqual([
      "phuket",
      "investment",
      "villa",
    ]);
  });

  it("is case-sensitive when de-duplicating", () => {
    // Documented rather than desired: tags are shown verbatim, so folding
    // case here would change what an editor sees on the page.
    expect(tagsToArray.parse("Phuket, phuket")).toEqual(["Phuket", "phuket"]);
  });
});

describe("projectSchema", () => {
  const VALID_PROJECT = {
    locale: "en",
    slug: "trinity-village",
    name: "Trinity Village",
    tagline: "",
    description: "",
    conceptDesign: "",
    conceptDesignImageUrl: "",
    aboutThisProject: "",
    aboutThisProjectImageUrl: "",
    specialFeatures: "",
    location: "Pasak 8, Cherngtalay, Phuket",
    propertyType: "POOL_VILLA",
    status: "UNDER_CONSTRUCTION",
    landAreaSqm: "",
    projectArea: "",
    totalUnits: "",
    facilities: "",
    heroImageUrl: "",
    heroMediaType: "IMAGE",
    heroVideoUrl: "",
    gallery: "",
    brochureUrl: "",
    masterPlanImageUrl: "",
    latitude: "",
    longitude: "",
    googleMapsUrl: "",
    metaTitle: "",
    metaDescription: "",
    isPublished: "on",
    sortOrder: "0",
  };

  it("accepts a minimal project", () => {
    expect(projectSchema.safeParse(VALID_PROJECT).success).toBe(true);
  });

  it("turns an empty optional number into null, not zero", () => {
    // The bug this guards: `Number("")` is 0, and a villa listed at
    // 0 sq.m. "land area" would go live looking like a data error.
    const result = projectSchema.parse(VALID_PROJECT);
    expect(result.landAreaSqm).toBeNull();
    expect(result.totalUnits).toBeNull();
  });

  it("keeps a real zero when one is typed", () => {
    const result = projectSchema.parse({ ...VALID_PROJECT, totalUnits: "0" });
    expect(result.totalUnits).toBe(0);
  });

  it("turns empty optional text into null", () => {
    expect(projectSchema.parse(VALID_PROJECT).tagline).toBeNull();
  });

  it.each([
    ["Trinity Village"], // spaces
    ["Trinity-Village"], // capitals
    ["trinity--village"], // doubled hyphen
    ["-trinity"], // leading hyphen
    ["trinity-"], // trailing hyphen
    ["trinity_village"], // underscore
    ["ทรินิตี้"], // non-ASCII
  ])("rejects the slug %s", (slug) => {
    expect(projectSchema.safeParse({ ...VALID_PROJECT, slug }).success).toBe(false);
  });

  it.each([["trinity-village"], ["villa-8"], ["a1"]])(
    "accepts the slug %s",
    (slug) => {
      expect(projectSchema.safeParse({ ...VALID_PROJECT, slug }).success).toBe(true);
    },
  );

  it("rejects coordinates outside their real ranges", () => {
    expect(
      projectSchema.safeParse({ ...VALID_PROJECT, latitude: "91" }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ ...VALID_PROJECT, longitude: "181" }).success,
    ).toBe(false);
  });

  it("accepts Phuket's actual coordinates", () => {
    const result = projectSchema.parse({
      ...VALID_PROJECT,
      latitude: "7.9519",
      longitude: "98.3381",
    });

    expect(result.latitude).toBeCloseTo(7.9519);
    expect(result.longitude).toBeCloseTo(98.3381);
  });

  it("treats an unchecked publish box as false", () => {
    // An unchecked checkbox is absent from FormData, so the action passes
    // "" — and `z.coerce.boolean()` reads "" as false. Any non-empty
    // string, including the "on" a checked box sends, is true.
    expect(projectSchema.parse({ ...VALID_PROJECT, isPublished: "" }).isPublished).toBe(
      false,
    );
    expect(projectSchema.parse({ ...VALID_PROJECT, isPublished: "on" }).isPublished).toBe(
      true,
    );
  });

  it("rejects an unknown property type", () => {
    expect(
      projectSchema.safeParse({ ...VALID_PROJECT, propertyType: "HOUSEBOAT" }).success,
    ).toBe(false);
  });
});

describe("faqSchema", () => {
  it("accepts a category outside the project-page list", () => {
    // Free text by design — it still shows on the home page. The constant
    // only drives which entries a project page filters to.
    const parsed = faqSchema.parse({
      locale: "en",
      question: "Can I rent it out?",
      answer: "Yes, through our rental programme.",
      category: "rental",
      isPublished: "on",
      sortOrder: "0",
    });

    expect(parsed.category).toBe("rental");
    expect(FAQ_CATEGORIES).not.toContain("rental" as never);
  });
});

describe("newsArticleSchema", () => {
  const VALID_ARTICLE = {
    locale: "en",
    slug: "phuket-market-2026",
    title: "Phuket market outlook 2026",
    excerpt: "",
    content: "Body copy.",
    coverImageUrl: "",
    category: "",
    tags: "",
    metaTitle: "",
    metaDescription: "",
    isPublished: "on",
    publishedAt: "",
  };

  it("requires a body", () => {
    expect(
      newsArticleSchema.safeParse({ ...VALID_ARTICLE, content: "" }).success,
    ).toBe(false);
  });

  it("turns an empty publish date into null", () => {
    expect(newsArticleSchema.parse(VALID_ARTICLE).publishedAt).toBeNull();
  });

  it("parses a datetime-local value", () => {
    const result = newsArticleSchema.parse({
      ...VALID_ARTICLE,
      publishedAt: "2026-08-20T18:00",
    });

    expect(result.publishedAt).toBeInstanceOf(Date);
    // Deliberately asserted in local time: the value carries no zone, and
    // reading it as UTC would shift every Phuket timestamp by seven hours.
    expect(result.publishedAt!.getHours()).toBe(18);
  });

  it("rejects a date it cannot parse", () => {
    expect(
      newsArticleSchema.safeParse({ ...VALID_ARTICLE, publishedAt: "sometime" }).success,
    ).toBe(false);
  });
});

describe("eventSchema", () => {
  const VALID_EVENT = {
    locale: "en",
    slug: "open-house-september",
    title: "Open house",
    description: "",
    location: "",
    startsAt: "2026-09-01T14:00",
    endsAt: "",
    coverImageUrl: "",
    capacity: "",
    isPublished: "on",
  };

  it("accepts an event with no end time", () => {
    expect(eventSchema.parse(VALID_EVENT).endsAt).toBeNull();
  });

  it("rejects an end time before the start", () => {
    expect(
      eventSchema.safeParse({ ...VALID_EVENT, endsAt: "2026-09-01T13:00" }).success,
    ).toBe(false);
  });

  it("rejects an end time equal to the start", () => {
    // A zero-length event is a data-entry slip, not a valid state.
    expect(
      eventSchema.safeParse({ ...VALID_EVENT, endsAt: "2026-09-01T14:00" }).success,
    ).toBe(false);
  });

  it("rejects a capacity of zero", () => {
    // Null means unlimited; zero would mean "published but unbookable",
    // which no one intends to type.
    expect(eventSchema.safeParse({ ...VALID_EVENT, capacity: "0" }).success).toBe(false);
  });

  it("treats an empty capacity as unlimited", () => {
    expect(eventSchema.parse(VALID_EVENT).capacity).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// USERS & PASSWORDS
// ─────────────────────────────────────────────────────────────────────────

describe("userCreateSchema", () => {
  const VALID_USER = {
    name: "Nok Suwan",
    email: "  Nok@Example.com ",
    role: "EDITOR",
    password: "correct horse battery staple",
    isActive: "on",
  };

  it("normalises the email to trimmed lowercase", () => {
    // The column is unique. Two rows differing only in case would both
    // insert, and one of the two people could never sign in.
    expect(userCreateSchema.parse(VALID_USER).email).toBe("nok@example.com");
  });

  it(`rejects a password shorter than ${PASSWORD_MIN}`, () => {
    expect(
      userCreateSchema.safeParse({ ...VALID_USER, password: "a".repeat(PASSWORD_MIN - 1) })
        .success,
    ).toBe(false);
  });

  it("accepts a long passphrase with no symbols", () => {
    // The policy is length, not composition — deliberately.
    expect(
      userCreateSchema.safeParse({
        ...VALID_USER,
        password: "the quiet villa at dusk",
      }).success,
    ).toBe(true);
  });

  it("rejects a role outside the enum", () => {
    expect(userCreateSchema.safeParse({ ...VALID_USER, role: "OWNER" }).success).toBe(
      false,
    );
  });
});

describe("setPasswordSchema", () => {
  it("requires the confirmation to match", () => {
    expect(
      messageFor(
        setPasswordSchema,
        { password: "a-long-enough-password", confirmPassword: "something-else-here" },
        "confirmPassword",
      ),
    ).toBe("Passwords do not match");
  });
});

describe("changePasswordSchema", () => {
  const VALID_CHANGE = {
    currentPassword: "the-old-passphrase",
    password: "a-brand-new-passphrase",
    confirmPassword: "a-brand-new-passphrase",
  };

  it("accepts a genuine change", () => {
    expect(changePasswordSchema.safeParse(VALID_CHANGE).success).toBe(true);
  });

  it("rejects reusing the current password", () => {
    expect(
      messageFor(
        changePasswordSchema,
        {
          ...VALID_CHANGE,
          password: VALID_CHANGE.currentPassword,
          confirmPassword: VALID_CHANGE.currentPassword,
        },
        "password",
      ),
    ).toBe("Choose a password you have not used here before");
  });

  it("requires the current password to be supplied", () => {
    expect(
      changePasswordSchema.safeParse({ ...VALID_CHANGE, currentPassword: "" }).success,
    ).toBe(false);
  });
});
