import { z } from "zod";
import { createTranslator } from "next-intl";
import { locales } from "@/i18n";
import { isKnownIso2, isValidPhoneForCountry } from "@/lib/countries";
import { containsLink } from "@/lib/links";
import { countH1s } from "@/lib/heading-policy";
/*
  Type-only, and it has to stay that way: lib/settings.ts is `server-only`
  and constructs a PrismaClient at module scope, so a value import would
  drag both into every client bundle that touches this file. `import type`
  is erased at compile time and costs nothing.
*/
import type { SettingKey } from "@/lib/settings";

/**
 * Shared client + server validation. The API route re-validates the parsed
 * body with `leadInquiryServerSchema` — never trust the client-side parse.
 */

/**
 * `?lang=` on an admin edit form, revalidated server-side rather than
 * trusted from the hidden input alone — see lib/admin/translated-form.ts
 * for the read-side equivalent (parseEditingLocale). Reused by every
 * schema below that edits a Translation-table row.
 */
export const editingLocaleSchema = z.enum(locales);

/**
 * Body for POST /api/cookie-consent-stats — the two booleans a banner
 * decision actually is. No visitor identifier, timestamp, or IP belongs
 * here: see lib/cookie-consent-stats.ts for why this stays aggregate-only.
 */
export const cookieConsentStatsSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
});

export const LEAD_SOURCES = [
  "PROJECT_PAGE",
  "CONTACT_PAGE",
  "EVENT_PAGE",
  "BLOG_ARTICLE",
  "LINE_OA",
  "REFERRAL",
  "OTHER",
] as const;

export const leadInquirySchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(120),
    email: z.string().trim().email("Enter a valid email address").max(180),
    // E.164: "+" then a calling code that cannot start with 0, then up to
    // 14 more digits — the shape CountrySelect.tsx's toE164() always
    // produces. The stricter "is this really dialable for the selected
    // country" check runs below, in superRefine, since it needs
    // `phoneCountry` alongside `phone` to answer that.
    phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "PHONE_INVALID"),
    // ISO2, set by CountrySelect.tsx alongside `phone` — see
    // LeadInquiry.phoneCountry in schema.prisma for why it is stored
    // separately rather than re-derived from `phone` on every read.
    phoneCountry: z.string().length(2).optional(),
    // Stores an ISO2 now, not free text — see LeadInquiry.nationality's
    // comment in schema.prisma for why existing free-text rows are left
    // alone rather than migrated.
    nationality: z
      .string()
      .length(2, "Unknown country")
      .refine((v) => isKnownIso2(v), { error: "Unknown country" })
      .optional(),
    message: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal(""))
      // See lib/links.ts for what counts as a link and why — this is the
      // same check LeadForm.tsx's own submit button disables on, run again
      // here so a script posting straight at the API cannot skip it.
      .refine((v) => !v || !containsLink(v), { error: "LINK_DETECTED" }),
    consentGiven: z.literal(true, { error: "Consent is required to submit this form" }),
    projectSlug: z.string().trim().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.phoneCountry && !isValidPhoneForCountry(data.phone, data.phoneCountry)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PHONE_INVALID", path: ["phone"] });
    }
  });

export type LeadInquiryInput = z.infer<typeof leadInquirySchema>;

// ── Admin CRM: assignment, follow-up, notes ─────────────────────────────

export const leadAssignSchema = z.object({
  id: z.string().min(1),
  // Empty string from the <select>'s "unassigned" option, normalised to
  // null before it reaches Prisma — see leads/actions.ts.
  assignedToId: z.string().trim().max(64).optional().or(z.literal("")),
});

export const leadFollowUpSchema = z.object({
  id: z.string().min(1),
  // ISO date string from <input type="date">, or "" to clear it.
  followUpAt: z.string().trim().max(32).optional().or(z.literal("")),
});

export const leadHousePreferenceSchema = z.object({
  id: z.string().min(1),
  // Free text a rep writes from a conversation — "" clears it, same
  // clear-by-emptying convention as leadFollowUpSchema above.
  housePreference: z.string().trim().max(300).optional().or(z.literal("")),
});

export const leadNoteSchema = z.object({
  leadId: z.string().min(1),
  body: z.string().trim().min(1, "Note cannot be empty").max(4000),
  // Which activity-composer tab produced this row — see LeadNoteKind in
  // schema.prisma. Optional, defaulting server-side to NOTE, so the
  // existing plain-note callers don't need to change.
  kind: z.enum(["NOTE", "CALL", "EMAIL"]).optional(),
  // Call length in seconds, CALL entries only — the composer offers
  // minutes+seconds inputs and combines them before this schema sees it.
  durationSeconds: z.coerce.number().int().min(0).max(24 * 60 * 60).optional(),
});

export const appointmentSchema = z.object({
  leadId: z.string().trim().max(64).optional().or(z.literal("")),
  projectId: z.string().trim().max(64).optional().or(z.literal("")),
  assignedToId: z.string().trim().max(64).optional().or(z.literal("")),
  scheduledAt: z.string().trim().min(1, "Pick a date and time"),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
  location: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const appointmentStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
});

export const appointmentAssignSchema = z.object({
  id: z.string().min(1),
  assignedToId: z.string().trim().max(64).optional().or(z.literal("")),
});

export const appointmentRescheduleSchema = z.object({
  id: z.string().min(1),
  scheduledAt: z.string().trim().min(1, "Pick a date and time"),
});

// ── Redirects ────────────────────────────────────────────────────────────

