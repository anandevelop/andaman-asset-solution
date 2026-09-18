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
  ARTICLE_FORMATS,
  contentLinkSchema,
  keywordAssignmentSchema,
  keywordSchema,
  linesToArray,
  newsArticleContentStudioSchema,
  newsArticleSchema,
  newsArticleSeoCacheSchema,
  newsArticleStudioFieldsSchema,
  projectSchema,
  secondaryKeywordsToArray,
  setPasswordSchema,
  tagsToArray,
  userCreateSchema,
  META_TITLE_MAX,
  SETTING_VALIDATORS,
} from "@/lib/validations";

/** A minimal lead that every field-level test starts from. `phone` is
 *  E.164 — the shape CountrySelect.tsx's toE164() always produces, and the
 *  only shape leadInquirySchema accepts now (see the "phone" describe
 *  block below for why the old loose formats no longer pass). */
const VALID_LEAD = {
  name: "Somchai Prasert",
  email: "somchai@example.com",
  phone: "+66812345678",
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

  it.each(["+66812345678", "+12025550143", "+8613800138000"])(
    "accepts the E.164 phone number %s",
    (phone) => {
      expect(leadInquirySchema.safeParse({ ...VALID_LEAD, phone }).success).toBe(true);
    },
  );

  it.each([
    // Every one of these used to be accepted, back when the field held
    // whatever a visitor typed. CountrySelect.tsx now assembles E.164
    // before the value ever reaches this schema, so only that shape is
    // valid input — a loose format arriving here means something upstream
    // (a script hitting the API directly, most likely) skipped assembly.
    ["a local format with no country code", "081-234-5678"],
    ["a loosely-formatted international number", "+66 (0) 81 234 5678"],
    ["digits with no + prefix at all", "6681234567"],
    ["letters", "call me maybe"],
    ["an extension marker", "+66812345678 ext 12"],
    ["too short to be a real calling code + number", "+1234567"],
    ["a leading zero right after the +", "+0812345678"],
  ])("rejects a phone number with %s", (_label, phone) => {
    expect(leadInquirySchema.safeParse({ ...VALID_LEAD, phone }).success).toBe(false);
  });

  describe("phoneCountry cross-check", () => {
    it("accepts a phone number that is genuinely valid for the given country", () => {
      expect(
        leadInquirySchema.safeParse({ ...VALID_LEAD, phone: "+66812345678", phoneCountry: "TH" })
          .success,
      ).toBe(true);
    });

    it("rejects a validly-shaped number from the wrong country", () => {
      // +1 always matches E.164's regex, but a US number is not a Thai
      // one just because both happen to have 10 national digits — this is
      // exactly the gap the regex alone cannot close, which is why
      // isValidPhoneForCountry runs separately in a superRefine.
      const result = leadInquirySchema.safeParse({
        ...VALID_LEAD,
        phone: "+12025550143",
        phoneCountry: "TH",
      });

      expect(result.success).toBe(false);
    });

    it("skips the cross-check when phoneCountry is not sent", () => {
      // Older or third-party clients that never learned about
      // phoneCountry still get the plain E.164-shape check, not a hard
      // failure for a field they were never told to send.
      expect(
        leadInquirySchema.safeParse({ ...VALID_LEAD, phone: "+12025550143" }).success,
      ).toBe(true);
    });
  });

  describe("nationality", () => {
    it("accepts a known ISO2 code", () => {
      expect(leadInquirySchema.safeParse({ ...VALID_LEAD, nationality: "GB" }).success).toBe(
        true,
      );
    });

    it("is case-insensitive", () => {
      expect(leadInquirySchema.safeParse({ ...VALID_LEAD, nationality: "gb" }).success).toBe(
        true,
      );
    });

    it("rejects a code that is not a real country", () => {
      // "XX" is exactly two letters — the .length(2) check alone would let
      // it through, which is why isKnownIso2 runs as well.
      expect(leadInquirySchema.safeParse({ ...VALID_LEAD, nationality: "XX" }).success).toBe(
        false,
      );
    });

    it("rejects free text from before CountrySelect.tsx existed", () => {
      // The exact shape old leads were stored with — this schema is what
      // a *new* submission goes through, not what a stored row must have
      // been at some point in the past. See LeadInquiry.nationality's
      // comment in schema.prisma for why those old rows are untouched.
      expect(
        leadInquirySchema.safeParse({ ...VALID_LEAD, nationality: "Russian" }).success,
      ).toBe(false);
    });

    it("is optional", () => {
      expect(leadInquirySchema.safeParse(VALID_LEAD).success).toBe(true);
    });
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

  it("treats an empty optional message as absent", () => {
    // Unlike nationality (see the describe block above), message keeps its
    // pre-existing "" .or(z.literal("")) shape — a text field submits an
    // empty string when untouched, not undefined.
    const result = leadInquirySchema.parse({ ...VALID_LEAD, message: "" });
    expect(result.message).toBe("");
  });

  it("rejects a message past the column limit", () => {
    expect(
      leadInquirySchema.safeParse({ ...VALID_LEAD, message: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  describe("link-blocking", () => {
    it("rejects a message containing a link", () => {
      // See tests/links.test.ts for containsLink's own, more thorough
      // coverage — this just confirms the schema actually wires it in.
      expect(
        leadInquirySchema.safeParse({ ...VALID_LEAD, message: "check bit.ly/cheap-villa" })
          .success,
      ).toBe(false);
    });

    it("accepts a message with a phone number and an email address", () => {
      // The false positive that would matter most: a genuine buyer's own
      // contact details getting blocked as if they were spam.
      expect(
        leadInquirySchema.safeParse({
          ...VALID_LEAD,
          message: "โทร 081-234-5678 หรือ james@gmail.com",
        }).success,
      ).toBe(true);
    });

    it("gives the link rejection an identifiable sentinel, not Zod's default", () => {
      // LeadForm.tsx matches on this exact string to swap in a translated
      // sentence — see its phoneError/messageError mapping.
      expect(
        messageFor(leadInquirySchema, { ...VALID_LEAD, message: "bit.ly/x" }, "message"),
      ).toBe("LINK_DETECTED");
    });
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
      ogImageUrl: "",
      capacity: "",
      isPublished: "",
      metaTitle: "",
      metaDescription: "",
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
    virtualTourUrl: "",
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
    ogImageUrl: "",
    category: "",
    tags: "",
    metaTitle: "",
    metaDescription: "",
    focusKeyword: "",
    contentFormat: "MARKDOWN",
    isPublished: "on",
    publishedAt: "",
  };

  it("requires a body", () => {
    expect(
      newsArticleSchema.safeParse({ ...VALID_ARTICLE, content: "" }).success,
    ).toBe(false);
  });

  it("only accepts a known ArticleFormat value", () => {
    expect(ARTICLE_FORMATS).toEqual(["MARKDOWN", "HTML"]);
    expect(newsArticleSchema.safeParse({ ...VALID_ARTICLE, contentFormat: "RICH_TEXT" }).success).toBe(
      false,
    );
    expect(newsArticleSchema.safeParse({ ...VALID_ARTICLE, contentFormat: "HTML" }).success).toBe(true);
  });

  it("blocks a second H1 in an HTML article", () => {
    const twoH1s = { ...VALID_ARTICLE, contentFormat: "HTML", content: "<h1>One</h1><h1>Two</h1>" };
    expect(newsArticleSchema.safeParse(twoH1s).success).toBe(false);
  });

  it("allows a single H1 in an HTML article", () => {
    const oneH1 = { ...VALID_ARTICLE, contentFormat: "HTML", content: "<h1>One</h1><p>Body</p>" };
    expect(newsArticleSchema.safeParse(oneH1).success).toBe(true);
  });

  it("never applies the H1 gate to a Markdown article", () => {
    // Old articles typed through the plain-textarea editor were never
    // subject to this rule and must keep saving exactly as before.
    const twoH1s = { ...VALID_ARTICLE, contentFormat: "MARKDOWN", content: "# One\n\n# Two" };
    expect(newsArticleSchema.safeParse(twoH1s).success).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────
// CONTENT STUDIO — schema-only phase (see lib/validations.ts's own header
// comment on this section for why none of this is wired into
// newsArticleSchema yet).
// ─────────────────────────────────────────────────────────────────────────

describe("secondaryKeywordsToArray", () => {
  it("splits, trims and de-duplicates comma-separated phrases", () => {
    expect(secondaryKeywordsToArray.parse("Phuket villas, beachfront , Phuket villas")).toEqual([
      "Phuket villas",
      "beachfront",
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(secondaryKeywordsToArray.parse("")).toEqual([]);
    expect(secondaryKeywordsToArray.parse("   ")).toEqual([]);
  });

  it("accepts exactly 5 secondary keywords", () => {
    const result = secondaryKeywordsToArray.safeParse("a, b, c, d, e");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(5);
  });

  it("rejects a 6th secondary keyword", () => {
    const result = secondaryKeywordsToArray.safeParse("a, b, c, d, e, f");
    expect(result.success).toBe(false);
  });
});

describe("newsArticleContentStudioSchema", () => {
  const VALID = {
    focusKeyword: "beachfront villas",
    secondaryKeywords: "phuket, real estate",
    schemaType: "NewsArticle",
    canonicalUrl: "https://example.com/news/original",
  };

  it("accepts a well-formed submission", () => {
    const result = newsArticleContentStudioSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secondaryKeywords).toEqual(["phuket", "real estate"]);
    }
  });

  it("turns blank optional text fields into null", () => {
    const result = newsArticleContentStudioSchema.parse({
      ...VALID,
      focusKeyword: "",
      schemaType: "",
      canonicalUrl: "",
    });
    expect(result.focusKeyword).toBeNull();
    expect(result.schemaType).toBeNull();
    expect(result.canonicalUrl).toBeNull();
  });
});

describe("newsArticleStudioFieldsSchema", () => {
  const VALID = {
    secondaryKeywords: "phuket, real estate",
    schemaType: "BlogPosting",
    canonicalUrl: "https://example.com/news/original",
  };

  it("accepts the three Settings-tab fields, without focusKeyword", () => {
    const result = newsArticleStudioFieldsSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        secondaryKeywords: ["phuket", "real estate"],
        schemaType: "BlogPosting",
        canonicalUrl: "https://example.com/news/original",
      });
    }
  });

  it("accepts a schemaType outside the dropdown's three options", () => {
    // Deliberately loose — see this schema's own comment on why schemaType
    // isn't a z.enum of just NewsArticle/BlogPosting/Report.
    const result = newsArticleStudioFieldsSchema.safeParse({ ...VALID, schemaType: "SomeFutureType" });
    expect(result.success).toBe(true);
  });

  it("turns a blank schemaType/canonicalUrl into null", () => {
    const result = newsArticleStudioFieldsSchema.parse({ ...VALID, schemaType: "", canonicalUrl: "" });
    expect(result.schemaType).toBeNull();
    expect(result.canonicalUrl).toBeNull();
  });
});

describe("newsArticleSeoCacheSchema", () => {
  it("accepts null across every field — the state before anything runs", () => {
    expect(
      newsArticleSeoCacheSchema.safeParse({
        readingMinutes: null,
        seoScore: null,
        seoScoreAt: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a score outside 0–100", () => {
    expect(
      newsArticleSeoCacheSchema.safeParse({ readingMinutes: 3, seoScore: 101, seoScoreAt: null })
        .success,
    ).toBe(false);
    expect(
      newsArticleSeoCacheSchema.safeParse({ readingMinutes: 3, seoScore: -1, seoScoreAt: null })
        .success,
    ).toBe(false);
  });

  it("accepts the boundary scores", () => {
    expect(
      newsArticleSeoCacheSchema.safeParse({ readingMinutes: 3, seoScore: 0, seoScoreAt: null }).success,
    ).toBe(true);
    expect(
      newsArticleSeoCacheSchema.safeParse({ readingMinutes: 3, seoScore: 100, seoScoreAt: null })
        .success,
    ).toBe(true);
  });
});

describe("keywordSchema", () => {
  const VALID_KEYWORD = { phrase: "beachfront villas phuket", locale: "en" };

  it("accepts a bare phrase with nothing else known yet", () => {
    expect(keywordSchema.safeParse(VALID_KEYWORD).success).toBe(true);
  });

  it("rejects an empty phrase", () => {
    expect(keywordSchema.safeParse({ ...VALID_KEYWORD, phrase: "  " }).success).toBe(false);
  });

  it("rejects a locale outside the site's four", () => {
    expect(keywordSchema.safeParse({ ...VALID_KEYWORD, locale: "fr" }).success).toBe(false);
  });

  it("rejects a difficulty outside 0–100", () => {
    expect(keywordSchema.safeParse({ ...VALID_KEYWORD, difficulty: 101 }).success).toBe(false);
  });

  it("accepts up to 12 weeks of trend, rejects a 13th", () => {
    const trend = Array.from({ length: 12 }, (_, i) => ({ w: i + 1, rank: 10 }));
    expect(keywordSchema.safeParse({ ...VALID_KEYWORD, trend }).success).toBe(true);
    expect(
      keywordSchema.safeParse({ ...VALID_KEYWORD, trend: [...trend, { w: 13, rank: 9 }] }).success,
    ).toBe(false);
  });
});

describe("keywordAssignmentSchema", () => {
  const VALID_ASSIGNMENT = {
    keywordId: "kw_1",
    contentType: "NEWS_ARTICLE",
    contentId: "article_1",
    locale: "en",
  };

  it("defaults isPrimary to false", () => {
    const result = keywordAssignmentSchema.parse(VALID_ASSIGNMENT);
    expect(result.isPrimary).toBe(false);
  });

  it("accepts any non-empty contentType — a free string, not an enum", () => {
    expect(
      keywordAssignmentSchema.safeParse({ ...VALID_ASSIGNMENT, contentType: "PROJECT" }).success,
    ).toBe(true);
  });

  it("rejects an empty contentType or contentId", () => {
    expect(keywordAssignmentSchema.safeParse({ ...VALID_ASSIGNMENT, contentType: "" }).success).toBe(
      false,
    );
    expect(keywordAssignmentSchema.safeParse({ ...VALID_ASSIGNMENT, contentId: "" }).success).toBe(
      false,
    );
  });
});

describe("contentLinkSchema", () => {
  const VALID_LINK = {
    fromType: "NEWS_ARTICLE",
    fromId: "article_1",
    fromLocale: "en",
    toPath: "/projects/andaman-bay",
    isInternal: true,
  };

  it("accepts a link not yet checked", () => {
    expect(contentLinkSchema.safeParse(VALID_LINK).success).toBe(true);
  });

  it("rejects an httpStatus outside the valid HTTP range", () => {
    expect(contentLinkSchema.safeParse({ ...VALID_LINK, httpStatus: 99 }).success).toBe(false);
    expect(contentLinkSchema.safeParse({ ...VALID_LINK, httpStatus: 600 }).success).toBe(false);
    expect(contentLinkSchema.safeParse({ ...VALID_LINK, httpStatus: 404 }).success).toBe(true);
  });

  it("requires isInternal to be an explicit boolean", () => {
    expect(contentLinkSchema.safeParse({ ...VALID_LINK, isInternal: undefined }).success).toBe(false);
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
    ogImageUrl: "",
    capacity: "",
    isPublished: "on",
    // Blank, not absent: optionalText() turns "" into null but a missing
    // key is a validation error, and the form always submits both.
    metaTitle: "",
    metaDescription: "",
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

/**
 * Site settings.
 *
 * These moved out of the settings server action so they could be tested at
 * all — a `"use server"` module exports only callable actions, so the map
 * was unreachable from a test file while it lived there.
 *
 * The cases below are the ones where being nearly right is invisible: a
 * title template missing its %s ships fifty identical <title> tags and
 * raises no error anywhere, and a validator that normalises is worthless
 * unless the action actually keeps `parsed.data`.
 */
describe("site setting validators", () => {
  /** Parse through the same map the action uses, by key. */
  const parse = (key: Parameters<typeof settingFor>[0], value: string) =>
    settingFor(key).safeParse(value);

  function settingFor(key: keyof typeof SETTING_VALIDATORS) {
    const validator = SETTING_VALIDATORS[key];
    if (!validator) throw new Error(`no validator registered for ${key}`);
    return validator;
  }

  describe("analytics.gaMeasurementId", () => {
    it("accepts a measurement ID and uppercases it", () => {
      // The normalisation half matters as much as the accept: it only
      // reaches the database because the action writes parsed.data.
      const result = parse("analytics.gaMeasurementId", "g-abc1234567");

      expect(result.success && result.data).toBe("G-ABC1234567");
    });

    it("names Universal Analytics when given a UA- id", () => {
      const result = parse("analytics.gaMeasurementId", "UA-12345678-1");

      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0]?.message).toContain(
        "Universal Analytics",
      );
    });

    it("names Tag Manager when given a GTM- container", () => {
      const result = parse("analytics.gaMeasurementId", "GTM-ABCD12");

      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0]?.message).toContain(
        "Tag Manager",
      );
    });

    it("rejects a pasted gtag snippet", () => {
      expect(
        parse("analytics.gaMeasurementId", "<script src=gtag.js?id=G-ABCD123456>")
          .success,
      ).toBe(false);
    });
  });

  describe("analytics.googleSiteVerification", () => {
    it("accepts an opaque token", () => {
      expect(
        parse("analytics.googleSiteVerification", "aBc123_def-456.ghi~789").success,
      ).toBe(true);
    });

    it("rejects a whole pasted meta tag, by name", () => {
      const result = parse(
        "analytics.googleSiteVerification",
        '<meta name="google-site-verification" content="abc123" />',
      );

      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0]?.message).toContain("<meta>");
    });

    it("rejects something far too short to be a token", () => {
      expect(parse("analytics.googleSiteVerification", "abc").success).toBe(false);
    });
  });

  describe("seo.titleTemplate", () => {
    it("accepts a template with the substitution point", () => {
      expect(parse("seo.titleTemplate", "%s | Andaman Asset Solution").success).toBe(
        true,
      );
    });

    it("rejects one without %s", () => {
      // Without this check the site silently ships one title for every page.
      const result = parse("seo.titleTemplate", "Andaman Asset Solution");

      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0]?.message).toContain("%s");
    });
  });

  describe("seo.twitterHandle", () => {
    it("adds the missing @", () => {
      const result = parse("seo.twitterHandle", "andamanasset");

      expect(result.success && result.data).toBe("@andamanasset");
    });

    it("leaves an existing @ alone", () => {
      const result = parse("seo.twitterHandle", "@andamanasset");

      expect(result.success && result.data).toBe("@andamanasset");
    });

    it("rejects a handle over the 15-character limit", () => {
      expect(parse("seo.twitterHandle", "a".repeat(16)).success).toBe(false);
    });
  });

  describe("branding image settings", () => {
    it.each(["/og-image.jpg", "https://cdn.example.test/x/y.webp"])(
      "accepts %s",
      (value) => {
        expect(parse("branding.ogImageUrl", value).success).toBe(true);
      },
    );

    it.each([
      ["javascript:alert(1)", "a script URL"],
      ["//evil.example/x.png", "a protocol-relative host"],
      ["https://x.test/y.svg", "an SVG, which lib/s3.ts also refuses"],
      ["http://x.test/y.png", "plain http"],
      ["data:image/png;base64,AA", "a data URI"],
      ["/not-an-image", "no image extension"],
    ])("rejects %s (%s)", (value) => {
      expect(parse("branding.ogImageUrl", value).success).toBe(false);
    });

    it("accepts .ico for the favicon but not for the og image", () => {
      expect(parse("branding.faviconUrl", "/favicon.ico").success).toBe(true);
      expect(parse("branding.ogImageUrl", "/favicon.ico").success).toBe(false);
    });

    it("rejects a JPEG favicon", () => {
      expect(parse("branding.faviconUrl", "/mark.jpg").success).toBe(false);
    });
  });

  describe("meta title and description length", () => {
    it("accepts a 70-character title", () => {
      /*
        Deliberate, and asserted so nobody later "fixes" it into a hard
        60-character limit. Google truncates on pixel width, not characters,
        and the same 60 characters are two different widths in Thai and in
        Chinese. Over-length is a truncated snippet, not an invalid value.
      */
      expect(parse("seo.metaTitleEn", "x".repeat(70)).success).toBe(true);
    });

    it("rejects a title past the abuse ceiling", () => {
      expect(parse("seo.metaTitleEn", "x".repeat(META_TITLE_MAX + 1)).success).toBe(
        false,
      );
    });

    it("accepts a description longer than Google will show", () => {
      expect(parse("seo.metaDescriptionTh", "ก".repeat(200)).success).toBe(true);
    });
  });
});
