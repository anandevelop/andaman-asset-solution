/**
 * lib/careers/applications.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Job applications: receiving one, reading them in the back office, and
 * deleting them — on request, and when their time is up.
 *
 * Nothing here checks who is asking. Every caller is either the public
 * endpoint (which may only create) or sits behind the manageCareers
 * capability; see app/[locale]/admin/(company)/careers and
 * app/api/admin/careers.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { JobApplicationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTranslation } from "@/lib/get-translation";
import { getCareersConfig } from "@/lib/careers/config";
import { CAREERS_CONSENT_VERSION, purgeDate, type ApplicationInput } from "@/lib/careers/fields";
import { confirmUploads, deleteApplicantFiles, deleteOrphanUploads } from "@/lib/careers/files";

export type SubmitResult = { ok: true; id: string; droppedFiles: number } | { ok: false; error: "POSITION_CLOSED" };

/**
 * Store one application. The position must be open: the form only offers
 * open ones, so anything else is a stale page or somebody posting by hand.
 */
export async function submitApplication(
  input: ApplicationInput,
  meta: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<SubmitResult> {
  const position = await prisma.jobPosition.findUnique({
    where: { id: input.positionId },
    include: { translations: true },
  });
  if (!position || !position.isOpen) return { ok: false, error: "POSITION_CLOSED" };

  // Thai first: the title is stored for HR to read, whatever language the
  // applicant used.
  const title = getTranslation(position.translations, "th", input.locale)?.title ?? "—";
  const [{ retentionMonths }, uploads] = await Promise.all([getCareersConfig(), confirmUploads(input.files)]);

  const created = await prisma.jobApplication.create({
    data: {
      positionId: position.id,
      positionTitle: title,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      education: input.education,
      expectedSalary: input.expectedSalary,
      locale: input.locale,
      consentVersion: CAREERS_CONSENT_VERSION,
      consentAt: now,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      purgeAfter: purgeDate(now, retentionMonths),
      files: {
        create: uploads.files.map((file) => ({
          key: file.key,
          name: file.name,
          contentType: file.contentType,
          size: file.size,
        })),
      },
    },
    select: { id: true },
  });

  return { ok: true, id: created.id, droppedFiles: uploads.dropped };
}

export type ApplicationFilter = { status?: JobApplicationStatus; positionId?: string; q?: string };

function whereOf(filter: ApplicationFilter): Prisma.JobApplicationWhereInput {
  const q = filter.q?.trim();
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.positionId ? { positionId: filter.positionId } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/\s+/g, "") } },
          ],
        }
      : {}),
  };
}

export async function listApplications(filter: ApplicationFilter = {}) {
  return prisma.jobApplication.findMany({
    where: whereOf(filter),
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      positionTitle: true,
      firstName: true,
      lastName: true,
      email: true,
      education: true,
      expectedSalary: true,
      status: true,
      viewedAt: true,
      createdAt: true,
      _count: { select: { files: true } },
    },
  });
}

/** How many applications sit in each status, for the tabs. */
export async function countByStatus(): Promise<Record<JobApplicationStatus, number>> {
  const groups = await prisma.jobApplication.groupBy({ by: ["status"], _count: { _all: true } });
  const out = Object.fromEntries(Object.values(JobApplicationStatus).map((status) => [status, 0])) as Record<
    JobApplicationStatus,
    number
  >;
  for (const group of groups) out[group.status] = group._count._all;
  return out;
}

export async function getApplication(id: string) {
  return prisma.jobApplication.findUnique({
    where: { id },
    include: {
      files: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
}
export type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof getApplication>>>;

/** First open: clears it from the menu's badge. Later opens change nothing. */
export async function markViewed(id: string, now = new Date()): Promise<void> {
  await prisma.jobApplication.updateMany({ where: { id, viewedAt: null }, data: { viewedAt: now } });
}

export async function setStatus(id: string, status: JobApplicationStatus): Promise<void> {
  await prisma.jobApplication.update({ where: { id }, data: { status } });
}

export async function addNote(id: string, author: { id: string; name: string }, body: string): Promise<void> {
  await prisma.jobApplicationNote.create({
    data: { applicationId: id, authorId: author.id, authorName: author.name.slice(0, 120), body: body.slice(0, 4000) },
  });
}

/**
 * Delete an application for good: the row, its notes, and its files in
 * the Space. The files go first — if the row went first and the Space
 * then failed, nothing would remember which objects to remove.
 */
export async function eraseApplication(id: string): Promise<boolean> {
  const application = await prisma.jobApplication.findUnique({
    where: { id },
    select: { id: true, files: { select: { key: true } } },
  });
  if (!application) return false;
  await deleteApplicantFiles(application.files.map((file) => file.key));
  await prisma.jobApplication.delete({ where: { id } });
  return true;
}

/**
 * The nightly sweep: every application past its purgeAfter, then uploads
 * nobody submitted. Returns what it removed, for the cron's log line.
 */
export async function purgeExpiredApplications(now = new Date()): Promise<{ applications: number; orphans: number }> {
  const expired = await prisma.jobApplication.findMany({
    where: { purgeAfter: { lte: now } },
    select: { id: true },
    take: 500,
  });
  let applications = 0;
  for (const { id } of expired) {
    if (await eraseApplication(id)) applications += 1;
  }

  let orphans = 0;
  try {
    const known = await prisma.jobApplicationFile.findMany({ select: { key: true } });
    orphans = await deleteOrphanUploads(new Set(known.map((file) => file.key)), now.getTime());
  } catch (error) {
    // No Space configured (a development machine), or it is unreachable:
    // the rows above are still gone, and tomorrow's run tries again.
    if (!(error instanceof Error && error.message === "S3_NOT_CONFIGURED")) {
      console.error("[careers] orphan upload sweep failed", error);
    }
  }
  return { applications, orphans };
}
