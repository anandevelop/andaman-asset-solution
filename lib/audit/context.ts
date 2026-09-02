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
 * AsyncLocalStorage is that way, with two details that are load-bearing and
 * were both wrong in the first version. Each cost the trail everything: the
 * back office recorded four real changes as nothing at all.
 *
 *
 * ONE. The store is pinned to globalThis, like the client in lib/prisma.ts.
 *
 * Next bundles server code per entry, so a module-level `new
 * AsyncLocalStorage()` is constructed once per bundle that reaches it, not
 * once per process. This file was being instantiated fourteen times in a
 * single dev server: the guards wrote the actor into one instance and the
 * Prisma extension read from another — thirty-three reads, every one of
 * them empty. Nothing threw. There is no error to raise when two objects
 * that were meant to be one are merely different.
 *
 *
 * TWO. `beginAuditScope()` must be called in the guard's *synchronous
 * prefix* — above every await — and it stores a mutable holder rather than
 * the actor itself.
 *
 * `enterWith` sets the store for the current async context. An async
 * function's body runs synchronously in its *caller's* context until its
 * first await, and only from there on in its own. So a call made above the
 * first await lands in the caller's context, which is the server action,
 * which is where the writes happen — while the same call made below it
 * lands in a context the caller never sees again once it resumes.
 *
 * The original code called `enterWith(actor)` at the bottom of the guard,
 * after `await getServerSession()`, because that is the first moment the
 * actor is known. It set the store on a context that ended microseconds
 * later. Hence the holder: the scope object enters the caller's context
 * empty, and the actor is dropped into it once the checks have passed.
 * `getAuditActor()` reads through the shared reference and sees it.
 *
 * That ordering is a real trap, so `beginAuditScope()` is the first
 * statement in both guards with a comment saying why. An await placed above
 * it would break the trail silently, exactly as before.
 *
 *
 * An empty scope is the normal case and means "not an admin acting" — a
 * visitor submitting the lead form, an RSVP, the sign-in path stamping
 * totpLastStep. Those writes are not audited, which is the intent: this
 * table answers "which administrator changed this", not "what has ever
 * been written". A request whose guard rejected it leaves an empty scope
 * too, and so is equally invisible.
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

/**
 * The per-request holder.
 *
 * Mutable on purpose: it is entered into the store before anyone knows who
 * is signing in, and filled once they do. See TWO in the header.
 */
export type AuditScope = { actor?: AuditActor };

/*
  Pinned to globalThis, not merely module-level. See ONE in the header —
  this file is bundled more than once, and a per-bundle store is a store
  the reader never finds.
*/
const globalForAudit = globalThis as unknown as {
  auditScopeStorage?: AsyncLocalStorage<AuditScope | undefined>;
};

const storage = (globalForAudit.auditScopeStorage ??= new AsyncLocalStorage<
  AuditScope | undefined
>());

/**
 * Open an audit scope for the rest of this request, with nobody in it yet.
 *
 * MUST be called above every `await` in its caller — see TWO in the header.
 * The returned holder is filled by setAuditActor() once authorisation has
 * actually passed.
 */
export function beginAuditScope(): AuditScope {
  const scope: AuditScope = {};
  storage.enterWith(scope);
  return scope;
}

/**
 * Mark the rest of this request as the work of a signed-in administrator.
 * Called by the admin guards, which every admin page and action already
 * goes through.
 *
 * Fills the scope opened by beginAuditScope(). Opens one itself if there is
 * none, which is what a caller outside a guard gets — but a guard must not
 * rely on that, because a scope opened here is opened below the guard's
 * awaits, and its caller will never see it.
 */
export function setAuditActor(actor: AuditActor): void {
  const scope = storage.getStore();

  if (scope) {
    scope.actor = actor;
    return;
  }

  storage.enterWith({ actor });
}

/** The administrator behind the current request, if there is one. */
export function getAuditActor(): AuditActor | undefined {
  return storage.getStore()?.actor;
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
