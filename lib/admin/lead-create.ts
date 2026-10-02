/**
 * lib/admin/lead-create.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rules for a lead a rep enters by hand — "+ เพิ่มลีด" on the leads page
 * (createLead in app/[locale]/admin/(crm)/leads/actions.ts).
 *
 * Until round two of the v4 review, leads only ever arrived through the
 * public form or an event registration. Sales asked to record the ones
 * that do not — a phone call, a walk-in at the show house, a LINE chat —
 * so they stop living in a notebook. What that changes, and what it must
 * not:
 *
 *  · THE PHONE NUMBER is held to the public form's standard: one E.164
 *    number for a chosen country (lib/countries.ts, the same helpers
 *    LeadForm.tsx uses), so masking, WhatsApp and search treat a hand-
 *    entered lead exactly like a captured one. A rep who types "081…" with
 *    Thailand selected gets "+6681…"; one who types "+7…" gets Russia.
 *
 *  · CONSENT is not invented. The rep must confirm the customer agreed to
 *    their contact details being kept and used; without that box the lead
 *    is refused, the same as a public form submitted without it. What is
 *    recorded is that confirmation, when it was given and the policy
 *    version in force — and the timeline names the rep who gave it.
 *
 *  · EMAIL is optional: a walk-in may not have given one. It is stored as
 *    an empty string (the column is NOT NULL), and every reader treats ""
 *    as "none".
 *
 * Pure, so it is tested without a database or a session.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import { detectFromInternational, isKnownIso2, isValidPhoneForCountry, toE164 } from "@/lib/countries";
import { LEAD_SOURCES } from "@/lib/validations";

export const COMMS_LANGUAGES = ["th", "en", "zh", "ru"] as const;

const schema = z.object({
  name: z.string().trim().min(2, "NAME").max(120, "NAME"),
  phone: z.string().trim().min(4, "PHONE").max(40, "PHONE"),
  phoneCountry: z.string().trim().length(2, "PHONE").refine(isKnownIso2, "PHONE"),
  email: z.union([z.literal(""), z.string().trim().email("EMAIL").max(180, "EMAIL")]),
  projectId: z.string().trim().max(40).optional(),
  source: z.enum(LEAD_SOURCES).catch("OTHER"),
  commsLanguage: z.union([z.literal(""), z.enum(COMMS_LANGUAGES)]).catch(""),
  message: z.string().trim().max(2000, "MESSAGE"),
  assignedToId: z.string().trim().max(40),
  consent: z.literal("on", { error: "CONSENT" }),
});

export type AdminLeadInput = {
  name: string;
  /** E.164. */
  phone: string;
  phoneCountry: string;
  /** "" when none was given. */
  email: string;
  projectId: string | null;
  source: (typeof LEAD_SOURCES)[number];
  commsLanguage: (typeof COMMS_LANGUAGES)[number] | null;
  message: string | null;
  /** null = unassigned; the action decides who may set what. */
  assignedToId: string | null;
};

/** Field → error code, for the form to translate. */
export type AdminLeadErrors = Partial<Record<"name" | "phone" | "email" | "message" | "consent", string>>;

export function parseAdminLead(
  raw: Record<string, FormDataEntryValue | null | undefined>,
): { ok: true; data: AdminLeadInput } | { ok: false; errors: AdminLeadErrors } {
  const text = (key: string) => {
    const value = raw[key];
    return typeof value === "string" ? value : "";
  };

  const parsed = schema.safeParse({
    name: text("name"),
    phone: text("phone"),
    phoneCountry: text("phoneCountry").toUpperCase(),
    email: text("email").trim(),
    projectId: text("projectId") || undefined,
    source: text("source") || "OTHER",
    commsLanguage: text("commsLanguage"),
    message: text("message"),
    assignedToId: text("assignedToId"),
    consent: raw.consent ?? undefined,
  });

  if (!parsed.success) {
    const errors: AdminLeadErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "phoneCountry" ? "phone" : issue.path[0];
      if (field === "name" || field === "phone" || field === "email" || field === "message" || field === "consent") {
        errors[field] ??= field.toUpperCase();
      }
    }
    return { ok: false, errors };
  }

  // A number typed with its own "+…"/"00…" wins over the selected country,
  // exactly as on the public form.
  const detected = detectFromInternational(parsed.data.phone);
  const phoneCountry = detected?.iso2 ?? parsed.data.phoneCountry;
  const phone = detected?.e164 ?? toE164(parsed.data.phone, phoneCountry);
  if (!phone || !isValidPhoneForCountry(phone, phoneCountry)) return { ok: false, errors: { phone: "PHONE" } };

  return {
    ok: true,
    data: {
      name: parsed.data.name,
      phone,
      phoneCountry,
      email: parsed.data.email.toLowerCase(),
      projectId: parsed.data.projectId ?? null,
      source: parsed.data.source,
      commsLanguage: parsed.data.commsLanguage || null,
      message: parsed.data.message || null,
      assignedToId: parsed.data.assignedToId || null,
    },
  };
}
