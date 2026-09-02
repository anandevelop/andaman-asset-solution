/**
 * lib/audit/context.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who is making the current request, carried where Prisma can see it.
 *
 * The audit trail is written by a client extension in lib/audit/extension.ts
 * — one place, rather than a call at each of the fifty-odd server actions.
 * That buys completeness: a new action is covered the day it is written,
 * and nobody can forget. The cost is that the extension sits below the
 * layer that knows who is signed in, so the actor has to reach it another
 * way.
 *
 * AsyncLocalStorage is that way. `enterWith` rather than `run(fn)` because
 * the guard cannot wrap its caller: requireAdminAction() is invoked at the
 * top of an action and returns, it does not enclose the body. enterWith
 * sets the store for the remainder of the current async context, which for
 * a server action or a route handler is the rest of that request.
 *
 * An empty store is the normal case and means "not an admin acting" — a
 * visitor submitting the lead form, an RSVP, the sign-in path stamping
 * totpLastStep. Those writes are not audited, which is the intent: this
 * table answers "which administrator changed this", not "what has ever
 * been written".
 * ─────────────────────────────────────────────────────────────────────────
 */

// No `import "server-only"` — see the note in lib/audit/extension.ts. It
// reaches lib/prisma.ts's module graph, and from there everything.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@prisma/client";

export type AuditActor = {
  id: string;
  email: string;
  role: Role;
};

const storage = new AsyncLocalStorage<AuditActor | undefined>();

/**
 * Mark the rest of this request as the work of a signed-in administrator.
 * Called by the admin guards, which every admin page and action already
 * goes through.
 */
export function setAuditActor(actor: AuditActor): void {
  storage.enterWith(actor);
}

/** The administrator behind the current request, if there is one. */
export function getAuditActor(): AuditActor | undefined {
  return storage.getStore();
}

/**
 * Run something with the trail switched off.
 *
 * For writes an administrator triggers but does not author: the audit
 * insert itself, and anything that would otherwise record a system
 * bookkeeping change as a human decision.
 */
export function withoutAudit<T>(fn: () => T): T {
  return storage.run(undefined, fn);
}
