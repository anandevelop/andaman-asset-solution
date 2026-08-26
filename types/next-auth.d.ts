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
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    /** Epoch ms of the last database re-validation of role/isActive. */
    checkedAt?: number;
  }
}
