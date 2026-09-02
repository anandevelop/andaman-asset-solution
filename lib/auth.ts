/**
 * lib/auth.ts
 * ─────────────────────────────────────────────────────────────────────────
 * NextAuth configuration for the admin back-office.
 *
 * Strategy: credentials + JWT sessions (no database sessions). The adapter
 * tables exist in the schema for a future OAuth provider, but a JWT session
 * is what lets middleware.ts authorise a request at the edge without a
 * round-trip to Postgres on every navigation.
 *
 * The `role` claim is copied into the token at sign-in and re-read from the
 * database on each token refresh, so revoking a user (isActive = false) or
 * demoting them takes effect without waiting for the session to expire.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, resetRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requiresTwoFactor } from "@/lib/totp";
import { consumeSecondFactor } from "@/lib/two-factor";
import {
  AUTH_LOGIN,
  AUTH_LOGIN_FAILED,
  AUTH_LOGOUT,
  AUTH_TOTP_FAILED,
  recordAuthEvent,
} from "@/lib/audit/events";

/** Role hierarchy — higher number grants everything below it. */
const ROLE_RANK: Record<Role, number> = {
  EDITOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function hasRole(role: Role | undefined | null, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** How often to re-validate the role/isActive flag against the database. */
const ROLE_REFRESH_MS = 5 * 60_000;

/**
 * A real bcrypt hash of a throwaway value, compared against when no user is
 * found. It has to be a *valid* hash: bcryptjs rejects a malformed one
 * immediately, which would leave exactly the timing difference this is
 * meant to erase.
 */
const DUMMY_HASH = "$2a$10$ayLYlA1n0y.FW/sO68XQxO7GIHambZGs0dS9RBmQCFg7oQzmi3V6e";

/**
 * Sign-in outcomes the login form has to tell apart.
 *
 * NextAuth turns a thrown error into `?error=<message>` and hands it back
 * as `result.error` from `signIn(..., { redirect: false })`, which is the
 * only channel a credentials provider has for saying anything other than
 * "no". Returning null stays reserved for "these credentials are wrong",
 * so the form keeps showing one identical message for a bad email and a
 * bad password.
 *
 * TOTP_REQUIRED does admit that the password was right — unavoidable in any
 * two-step flow, and not a leak worth designing around: whoever sees it has
 * the password already.
 */
export const TOTP_REQUIRED = "TOTP_REQUIRED";
export const TOTP_INVALID = "TOTP_INVALID";
export const TOTP_LOCKED = "TOTP_LOCKED";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8h — one working day, then re-authenticate
  },

  pages: {
    // Locale is prepended by the middleware redirect; this is the fallback
    // NextAuth uses for its own redirects (e.g. session expiry).
    signIn: "/th/login",
    error: "/th/login",
  },

  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        /** Empty on the first submit; filled on the second. */
        totp: { label: "Authentication code", type: "text" },
      },

      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) return null;

        /*
          Brute-force guard.

          Without this the credentials endpoint accepts unlimited guesses at
          whatever rate the network allows — bcrypt at cost 12 slows an
          attacker to roughly four attempts a second per connection, which
          is a speed bump, not a defence.

          Checked before the database lookup so a flood costs one Map
          lookup rather than a query plus a hash. `check: true` inspects the
          bucket without consuming from it: only genuine failures below
          should count against the limit, or a user with the right password
          could still be locked out by someone else's attempts.
        */
        const limitKey = `login:${email}`;

        if (!rateLimit(limitKey, { ...RATE_LIMITS.login, check: true }).ok) {
          console.warn(`[auth] sign-in temporarily locked for ${email}`);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            isActive: true,
            passwordHash: true,
            totpEnabledAt: true,
          },
        });

        // Burn the same bcrypt work when the user is missing, so response
        // time does not reveal whether an address belongs to staff.
        if (!user?.passwordHash) {
          await bcrypt.compare(password, DUMMY_HASH);
          rateLimit(limitKey, RATE_LIMITS.login);
          /*
            No id and no role: nobody owns this address. The entry still
            records the attempt, because a run of them against addresses
            that do not exist is somebody working through a list.

            Recorded in all three failure branches below as well as this
            one, so the extra work does not become a timing signal for
            which addresses belong to staff — the same reason the dummy
            bcrypt compare above exists.
          */
          await recordAuthEvent(AUTH_LOGIN_FAILED, { email });
          return null;
        }

        if (!user.isActive) {
          rateLimit(limitKey, RATE_LIMITS.login);
          await recordAuthEvent(AUTH_LOGIN_FAILED, {
            id: user.id,
            email,
            role: user.role,
          });
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
          rateLimit(limitKey, RATE_LIMITS.login);
          await recordAuthEvent(AUTH_LOGIN_FAILED, {
            id: user.id,
            email,
            role: user.role,
          });
          return null;
        }

        // Correct credentials — release the bucket so a run of typos before
        // getting it right does not linger for the rest of the window. Done
        // before the second factor so an admin fumbling the code from their
        // phone is not also burning password attempts.
        resetRateLimit(limitKey);

        /*
          Second factor.

          Enrolment is enforced elsewhere (middleware.ts and
          lib/admin/guard.ts push un-enrolled ADMINs into setup), not here:
          an account that has no secret yet still has to be able to sign in
          once to create one.
        */
        if (user.totpEnabledAt) {
          const code = credentials?.totp?.trim();

          if (!code) throw new Error(TOTP_REQUIRED);

          const codeKey = `2fa:${user.id}`;

          if (!rateLimit(codeKey, { ...RATE_LIMITS.twoFactor, check: true }).ok) {
            console.warn(`[auth] second factor temporarily locked for ${email}`);
            throw new Error(TOTP_LOCKED);
          }

          const second = await consumeSecondFactor(user.id, code);

          if (!second.ok) {
            rateLimit(codeKey, RATE_LIMITS.twoFactor);
            /*
              A different entry from the one above, and the more serious of
              the two: reaching this line means the password was correct.
              A run of these is somebody holding a working password and
              missing only the phone.
            */
            await recordAuthEvent(AUTH_TOTP_FAILED, {
              id: user.id,
              email,
              role: user.role,
            });
            throw new Error(TOTP_INVALID);
          }

          if (second.method === "recovery") {
            console.warn(
              `[auth] ${email} signed in with a recovery code; ${second.remaining} left`,
            );
          }

          resetRateLimit(codeKey);
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          twoFactorEnabled: Boolean(user.totpEnabledAt),
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger }) {
      // Sign-in: seed the token from the authorize() result.
      if (user) {
        const seeded = user as { role: Role; twoFactorEnabled?: boolean };
        token.id = user.id;
        token.role = seeded.role;
        token.twoFactorEnabled = Boolean(seeded.twoFactorEnabled);
        token.checkedAt = Date.now();
        // Stamped once, never refreshed: this is when *this* session began,
        // and it is what a later credential change is measured against.
        token.issuedAt = Date.now();
        return token;
      }

      // Subsequent requests: refresh role/active state periodically so
      // permission changes propagate without a forced sign-out.
      /*
        An account still owing 2FA setup is re-read on every request, not
        every five minutes. Otherwise finishing enrolment leaves the claim
        stale for up to ROLE_REFRESH_MS, and the gate keeps bouncing the
        user back to a setup page they have already completed. The extra
        query only affects accounts in that short-lived state.
      */
      const awaitingEnrolment =
        requiresTwoFactor(token.role as Role) && !token.twoFactorEnabled;

      const stale =
        trigger === "update" ||
        awaitingEnrolment ||
        typeof token.checkedAt !== "number" ||
        Date.now() - token.checkedAt > ROLE_REFRESH_MS;

      if (stale && token.id) {
        const fresh = await prisma.user
          .findUnique({
            where: { id: token.id as string },
            select: {
              name: true,
              role: true,
              isActive: true,
              totpEnabledAt: true,
              credentialsChangedAt: true,
            },
          })
          .catch(() => null);

        // Database unreachable → keep the existing claims rather than
        // locking every editor out of the CMS.
        if (fresh) {
          if (!fresh.isActive) return {};

          /*
            A password reset has to end the sessions that predate it.

            Without this, rotating the password of a compromised account
            did nothing to the intruder: their token stayed valid for the
            rest of its eight hours (`maxAge` above), and the only thing
            that actually revoked anything was setting isActive = false.
            That is the wrong instrument — it locks the real owner out too.

            An empty token signs the session out. Tokens issued before this
            claim existed have no `issuedAt`, and are treated as older than
            any reset: the safe direction, at the cost of signing out
            everyone who was mid-session when a password was changed.

            This lands on the same schedule as every other revocation here —
            within ROLE_REFRESH_MS rather than instantly — because it rides
            the existing refresh rather than adding a query per request.
            An eight-hour window becomes a five-minute one.
          */
          if (
            fresh.credentialsChangedAt &&
            (token.issuedAt ?? 0) < fresh.credentialsChangedAt.getTime()
          ) {
            return {};
          }

          token.name = fresh.name;
          token.role = fresh.role;
          // Re-read rather than trusted from sign-in, so finishing setup in
          // one tab unlocks the admin in every other one within the refresh
          // window instead of requiring a sign-out.
          token.twoFactorEnabled = Boolean(fresh.totpEnabledAt);
        }
        token.checkedAt = Date.now();
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.twoFactorEnabled = Boolean(token.twoFactorEnabled);
        // "Signed in, but not allowed to do anything until 2FA is set up."
        // Computed in one place so middleware, guards and the account page
        // cannot drift apart on what counts as pending.
        session.user.twoFactorPending =
          requiresTwoFactor(token.role as Role) && !token.twoFactorEnabled;
      }
      return session;
    },
  },

  /*
    Arrivals and departures, into the same trail as every other change.

    Here rather than in the login form or the sidebar button because this
    is the only place that knows a sign-in actually succeeded: the form
    submits twice (password, then code) and the first submit is not a
    sign-in, while the button in the sidebar cannot know whether the
    session it is ending was ever valid. See lib/audit/events.ts, including
    what a login with no logout after it does and does not mean.
  */
  events: {
    async signIn({ user }) {
      const actor = user as { id?: string; email?: string | null; role?: Role };

      // Defensive rather than expected: authorize() returns all three on
      // every path that reaches here.
      if (!actor.id || !actor.role) return;

      await recordAuthEvent(AUTH_LOGIN, {
        id: actor.id,
        email: actor.email ?? "",
        role: actor.role,
      });
    },

    async signOut({ token }) {
      /*
        An emptied token is the revocation path in the jwt callback above —
        a deactivated account, or a session older than a password reset. It
        has no id to attribute the row to, and it is not the person
        pressing a button, which is the event this records.
      */
      if (!token?.id || !token.role) return;

      await recordAuthEvent(AUTH_LOGOUT, {
        id: token.id as string,
        email: (token.email as string | null) ?? "",
        role: token.role as Role,
      });
    },
  },
};
