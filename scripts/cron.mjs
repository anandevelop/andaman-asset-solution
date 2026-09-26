/**
 * scripts/cron.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Calls this application's scheduled endpoints, on time.
 *
 * Until this existed, /api/cron/seo-audit, /api/cron/vitals-rollup and
 * /api/cron/monthly-report were three endpoints nothing ever called. The
 * audit screen showed figures from whenever somebody last ran curl, the
 * Core Web Vitals tab had nothing rolled up, and the monthly report was a
 * feature that had never been sent.
 *
 * WHY THIS AND NOT A CRON CONTAINER
 *
 * It runs from the application's own image, which the host has already
 * pulled for the app and migrate services. That means no second image to
 * keep patched, no `apk add curl` at container start — which fails exactly
 * when the network is having a bad day — and the same .env, so CRON_SECRET
 * is the one the endpoints check without being copied anywhere.
 *
 * WHY IT COMPUTES THE NEXT TIME RATHER THAN SLEEPING A FIXED INTERVAL
 *
 * "Sleep 24 hours" drifts by however long each run takes, and a restart at
 * 02:59 would push a 03:00 job to the following day. Each job works out
 * its next occurrence from the wall clock every time, so a restart at any
 * moment picks up the next real slot, and a run that takes twenty minutes
 * does not move tomorrow's.
 *
 * ONE REPLICA, DELIBERATELY
 *
 * There is no lock. Two of these running would fire every job twice — the
 * audit would double its work and the monthly report would be sent to the
 * executives twice. The compose service that runs it has no `deploy:
 * replicas`, and it must not grow one.
 *
 * TIMES ARE LOCAL, AND THE CONTAINER'S CLOCK IS Asia/Bangkok
 *
 * Set by TZ in docker-compose.prod.yml for the app, and by this service
 * too. "Runs at 03:15" should mean what the person reading it thinks it
 * means, and a monthly report timed for 08:00 has to arrive over
 * breakfast rather than at three in the afternoon.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Where the endpoints are. `app` is the service name on the compose
 *  network; nothing here ever goes out to the internet. */
const BASE = process.env.CRON_TARGET_URL ?? "http://app:3000";

const SECRET = process.env.CRON_SECRET;

/**
 * The schedule.
 *
 * `at` is [hour, minute] local. `day` is a day of the month for monthly
 * jobs, and absent for daily ones.
 *
 * The audit runs first and the rollup half an hour later: both check the
 * alert rules when they finish (see lib/seo/alerts.ts), and running them
 * back to back would have the second one's checks suppressed as duplicates
 * of the first's.
 */
const JOBS = [
  { name: "seo-audit", path: "/api/cron/seo-audit", at: [3, 15] },
  { name: "vitals-rollup", path: "/api/cron/vitals-rollup", at: [3, 45] },
  /*
    Search Console's own data runs two to three days behind, so the hour
    is not load-bearing — what matters is that it lands before anybody
    opens the screens in the morning. Its first run pulls sixteen months
    and takes minutes rather than seconds.
  */
  { name: "seo-search", path: "/api/cron/seo-search", at: [4, 15] },
  /*
    After the search sync, because the URLs worth inspecting are the ones
    the audit and Search Console have just told us about — and far enough
    behind it that the long first sync does not overlap with it.
  */
  { name: "seo-inspect", path: "/api/cron/seo-inspect", at: [5, 0] },
  { name: "monthly-report", path: "/api/cron/monthly-report", at: [8, 0], day: 1 },
];

function log(message) {
  console.log(`[cron] ${new Date().toISOString()} ${message}`);
}

/**
 * The next time this job should run, from now.
 *
 * Built by moving a copy of the current date forward rather than by adding
 * a fixed number of milliseconds, so the daylight-saving arithmetic — and
 * the "31 days in this month, 30 in the next" arithmetic — belongs to Date
 * rather than to this file. Thailand has no daylight saving, but a server
 * moved to another region should not turn that into a bug.
 */
function nextRun(job, now = new Date()) {
  const next = new Date(now);
  const [hour, minute] = job.at;

  next.setHours(hour, minute, 0, 0);

  if (job.day === undefined) {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  next.setDate(job.day);
  if (next <= now) next.setMonth(next.getMonth() + 1, job.day);

  return next;
}

async function run(job) {
  const url = `${BASE}${job.path}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      // Long enough for a full-site audit (its own maxDuration is 300s)
      // and short enough that a hung request cannot silently stop the
      // schedule for ever.
      signal: AbortSignal.timeout(10 * 60_000),
    });

    const body = await response.text();

    if (!response.ok) {
      // Logged, never retried here. The endpoints record their own
      // failures as alerts (lib/seo/alerts.ts) and a retry loop would
      // email the same failure repeatedly.
      log(`${job.name} FAILED ${response.status}: ${body.slice(0, 300)}`);
      return;
    }

    log(`${job.name} ok: ${body.slice(0, 300)}`);
  } catch (error) {
    log(`${job.name} FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * One self-rescheduling timer per job.
 *
 * A single timer walking a queue would let a slow job delay an unrelated
 * one; a timer each keeps the monthly report's 08:00 independent of how
 * long the audit took at 03:15.
 */
function schedule(job) {
  const at = nextRun(job);
  const delay = at.getTime() - Date.now();

  log(`${job.name} next at ${at.toLocaleString("en-GB")} (in ${Math.round(delay / 60_000)} min)`);

  setTimeout(async () => {
    await run(job);
    schedule(job);
  }, delay);
}

if (!SECRET) {
  /*
    Stay up, do nothing, and say so — repeatedly.

    This exited instead, on the reasoning that a silent scheduler is worse
    than a loud crash. Under the service's `restart: always` that produced
    a container restarting for ever, so a deployment whose .env simply had
    no CRON_SECRET came up with the stack apparently broken. The
    application itself treats that variable as recommended and runs
    perfectly well without it — lib/env.ts warns and carries on, and
    phase 0 was explicit that none of these may become required. A
    companion service that cannot start on a configuration the app
    considers valid is that requirement by the back door.

    So: one clear line at startup, and the same line every hour, because
    the startup message scrolls out of `docker logs` within a day while
    the reason is still true.
  */
  const complain = () =>
    log("CRON_SECRET is not set — nothing will be scheduled. The audit, the vitals rollup and the monthly report will not run until it is set and this service is restarted.");

  complain();
  setInterval(complain, 60 * 60_000);
} else {
  log(`scheduling ${JOBS.length} jobs against ${BASE}`);
  for (const job of JOBS) schedule(job);
}

/*
  Nothing keeps a Node process alive but its timers, and every timer here
  reschedules itself — so this never exits on its own. SIGTERM from
  `docker compose down` ends it; there is no in-flight state worth
  draining, because a job that was interrupted simply runs at its next
  slot.
*/
process.on("SIGTERM", () => {
  log("SIGTERM — stopping");
  process.exit(0);
});
