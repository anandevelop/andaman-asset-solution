/**
 * lib/permissions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What each role may actually do — the table the Users & Permissions page
 * renders, and the checks the pages themselves run.
 *
 * ONE TABLE, USED BOTH WAYS, ON PURPOSE.
 *
 * A permissions screen that is hand-written prose drifts from the code
 * within a release or two, and the drift is invisible: the screen keeps
 * claiming an editor cannot see customer phone numbers long after someone
 * widened a guard. Everything below is the source both for `can()` — which
 * the guards call — and for the matrix the page draws, so the screen
 * cannot describe a rule the app does not enforce.
 *
 * WHY THIS EXISTS AT ALL, RATHER THAN JUST hasRole().
 *
 * lib/role-rank.ts orders the roles SUPER_ADMIN > ADMIN > EDITOR > SALES >
 * VIEWER, and "at least this rank" answers most questions. It cannot
 * answer this one: EDITOR outranks SALES, so `hasRole(role, SALES)` — what
 * the leads pages used to ask — let every content editor read every
 * customer's name, phone and email. That is the wrong shape of question
 * for CRM access, not a wrong threshold, and it is exactly the gap this
 * module closes.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";

export const CAPABILITIES = [
  "viewContent",
  "editContent",
  "publishLive",
  "manageProjects",
  "viewAllLeads",
  "viewCustomerContact",
  "exportCustomerData",
  "viewAuditLog",
  "manageUsers",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * `true` — allowed outright.
 * `false` — refused.
 * A string — allowed, but narrower than the plain yes above it; the string
 * is the i18n key suffix under admin.users.matrix.limit.* describing how.
 * The page draws these as the amber cells; `can()` treats them as allowed,
 * because the narrowing is enforced elsewhere (row scoping in the query,
 * the publish gate, and so on) rather than by this table.
 */
export type Grant = boolean | string;

export const PERMISSION_MATRIX: Record<Capability, Record<Role, Grant>> = {
  viewContent: {
    SUPER_ADMIN: true,
    ADMIN: true,
    EDITOR: true,
    /*
      True again, as of Phase 4 — and this time it is true because
      something enforces it, not by default.

      app/[locale]/admin/(catalog)/layout.tsx and .../(content)/layout.tsx
      now guard at requireAdmin(locale, Role.VIEWER), so a VIEWER account
      can open every page in both zones; every page's own write path
      (its server action, and a disabled <fieldset> around its form) still
      requires EDITOR, unchanged. Phase 1 set this row to `false` because
      the row was describing a right nothing granted — "the screen cannot
      describe a rule the app does not enforce". The rule now exists, so
      the row says so.

      Read-only content access for SALES is not part of this — a rep does
      not need the marketing copy, and lib/admin/nav.ts's ROLE_SETS.CONTENT
      already leaves SALES out of the Pages/news/media/publishing menu on
      that basis. No page in either zone offers SALES a lower guard than
      EDITOR, so the honest value for that row stays false.
    */
    SALES: false,
    VIEWER: true,
  },
  editContent: {
    SUPER_ADMIN: true,
    ADMIN: true,
    EDITOR: true,
    SALES: false,
    VIEWER: false,
  },
  publishLive: {
    SUPER_ADMIN: true,
    ADMIN: true,
    // lib/publishing-gate.ts: an editor may move a row into review but
    // cannot flip isPublished on an unreviewed one.
    EDITOR: "submitOnly",
    SALES: false,
    VIEWER: false,
  },
  manageProjects: {
    SUPER_ADMIN: true,
    ADMIN: true,
    EDITOR: true,
    // A rep may change a unit's sale status from the desk or the phone
    // (units/actions.ts's updateUnitStatusMobile), and nothing else.
    SALES: "unitStatusOnly",
    VIEWER: false,
  },
  viewAllLeads: {
    SUPER_ADMIN: true,
    ADMIN: true,
    // The PDPA fix. A content editor writes project copy and news posts;
    // the enquiry list is not theirs to read.
    EDITOR: false,
    SALES: "ownScope",
    VIEWER: false,
  },
  viewCustomerContact: {
    SUPER_ADMIN: true,
    ADMIN: true,
    EDITOR: false,
    SALES: "ownLeads",
    VIEWER: false,
  },
  exportCustomerData: {
    SUPER_ADMIN: true,
    // Every export already writes who took it, with which filters and how
    // many rows, to the server log (app/api/admin/leads/export).
    ADMIN: "logged",
    EDITOR: false,
    SALES: false,
    VIEWER: false,
  },
  viewAuditLog: {
    SUPER_ADMIN: true,
    // Deliberately narrower than the mockup, which put a tick here: the
    // activity page shows every action by every account, and widening
    // access to it is not a change to make silently while implementing a
    // screen about tightening access.
    ADMIN: false,
    EDITOR: false,
    SALES: false,
    VIEWER: false,
  },
  manageUsers: {
    SUPER_ADMIN: true,
    ADMIN: false,
    EDITOR: false,
    SALES: false,
    VIEWER: false,
  },
};

/** Display order of the columns — strongest first, like the mockup. */
export const ROLE_ORDER: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.SALES,
  Role.VIEWER,
];

/**
 * May this role do this at all?
 *
 * A narrowed grant counts as allowed — see Grant above. A caller that
 * needs to know *how* narrow reads the matrix directly, which is what the
 * lead queries do to decide between "every lead" and "the ones assigned to
 * you".
 */
export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[capability][role] !== false;
}

/** True only for an unrestricted grant — no row scoping, no gate. */
export function canFully(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[capability][role] === true;
}
