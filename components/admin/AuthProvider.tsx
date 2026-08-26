"use client";

/**
 * components/admin/AuthProvider.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Thin "use client" wrapper around NextAuth's SessionProvider so it can be
 * mounted from a server component. Scoped to /login and /admin only — the
 * public marketing pages stay fully static and never fetch a session.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { SessionProvider } from "next-auth/react";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
