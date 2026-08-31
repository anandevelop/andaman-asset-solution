/**
 * app/[locale]/admin/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Back-office chrome: persistent sidebar, identity block, sign-out.
 *
 * requireAdmin() runs here as well as in each page. The middleware already
 * redirects anonymous traffic, but a layout guard means a new page added
 * under /admin is protected the moment it is created, even if the author
 * forgets to call the guard themselves.
 *
 * The one thing this guard does NOT enforce is the 2FA enrolment gate. It
 * cannot: the setup page lives under /admin and therefore renders inside
 * this layout, so a layout that redirects a pending account would redirect
 * the very page it is sending them to — a loop with no exit. Enrolment is
 * gated in three places that can tell the difference:
 *
 *   • middleware.ts   — every admin URL except the setup page
 *   • each page's own requireAdmin() — the setup page opts out explicitly
 *   • requireAdminAction() — server actions, which middleware never sees
 *
 * A page added under /admin without its own guard is still unreachable for
 * a pending account, because middleware turns the navigation away first.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/guard";
import AuthProvider from "@/components/admin/AuthProvider";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata: Metadata = {
  title: "Back office",
  robots: { index: false, follow: false },
};

// The admin reads live data on every request; nothing here should be
// statically generated or cached between users.
export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

export default async function AdminLayout({ children, params: { locale } }: Props) {
  const user = await requireAdmin(locale, undefined, { allowTwoFactorSetup: true });

  return (
    <AuthProvider>
      <div className="min-h-screen bg-surface lg:flex">
        <AdminSidebar locale={locale} user={user} />

        <div className="flex-1 lg:min-w-0">
          <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
            {children}
          </div>
        </div>
      </div>
    </AuthProvider>
  );
}
