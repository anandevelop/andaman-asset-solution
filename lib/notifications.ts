import "server-only";

/**
 * lib/notifications.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the back office tells people about, on which channel, and who gets
 * told.
 *
 * THE TABLE ON THE SETTINGS SCREEN IS THIS LIST
 *
 * Every row rendered there comes from NOTIFICATION_EVENTS below, and every
 * switch writes a preference this file then honours at send time. There is
 * no row on that screen that nothing reads, and no notification sent that
 * has no row.
 *
 * THREE OF THEM ARE SWITCHED OFF AT THE SOURCE, AND SAY SO
 *
 * "Nobody picked this lead up within two hours", "a unit reservation is
 * about to expire" and "the Monday summary" are not events — they are the
 * *absence* of an event after a period of time, which needs something
 * running on a clock. This application has no scheduler: no cron, no
 * worker, no queue (see the Redis row on the settings screen, which says
 * the same thing from the other end). So those three carry
 * `needsScheduler`, their switches render disabled with the reason, and
 * nothing here will send them. Shipping three switches that quietly do
 * nothing would be worse than shipping four that work.
 *
 * DELIVERY IS BEST EFFORT AND NOT RETRIED
 *
 * Also a consequence of having no queue. An in-app row is a database write
 * in the same transaction-less breath as the thing that caused it; an
 * email goes out through lib/email.ts and, if the SMTP host is down, is
 * gone. That is a real limitation, stated on the settings screen rather
 * than hidden here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { withoutAudit } from "@/lib/audit/context";
import { can, type Capability } from "@/lib/permissions";

/** Where the preference map lives. A SiteSetting row, like leadRouting —
 *  one JSON blob for a handful of booleans needs no table of its own. */
const PREFS_KEY = "notificationPrefs";

export type NotificationChannel = "email" | "inApp";

export type NotificationEvent = {
  key: string;
  /** Who is told. Somebody who cannot see leads is never told about one. */
  capability: Capability;
  /** True when the event is a timer, not a thing that happens. */
  needsScheduler: boolean;
  /** Channels this event can use at all. */
  channels: readonly NotificationChannel[];
  /** What both channels default to before anybody visits the settings. */
  defaults: Record<NotificationChannel, boolean>;
};

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  {
    key: "newLead",
    capability: "viewAllLeads",
    needsScheduler: false,
    channels: ["email", "inApp"],
    defaults: { email: true, inApp: true },
  },
  {
    key: "unclaimedLead",
    capability: "viewAllLeads",
    // "Two hours have passed and nobody has touched it" — a timer.
    needsScheduler: true,
    channels: ["email", "inApp"],
    defaults: { email: false, inApp: false },
  },
  {
    key: "eventRegistration",
    capability: "viewAllLeads",
    needsScheduler: false,
    channels: ["email", "inApp"],
    defaults: { email: true, inApp: true },
  },
  {
    key: "contentInReview",
    capability: "publishLive",
    needsScheduler: false,
    channels: ["email", "inApp"],
    defaults: { email: false, inApp: true },
  },
  {
    key: "reservationExpiring",
    capability: "viewAllLeads",
    // A date passing with nothing having happened — a timer.
    needsScheduler: true,
    channels: ["email", "inApp"],
    defaults: { email: false, inApp: false },
  },
  {
    key: "weeklySummary",
    capability: "viewAuditLog",
    // Every Monday — a timer.
    needsScheduler: true,
    channels: ["email", "inApp"],
    defaults: { email: false, inApp: false },
  },
  {
    key: "failedLogins",
    capability: "manageUsers",
    needsScheduler: false,
    channels: ["email", "inApp"],
    defaults: { email: true, inApp: true },
  },
] as const;

export type NotificationPrefs = Record<string, Record<NotificationChannel, boolean>>;

export function defaultNotificationPrefs(): NotificationPrefs {
  return Object.fromEntries(
    NOTIFICATION_EVENTS.map((event) => [event.key, { ...event.defaults }]),
  );
}

function eventByKey(key: string): NotificationEvent | undefined {
  return NOTIFICATION_EVENTS.find((event) => event.key === key);
}

