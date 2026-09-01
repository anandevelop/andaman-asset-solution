# Technical handoff

For the developer taking this over. Assumes you can read TypeScript but
know nothing about this codebase.

Companion documents:

- [DEPLOYMENT.md](./DEPLOYMENT.md) — how to build, migrate and run
- [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) — what must be true before launch
- [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) — for the non-technical site administrator (Thai)

---

## 1. What this is

A bilingual (Thai/English) marketing site and back-office for a Phuket
property developer. One Next.js 15 application serves both: the public site
under `/[locale]/(site)/`, the admin under `/[locale]/admin/`.

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router | Server components keep the data layer off the client |
| Database | PostgreSQL 16 via Prisma | Relational data, and Prisma's types are the schema |
| i18n | next-intl, `/th` and `/en` prefixes | Both locales indexable, no cookie-based switching |
| Auth | NextAuth v4, credentials + JWT | Edge-checkable session without a database round trip |
| Styling | Tailwind, custom design tokens | Palette and components in `tailwind.config.ts` and `app/globals.css` |
| Images | S3 + CloudFront, presigned direct upload | The server never handles file bytes |
| Errors | Sentry, exceptions only | No tracing, no session replay — see §7 |
| Tests | Vitest, 190+ unit tests | Pure functions where a regression would be silent and dangerous |

---

## 2. Layout of the repository

```
app/
  [locale]/
    (site)/        Public pages. The route group exists so /admin and
                   /login do not inherit the marketing Navbar/Footer.
    admin/         Back-office. Guarded twice — middleware and requireAdmin().
    login/
    layout.tsx     html/font/i18n shell only
    error.tsx      Route error boundary (no next-intl — see the comment)
    not-found.tsx
  api/
    auth/[...nextauth]/   NextAuth handler
    leads/                Public lead capture
    events/[id]/register/ Public RSVP
    uploads/presign/      Signed S3 PUT (admin only)
    admin/leads/export/   CSV export (ADMIN+)
    line/webhook/         Inbound LINE events
    revalidate/           External cache purge (NOT used by the admin)
    health/               Liveness + readiness
  sitemap.ts, robots.ts, manifest.ts, global-error.tsx

lib/                  All server-side logic. Start here.
  prisma.ts           Client singleton
  db.ts               safeQuery — degrades to empty on connection failure
  locale.ts           pickLocale. Imports nothing; keep it that way.
  projects/news/events/faqs.ts   Read models per entity
  reports.ts          Dashboard aggregates
  settings.ts         DB overrides merged over config/site.ts
  auth.ts             NextAuth options, bcrypt, brute-force guard
  admin/guard.ts      requireAdmin / requireAdminAction
  s3.ts, line.ts, email.ts, recaptcha.ts, analytics.ts, sentry.ts
  markdown.ts         Markdown → sanitized HTML. Read before touching.
  rate-limit.ts       In-memory limiter + named policies
  csv.ts              CSV escaping, incl. formula-injection guard
  validations.ts      Every zod schema

components/           Public components
components/admin/     Back-office components
config/site.ts        Brand, SEO, nav. Non-editable defaults.
config/team.ts        ⚠ Placeholder people — see LAUNCH_CHECKLIST
prisma/               schema.prisma, migrations, seed
tests/                Vitest suites
messages/th.json, en.json   Every user-facing string
```

---

## 3. The five things most likely to surprise you

**1. `safeQuery` swallows connection errors, not query errors.**
`lib/db.ts` returns a fallback when Postgres is unreachable so the public
site renders an empty state instead of a 500. Constraint violations and
query bugs still throw. If a page shows no data, check
`isDatabaseOffline()` before assuming the query is wrong.

**2. Authorisation is enforced twice, deliberately.**
`middleware.ts` redirects anonymous traffic away from `/admin` — that is
UX. `requireAdmin()` / `requireAdminAction()` in every page and server
action is the actual security boundary, because middleware does not protect
a server action invoked directly.

**3. Markdown is sanitized on the server, with a hook.**
`lib/markdown.ts` runs marked → DOMPurify. The `afterSanitizeAttributes`
hook is not optional: DOMPurify permits `data:` URIs on `<img src>` through
a code path that `ALLOWED_URI_REGEXP` does not cover. Removing the hook
reopens that. `tests/markdown.test.ts` has 17 attack vectors.

**4. `revalidatePath` is called in-process by server actions.**
`/api/revalidate` exists only for external callers (CI, webhooks). Do not
rewire the admin through it — it would add a network hop and a failure mode
for behaviour that already works.

**5. The rate limiter is per-process and in-memory.**
Behind more than one replica, each gets its own counters and the effective
limit multiplies. Move `lib/rate-limit.ts` to Redis before scaling out.

---

## 4. Environment variables

Full annotated reference: `.env.example`. Summary:

