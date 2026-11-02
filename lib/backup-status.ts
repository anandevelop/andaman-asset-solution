/**
 * lib/backup-status.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Is the database being backed up?
 *
 * The backup itself runs on the droplet, outside the application:
 * scripts/backup-db.sh from root's crontab (docs/DEPLOYMENT.md §8a). The
 * app cannot take one. What it can do is report: the script writes its
 * outcome to site_settings "backup.last" after every run, success or
 * failure, and this file turns that row into a state the system page shows
 * and the scheduled alerts check.
 *
 *   never   no run has ever reported — the script is not installed
 *   failed  the last run failed
 *   stale   the last success is older than 36 h — the cron stopped
 *   ok      a successful run in the last 36 h
 *
 * "local" — the dump stayed on the droplet (BACKUP_BUCKET unset) — is a
 * flag on ok, not a state of its own: the data is backed up, just not
 * anywhere that survives losing the droplet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";

export const BACKUP_STATUS_KEY = "backup.last";
export const BACKUP_STALE_HOURS = 36;

export type BackupRun = {
  at: string;
  ok: boolean;
  file?: string;
  size?: string;
  tables?: number;
  uploaded?: boolean;
  detail?: string;
};

export type BackupStatus =
  | { state: "never" }
  | { state: "ok" | "stale" | "failed"; run: BackupRun; ageHours: number; offsite: boolean };

/** Pure, for the tests and for anyone holding the row already. */
export function backupStatusFrom(raw: string | null | undefined, now = new Date()): BackupStatus {
  if (!raw) return { state: "never" };
  let run: BackupRun;
  try {
    run = JSON.parse(raw) as BackupRun;
  } catch {
    return { state: "never" };
  }
  const at = Date.parse(run.at);
  if (!Number.isFinite(at)) return { state: "never" };
  const ageHours = (now.getTime() - at) / 3_600_000;
  const state = !run.ok ? "failed" : ageHours > BACKUP_STALE_HOURS ? "stale" : "ok";
  return { state, run, ageHours, offsite: Boolean(run.uploaded) };
}

export async function getBackupStatus(now = new Date()): Promise<BackupStatus> {
  const row = await prisma.siteSetting
    .findUnique({ where: { key: BACKUP_STATUS_KEY }, select: { value: true } })
    .catch(() => null);
  return backupStatusFrom(row?.value, now);
}
