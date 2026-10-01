/**
 * lib/admin/notification-feed.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Shaping the bell's feed for the drawer: what counts as important, which
 * rows are the same thing said twice, and which are test traffic.
 *
 * Pure, so the rules are tested without a database; the server action that
 * dismisses test rows (notifications-actions.ts) uses the same predicate,
 * so what the drawer folds away and what the button clears cannot differ.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The events somebody should act on today; the rest are "for your
 *  information" and live under ทั้งหมด only. */
export const IMPORTANT_EVENTS: ReadonlySet<string> = new Set([
  "newLead",
  "unclaimedLead",
  "reservationExpiring",
  "failedLogins",
]);

/**
 * Test traffic, by what it calls itself. The feed today carries rows like
 * "Landing Test" and "p6-test-…" from QA runs against production; they
 * are real rows (and their leads real rows), so they are folded away, not
 * deleted — the same "filter, not delete" rule the v4 brief sets for test
 * 404 hits. Deliberately narrow: a customer called Tess must not vanish.
 */
const TEST_PATTERN = /\blanding test\b|\bp\d+-test-|\be2e[-_ ]|\[test\]|@andaman\.test\b/i;

export function isTestNotification(row: { title: string; body: string | null }): boolean {
  return TEST_PATTERN.test(row.title) || (row.body !== null && TEST_PATTERN.test(row.body));
}

export type FeedRow = {
  id: string;
  event: string;
  title: string;
  body: string | null;
  read: boolean;
};

export type FeedEntry<R extends FeedRow> = {
  /** The newest of the group — what is drawn. */
  row: R;
  /** How many identical rows it stands for (same event and title in a row). */
  count: number;
  /** Unread if any row in the group is. */
  read: boolean;
};

/**
 * Newest-first rows → drawer entries. Consecutive rows with the same event
 * and title collapse into one with a count: five "failed sign-ins locked
 * x@…" in a minute is one fact, not five. Test rows are set aside.
 */
export function buildFeed<R extends FeedRow>(rows: readonly R[]): { entries: FeedEntry<R>[]; tests: R[] } {
  const entries: FeedEntry<R>[] = [];
  const tests: R[] = [];

  for (const row of rows) {
    if (isTestNotification(row)) {
      tests.push(row);
      continue;
    }
    const last = entries.at(-1);
    if (last && last.row.event === row.event && last.row.title === row.title) {
      last.count += 1;
      last.read = last.read && row.read;
    } else {
      entries.push({ row, count: 1, read: row.read });
    }
  }

  return { entries, tests };
}