const redirectPath = z.string().trim().min(1).max(300).regex(/^\/[^\s?#]*$/, "Must start with / and contain no query string or #").refine((v) => v === "/" || !v.endsWith("/"), "No trailing slash");

export const redirectSchema = z.object({
  fromPath: redirectPath,
  toPath: redirectPath,
  statusCode: z.union([z.literal(301), z.literal(302)]),
  isActive: z.coerce.boolean().default(true),
});

export const redirectUpdateSchema = redirectSchema.extend({
  id: z.string().min(1),
});

// ── Media library ────────────────────────────────────────────────────────

/**
 * Alt text is one JSON blob per Media row (see Media.altText's comment in
 * schema.prisma) rather than four columns, but the validation still checks
 * every locale explicitly — a typo'd key here would silently store text
 * nothing ever reads.
 */
export const mediaAltTextSchema = z.object({
  en: z.string().trim().max(300).optional().or(z.literal("")),
  th: z.string().trim().max(300).optional().or(z.literal("")),
  zh: z.string().trim().max(300).optional().or(z.literal("")),
  ru: z.string().trim().max(300).optional().or(z.literal("")),
});

export const mediaMetaSchema = z.object({
  id: z.string().min(1),
  altText: mediaAltTextSchema,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

/** What the client already knows right after a successful S3 PUT. */
export const mediaCreateSchema = z.object({
  url: z.string().trim().url().max(1000),
  key: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().max(100).optional().or(z.literal("")),
  width: z.coerce.number().int().positive().max(20000).optional(),
  height: z.coerce.number().int().positive().max(20000).optional(),
  sizeBytes: z.coerce.number().int().positive().max(200 * 1024 * 1024).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
});

export const mediaDeleteSchema = z.object({
  id: z.string().min(1),
});

/**
 * Server-side shape: everything the client sends, plus the PDPA consent
 * version and UTM attribution captured at submit time.
 */
export const leadInquiryServerSchema = leadInquirySchema.extend({
  consentVersion: z.string().trim().max(64).optional(),
  /*
    reCAPTCHA v3 token. Optional at the schema level because the feature is
    optional — lib/recaptcha decides what a missing token means, and it
    already accepts `string | undefined | null`.

    `.nullish()`, not `.optional()`. useRecaptchaToken() returns null when
    the site key is unset, when the script has not loaded, and when
    execute() throws — and JSON.stringify keeps a null rather than dropping
    the key, so those requests arrived carrying `recaptchaToken: null` and
    were rejected 422 before reaching the code written to handle exactly
    that case. The visitor saw the generic failure message and the enquiry
    was never saved: an ad blocker or a slow CDN was enough to lose a lead.
  */
  recaptchaToken: z.string().max(4000).nullish(),
  source: z.enum(LEAD_SOURCES).optional(),
  utmSource: z.string().trim().max(120).optional().or(z.literal("")),
  utmMedium: z.string().trim().max(120).optional().or(z.literal("")),
  utmCampaign: z.string().trim().max(160).optional().or(z.literal("")),
  // Which language version of the site the form was on (LeadForm's own
  // useLocale()) and the page's pathname — real signals captured at
  // submission time, not typed by the visitor. See LeadInquiry.commsLanguage/
  // sourcePath in schema.prisma for what these feed on the admin side.
  commsLanguage: z.enum(locales).optional(),
  sourcePath: z.string().trim().max(300).optional().or(z.literal("")),
  // Honeypot — must stay empty. Bots fill every field they can see.
  /*
    Honeypot — hidden from real visitors, so only a script fills it in.

    Deliberately NOT constrained to an empty string here. It used to be
    `z.string().max(0)`, which rejects any filled-in value with a 422
    before the request body even reaches the route handler — so the one
    line below that was written to catch this ("Honeypot tripped — accept
    silently so bots don't learn the shape") was unreachable dead code,
    and every bot that took the bait got a validation error back instead
    of the silent 201 that was supposed to teach it nothing. Accepting any
    string here is what lets the route handler's own `if (data.company)`
    check be the one place that decides.
  */
  company: z.string().optional().or(z.literal("")),
});

export type LeadInquiryServerInput = z.infer<typeof leadInquiryServerSchema>;

/** Flatten a ZodError into `{ field: "message" }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EVENT RSVP — public registration form (Phase 4)
// ─────────────────────────────────────────────────────────────────────────

export const eventRegistrationSchema = z.object({
  // "Agent Name" in the UI — field key kept as `name` since it is still
  // exactly one person's name, same as every other form on this site.
  name: z.string().trim().min(2, "Name is too short").max(120),
  agencyName: z.string().trim().min(2, "Agency / company is too short").max(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(180),
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Enter a valid phone number"),
  whatsapp: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+()\-\s]*$/, "Enter a valid WhatsApp number")
    .optional()
    .or(z.literal("")),
  consentGiven: z.literal(true, { error: "Consent is required to register" }),
});

export type EventRegistrationInput = z.infer<typeof eventRegistrationSchema>;

export const eventRegistrationServerSchema = eventRegistrationSchema.extend({
  consentVersion: z.string().trim().max(64).optional(),
  // Nullable for the same reason as the lead schema above.
  recaptchaToken: z.string().max(4000).nullish(),
  // Which locale's copy to send the RSVP confirmation email in — the page
  // the visitor filled the form on, not a guess. Optional because the
  // feature degrades fine without it (falls back to the default locale).
  locale: editingLocaleSchema.optional(),
  // Honeypot — must stay empty.
  /*
    Honeypot — hidden from real visitors, so only a script fills it in.

    Deliberately NOT constrained to an empty string here. It used to be
    `z.string().max(0)`, which rejects any filled-in value with a 422
    before the request body even reaches the route handler — so the one
    line below that was written to catch this ("Honeypot tripped — accept
    silently so bots don't learn the shape") was unreachable dead code,
    and every bot that took the bait got a validation error back instead
    of the silent 201 that was supposed to teach it nothing. Accepting any
    string here is what lets the route handler's own `if (data.company)`
    check be the one place that decides.
  */
  company: z.string().optional().or(z.literal("")),
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN — back-office write schemas (Phase 3)
//
// These validate FormData, so every field arrives as a string. The coercion
// helpers below turn "" into null rather than 0/NaN, which matters because
// an empty "price from" means unknown, not free.
// ─────────────────────────────────────────────────────────────────────────

export const PROPERTY_TYPES = [
  "POOL_VILLA",
  "TOWNHOME",
  "CONDOMINIUM",
  "LAND",
  "COMMERCIAL",
] as const;

export const PROJECT_STATUSES = [
  "UPCOMING",
  "UNDER_CONSTRUCTION",
  "READY_TO_MOVE_IN",
  "SOLD_OUT",
] as const;

export const UNIT_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
] as const;

/** Empty / whitespace-only string → null; otherwise the trimmed string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

/** Empty string → null; otherwise a finite number within range. */
const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isFinite(value) && value >= min && value <= max),
      { message: "Enter a valid number" },
    );

/** Textarea with one entry per line → trimmed, de-blanked string array. */
export const linesToArray = z
  .string()
  .transform((value) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

/**
 * One row of Project.specialFeatures. Submitted by SpecialFeaturesEditor
 * (components/admin/SpecialFeaturesEditor.tsx) as a single hidden-input
 * JSON string rather than N indexed form fields — the row count is
 * variable and FormData has no native array/object support, so the
 * component owns serialization and this schema owns validating what comes
 * back.
 */
const specialFeatureSchema = z.object({
  titleEn: z.string().trim().min(1, "Title is required").max(200),
  titleTh: optionalText(200),
  detailEn: z.string().trim().min(1, "Detail is required").max(2000),
  detailTh: optionalText(2000),
});

/** Empty/blank/unparsable JSON → an empty array rather than a validation
 *  error — a project with zero special features is the common case, not a
 *  mistake. A malformed row inside a non-empty array still fails loudly via
 *  the nested schema, since that indicates a real bug in the editor. */
const specialFeaturesJson = z
  .string()
  .transform((value) => {
    if (!value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })
  .pipe(z.array(specialFeatureSchema).max(20, "Too many special features"));

/** IMAGE | VIDEO — shared by Project.heroMediaType and
 *  HeroStorySlide.mediaType (see heroStorySlideSchema further down this
 *  file), which is why this lives up here rather than next to the Hero
 *  Story Banner section: projectSchema below needs it too, and a `const`
 *  declared later in the file isn't usable at this point (TDZ). */
export const heroStoryMediaTypes = ["IMAGE", "VIDEO"] as const;

export const projectSchema = z.object({
  locale: editingLocaleSchema,

  slug: z
    .string()
    .trim()
    .min(2, "Slug is too short")
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens",
    ),

  name: z.string().trim().min(2, "Name is required").max(160),
  tagline: optionalText(300),
  description: optionalText(8000),

  // Sale Kit "Concept Design" / "About This Project" — see the field
  // comments on Project in schema.prisma for how these differ from
  // `description` above.
  conceptDesign: optionalText(8000),
  conceptDesignImageUrl: optionalText(600),
  aboutThisProject: optionalText(8000),
  aboutThisProjectImageUrl: optionalText(600),
  specialFeatures: specialFeaturesJson,

  location: z.string().trim().min(2, "Location is required").max(240),
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROJECT_STATUSES),

  landAreaSqm: optionalNumber(0, 99_999_999),
  projectArea: optionalText(200),         // human-readable area string
  totalUnits: optionalNumber(0, 100_000),

  facilities: linesToArray,
  heroImageUrl: optionalText(600),
  // heroStoryMediaTypes is defined further down this file (see the Hero
  // Story Banner section) — reused here rather than duplicated since it's
  // the exact same IMAGE/VIDEO pair.
  heroMediaType: z.enum(heroStoryMediaTypes).default("IMAGE"),
  heroVideoUrl: optionalText(600),
  gallery: linesToArray,
  brochureUrl: optionalText(600),
  masterPlanImageUrl: optionalText(600),

  latitude: optionalNumber(-90, 90),
  longitude: optionalNumber(-180, 180),
  googleMapsUrl: optionalText(600),
  // External Matterport/Kuula/YouTube-360 link — see the schema.prisma
  // comment on Project.virtualTourUrl.
  virtualTourUrl: optionalText(600),

  metaTitle: optionalText(200),
  metaDescription: optionalText(400),
  // Per-locale opt-out of indexing — unchecked (the default) leaves the
  // page indexed exactly as before this field existed.
  noIndex: z.coerce.boolean().optional().default(false),

  isPublished: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type ProjectInput = z.infer<typeof projectSchema>;

// ── FAQs (Phase 9) ───────────────────────────────────────────────────────

export const faqSchema = z.object({
  locale: editingLocaleSchema,
  question: z.string().trim().min(5, "Question is required").max(300),
  answer: z.string().trim().min(5, "Answer is required").max(8000),

  // Free text, but the project page only shows a fixed set — see
  // FAQ_CATEGORIES below.
  category: optionalText(80),
  isPublished: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type FaqInput = z.infer<typeof faqSchema>;

/**
 * Categories the project detail page filters on.
 *
 * Anything outside this list still appears on the home page but will not
 * show on a project page — the admin surfaces it as a datalist so the
 * distinction is visible while typing rather than discovered later.
 */
export const FAQ_CATEGORIES = [
  "ownership",
  "payment",
  "construction",
  "aftercare",
] as const;

// ── Users ───────────────────────────────────────────────────────────────

export const ROLES = ["SUPER_ADMIN", "ADMIN", "EDITOR", "SALES", "VIEWER"] as const;

/**
 * Minimum 12 characters, no composition rules. Length beats forced symbols:
 * a passphrase is both stronger and likelier to be remembered than
 * "P@ssw0rd!", which is what character classes actually produce.
 */
export const PASSWORD_MIN = 12;

const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(200);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(180);

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email,
  role: z.enum(ROLES),
  password,
  isActive: z.coerce.boolean(),
});

/** Password is changed through its own form, so it is absent here. */
export const userUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email,
  role: z.enum(ROLES),
  isActive: z.coerce.boolean(),
});

/** An admin setting someone else's password — no current password needed. */
export const setPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** A user changing their own — proving they hold the current one. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((value) => value.password !== value.currentPassword, {
    message: "Choose a password you have not used here before",
    path: ["password"],
  });

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ── News & Events (Phase 4 admin) ───────────────────────────────────────

/** Comma-separated tag input → trimmed, de-duplicated array. */
export const tagsToArray = z.string().transform((value) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ),
);

