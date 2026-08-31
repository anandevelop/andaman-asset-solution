import { z } from "zod";
import { locales } from "@/i18n";

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

export const leadInquirySchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  email: z.string().trim().email("Enter a valid email address").max(180),
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, "Enter a valid phone number"),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: "Consent is required to submit this form" }),
  }),
  projectSlug: z.string().trim().max(120).optional(),
});

export type LeadInquiryInput = z.infer<typeof leadInquirySchema>;

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
  // Honeypot — must stay empty. Bots fill every field they can see.
  company: z.string().max(0).optional().or(z.literal("")),
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
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: "Consent is required to register" }),
  }),
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
  company: z.string().max(0).optional().or(z.literal("")),
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

  metaTitle: optionalText(200),
  metaDescription: optionalText(400),

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

export const ROLES = ["SUPER_ADMIN", "ADMIN", "EDITOR"] as const;

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

export const newsArticleSchema = z.object({
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

  coverImageUrl: optionalText(600),
  category: optionalText(80),
  tags: tagsToArray,

  metaTitle: optionalText(200),
  metaDescription: optionalText(400),

  isPublished: z.coerce.boolean(),
  publishedAt: optionalDateTime,
});

export type NewsArticleInput = z.infer<typeof newsArticleSchema>;

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

    capacity: optionalNumber(1, 100_000),
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
});

export type ProjectUnitInput = z.infer<typeof projectUnitSchema>;

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
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

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
  // Both optional: a slide can be a pure mood shot with no overlay copy.
  caption: optionalText(300),
  // Short line under the headline — same field/limit as Project.tagline.
  tagline: optionalText(300),
  ctaLabel: optionalText(60),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999),
});

export type HeroStorySlideInput = z.infer<typeof heroStorySlideSchema>;
