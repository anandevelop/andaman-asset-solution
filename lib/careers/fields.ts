/**
 * lib/careers/fields.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The shape of a job application, shared by the public form, the endpoint
 * that receives it and the back office that reads it. No server imports:
 * the form runs in the browser.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";

export const EDUCATION_LEVELS = [
  "doctorate",
  "master",
  "bachelor",
  "high_vocational",
  "vocational",
  "secondary",
  "other",
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const APPLICATION_STATUSES = ["NEW", "REVIEWING", "INTERVIEW", "HIRED", "REJECTED"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Attachment limits. The copy that goes to the HR mailbox carries the
 * files, and a mail message has a ceiling: Gmail's is 25 MB after
 * encoding, and base64 adds a third. Three files of 5 MB are 15 MB raw,
 * about 20 MB on the wire — under it, with room for the message itself.
 * Raise either number only with that sum in hand.
 */
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Content type → extension. The whole list of what an applicant may attach. */
export const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
};
export const FILE_ACCEPT = Object.keys(FILE_TYPES).join(",");

/**
 * The version of the applicant notice a person agreed to, stored on their
 * application. Change it whenever the notice's meaning changes (what is
 * collected, why, who sees it, how long it is kept), so an application
 * always says which text its consent was given under.
 */
export const CAREERS_CONSENT_VERSION = "applicant-notice-v1";

/** How long an application is kept when nobody has chosen otherwise. */
export const DEFAULT_RETENTION_MONTHS = 12;
export const RETENTION_CHOICES = [3, 6, 12, 24, 36] as const;

export const SALARY_MAX = 10_000_000;

/** Digits of a phone number as typed: "081 234 5678", "+66 81-234-5678". */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export const applicationSchema = z.object({
  positionId: z.string().trim().min(1, "REQUIRED").max(64),
  firstName: z.string().trim().min(1, "REQUIRED").max(80),
  lastName: z.string().trim().min(1, "REQUIRED").max(80),
  email: z.string().trim().toLowerCase().min(1, "REQUIRED").max(160).email("EMAIL_INVALID"),
  phone: z
    .string()
    .trim()
    .min(1, "REQUIRED")
    .max(24)
    .regex(/^\+?[\d\s().-]+$/, "PHONE_INVALID")
    .refine((value) => {
      const digits = phoneDigits(value).length;
      return digits >= 9 && digits <= 15;
    }, "PHONE_INVALID"),
  education: z.enum(EDUCATION_LEVELS, "REQUIRED"),
  // Arrives as the text of an input. An empty one must say "required",
  // which z.coerce alone would not: Number("") is 0, a valid salary.
  expectedSalary: z
    .union([z.number(), z.string().trim().min(1, "REQUIRED").regex(/^\d+$/, "SALARY_INVALID")], "REQUIRED")
    .transform(Number)
    .pipe(z.number("SALARY_INVALID").int("SALARY_INVALID").min(0, "SALARY_INVALID").max(SALARY_MAX, "SALARY_INVALID")),
  locale: z.string().trim().min(2).max(5),
  // Literal true: there is no application without the consent.
  consent: z.literal(true, "CONSENT_REQUIRED"),
  /** Upload tokens from /api/careers/upload, one per attached file. */
  files: z.array(z.string().max(1200)).max(MAX_FILES, "TOO_MANY_FILES").default([]),
  /** Honeypot: a field people never see. Filled means a bot. */
  company: z.string().max(200).optional(),
  recaptchaToken: z.string().max(4000).optional(),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** The day an application received now is to be deleted. */
export function purgeDate(from: Date, months: number): Date {
  const date = new Date(from);
  date.setMonth(date.getMonth() + months);
  return date;
}