/**
 * `datetime-local` submits "2026-08-20T18:00" with no zone. Interpreting
 * that as UTC would shift every Phuket event by seven hours, so it is
 * parsed as local time on the server — which is why the deploy's TZ should
 * be Asia/Bangkok.
 */
const requiredDateTime = z
  .string()
  .trim()
  .min(1, "A date and time is required")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date and time",
  })
  .transform((value) => new Date(value));

const optionalDateTime = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date and time",
  })
  .transform((value) => (value.length === 0 ? null : new Date(value)));

/** MARKDOWN for every article written before the rich-text editor
 *  existed; HTML for one authored (or explicitly converted — see
 *  NewsForm.tsx's Markdown→rich-text banner) in it. Read by lib/news.ts
 *  to choose renderMarkdown() vs sanitizeArticleHtml() and by NewsForm.tsx
 *  to choose which editor to show. See schema.prisma's ArticleFormat
 *  comment for why the two formats coexist rather than one converting
 *  the other on save. */
export const ARTICLE_FORMATS = ["MARKDOWN", "HTML"] as const;

export const newsArticleSchema = z
  .object({
    locale: editingLocaleSchema,

    slug: z
      .string()
      .trim()
      .min(2, "Slug is too short")
      .max(140)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers and single hyphens",
      ),

    title: z.string().trim().min(2, "Title is required").max(200),
    excerpt: optionalText(600),
    // Body is required — an article with no content should not be publishable.
    content: z.string().trim().min(1, "Content is required").max(60_000),
    contentFormat: z.enum(ARTICLE_FORMATS),

    coverImageUrl: optionalText(600),
    // Manual social-share override — see the schema.prisma comment on
    // NewsArticle.ogImageUrl. Falls back to coverImageUrl when empty.
    ogImageUrl: optionalText(600),
    category: optionalText(80),
    tags: tagsToArray,

    metaTitle: optionalText(200),
    metaDescription: optionalText(400),
    // The phrase this locale's version targets — see the schema.prisma
    // comment on NewsArticleTranslation.focusKeyword. Feeds lib/article-seo.ts.
    focusKeyword: optionalText(200),
    // Per-locale opt-out of indexing — unchecked (the default) leaves the
    // page indexed exactly as before this field existed.
    noIndex: z.coerce.boolean().optional().default(false),

    isPublished: z.coerce.boolean(),
    publishedAt: optionalDateTime,
  })
  .refine((data) => data.contentFormat !== "HTML" || countH1s(data.content, "HTML") <= 1, {
    // The public page already renders the article title as its own H1
    // (see app/[locale]/(site)/news/[slug]/page.tsx) and the first H1 in
    // a rich-text body is kept in sync with the title field
    // (NewsForm.tsx) — a second one is a structural error, not a style
    // choice. Scoped to HTML articles only: an old Markdown article typed
    // through the plain-textarea editor was never subject to this rule
    // and must keep opening and saving exactly as it always has.
    message: "Body can have only one H1 — the first one is kept in sync with the title above.",
    path: ["content"],
  });

export type NewsArticleInput = z.infer<typeof newsArticleSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Content studio. These validate the remaining NewsArticle/
// NewsArticleTranslation content-studio columns and the new Keyword/
// KeywordAssignment/ContentLink models added alongside them.
// `contentFormat` graduated out of this section into newsArticleSchema
// above once the rich-text editor gave it an actual form to be read from;
// `schemaType`/`canonicalUrl`/`secondaryKeywords` graduated the same way
// into newsArticleStudioFieldsSchema below once the SEO panel's Settings
// tab gave them one. The article-level `focusKeyword` here (as opposed to
// the per-locale one on NewsArticleTranslation, which the form has always
// read/written) remains unwired — there is still no UI for it, and the
// Keywords tab stays scoped to the per-locale field on purpose.
// ─────────────────────────────────────────────────────────────────────────

/** How many secondary keywords the Keywords tab lets an article carry —
 *  shared with the client-side count hint (NewsSeoPanel.tsx) so the two
 *  never drift apart. */
