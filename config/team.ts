/**
 * config/team.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The people shown on /about.
 *
 * Deliberately a config file rather than a database model. This list
 * changes once or twice a year, it needs no workflow, and giving it a
 * Prisma table plus an admin CRUD would be more machinery than the problem
 * deserves. Promote it to the database when someone actually asks to edit
 * it without a deploy.
 *
 * The roster is empty, and nothing renders it: the "Our Team" section was
 * removed from /about rather than populated with fake people (see
 * docs/LAUNCH_CHECKLIST.md), and this file was kept for the shape, not the
 * contents. It used to carry four invented directors with stock portraits
 * of identifiable strangers attached to their names and job titles — a
 * worse artefact to leave lying in a repository than a placeholder building
 * photo, because the next person to wire this up would have shipped them.
 *
 * To bring the section back: fill `team` with real people and real
 * photographs, then re-add the section to app/[locale]/(site)/about/page.tsx.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type TeamMember = {
  /** Stable key, used for React list keys. */
  key: string;
  name: { en: string; th: string };
  role: { en: string; th: string };
  /** One line on what they are actually responsible for. */
  focus: { en: string; th: string };
  imageUrl: string;
};

export const team: TeamMember[] = [];
