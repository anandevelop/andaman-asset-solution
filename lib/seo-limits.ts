/**
 * lib/seo-limits.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where Google truncates a title and a description.
 *
 * Its own file, with no imports, because both sides need it: the checklist
 * in lib/admin/page-seo.ts (server, "server-only") and the character
 * counters in components/admin/PageSeoEditor.tsx (client). Importing the
 * former from the latter is what this file exists to prevent — it compiles
 * fine and then fails at request time with "you're importing a component
 * that needs server-only".
 *
 * Approximations, not API limits: Google measures rendered pixel width,
 * not characters, and the cut-off moves. These are the numbers the SEO
 * tooling everyone here already uses shows, which is what makes them
 * useful — a counter that disagrees with the tool beside it is noise.
 *
 * titleMin/descriptionMin (added for lib/article-seo.ts's News checklist)
 * are the lower bound of the same recommendation — too short wastes the
 * space Google gives a snippet, same "don't re-hardcode it a second place"
 * reasoning as the two upper bounds above.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const SEO_LIMITS = { title: 60, titleMin: 30, description: 160, descriptionMin: 120 } as const;
