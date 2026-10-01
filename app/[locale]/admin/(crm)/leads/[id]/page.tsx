/**
 * app/[locale]/admin/leads/[id]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One lead's full record (LeadDetail.dc.html): a header that answers "how
 * long has this been open and when did we last touch it" at a glance, a
 * four-tab composer (note/call/email/appointment), the unified activity
 * timeline that merges notes, audited field changes, booked appointments
 * and the lead's own arrival (lib/lead-timeline.ts), and a sidebar of
 * contact/ownership/PDPA/source facts.
 *
 * SALES-role scoping mirrors the list page and actions.ts: a SALES session
 * looking at a lead assigned to someone else gets notFound() rather than a
 * permission page, so the existence of another rep's lead is not
 * disclosed by the difference between "not found" and "forbidden".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { requireCapability } from "@/lib/admin/guard";
import LeadDetailView from "@/components/admin/LeadDetailView";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

/* The body lives in LeadDetailView so the pipeline's side drawer
   (/admin/leads?lead=[id]) renders exactly the same thing. */
export default async function AdminLeadDetailPage(props: Props) {
  const { locale, id } = await props.params;

  /* Guarded here as well as inside the view: every page that shows a
     customer record states its own guard, so tests/permissions.test.ts can
     check each one by reading it, and a later refactor of the view cannot
     silently unguard the route. */
  await requireCapability(locale, "viewAllLeads");

  return <LeadDetailView locale={locale} id={id} variant="page" />;
}