export const MAX_SECONDARY_KEYWORDS = 5;

/** Comma-separated → trimmed, de-duplicated array — same shape as
 *  tagsToArray just above, for the same reason: every multi-value field
 *  in this file arrives as FormData, and there is no chip-style input
 *  for secondary keywords built yet. Server-side enforcement of the
 *  5-keyword cap behind the client's live count hint — never silently
 *  truncates, surfaces as a real field error instead (see fieldErrors()). */
export const secondaryKeywordsToArray = z
  .string()
  .transform((value) =>
    Array.from(
      new Set(
        value
          .split(",")
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0),
      ),
    ),
  )
  .pipe(z.array(z.string()).max(MAX_SECONDARY_KEYWORDS, "TOO_MANY_SECONDARY_KEYWORDS"));

/**
 * The remaining NewsArticle-level content-studio fields: the
 * default-locale focus keyword and secondary keywords, the JSON-LD
 * schema-type override, and the canonical-URL override.
 *
 * readingMinutes/seoScore/seoScoreAt are deliberately not here — see
 * newsArticleSeoCacheSchema below. Those three are a cache a server
 * process writes after calling lib/content-stats.ts / lib/article-seo.ts,
 * never a value typed into a form field, so validating them the way a
 * FormData submission is validated here would be validating the wrong
 * thing.
 */
export const newsArticleContentStudioSchema = z.object({
  focusKeyword: optionalText(200),
  secondaryKeywords: secondaryKeywordsToArray,
  schemaType: optionalText(60),
  canonicalUrl: optionalText(600),
});

/**
 * The three NewsArticle-level studio fields actions.ts actually reads
 * from the SEO panel's Settings tab: schema type, canonical URL override,
 * secondary keywords. Excludes this object's own `focusKeyword` member —
 * see the section header above for why that field stays unwired.
 *
 * `schemaType` stays loose text (optionalText), not a z.enum of the
 * Settings tab's three dropdown options: the Prisma column is
 * deliberately an open string (schema.prisma's own comment — "Google's
 * article types are an open set"), and constraining it here would reject
 * a value set directly in the DB or by a future fourth option the
 * dropdown doesn't offer yet.
 */
export const newsArticleStudioFieldsSchema = newsArticleContentStudioSchema.pick({
  schemaType: true,
  canonicalUrl: true,
  secondaryKeywords: true,
});

/** 0–100, matching the 0–100 scale lib/article-seo.ts's auditArticle()
 *  already returns — shared because NewsArticle.seoScore and
 *  NewsArticleTranslation.seoScore are the same cache at two scopes
 *  (whole-article default-locale figure vs. one language's own). */
const seoScoreSchema = z.number().int().min(0).max(100).nullable();

/** The cache fields createArticle/updateArticle write after calling
 *  lib/article-seo.ts's auditArticle() — plain value validators, not
 *  FormData ones, since nothing here is ever typed into a form. */
export const newsArticleSeoCacheSchema = z.object({
  readingMinutes: z.number().int().min(0).max(999).nullable(),
  seoScore: seoScoreSchema,
  seoScoreAt: z.date().nullable(),
});

/** One point in Keyword.trend's up-to-12-week rank history. */
const keywordTrendPointSchema = z.object({
  w: z.number().int().min(1).max(52),
  rank: z.number().int().min(1),
});

/**
 * A tracked phrase, independent of any content it may be assigned to —
 * see the schema.prisma comment on Keyword for why rank/volume/
 * difficulty are nullable: nothing in this codebase populates them yet.
 */
export const keywordSchema = z.object({
  phrase: z.string().trim().min(1, "Enter a phrase").max(200),
  locale: z.enum(locales),
  searchVolume: z.number().int().min(0).nullable().optional(),
  difficulty: z.number().int().min(0).max(100).nullable().optional(),
  currentRank: z.number().int().min(1).nullable().optional(),
  previousRank: z.number().int().min(1).nullable().optional(),
  rankCheckedAt: z.date().nullable().optional(),
  trend: z.array(keywordTrendPointSchema).max(12).nullable().optional(),
});

/** Links a Keyword to one piece of content in one locale — contentType
 *  is a free string, not z.enum(...), for the same reason the column is
 *  a plain string in schema.prisma: a fifth content type should not need
 *  a code change here either. */
export const keywordAssignmentSchema = z.object({
  keywordId: z.string().min(1),
  contentType: z.string().trim().min(1).max(60),
  contentId: z.string().min(1),
  locale: z.enum(locales),
  isPrimary: z.boolean().default(false),
});

/** One link found by lib/content-links.ts's extractLinks() and persisted
 *  by the scan lib/admin/url-health.ts runs — see the schema.prisma
 *  comment on ContentLink. httpStatus/checkedAt are null until that scan
 *  actually checks the link. */
export const contentLinkSchema = z.object({
  fromType: z.string().trim().min(1).max(60),
  fromId: z.string().min(1),
  fromLocale: z.enum(locales),
  toPath: z.string().trim().min(1).max(2000),
  anchorText: z.string().trim().max(300).nullable().optional(),
  isInternal: z.boolean(),
  httpStatus: z.number().int().min(100).max(599).nullable().optional(),
  checkedAt: z.date().nullable().optional(),
});

export const eventSchema = z
  .object({
    locale: editingLocaleSchema,

    slug: z
      .string()
      .trim()
      .min(2, "Slug is too short")
      .max(140)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers and single hyphens",
      ),

    title: z.string().trim().min(2, "Title is required").max(200),
    description: optionalText(8000),

    location: optionalText(240),
    startsAt: requiredDateTime,
    endsAt: optionalDateTime,
    coverImageUrl: optionalText(600),
    // Manual social-share override — see the schema.prisma comment on
    // Event.ogImageUrl. Falls back to coverImageUrl when empty.
    ogImageUrl: optionalText(600),

    capacity: optionalNumber(1, 100_000),

    metaTitle: optionalText(200),
    metaDescription: optionalText(400),
    // Per-locale opt-out of indexing — unchecked (the default) leaves the
    // page indexed exactly as before this field existed.
    noIndex: z.coerce.boolean().optional().default(false),

    isPublished: z.coerce.boolean(),
  })
  .refine((value) => value.endsAt === null || value.endsAt > value.startsAt, {
    message: "The end time must be after the start time",
    path: ["endsAt"],
  });

export type EventInput = z.infer<typeof eventSchema>;

export const projectProgressSchema = z.object({
  projectId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  // A YouTube link, loosely validated like every other admin-pasted URL
  // field in this file (heroVideoUrl, brochureUrl, googleMapsUrl) rather
  // than enforcing a youtube.com/youtu.be host here — lib/youtube.ts
  // already treats anything it can't parse as "no video" on the render
  // side, so a stricter check here would only reject early with a worse
  // error message for the same outcome.
  videoUrl: optionalText(600),
  images: linesToArray,
  isPublished: z.coerce.boolean(),
});

export type ProjectProgressInput = z.infer<typeof projectProgressSchema>;

// ─────────────────────────────────────────────────────────────────────────
// PROJECT UNIT TYPES (Sale Kit — Phase N)
// ─────────────────────────────────────────────────────────────────────────

