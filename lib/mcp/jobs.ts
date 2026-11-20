/**
 * lib/mcp/jobs.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Work that is accepted now and done afterwards — the AI connection's image
 * uploads. A tool calls enqueueJob() and answers at once with the job id;
 * the client asks job_status later.
 *
 * WHERE IT RUNS
 *
 * Twice over, so neither has to be perfect. The route that accepted the job
 * kicks runDueJobs() after its response has gone out (next/server `after`),
 * which is why a job normally starts within a second. And the cron process
 * calls /api/cron/jobs every minute, which is what picks up a job whose
 * first attempt died with a deploy, and every retry.
 *
 * ONE WORKER PER JOB
 *
 * Claiming is a single UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP
 * LOCKED). Two workers running at once each get a different row or none.
 * A job left RUNNING for ten minutes belonged to a process that is gone and
 * is put back in the queue.
 *
 * A handler that throws is retried with a growing delay until maxAttempts,
 * then left FAILED with the message, which is what job_status reports.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { beginAuditScope, setAuditActor, withoutAudit } from "@/lib/audit/context";

export type JobHandler = (payload: unknown, job: { id: string; createdById: string | null }) => Promise<unknown>;

const globalForJobs = globalThis as unknown as { backgroundJobHandlers?: Map<string, JobHandler> };
const handlers = (globalForJobs.backgroundJobHandlers ??= new Map<string, JobHandler>());

export function registerJob(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export const STALE_AFTER_MS = 10 * 60_000;
export const MAX_QUEUED_PER_TOKEN = 200;

/** Seconds to wait before attempt n+1: 30s, 2m, 8m… */
export function retryDelayMs(attempts: number): number {
  return 30_000 * 4 ** Math.max(0, attempts - 1);
}

export async function enqueueJob(input: {
  kind: string;
  payload: Prisma.InputJsonValue;
  createdById?: string | null;
  tokenId?: string | null;
  maxAttempts?: number;
}): Promise<{ id: string } | { error: "QUEUE_FULL" | "UNKNOWN_KIND" }> {
  if (!handlers.has(input.kind)) return { error: "UNKNOWN_KIND" };
  if (input.tokenId) {
    const waiting = await prisma.backgroundJob.count({
      where: { tokenId: input.tokenId, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (waiting >= MAX_QUEUED_PER_TOKEN) return { error: "QUEUE_FULL" };
  }
  return withoutAudit(async () =>
    await prisma.backgroundJob.create({
      data: {
        kind: input.kind,
        payload: input.payload,
        createdById: input.createdById ?? null,
        tokenId: input.tokenId ?? null,
        maxAttempts: input.maxAttempts ?? 3,
      },
      select: { id: true },
    }),
  );
}

type Claimed = { id: string; kind: string; payload: unknown; attempts: number; maxAttempts: number; createdById: string | null };

async function claimNext(now: Date): Promise<Claimed | null> {
  const rows = await prisma.$queryRaw<Claimed[]>(Prisma.sql`
    UPDATE "background_jobs"
       SET "status" = 'RUNNING', "lockedAt" = ${now}, "attempts" = "attempts" + 1, "updatedAt" = ${now}
     WHERE "id" = (
       SELECT "id" FROM "background_jobs"
        WHERE "status" = 'QUEUED' AND "runAfter" <= ${now}
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING "id", "kind", "payload", "attempts", "maxAttempts", "createdById"
  `);
  return rows[0] ?? null;
}

async function runOne(job: Claimed, now: Date): Promise<boolean> {
  const handler = handlers.get(job.kind);
  try {
    if (!handler) throw new Error(`no handler for job kind "${job.kind}"`);

    // What the job writes is the doing of whoever asked for it.
    let result: unknown;
    if (job.createdById) {
      const owner = await prisma.user.findUnique({ where: { id: job.createdById }, select: { id: true, email: true, role: true } });
      beginAuditScope();
      if (owner) setAuditActor(owner);
    }
    result = await handler(job.payload, { id: job.id, createdById: job.createdById });

    await withoutAudit(async () =>
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "DONE", result: (result ?? null) as Prisma.InputJsonValue, error: null, lockedAt: null },
      }),
    );
    return true;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    const final = job.attempts >= job.maxAttempts;
    await withoutAudit(async () =>
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: final
          ? { status: "FAILED", error: message, lockedAt: null }
          : { status: "QUEUED", error: message, lockedAt: null, runAfter: new Date(now.getTime() + retryDelayMs(job.attempts)) },
      }),
    ).catch((failure) => console.error("[jobs] could not record failure", failure));
    return false;
  }
}

export type RunSummary = { done: number; failed: number; requeued: number };

/** Runs what is due, one at a time, until the queue is empty or time is up. */
export async function runDueJobs({ budgetMs = 50_000, max = 25 }: { budgetMs?: number; max?: number } = {}): Promise<RunSummary> {
  const started = Date.now();
  const summary: RunSummary = { done: 0, failed: 0, requeued: 0 };

  const stale = await withoutAudit(async () =>
    await prisma.backgroundJob.updateMany({
      where: { status: "RUNNING", lockedAt: { lt: new Date(started - STALE_AFTER_MS) } },
      data: { status: "QUEUED", lockedAt: null },
    }),
  );
  summary.requeued = stale.count;

  for (let i = 0; i < max && Date.now() - started < budgetMs; i++) {
    const now = new Date();
    const job = await claimNext(now);
    if (!job) break;
    if (await runOne(job, now)) summary.done++;
    else summary.failed++;
  }
  return summary;
}

export type JobStatus = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  result: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One job, for the key that queued it. */
export async function jobStatus(id: string, tokenId: string): Promise<JobStatus | null> {
  return prisma.backgroundJob.findFirst({
    where: { id, tokenId },
    select: { id: true, kind: true, status: true, attempts: true, result: true, error: true, createdAt: true, updatedAt: true },
  });
}
