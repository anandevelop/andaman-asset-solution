/**
 * lib/careers/notify.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Telling HR an application has arrived: a copy by email with the files
 * attached, and a short notice in the HR LINE chat.
 *
 * The two say different amounts on purpose. The mailbox is HR's own and
 * gets everything. A LINE group is a chat with other people's phones in
 * it, so it gets the position and the applicant's name and a button into
 * the back office — not the phone number, the salary or the CV.
 *
 * Never throws: the application is already saved by the time this runs.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { sendJobApplicationEmail } from "@/lib/email";
import { pushLineAlert } from "@/lib/line";
import { getCareersConfig } from "@/lib/careers/config";
import { readApplicantFile } from "@/lib/careers/files";

/** Education levels as HR reads them. The public form has its own, per language. */
export const EDUCATION_TH: Record<string, string> = {
  doctorate: "ปริญญาเอก",
  master: "ปริญญาโท",
  bachelor: "ปริญญาตรี",
  high_vocational: "ปวส.",
  vocational: "ปวช.",
  secondary: "มัธยมศึกษา",
  other: "อื่น ๆ",
};

export function adminApplicationUrl(id: string): string | null {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/th/admin/careers?open=${encodeURIComponent(id)}`;
}

export async function notifyNewApplication(id: string): Promise<void> {
  try {
    const application = await prisma.jobApplication.findUnique({ where: { id }, include: { files: true } });
    if (!application) return;

    const url = adminApplicationUrl(id);
    const name = `${application.firstName} ${application.lastName}`;

    // LINE first: it is quick, and must not wait behind three attachments.
    // Its own catch: a LINE failure must not cost HR the email as well.
    await pushLineAlert({
      kind: "hr",
      title: "ใบสมัครงานใหม่",
      rows: [
        ["ตำแหน่ง", application.positionTitle],
        ["ผู้สมัคร", name],
        ["เอกสารแนบ", application.files.length ? `${application.files.length} ไฟล์` : "ไม่มี"],
      ],
      url: url ?? "",
      urlLabel: "เปิดใบสมัคร",
    }).catch((error) => console.error("[careers] LINE notice to HR failed", error));

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    let missingFiles = 0;
    for (const file of application.files) {
      try {
        attachments.push({ filename: file.name, content: await readApplicantFile(file.key), contentType: file.contentType });
      } catch (error) {
        missingFiles += 1;
        console.error("[careers] could not read an attachment back for the HR email", error);
      }
    }

    const { notifyEmail } = await getCareersConfig();
    const sent = await sendJobApplicationEmail({
      to: notifyEmail,
      application: {
        positionTitle: application.positionTitle,
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
        education: EDUCATION_TH[application.education] ?? application.education,
        expectedSalary: application.expectedSalary,
        submittedAt: application.createdAt,
      },
      attachments,
      missingFiles,
      adminUrl: url,
    });

    await prisma.jobApplication.update({
      where: { id },
      data: sent.ok ? { emailSentAt: new Date(), emailError: null } : { emailError: sent.error },
    });
  } catch (error) {
    console.error("[careers] notifying HR failed", error);
  }
}