/**
 * `name` ("Type A", "Type R") is shared across every locale — see the
 * field comment on ProjectUnitType.name in schema.prisma — so unlike every
 * other translated admin form in this codebase, `name` stays outside the
 * language-dropdown fields here; only `description` is per-locale.
 *
 * Deliberately does NOT cover every ProjectUnitType column
 * (landAreaSqm/restrooms/priceFromTHB/priceToTHB/coverImageUrl/gallery all
 * exist on the model but nothing on the public page renders them yet — see
 * the "Unit Types" section on the project page, which only shows
 * livingAreaSqm/bedrooms/bathrooms/totalUnits). Adding an admin field with
 * no visible effect just invites an admin to fill it in and wonder why
 * nothing changed; those columns stay reachable directly in the database
 * until a future pass actually renders them.
 */
export const unitTypeSchema = z.object({
  locale: editingLocaleSchema,
  name: z.string().trim().min(1, "Name is required").max(80),
  description: optionalText(4000),
  livingAreaSqm: optionalNumber(0, 99_999),
  bedrooms: optionalNumber(0, 99),
  bathrooms: optionalNumber(0, 99),
  totalUnits: optionalNumber(0, 10_000),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type UnitTypeInput = z.infer<typeof unitTypeSchema>;

// ─────────────────────────────────────────────────────────────────────────
// FLOOR PLANS (attached to a Unit Type)
// ─────────────────────────────────────────────────────────────────────────

/**
 * One row from FloorPlansEditor's repeatable list — see that component's
 * file comment for the id/key distinction (`id` is the database row, blank
 * for a row the admin just added; `key` is a client-only stable identifier
 * used to name that row's own ImageUploader field, never written to the
 * database). Not translated — a floor-plan photo and its "1st Floor"-style
 * label don't have a language, same reasoning as FacilityCard's imageUrl.
 */
export const floorPlanRowSchema = z.object({
  id: optionalText(40),
  key: z.string().trim().min(1).max(80),
  floorName: z.string().trim().min(1, "Floor name is required").max(80),
  imageUrl: z.string().trim().min(1, "Image is required").max(600),
});

export type FloorPlanRowInput = z.infer<typeof floorPlanRowSchema>;

// ─────────────────────────────────────────────────────────────────────────
// PROJECT UNITS (individual plots — drives the Interactive Master Plan)
// ─────────────────────────────────────────────────────────────────────────

export const projectUnitSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  unitTypeId: optionalText(40),
  unitNumber: z.string().trim().min(1, "Unit number is required").max(20),
  status: z.enum(UNIT_STATUSES),
  landAreaSqm: optionalNumber(0, 99_999),
  adminNotes: optionalText(2000),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),

  // Plot facts added with the Units & Site Plan page — free text for
  // facing/view because the Sale Kits write them as prose, see the field
  // comments on ProjectUnit in schema.prisma.
  facing: optionalText(60),
  viewLabel: optionalText(60),
  priceTHB: optionalNumber(0, 9_999_999_999),
  /** Null means "this project isn't sold in phases", not "phase 0". */
  phase: optionalNumber(1, 99),
  /** A checkbox: absent from FormData when unticked. */
  releasedForSale: z.coerce.boolean(),
});

export type ProjectUnitInput = z.infer<typeof projectUnitSchema>;

/**
 * One month's construction update, as the Progress.dc.html editor sends
 * it. Separate from projectProgressSchema, which validates the older
 * month/images/video form against the same row.
 */
export const progressDetailSchema = z.object({
  id: z.string().max(40).optional(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  // Null is "not recorded this month", which is different from 0%.
  percentComplete: z.coerce.number().int().min(0).max(100).nullable(),
  /* partialRecord, not record: a progress entry is written in one language
     and translated later, so most of these arrive with only `en` filled in.
     zod 4 made an enum-keyed z.record exhaustive — it would now demand all
     four locales and reject every real submission. */
  summaries: z.partialRecord(z.enum(locales), z.string().max(4000)),
  images: z.array(z.string().max(600)).max(40),
});

/** Bulk status-only update — used by the Master Plan status table. */
export const unitStatusPatchSchema = z.object({
  status: z.enum(UNIT_STATUSES),
});

export type UnitStatusPatchInput = z.infer<typeof unitStatusPatchSchema>;

/** One polygon vertex, as a percentage (0-100) of the master plan image's
 *  width/height — see the field comment on ProjectUnit.shapePoints in
 *  schema.prisma for why percentages rather than pixels. */
const shapePointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

/**
 * Submitted by the site-plan drawing tool
 * (components/admin/SitePlanDrawer.tsx) as a single hidden-input JSON
 * string, the same pattern as Project.specialFeatures above — the point
 * count is variable and FormData has no native array support. Unlike
 * specialFeaturesJson, a malformed or too-short shape here always fails
 * loudly: there is no "empty is fine" case, since submitting a shape at
 * all means the admin clicked "Close Shape" on a real polygon.
 */
export const unitShapeSchema = z.object({
  unitId: z.string().min(1, "Select a unit"),
  shapePoints: z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid shape data" });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(shapePointSchema)
        .min(3, "A shape needs at least 3 points")
        .max(50, "Too many points"),
    ),
});

export type UnitShapeInput = z.infer<typeof unitShapeSchema>;

// ─────────────────────────────────────────────────────────────────────────
// NEARBY ATTRACTIONS — removed. Used to be an admin-editable "shared
// default, project-overridable" feature (NearbyAttractionCategory/Item);
// the per-project override was never used in practice and the shared
// default was silently pointless to edit (prisma/seed.ts recreated it
// every seed run), so the whole admin surface was removed by client
// request. The data is now code-owned — see content/nearby-attractions.ts.
// The dead ProjectAttraction model these once superseded (and its
// projectAttractionSchema) was already unused before this removal — left
// in schema.prisma per its own comment as "a separate decision."
// ─────────────────────────────────────────────────────────────────────────
// COMPANY PROFILE — singleton "About Us" text shared by every project
// ─────────────────────────────────────────────────────────────────────────

export const companyProfileSchema = z.object({
  locale: editingLocaleSchema,
  aboutUs: z.string().trim().min(10, "About Us text is required").max(8000),
  // About page Story section — translated alongside aboutUs, same `lang`
  // tab. See storyEyebrow/storyTitle on CompanyProfileTranslation.
  storyEyebrow: z.string().trim().min(1, "Eyebrow is required").max(120),
  storyTitle: z.string().trim().min(1, "Title is required").max(200),
  // Story section photo. Not translated — one photo per locale would be
  // a odd asymmetry when every other image on this site is locale-blind.
  storyImageUrl: z.string().trim().min(1, "A photo is required").max(600),
  // The About page header's hero photo — same reasoning as storyImageUrl.
  aboutHeroImageUrl: z.string().trim().min(1, "A photo is required").max(600),
  /*
    The year the company was founded — the one figure in the home page's
    Vision & Mission block that cannot be counted from anything else on
    the site. Blank is allowed and means "not set": the tile is left out
    rather than showing a year nobody chose.

    The four free-text figures that used to live here (team members,
    client feedback, awards, projects complete) are gone. Three of them
    are now counted from the content they name — see lib/company-stats.ts
    — and the fourth was this. A field whose value nothing reads is worse
    than no field: somebody edits "10+ awards" and the page does not
    change, with nothing on screen to say why.
  */
  foundedYear: z
    .string()
    .trim()
    .max(4)
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 1900 && value <= 2100),
      { message: "Enter a four-digit year" },
    ),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

