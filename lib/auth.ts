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
          },
        });

        // Burn the same bcrypt work when the user is missing, so response
        // time does not reveal whether an address belongs to staff.
        if (!user?.passwordHash) {
          await bcrypt.compare(password, DUMMY_HASH);
          rateLimit(limitKey, RATE_LIMITS.login);
          return null;
        }

        if (!user.isActive) {
          rateLimit(limitKey, RATE_LIMITS.login);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
          rateLimit(limitKey, RATE_LIMITS.login);
          return null;
        }

        // Correct credentials — release the bucket so a run of typos before
        // getting it right does not linger for the rest of the window.
        resetRateLimit(limitKey);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger }) {
      // Sign-in: seed the token from the authorize() result.
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.checkedAt = Date.now();
        return token;
      }

      // Subsequent requests: refresh role/active state periodically so
      // permission changes propagate without a forced sign-out.
      const stale =
        trigger === "update" ||
        typeof token.checkedAt !== "number" ||
        Date.now() - token.checkedAt > ROLE_REFRESH_MS;

      if (stale && token.id) {
        const fresh = await prisma.user
          .findUnique({
            where: { id: token.id as string },
            select: { name: true, role: true, isActive: true },
          })
          .catch(() => null);

        // Database unreachable → keep the existing claims rather than
        // locking every editor out of the CMS.
        if (fresh) {
          if (!fresh.isActive) return {};
          token.name = fresh.name;
          token.role = fresh.role;
        }
        token.checkedAt = Date.now();
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
