import { Database } from "lucide-react";

/**
 * Development-only banner shown when a page rendered its empty state because
 * Postgres was unreachable — so "no projects yet" is never mistaken for
 * "the seed didn't run".
 *
 * Renders nothing in production: visitors should see the normal empty state,
 * not our infrastructure.
 */
export default function DbOfflineNotice() {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="mb-8 rounded-xs border border-amber-500/30 bg-amber-500/6 p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
        <Database size={15} /> Database unreachable — showing an empty state
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        This block is development-only. Start Postgres and load the seed data:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xs bg-primary-900/6 p-4 text-xs leading-relaxed text-ink/80">
        {`npm run db:up
npm run prisma:migrate
npm run prisma:seed`}
      </pre>
      <p className="mt-3 text-sm text-ink/70">
        Then reload. For a step-by-step diagnosis run{" "}
        <code className="text-ink">npm run db:check</code>.
      </p>
    </div>
  );
}
