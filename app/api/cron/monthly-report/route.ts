/**
 * app/api/cron/monthly-report/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/monthly-report — the report, emailed.
 *
 * Same shape as the other two jobs: guardCron first, POST only, JSON back
 * so whatever triggered it can log something more useful than "200".
 *
 * ALWAYS LAST MONTH
 *
 * Run on the 1st, "this month" is a few hours old and "last month" is the
 * month everybody means. The period is not a parameter: an endpoint whose
 * window can be set by its caller is an endpoint that eventually sends
 * September's numbers under August's heading because a scheduler was
 * misconfigured.
 *
 * AN UNEDITED NOTE STILL GOES OUT
 *
 * If nobody wrote the month's note, the drafted text is sent carrying the
 * "automatic draft" label — not silently as though a person wrote it, and
 * not suppressed. Suppressing it would mean the report stops arriving in
 * exactly the months nobody was paying attention, which is when it is
 * worth most.
 *
 * Nothing in the application calls this. A scheduler outside it must.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { prisma } from "@/lib/prisma";
import { reportRecipients, sendReportEmail } from "@/lib/email";
import { getReportData } from "@/lib/reports/seo-report";
import { renderReportEmail } from "@/lib/reports/email-body";
import { draftNoteText } from "@/lib/reports/audience";
import { lastMonth } from "@/lib/reports/period";
import { recordCronFailure } from "@/lib/seo/alerts";
import { defaultLocale } from "@/i18n";

/** Seconds. A month of leads and rollups is a handful of queries, but the
 *  SMTP round trip is somebody else's server. */
export const maxDuration = 120;

export const dynamic = "force-dynamic";

/** Who the scheduled send is written for. The other two audiences exist on
 *  screen; mailing all three unasked would be three emails a month nobody
 *  agreed to. */
const AUDIENCE = "executive";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const period = lastMonth();
  const locale = defaultLocale;

  try {
    const data = await getReportData({ period, locale, audience: AUDIENCE });

    const noteBody =
      data.note.body.trim() === ""
        ? await draftNoteText(locale, data)
        : data.note.body;

    const { subject, html, text } = await renderReportEmail({
      data,
      locale,
      audience: AUDIENCE,
      noteBody,
    });

    const to = reportRecipients();
    const result = await sendReportEmail({ to, subject, html, text });

    await prisma.reportSend.create({
      data: {
        period: period.noteKey,
        audience: AUDIENCE,
        locale,
        ok: result.ok,
        error: result.ok ? null : result.error.slice(0, 500),
        recipientCount: result.ok ? result.recipientCount : 0,
      },
    });

    if (!result.ok) {
      /*
        A 500 on purpose. "No recipients configured" and "the mail server
        refused us" are both states somebody has to fix, and a scheduler
        that sees 200 will never say so — the report simply stops arriving
        and nobody notices for a quarter.
      */
      await recordCronFailure("monthly report", new Error(result.error)).catch(
        () => {},
      );
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      period: period.noteKey.toISOString().slice(0, 10),
      recipientCount: result.recipientCount,
      noteWasDraft: data.note.isDraft,
    });
  } catch (error) {
    console.error("[cron/monthly-report] failed", error);
    await recordCronFailure("monthly report", error).catch(() => {});

    return NextResponse.json(
      { ok: false, error: "REPORT_FAILED" },
      { status: 500 },
    );
  }
}
