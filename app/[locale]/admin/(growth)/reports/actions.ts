"use server";

/**
 * app/[locale]/admin/(growth)/reports/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Editing the month's note, switching an alert rule, and sending a test.
 *
 * Every action calls the guard itself. The (growth) layout already requires
 * ADMIN, but a layout is a routing concern and a server action can be
 * invoked directly with no layout ever having rendered — AGENTS.md is
 * explicit about this, and it is the difference between "the control is not
 * on screen" and "you cannot do it".
 *
 * SAVING A NOTE IS WHAT MAKES IT NOT A DRAFT
 *
 * updatedById is set here and nowhere else. It is the whole mechanism
 * behind the "automatic draft" label on a sent report: a note with no
 * editor is text the system wrote, and it goes out saying so. There is no
 * separate flag to fall out of step with it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role, type SeoAlertKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { setAlertRule } from "@/lib/seo/alerts";
import { ALERT_KINDS } from "@/lib/seo/alert-rules";
import { reportRecipients, sendReportEmail } from "@/lib/email";
import { getReportData } from "@/lib/reports/seo-report";
import { renderReportEmail } from "@/lib/reports/email-body";
import {
  AUDIENCES,
  draftNoteText,
  periodFromNoteKey,
} from "@/lib/reports/audience";

/** Long enough for a real paragraph, short enough that nobody pastes the
 *  whole report into it. */
const NOTE_MAX = 4000;

export type NoteResult =
  { ok: true } | { ok: false; error: "TOO_LONG" | "BAD_PERIOD" | "FAILED" };

export async function saveReportNote(
  locale: string,
  periodIso: string,
  audience: string,
  reportLocale: string,
  body: string,
): Promise<NoteResult> {
  const actor = await requireAdminAction(Role.ADMIN);

  if (body.length > NOTE_MAX) return { ok: false, error: "TOO_LONG" };

  // The period is a date the client round-trips back to us. Anything that
  // is not a real day would land in the unique key and quietly create a
  // second note for the same month.
  const period = new Date(periodIso);
  if (Number.isNaN(period.getTime())) return { ok: false, error: "BAD_PERIOD" };

  try {
    await prisma.reportNote.upsert({
      where: {
        period_audience_locale: { period, audience, locale: reportLocale },
      },
      create: {
        period,
        audience,
        locale: reportLocale,
        body,
        updatedById: actor.id,
      },
      update: { body, updatedById: actor.id },
    });

    await log(
      actor,
      "report_note_saved",
      `${periodIso}/${audience}/${reportLocale}`,
    );
    revalidatePath(`/${locale}/admin/reports`);

    return { ok: true };
  } catch (error) {
    console.error("[reports] failed to save note", error);
    return { ok: false, error: "FAILED" };
  }
}

export type RuleResult =
  { ok: true } | { ok: false; error: "UNKNOWN_RULE" | "FAILED" };

export async function toggleAlertRule(
  locale: string,
  kind: string,
  enabled: boolean,
): Promise<RuleResult> {
  const actor = await requireAdminAction(Role.ADMIN);

  if (!(ALERT_KINDS as string[]).includes(kind))
    return { ok: false, error: "UNKNOWN_RULE" };

  try {
    await setAlertRule(kind as SeoAlertKind, enabled);

    // Logged because switching an alert off is exactly the kind of change
    // nobody remembers making when the thing it watched for happens.
    await log(
      actor,
      enabled ? "seo_alert_enabled" : "seo_alert_disabled",
      kind,
    );
    revalidatePath(`/${locale}/admin/reports`);

    return { ok: true };
  } catch (error) {
    console.error("[reports] failed to toggle rule", error);
    return { ok: false, error: "FAILED" };
  }
}

export type TestEmailResult =
  { ok: true; recipientCount: number } | { ok: false; error: string };

/**
 * Send the current report to the configured addresses, now.
 *
 * Takes a selection, never markup. The obvious shape — the page renders
 * the report and hands the HTML to this action — is a server action that
 * mails arbitrary content to the company's executives under the company's
 * own From address; anybody who can reach the action can reach the
 * mailbox. The body is built from the database by
 * lib/reports/email-body.ts, so there is no argument that can become
 * content.
 *
 * Sends to the real recipients rather than to the person clicking: the
 * question this button answers is "will the monthly send arrive", and a
 * successful send to oneself proves only that one's own mailbox works.
 * The failure comes back verbatim, because an administrator is standing
 * there and "Invalid login" is something they can act on.
 */
export async function sendTestReport(
  locale: string,
  periodIso: string,
  audience: string,
  reportLocale: string,
): Promise<TestEmailResult> {
  const actor = await requireAdminAction(Role.ADMIN);

  if (!(AUDIENCES as readonly string[]).includes(audience)) {
    return { ok: false, error: "BAD_AUDIENCE" };
  }

  const period = new Date(periodIso);
  if (Number.isNaN(period.getTime())) return { ok: false, error: "BAD_PERIOD" };

  const data = await getReportData({
    period: periodFromNoteKey(period),
    locale: reportLocale,
    audience,
  });

  const draft = await draftNoteText(reportLocale, data);
  const { subject, html, text } = await renderReportEmail({
    data,
    locale: reportLocale,
    audience,
    noteBody: data.note.body.trim() === "" ? draft : data.note.body,
  });

  const to = reportRecipients();
  const result = await sendReportEmail({ to, subject, html, text });

  // Recorded like any other send, so the card's "last sent" line tells the
  // truth about tests as well as scheduled runs — a test that failed is
  // exactly the thing somebody needs to still see tomorrow.
  await prisma.reportSend
    .create({
      data: {
        period,
        audience,
        locale: reportLocale,
        ok: result.ok,
        error: result.ok ? null : result.error.slice(0, 500),
        recipientCount: result.ok ? result.recipientCount : 0,
      },
    })
    .catch((error) => console.error("[reports] failed to record send", error));

  await log(
    actor,
    "report_test_sent",
    result.ok ? `${to.length} recipients` : result.error,
  );
  revalidatePath(`/${locale}/admin/reports`);

  return result;
}

async function log(
  actor: { id: string; email: string; role: Role },
  action: string,
  detail: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email.slice(0, 200),
        actorRole: actor.role,
        action,
        model: "ReportNote",
        recordId: detail.slice(0, 200),
        recordLabel: detail.slice(0, 200),
        changedFields: [],
        changes: { detail },
      },
    });
  } catch (error) {
    // Never the reason an edit fails: the change is already written, and a
    // missing log line is not worth showing an error for.
    console.error("[reports] failed to write audit log", error);
  }
}
