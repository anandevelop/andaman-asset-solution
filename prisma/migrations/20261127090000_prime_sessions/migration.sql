-- THE PRIME SESSIONS: replies to the agency invitation are kept as
-- registrations on an unpublished event (see lib/prime-sessions.ts).
-- They carry an answer and dietary needs, and no email address.

-- CreateEnum
CREATE TYPE "RsvpAttendance" AS ENUM ('ATTENDING', 'MAYBE', 'DECLINED');

-- AlterTable
ALTER TABLE "event_registrations" ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN     "attendance" "RsvpAttendance",
ADD COLUMN     "dietary" TEXT;

-- CreateIndex
CREATE INDEX "event_registrations_eventId_phone_idx" ON "event_registrations"("eventId", "phone");

-- The event itself, unpublished so it appears in no list, calendar or
-- sitemap: the invitation page is the only way in. Saturday 12 December
-- 2026, 19:00 Bangkok = 12:00 UTC. Skipped if a row with this slug exists.
INSERT INTO "events" ("id", "slug", "titleEn", "titleTh", "descriptionEn", "descriptionTh", "location", "startsAt", "isPublished", "contentStatus", "createdAt", "updatedAt")
VALUES (
  'evt_prime_sessions_2026',
  'the-prime-sessions',
  'THE PRIME SESSIONS — Live Jazz, Wine & the Privilege Card Launch',
  'THE PRIME SESSIONS — Live Jazz, Wine & the Privilege Card Launch',
  'Agency invitation. Replies come from the invitation page /prime-sessions — keep this event unpublished.',
  'งานเชิญเอเจนซี่ รับคำตอบจากหน้าการ์ดเชิญ /prime-sessions — ไม่ต้องเผยแพร่กิจกรรมนี้',
  'The Residence Prime',
  TIMESTAMP '2026-12-12 12:00:00',
  false,
  'DRAFT',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "event_translations" ("id", "eventId", "locale", "title", "noIndex", "createdAt", "updatedAt")
SELECT 'evt_prime_sessions_2026_' || l.locale, e."id", l.locale,
       'THE PRIME SESSIONS — Live Jazz, Wine & the Privilege Card Launch', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "events" e
CROSS JOIN (VALUES ('en'), ('th'), ('zh'), ('ru')) AS l(locale)
WHERE e."slug" = 'the-prime-sessions'
ON CONFLICT ("eventId", "locale") DO NOTHING;