| Variable | Required | Purpose | Blast radius if wrong |
|---|:--:|---|---|
| `DATABASE_URL` | ● | Postgres connection | Nothing works |
| `NEXTAUTH_URL` | ● | Exact public origin | Sign-in callback fails silently |
| `NEXTAUTH_SECRET` | ● | JWT signing | Rotating logs everyone out |
| `NEXT_PUBLIC_SITE_URL` | ● | Canonical origin | Corrupts canonicals, sitemap, hreflang, JSON-LD |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | ● | `th` | Wrong default language |
| `DO_SPACES_REGION` | ● | Spaces region (sgp1) | Uploads fail |
| `DO_SPACES_ACCESS_KEY_ID` | ● | Spaces access key | Uploads fail |
| `DO_SPACES_SECRET_ACCESS_KEY` | ● | Spaces secret | Uploads fail |
| `DO_SPACES_BUCKET` | ● | Media bucket | Uploads fail |
| `NEXT_PUBLIC_MEDIA_DOMAIN` | ● | Public media host, **build-time** | Every uploaded image 404s |
| `TZ` | ● | `Asia/Bangkok` | Event times shift by 7 hours |
| `LINE_CHANNEL_SECRET` | ○ | Webhook signature | Webhook rejects everything |
| `LINE_CHANNEL_ACCESS_TOKEN` | ○ | Push API | No lead notifications |
| `LINE_NOTIFY_TO` | ○ | Recipient IDs | No lead notifications |
| `LINE_OA_ID` | ○ | Displayed OA handle | Cosmetic |
| `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` | ○ | LINE CTA target | CTA goes nowhere |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | ○ | Client token | Verification skipped (logged) |
| `RECAPTCHA_SECRET_KEY` | ○ | Server verify | Verification skipped (logged) |
| `RECAPTCHA_MIN_SCORE` | ○ | Default `0.5` | Too high blocks real leads |
| `NEXT_PUBLIC_GA_ID` | ○ | GA4, **build-time**, no admin override | No analytics |
| `NEXT_PUBLIC_META_PIXEL_ID` | ○ | Pixel default — Admin → Settings → Analytics & SEO overrides at runtime | No Meta conversions |
| `GOOGLE_SITE_VERIFICATION` | ○ | Search Console default — same admin field overrides at runtime | Verify via DNS/file instead |
| `NEXT_PUBLIC_SENTRY_DSN` | ○ | Error ingest, **build-time** | No error reports |
| `SENTRY_DSN` | ○ | Server-only fallback | — |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | ○ | Source-map upload in CI | Stack traces are minified |
| `SENTRY_DEBUG_LOCAL` | ○ | Send events from a local run | — |
| `REVALIDATE_SECRET` | ○ | `/api/revalidate` auth | Endpoint returns 501 |
| `CSP_ENFORCE` | ○ | `true` blocks; default reports only | Enforcing early breaks GA/Pixel/reCAPTCHA |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` / `ADMIN_ROLE` | ○ | `npm run admin:create` only | — |
| `POSTGRES_*` | ○ | Local docker-compose only | — |
| `SMTP_*`, `LEAD_NOTIFICATION_TO_EMAIL` | ○ | `lib/email.ts` — staff alerts + RSVP confirmation | No email sent; site still works, LINE-only |

**Build-time vs runtime.** Every `NEXT_PUBLIC_*` value is compiled into the
browser bundle. Changing one needs a rebuild, not a restart. See the
build-arg example in DEPLOYMENT.md §2.

---

## 5. Rotating secrets

| Secret | How | Impact |
|---|---|---|
| `NEXTAUTH_SECRET` | `openssl rand -base64 32`, set, restart | **Everyone is signed out.** Do it out of hours. |
| AWS keys | New IAM access key → set → verify an upload → delete the old key | None if done in that order |
| `LINE_CHANNEL_ACCESS_TOKEN` | Reissue in the LINE console, set, restart | Notifications pause until restarted |
| `LINE_CHANNEL_SECRET` | Reissue, set, restart | Webhook rejects LINE until restarted — reissue and deploy together |
| reCAPTCHA keys | New pair in the admin console; both must change together | A mismatched pair means verification is skipped, not blocked |
| `REVALIDATE_SECRET` | `openssl rand -hex 32`, set, update callers | External purges fail until callers are updated |
| `SENTRY_AUTH_TOKEN` | New token in Sentry, update the CI secret | Source-map upload fails; the build still succeeds |
| Database password | Rotate on the provider, update `DATABASE_URL`, restart | Brief downtime unless the provider supports dual credentials |
| Admin passwords | `/admin/users` → Reset password | That user is not signed out; the JWT lasts up to 8h |

**After any rotation:** `curl -fsS https://your-domain/api/health?deep=1`
and confirm `checks.database.ok` and `checks.s3.reachable`.

---

## 6. Data model

Ten models in `prisma/schema.prisma`. The relationships that matter:

- `Project` → `ProjectProgress` (cascade), `LeadInquiry` (set null)
- `Event` → `EventRegistration` (cascade)
- `User` → `NewsArticle.author`, `ProjectProgress.publishedBy` (both set null,
  so deleting a user keeps their content)

**Soft vs hard delete.** `Project` and `NewsArticle` are soft-deleted
(`deletedAt`) because published URLs and lead attribution point at them.
Everything else is a hard delete — check the relation before adding a
`prisma.x.delete` call.

**Indexes.** `LeadInquiry` carries both `(status, createdAt)` and
`(createdAt, status)`. Column order is the point: the first serves the admin
table, the second serves the reports. Postgres can only seek on a leading
column.

---

## 7. Deliberate omissions

Things a reviewer might flag as missing. Each was a decision:

- **Email is wired but opt-in.** `lib/email.ts` sends a staff copy on
  every lead/RSVP and the RSVP confirmation the on-site copy promises, but
  only once `SMTP_HOST` is set — unset, every send is a logged no-op and
  the site behaves exactly as it did before this existed.
- **No performance tracing or session replay in Sentry.** Replay records
  the DOM of pages carrying names and phone numbers; that is an unanswered
  PDPA question, not an oversight.
- **Cookie consent banner is built, opt-in.** `components/CookieConsentBanner.tsx`
  + `lib/cookie-consent.ts` gate `components/Analytics.tsx`: neither GA4 nor
  the Meta Pixel script mounts until the visitor grants that category, and
  the default before a decision is "neither". Stored under
  `siteConfig.legal.consentVersion` — bumping that string reopens the
  banner for everyone. No full Consent Mode v2 signal API or `fbq('consent', ...)`
  implemented; gating render is simpler and strictly stricter.
- **CSP is Report-Only.** Enforcing before the reports are clean silently
  breaks third-party scripts. See LAUNCH_CHECKLIST §8.
- **No pagination on the admin lead table.** Capped at 100 rows. Add it
  when the list outgrows that; the CSV export covers bulk access today.
- **No image deletion from S3.** Removing an image from a record does not
  delete the object. A lifecycle rule is the cheap fix.

---

## 8. Common tasks

```bash
npm run dev                  # local development
npm run verify               # lint + typecheck + unit tests — before pushing
npm test                     # unit tests only (vitest, no database)
npm run test:coverage        # …with a coverage report in coverage/
npm run test:e2e             # end-to-end (Playwright + axe) — see docs/TESTING.md
npm run typecheck            # tsc --noEmit
npm run lint
npm run build

npx prisma migrate dev       # create + apply a migration locally
npx prisma migrate deploy    # apply in production — never `dev`
npx prisma studio            # browse the database

npm run admin:create -- --email you@example.com --name "You"
npm run db:check             # diagnose a connection problem
```

**Adding a field to an entity** touches, in order: `prisma/schema.prisma` →
migration → `lib/validations.ts` → the entity's `actions.ts` → its form
component → the page that reads it → `messages/*.json` for the label.

**Adding a translated string:** add to **both** `messages/en.json` and
`messages/th.json`. `tests/i18n.test.ts` fails the build if they diverge.

**Before running the e2e suite for the first time:** create its own
database (`createdb andaman_e2e`) and set `E2E_DATABASE_URL`. The suite
truncates every table it can see, and refuses to start if that URL is
missing or equal to `DATABASE_URL`. Full setup in `docs/TESTING.md`.

---

## 9. Maintenance contacts

*To be completed at handover.*

| Role | Company | Name | Email | Phone | Notes |
|---|---|---|---|---|---|
| Product owner | | | | | Decisions on scope and copy |
| Technical maintainer | | | | | Code, deploys, incidents |
| Hosting provider | | | | | Account holder, support plan |
| Database provider | | | | | Backup retention, restore SLA |
| Domain registrar | | | | | Renewal date: |
| AWS account owner | | | | | Billing, IAM |
| LINE OA administrator | | | | | Channel credentials |
| Google account owner | | | | | GA4, Search Console, reCAPTCHA |
| Meta business admin | | | | | Pixel |
| Sentry account owner | | | | | Quota, alert routing |

**Support expectations to agree in writing:** response time for a site
outage, for a broken form, and for a content request. Who is called out of
hours, and by what channel.

---

## 10. First week suggestions

1. Read `lib/db.ts`, `lib/admin/guard.ts` and `lib/markdown.ts`. They
   encode most of the non-obvious decisions.
2. Run the test suite and read `tests/markdown.test.ts` — it documents the
   threat model better than prose.
3. Work through LAUNCH_CHECKLIST §⛔ before anything else. Five known gaps
   are listed there, including placeholder team data on a public page.
4. Watch the CSP Report-Only console output for a week, then enforce.
5. Confirm database backups have actually been restored once, not just
   configured.