// ─────────────────────────────────────────────────────────────────────────
// SectionIcon — the icon picker shared by WhyUsPoint and MissionPrinciple
// below. Kept as its own exported list (not just referenced off the Prisma
// enum) so the admin form's <select> options and this schema's validation
// are built from the same literal array, the way heroStoryMediaTypes
// already does for HeroStorySlide's mediaType.
// ─────────────────────────────────────────────────────────────────────────

export const sectionIcons = [
  "MOUNTAIN",
  "SHIELD_CHECK",
  "HARD_HAT",
  "HAND_HEART",
  "EYE",
  "HEART_HANDSHAKE",
] as const;

// ─────────────────────────────────────────────────────────────────────────
// HOME PAGE GALLERY — "Who we are" photo strip (see HomeGalleryPhoto in
// schema.prisma). No `locale` field: `label` is a proper noun, same
// reasoning as milestoneSchema's `projectName`.
// ─────────────────────────────────────────────────────────────────────────

export const homeGalleryPhotoSchema = z.object({
  imageUrl: z.string().trim().min(1, "A photo is required").max(600),
  label: z.string().trim().min(1, "Label is required").max(120),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type HomeGalleryPhotoInput = z.infer<typeof homeGalleryPhotoSchema>;

// ─────────────────────────────────────────────────────────────────────────
// CORPORATE SERVICES — 2×2 photo tile grid on the home page (see
// CorporateService in schema.prisma)
// ─────────────────────────────────────────────────────────────────────────

export const corporateServiceSchema = z.object({
  locale: editingLocaleSchema,
  label: z.string().trim().min(1, "Label is required").max(80),
  imageAlt: z.string().trim().min(1, "Alt text is required").max(200),
  imageUrl: z.string().trim().min(1, "A photo is required").max(600),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type CorporateServiceInput = z.infer<typeof corporateServiceSchema>;

// ─────────────────────────────────────────────────────────────────────────
// CLOSING CTA — the band above the footer (see SiteCtaBlock in
// schema.prisma, lib/site-cta.ts for how it is read)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the CtaLinkKind enum in schema.prisma. Written out here rather
 * than imported from @prisma/client because this module is bundled into
 * client components — same reason lib/settings.ts is imported type-only at
 * the top of this file. tests/site-cta.test.ts fails if the two drift.
 */
export const CTA_LINK_KINDS = ["PAGE", "URL", "WHATSAPP", "PHONE", "NONE"] as const;

export type CtaLinkKindValue = (typeof CTA_LINK_KINDS)[number];

/**
 * The two answers the page-assignment select offers besides naming a
 * block. Sentinels rather than an empty value because "" is what a select
 * submits when something has gone wrong, and the two cases want different
 * treatment: PLACEMENT_DEFAULT deletes the row, PLACEMENT_HIDDEN writes
 * one with no block.
 *
 * Here rather than beside the action that reads them: a "use server"
 * module may only export async functions, and the client form needs these
 * strings too.
 */
export const PLACEMENT_DEFAULT = "__default__";
export const PLACEMENT_HIDDEN = "__hidden__";

/** Kinds that need the href column filled in; the rest build their target
 *  from Settings → contact, or render no button at all. */
const KINDS_NEEDING_HREF: readonly string[] = ["PAGE", "URL"];

/**
 * Why an editor's headline cannot be saved, or null when it can.
 *
 * The CTA's title and subtitle are ICU messages so a sentence can count
 * the published developments — "{count, plural, =3 {all three} other
 * {all #}}" — instead of saying three until somebody remembers to edit it.
 * That power is why this check exists: unbalanced braces or a placeholder
 * the renderer cannot supply would otherwise be discovered by visitors, on
 * every page, at once.
 *
 * Formats against a sample count rather than only parsing, because the two
 * failures look different to next-intl: bad syntax is INVALID_MESSAGE at
 * parse, an unknown {name} is FORMATTING_ERROR at format, and both are
 * equally broken on the page.
 */
export function ctaMessageError(value: string): string | null {
  if (!value.includes("{")) return null;

  let code: string | null = null;

  const format = createTranslator({
    locale: "en",
    messages: { value },
    onError: (error: { code?: string }) => {
      code = error?.code ?? "INVALID_MESSAGE";
    },
    getMessageFallback: () => "",
  });

  // Two counts: a plural message can be well-formed for one and not the
  // other, and "other" is the branch every locale is required to have.
  format("value", { count: 1 });
  format("value", { count: 3 });

  if (!code) return null;

  return code === "FORMATTING_ERROR"
    ? "Only {count} can be used here"
    : "Check the { } braces — this is not a valid message";
}

const ctaText = (max: number) => z.string().trim().max(max);

export const siteCtaBlockSchema = z
  .object({
    locale: editingLocaleSchema,

    name: z.string().trim().min(1, "A name is required").max(80),
    isActive: z.coerce.boolean(),
    isDefault: z.coerce.boolean(),
    sortOrder: z.coerce.number().int().min(-9999).max(9999),

    backgroundImageUrl: ctaText(600),

    primaryKind: z.enum(CTA_LINK_KINDS),
    primaryHref: ctaText(600),
    secondaryKind: z.enum(CTA_LINK_KINDS),
    secondaryHref: ctaText(600),

    eyebrow: ctaText(80),
    title: z
      .string()
      .trim()
      .min(1, "A headline is required")
      .max(300)
      .refine((value) => ctaMessageError(value) === null, {
        message: "Check the { } braces — this is not a valid message",
      }),
    subtitle: ctaText(600).refine((value) => ctaMessageError(value) === null, {
      message: "Check the { } braces — this is not a valid message",
    }),
    primaryLabel: ctaText(60),
    secondaryLabel: ctaText(60),
  })
  .superRefine((data, ctx) => {
    /* A button whose kind needs a target and has none would render as a
       link to nowhere. Refusing the save is the only place this can be
       caught: at render time the choice is between a dead button and a
       silently missing one, and both look like a bug in the site. */
    for (const side of ["primary", "secondary"] as const) {
      const kind = data[`${side}Kind`];
      const href = data[`${side}Href`];

      if (KINDS_NEEDING_HREF.includes(kind) && href.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [`${side}Href`],
          message: "This link needs a destination",
        });
        continue;
      }

      if (kind === "PAGE" && href.length > 0 && !href.startsWith("/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [`${side}Href`],
          message: "A page on this site starts with / — leave the language out",
        });
      }

      if (kind === "URL" && href.length > 0 && !/^https?:\/\//i.test(href)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [`${side}Href`],
          message: "An external link starts with http:// or https://",
        });
      }

      // A button with a target but no words is a blank rectangle.
      if (kind !== "NONE" && data[`${side}Label`].length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [`${side}Label`],
          message: "This button needs a label",
        });
      }
    }
  });

export type SiteCtaBlockInput = z.infer<typeof siteCtaBlockSchema>;

// ─────────────────────────────────────────────────────────────────────────
// WHY US — 4-card section on the home page (see WhyUsPoint in
// schema.prisma)
// ─────────────────────────────────────────────────────────────────────────

