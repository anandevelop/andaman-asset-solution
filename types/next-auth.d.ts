/**
 * types/next-auth.d.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Module augmentation so `session.user.role` and `token.role` are typed as
 * the Prisma Role enum instead of `any` throughout the admin pages.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** Has a confirmed authenticator enrolled. */
      twoFactorEnabled: boolean;
      /** Role requires 2FA but none is enrolled — access is gated on setup. */
      twoFactorPending: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    twoFactorEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    twoFactorEnabled?: boolean;
    /** Epoch ms of the last database re-validation of role/isActive. */
    checkedAt?: number;
  }
}