/**
 * Saved preferences merged over the defaults.
 *
 * Merged rather than replaced so a new event added to the list above
 * arrives switched to its own default, instead of being silently off for
 * everyone who saved this screen before it existed.
 */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const row = await safeQuery(
    "notifications:prefs",
    () => prisma.siteSetting.findUnique({ where: { key: PREFS_KEY }, select: { value: true } }),
    null,
  );

  const prefs = defaultNotificationPrefs();
  if (!row?.value) return prefs;

  try {
    const saved = JSON.parse(row.value) as Partial<NotificationPrefs>;

    for (const event of NOTIFICATION_EVENTS) {
      const stored = saved[event.key];
      if (!stored) continue;

      for (const channel of event.channels) {
        if (typeof stored[channel] === "boolean") prefs[event.key][channel] = stored[channel];
      }
    }
  } catch {
    // A malformed blob falls back to the defaults rather than turning
    // every notification off without telling anybody.
  }

  return prefs;
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  // Only known keys and channels are written, and never one that needs a
  // scheduler — an on switch for something nothing can send is a lie
  // stored in the database.
  const clean: NotificationPrefs = {};

  for (const event of NOTIFICATION_EVENTS) {
    const incoming = prefs[event.key] ?? {};
    clean[event.key] = {
      email: event.needsScheduler ? false : Boolean(incoming.email),
      inApp: event.needsScheduler ? false : Boolean(incoming.inApp),
    };
  }

  await prisma.siteSetting.upsert({
    where: { key: PREFS_KEY },
    create: { key: PREFS_KEY, value: JSON.stringify(clean) },
    update: { value: JSON.stringify(clean) },
  });
}

/** Is this channel switched on for this event right now? */
export async function isEnabled(
  eventKey: string,
  channel: NotificationChannel,
): Promise<boolean> {
  const event = eventByKey(eventKey);
  if (!event || event.needsScheduler || !event.channels.includes(channel)) return false;

  const prefs = await getNotificationPrefs();
  return prefs[eventKey]?.[channel] === true;
}

/**
 * Write the in-app half of a notification.
 *
 * Returns the number of people told, which is 0 when the switch is off —
 * callers use that only for logging; nothing about the thing that happened
 * depends on whether anybody was notified about it.
 *
 * Never throws: a lead that arrives must be saved even if the notification
 * about it cannot be, and the caller has already committed by this point.
 */
export async function notifyAdmins(args: {
  event: string;
  title: string;
  body?: string;
  href?: string;
}): Promise<number> {
  const event = eventByKey(args.event);
  if (!event || event.needsScheduler) return 0;

  try {
    if (!(await isEnabled(args.event, "inApp"))) return 0;

    const recipients = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true },
    });

    const targets = recipients.filter((user) => can(user.role as Role, event.capability));
    if (targets.length === 0) return 0;

    /*
      withoutAudit: these rows are written by the system in reaction to
      something a visitor did, not by an administrator editing anything.
      Logging them would fill the audit trail with entries whose actor is
      whoever happened to trigger the request.
    */
    await withoutAudit(() =>
      prisma.adminNotification.createMany({
        data: targets.map((user) => ({
          userId: user.id,
          event: args.event,
          title: args.title,
          body: args.body ?? null,
          href: args.href ?? null,
        })),
      }),
    );

    return targets.length;
  } catch (error) {
    console.error("[notifications] failed to write", { event: args.event, error });
    return 0;
  }
}

export type NotificationRow = {
  id: string;
  event: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** The bell's feed: the newest few, plus how many are unread. */
export async function getNotificationsFor(
  userId: string,
  take = 10,
): Promise<{ rows: NotificationRow[]; unread: number }> {
  return safeQuery(
    "notifications:feed",
    async () => {
      const [rows, unread] = await Promise.all([
        prisma.adminNotification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            event: true,
            title: true,
            body: true,
            href: true,
            readAt: true,
            createdAt: true,
          },
        }),
        prisma.adminNotification.count({ where: { userId, readAt: null } }),
      ]);

      return { rows, unread };
    },
    { rows: [], unread: 0 },
  );
}
