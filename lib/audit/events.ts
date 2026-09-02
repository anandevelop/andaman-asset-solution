/**
 * lib/audit/events.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Arrivals, departures, and the attempts that never got in.
 *
 * "Who changed this" and "who was in the building at the time" are the same
 * question asked twice, and answering them from two tables would mean
 * reading two pages and merging them by eye. So an auth event is an
 * AuditLog row like any other, with model = "Session" and action =
 * "login" | "logout" | "login_failed" | "totp_failed". `action` and `model`
 * were always plain strings rather than enums, precisely so the trail could
 * learn a new kind of entry without a migration.
 *
 * THIS IS THE SECOND WRITER, AND UNTIL NOW THERE WAS ONLY ONE.
 *
 * lib/audit/extension.ts records changes by watching every write pass
 * through Prisma, which is what makes it impossible for a future action to
 * forget. A sign-in is not a write to any table, so there is nothing for
 * that extension to watch and this module has to insert the row itself.
 * Two writers is a deliberate exception; three would be a table anyone can
 * post to.
 *
 * WHAT A MISSING "logout" MEANS.
 *
 * NextAuth fires its signOut event when somebody presses the button. It
 * does not fire when an eight-hour token simply expires, when the browser
 * is closed, or when a password reset invalidates a session from
 * underneath it — nothing runs in the browser at those moments to report
 * it. So a login with no logout after it is the normal case, not a
 * suspicious one, and the pair must never be read as a shift with a start
 * and an end. What the trail can honestly say is when someone arrived, and
 * when they deliberately left.
 *
 * WHAT A FAILED ENTRY IS, AND IS NOT.
 *
 * On every other row actorEmail is an identity the application verified.
 * On a failed sign-in it is a string somebody typed, and it may belong to
 * nobody at all — so actorId is null unless the account exists, actorRole
 * is null unless it is known, and the activity page marks these rows
 * unverified rather than letting them read as "this person did something".
 *
 * WHY ONLY EVALUATED ATTEMPTS ARE RECORDED.
 *
 * lib/auth.ts turns attempts away at the rate limiter before it checks
 * anything, and those are deliberately not written here. Recording them
 * would hand an attacker a way to grow this table as fast as they can send
 * requests, which is a cheaper attack than the one the log exists to
 * reveal. Ten attempts per address per fifteen minutes reach a credential
 * check and leave a row; the eleventh leaves nothing, and the ten already
 * there say what is happening.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { reportError } from "@/lib/sentry";

/**
 * The `model` on an auth entry.
 *
 * Not a Prisma model — there is no Session table, the strategy is JWT. It
 * is the noun the entry is about, which is what this column means for
 * every other row too, and it puts sign-ins in the activity page's type
 * filter alongside Project and Faq for free.
 */
export const AUTH_MODEL = "Session";

export const AUTH_LOGIN = "login";
export const AUTH_LOGOUT = "logout";

/** Address or password rejected — the attempt never reached a session. */
export const AUTH_LOGIN_FAILED = "login_failed";

/**
 * Password accepted, second factor not.
 *
 * Kept separate from AUTH_LOGIN_FAILED because it means something much
 * worse: somebody has a working password. A run of these is the one
 * pattern in this table worth waking a person up for.
 */
export const AUTH_TOTP_FAILED = "totp_failed";

export type AuthAction =
  | typeof AUTH_LOGIN
  | typeof AUTH_LOGOUT
  | typeof AUTH_LOGIN_FAILED
  | typeof AUTH_TOTP_FAILED;

/** True for the rows this module writes, false for record changes. */
export function isAuthEvent(model: string): boolean {
  return model === AUTH_MODEL;
}

/** True where actorEmail is a claim rather than a verified identity. */
export function isFailedAuth(action: string): boolean {
  return action === AUTH_LOGIN_FAILED || action === AUTH_TOTP_FAILED;
}

type AuthActor = {
  /** Null when the address matched no account. */
  id?: string | null;
  email: string;
  /** Null for the same reason as id. */
  role?: Role | null;
};

/**
 * Best-effort client address for the request in progress.
 *
 * Imported lazily rather than at the top of the file. lib/auth.ts imports
 * this module and is itself imported by route handlers, server actions and
 * both admin guards; `next/headers` belongs to none of those graphs by
 * right, and this project has already lost days to a module that was fine
 * everywhere except the one place a build worker evaluated it.
 *
 * Returns null rather than throwing outside a request — a background job
 * or a script has no address to record, and that is not an error.
 */
async function requestAddress(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const address = clientIp(await headers());
    return address === "unknown" ? null : address;
  } catch {
    return null;
  }
}

/**
 * Record an arrival, a departure, or a refusal.
 *
 * Never throws. Sign-in is the one flow where an exception is most
 * expensive — a failure here would turn a correct password into a login
 * error, and the user, having done nothing wrong, would try again and get
 * the same thing. A lost entry goes to Sentry instead, the same bargain
 * lib/audit/extension.ts makes for the same reason.
 */
export async function recordAuthEvent(
  action: AuthAction,
  actor: AuthActor,
): Promise<void> {
  try {
    /*
      Written through the ordinary client on purpose. The extension skips
      model "AuditLog", so this insert cannot recurse into itself, and
      routing it around the extension would only hide it from the one
      place that would notice if that ever stopped being true.
    */
    await prisma.auditLog.create({
      data: {
        actorId: actor.id ?? null,
        // Bounded because a failed attempt's address is unvalidated input
        // and this column is read by a page, not by a login form.
        actorEmail: actor.email.slice(0, 200),
        actorRole: actor.role ?? null,
        action,
        model: AUTH_MODEL,
        // An auth event is about a person, not a row: there is nothing to
        // name here, and nothing was edited.
        recordId: null,
        recordLabel: null,
        changedFields: [],
        ipAddress: await requestAddress(),
      },
    });
  } catch (error) {
    console.error(`[audit] failed to record a ${action}`, error);
    reportError(error, {
      tags: { area: "audit" },
      extra: { action, actorId: actor.id ?? null },
    });
  }
}
