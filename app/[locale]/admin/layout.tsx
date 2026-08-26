/**
 * app/[locale]/admin/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Back-office chrome: persistent sidebar, identity block, sign-out.
 *
 * requireAdmin() runs here as well as in each page. The middleware already
 * redirects anonymous traffic, but a layout guard means a new page added
 * under /admin is protected the moment it is created, even if the author
 * forgets to call the guard themselves.
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
  const user = await requireAdmin(locale);

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