export const whyUsPointSchema = z.object({
  locale: editingLocaleSchema,
  icon: z.enum(sectionIcons),
  title: z.string().trim().min(1, "Title is required").max(160),
  body: z.string().trim().min(1, "Body is required").max(600),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type WhyUsPointInput = z.infer<typeof whyUsPointSchema>;

// ─────────────────────────────────────────────────────────────────────────
// MISSION PRINCIPLES — 3-card "how we work" section on the About page (see
// MissionPrinciple in schema.prisma)
// ─────────────────────────────────────────────────────────────────────────

export const missionPrincipleSchema = z.object({
  locale: editingLocaleSchema,
  icon: z.enum(sectionIcons),
  title: z.string().trim().min(1, "Title is required").max(160),
  body: z.string().trim().min(1, "Body is required").max(600),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type MissionPrincipleInput = z.infer<typeof missionPrincipleSchema>;

// ─────────────────────────────────────────────────────────────────────────
// SALES TEAM — "Our Sales" section (shown only on /about and /contact)
// ─────────────────────────────────────────────────────────────────────────

/** Same shape as leadInquirySchema's phone field — digits, spaces, +, (), -
 *  accepted here; stripped down to bare digits when building wa.me / tel:
 *  links (see lib/sales-team.ts and components/SalesTeamSection.tsx). */
const phoneLike = (label: string) =>
  z
    .string()
    .trim()
    .min(8, `Enter a valid ${label}`)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, `Enter a valid ${label}`);

export const salesPersonSchema = z.object({
  locale: editingLocaleSchema,
  name: z.string().trim().min(2, "Name is required").max(160),
  position: z.string().trim().min(2, "Position is required").max(160),
  whatsappNumber: phoneLike("WhatsApp number"),
  // Separate from whatsappNumber — a sales person can carry a direct line
  // that isn't on WhatsApp. See the field comment on SalesPerson in
  // schema.prisma for why these aren't collapsed into one column.
  phoneNumber: phoneLike("phone number"),
  // No source in the Sale Kit / team roster has ever supplied an email for
  // any of the three people seeded so far, hence optional rather than
  // required like the two phone fields.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(180)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  photoUrl: optionalText(600),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type SalesPersonInput = z.infer<typeof salesPersonSchema>;

// ─────────────────────────────────────────────────────────────────────────
// AWARDS — "Awards" section (home page)
// ─────────────────────────────────────────────────────────────────────────

export const awardSchema = z.object({
  locale: editingLocaleSchema,
  title: z.string().trim().min(2, "Title is required").max(200),
  // Awarding body — not bilingual, an organization's name isn't translated.
  organization: z.string().trim().min(2, "Organization is required").max(160),
  // Null for company-level awards not tied to any one development.
  projectName: optionalText(200),
  year: z.coerce.number().int().min(1990).max(2100),
  trophyImageUrl: optionalText(600),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type AwardInput = z.infer<typeof awardSchema>;

// ─────────────────────────────────────────────────────────────────────────
// MILESTONES — the "How we got here" photo timeline on the About page
// (see Milestone in schema.prisma). No `locale` field: projectName and
// brand are proper nouns, same as Award's organization/projectName.
// ─────────────────────────────────────────────────────────────────────────

export const milestoneSchema = z.object({
  year: z.coerce.number().int().min(1990).max(2100),
  projectName: z.string().trim().min(1, "Project name is required").max(160),
  brand: optionalText(160),
  imageUrl: optionalText(600),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type MilestoneInput = z.infer<typeof milestoneSchema>;

// ─────────────────────────────────────────────────────────────────────────
// PROJECT FACILITIES — full-bleed photo cards, per project (see
// ProjectFacility in schema.prisma)
// ─────────────────────────────────────────────────────────────────────────

export const projectFacilitySchema = z.object({
  locale: editingLocaleSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
  imageUrl: optionalText(600),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type ProjectFacilityInput = z.infer<typeof projectFacilitySchema>;

// ─────────────────────────────────────────────────────────────────────────
// HERO STORY BANNER — homepage IG-Stories-style hero (see HeroStorySlide in
// schema.prisma)
// ─────────────────────────────────────────────────────────────────────────

// heroStoryMediaTypes now lives up near projectSchema — projectSchema's
// heroMediaType field needs it too, and this file's declarations run
// top-to-bottom. See the comment there.

export const heroStorySlideSchema = z.object({
  locale: editingLocaleSchema,
  mediaType: z.enum(heroStoryMediaTypes),
  mediaUrl: z.string().trim().min(1, "A photo or video is required").max(600),
  // Video-loading thumbnail. Not required even for a VIDEO slide — the
  // browser's own poster-less first frame is an acceptable fallback, and
  // making this required would block publishing a slide before a
  // thumbnail is ready.
  posterImageUrl: optionalText(600),
  // IMAGE slides only — see the field comment on HeroStorySlide in
  // schema.prisma for why VIDEO slides ignore this and use the file's own
  // length instead. Still validated even when the form hides the field for
  // a VIDEO slide, since the column has a NOT NULL default of 5.
  durationSeconds: z.coerce.number().int().min(1, "Enter at least 1 second").max(60),
  // Not translated — a URL doesn't have a language.
  ctaUrl: optionalText(600),
  // Names the development on screen — see HeroStorySlideTranslation.label.
  label: optionalText(120),
  // Both optional: a slide can be a pure mood shot with no overlay copy.
  caption: optionalText(300),
  // Short line under the headline — same field/limit as Project.tagline.
  tagline: optionalText(300),
  ctaLabel: optionalText(60),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
  // Optional on-air window (see HeroStorySlide.startAt/endAt in
  // schema.prisma). Either end left blank means that side is open-ended;
  // read-time queries treat a null bound as "no restriction" on that side.
  startAt: optionalDateTime,
  endAt: optionalDateTime,
})
  .refine(
    (value) => value.startAt === null || value.endAt === null || value.endAt > value.startAt,
    { message: "End must be after start", path: ["endAt"] },
  );

export type HeroStorySlideInput = z.infer<typeof heroStorySlideSchema>;

// ─────────────────────────────────────────────────────────────────────────
// E-BROCHURES — the PDF flipbook at /e-brochure/<slug>
// ─────────────────────────────────────────────────────────────────────────

export const eBrochureSchema = z.object({
  locale: editingLocaleSchema,

  // Same rule and limit as newsArticleSchema — a URL slug of the same class.
  slug: z
    .string()
    .trim()
    .min(2, "Slug is too short")
    .max(140)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens",
    ),

  title: z.string().trim().min(2, "Title is required").max(200),
  description: optionalText(600),

  /*
    Required, unlike every other URL field in this file. A brochure with no
    PDF is not a draft of anything — the viewer has nothing to open and the
    index card links to a blank page. Publishing is gated separately by
    isPublished; this is about the record being coherent at all.
  */
  fileUrl: z.string().trim().min(1, "A PDF file is required").max(600),

  // Optional: the index falls back to an icon tile, same as a missing
  // trophy photo on an award.
  coverImageUrl: optionalText(600),

  // Null for a corporate brochure that belongs to no development.
  projectId: optionalText(40),

  isPublished: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type EBrochureInput = z.infer<typeof eBrochureSchema>;

// ─────────────────────────────────────────────────────────────────────────
// SITE SETTINGS — per-key shapes for the admin Settings page
// ─────────────────────────────────────────────────────────────────────────

/**
 * Per-key validation for lib/settings.ts's SETTING_KEYS.
 *
 * Here rather than beside the action that uses it: the action file is
 * `"use server"`, so every export in it becomes a callable server action
 * and nothing may import a plain const out of it — which meant these
 * shapes could not be unit-tested at all. They are the only thing between
 * an operator and a sitewide wrong `<title>`, so that mattered.
 */

/**
 * Google's Search Console verification token.
 *
 * It hands out an opaque token and asks you to paste it into an HTML tag,
 * so the most common mistake is pasting the whole
 * `<meta name="..." content="..." />` — which renders as a nested tag and
 * silently fails verification. Rejecting angle brackets and quotes is what
 * catches that, in the same spirit as the Pixel's "not the full script".
 */
const verificationToken = z
  .string()
  .refine(
    (value) => !/[<>"']/.test(value),
    "Paste only the code itself, not the whole <meta> tag",
  )
  .refine(
    (value) => /^[A-Za-z0-9._~+/=-]{8,128}$/.test(value),
    "That does not look like a verification code",
  );

/**
 * A brand asset: either a /public-relative path (the committed default) or
 * an absolute https URL (an admin upload).
 *
 * SVG is refused for the same reason lib/s3.ts refuses to accept one — it
 * is a script container, and one served from our own domain would be
 * same-origin with the site. Refusing it at upload and then accepting it
 * through the paste-a-URL box would be a door with no wall around it.
 *
 * Protocol-relative `//host/x.png` is refused rather than guessed at:
 * browsers treat it as absolute, our own resolver treats it as neither,
 * and the two disagreeing is how an og:image ends up pointing at a
 * stranger's server.
 */
const imageSetting = (extensions: RegExp, message: string) =>
  z
    .string()
    .refine((value) => !value.startsWith("//"), "Start with / or https://")
    .refine(
      (value) => (/^https:\/\//i.test(value) || value.startsWith("/")) && extensions.test(value),
      message,
    );

const RASTER_EXT = /\.(png|jpe?g|webp|avif)(\?.*)?$/i;
const ICON_EXT = /\.(png|ico)(\?.*)?$/i;

/** Decimal degrees within ±`limit`. Stored as a string, like every other
 *  setting — the value is parsed back to a number in lib/settings.ts. */
const coordinateSetting = (limit: number, name: string) =>
  z
    .string()
    .refine(
      (value) => /^-?\d{1,3}(\.\d+)?$/.test(value.trim()),
      `Enter decimal degrees, e.g. 7.999478 (a full stop, not a comma)`,
    )
    .refine((value) => Math.abs(Number(value)) <= limit, `A ${name} is between -${limit} and ${limit}`);

/**
 * Meta title and description are capped, but nowhere near Google's
 * display limits.
 *
 * Google truncates a title on pixel width — roughly 580px — not on
 * character count. Sixty Chinese characters are about double that budget;
 * sixty Thai characters are comfortably under it. A 60-character cap would
 * encode an English-typography assumption into a field that has to hold
 * four scripts, and would block copy an agency supplied. The caps below
 * are abuse ceilings; the recommended lengths are advice the form renders
 * as a counter, and a title over them is truncated in the SERP rather than
 * rejected here.
 */
export const META_TITLE_MAX = 120;
export const META_DESCRIPTION_MAX = 320;

export const SETTING_VALIDATORS: Partial<Record<SettingKey, z.ZodType<string>>> = {
  "contact.phone": z
    .string()
    .regex(/^[0-9+()\-\s]{6,20}$/, "Enter a valid phone number"),
  "contact.whatsapp": z.string().regex(/^[0-9+]{6,20}$/, "Digits and + only"),
  "contact.email": z.string().email("Enter a valid email address"),
  "contact.salesEmail": z.string().email("Enter a valid email address"),
  "contact.mapUrl": z.string().url("Enter a full https:// URL"),

  /*
    The office pin.

    Decimal degrees only, and rejected rather than coerced: Google Maps
    also hands out "7°59'58.1"N" if you copy the wrong line out of the
    place card, and Number() turns that into NaN, which would store a
    coordinate the map then silently cannot use. A comma decimal separator
    ("7,999478" — the default on a Thai or Russian keyboard layout) fails
    the same way, hence the explicit mention.
  */
  "contact.latitude": coordinateSetting(90, "latitude"),
  "contact.longitude": coordinateSetting(180, "longitude"),

  "social.facebook": z.string().url("Enter a full https:// URL"),
  "social.instagram": z.string().url("Enter a full https:// URL"),
  "social.youtube": z.string().url("Enter a full https:// URL"),

  // Facebook Events Manager gives out a plain numeric ID — a pasted-in
  // <script> tag or share URL is the most common mistake, so this catches
  // it before the pixel silently fails to load.
  "analytics.metaPixelId": z
    .string()
    .regex(/^\d{6,20}$/, "Enter just the numeric Pixel ID, not the full script"),

  /*
    GA4 measurement IDs start with G-. The two wrong products people reach
    for get their own messages, because "invalid" tells someone holding a
    UA- or GTM- id nothing about which of the three Google analytics
    properties they are looking at.
  */
  "analytics.gaMeasurementId": z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine(
      (value) => !value.startsWith("UA-"),
      "That is a Universal Analytics ID — GA4 measurement IDs start with G-",
    )
    .refine(
      (value) => !value.startsWith("GTM-"),
      "That is a Tag Manager container ID, not a GA4 measurement ID",
    )
    .refine(
      (value) => /^G-[A-Z0-9]{4,15}$/.test(value),
      "Enter the GA4 measurement ID, e.g. G-ABCD123456",
    ),

  // Google's token had no shape check at all before — only the action's
  // 500-character cap.
  "analytics.googleSiteVerification": verificationToken,

  "branding.faviconUrl": imageSetting(
    ICON_EXT,
    "Upload a PNG, or paste an https:// link ending in .png or .ico",
  ),
  "branding.logoUrl": imageSetting(
    RASTER_EXT,
    "Upload an image, or paste an https:// link ending in .png, .jpg, .webp or .avif",
  ),
  "branding.ogImageUrl": imageSetting(
    RASTER_EXT,
    "Upload an image, or paste an https:// link ending in .png, .jpg, .webp or .avif",
  ),

  /*
    The highest-value check here. `%s` is where Next substitutes the page's
    own title; a template without it silently replaces every child page's
    title with one constant string, and Next raises no error — the site
    just quietly ships 50 identical <title> tags.
  */
  "seo.titleTemplate": z
    .string()
    .max(80)
    .refine(
      (value) => value.includes("%s"),
      "Must contain %s — that is where the page name goes",
    ),

  "seo.twitterHandle": z
    .string()
    .transform((value) => (value.startsWith("@") ? value : `@${value}`))
    .refine(
      (value) => /^@[A-Za-z0-9_]{1,15}$/.test(value),
      "Letters, numbers and underscores, up to 15 characters",
    ),

  "seo.metaTitleTh": z.string().max(META_TITLE_MAX),
  "seo.metaTitleEn": z.string().max(META_TITLE_MAX),
  "seo.metaTitleZh": z.string().max(META_TITLE_MAX),
  "seo.metaTitleRu": z.string().max(META_TITLE_MAX),

  "seo.metaDescriptionTh": z.string().max(META_DESCRIPTION_MAX),
  "seo.metaDescriptionEn": z.string().max(META_DESCRIPTION_MAX),
  "seo.metaDescriptionZh": z.string().max(META_DESCRIPTION_MAX),
  "seo.metaDescriptionRu": z.string().max(META_DESCRIPTION_MAX),
};
