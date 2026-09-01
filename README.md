# Andaman Asset Solution — Phase 2 (Data Layer & API)

Luxury real-estate site for `andamanassetsolution.com`. Next.js 15 (App Router, React 19,
TypeScript), Tailwind CSS, PostgreSQL + Prisma, `next-intl` (TH/EN), `framer-motion`,
`lucide-react`.

## What's in Phase 1

| Area | File(s) |
|---|---|
| Local Postgres | `docker-compose.yml` |
| Environment template | `.env.example` |
| Full data model | `prisma/schema.prisma` |
| Centralized contact/social config | `config/site.ts` |
| Brand tokens (colors, fonts, motion) | `tailwind.config.ts`, `app/globals.css` |
| i18n routing (TH/EN) | `i18n.ts`, `middleware.ts`, `messages/*.json` |
| Global layout + SEO | `app/[locale]/layout.tsx` |
| Shared UI | `components/*` |

## What's in Phase 2

| Area | File(s) |
|---|---|
| Seed data (Trinity Village + 3 progress months) | `prisma/seed.ts` |
| Server-only data access + Decimal serialization | `lib/projects.ts` |
| Locale-aware number/date formatting | `lib/format.ts` |
| Dynamic project route | `app/[locale]/projects/[slug]/page.tsx` |
| Project listing grid | `app/[locale]/projects/page.tsx` |
| Lead capture API | `app/api/leads/route.ts` |
| In-memory rate limiter | `lib/rate-limit.ts` |
| PDPA privacy notice (TH/EN) | `app/[locale]/privacy-policy/page.tsx`, `content/privacy-policy.ts` |

## Getting started

```bash
npm install
npm run setup            # database → migrate → seed → verify
npm run dev              # http://localhost:3000 → redirects to /th
```

`npm run setup` picks whichever Postgres engine this machine has:

| | Requires | Command |
|---|---|---|
| **Docker** | Docker Desktop running | `npm run setup:docker` |
| **Native** | Homebrew (installs `postgresql@16`) | `npm run setup:native` |

`setup` auto-detects — Docker if the daemon is up, otherwise Homebrew. Neither
installed? It prints both install commands. Each step stops with the specific
fix for that step (daemon not running, port 5432 taken, credential mismatch,
migration failure) instead of failing confusingly later. Safe to re-run.

Stop the database with `npm run db:stop`.

Manual equivalent, if you prefer the steps separately:

```bash
cp .env.example .env
npm run db:up            # Docker only — starts Postgres + Adminer
npm run prisma:migrate   # creates tables from schema.prisma
npm run prisma:seed      # inserts Trinity Village + progress galleries
```

Scripts are split so each is readable on its own:
`scripts/setup-db.sh` (dispatcher + migrate/seed) → `setup-docker.sh` /
`setup-native.sh` (bring Postgres up) → `setup-lib.sh` (shared helpers,
reads credentials from `.env` rather than hardcoding them).

`prisma:seed` is idempotent (upsert on `slug` and `projectId+year+month`), so
it is safe to re-run after a `prisma migrate reset`.

## Troubleshooting: "Can't reach database server at localhost:5432"

Run `npm run db:check`. It walks the layers in order and prints the exact
next step:

1. Is `DATABASE_URL` set and parseable?
2. Is anything listening on that host and port?
3. Do the credentials authenticate?
4. Have migrations been applied, and is there any seed data?

Common causes:

| Symptom | Fix |
|---|---|
| Docker Desktop not running | `docker info` — start Docker, then `npm run db:up` |
| Port 5432 already taken by a local Postgres | `lsof -i :5432`; change the mapping in `docker-compose.yml` to `"5433:5432"` and update `DATABASE_URL` |
| `P1000` auth failed | The pg volume was created with an older password: `npm run db:reset` (**destroys local data**) |
| `P2021` table does not exist | `npm run prisma:migrate` |
| Pages render but empty | `npm run prisma:seed` |

The app does not hard-crash when Postgres is down. `lib/db.ts` catches
connection-class errors only (`P1000`–`P1017`, `P2021`, `P2022`) and degrades
reads to an empty state; query bugs and constraint violations still throw.
In development an amber banner explains why a page is empty, and
`app/[locale]/error.tsx` renders the recovery instructions. `POST /api/leads`
returns `503` with `Retry-After` rather than `500`, so a lost submission is
retryable.

Adminer (DB browser) is available at `http://localhost:8080` once `db:up` is running.

## Routing & i18n

All pages live under `app/[locale]/...` with `locale` = `th` or `en`
(`localePrefix: "always"`, default `th`, set in `config/site.ts` /
`NEXT_PUBLIC_DEFAULT_LOCALE`). Copy lives in `messages/th.json` and
`messages/en.json` — never hardcode UI strings in components.

## Design system

- **Colors**: `primary` `#083551`, `surface` (bg) `#f9f9fa`, `accent` `#e8b384` —
  all defined as full Tailwind scales in `tailwind.config.ts`.
- **Type**: Roboto via `next/font/google`, loaded once in `app/[locale]/layout.tsx`.
- **Signature element**: the "horizon divider" (`.horizon-divider` in
  `globals.css`) — a thin line fading from transparent → accent → transparent,
  echoing the sea horizon at dusk. Used to separate major content blocks
  instead of a generic hairline rule.
- **Motion**: `components/Reveal.tsx` wraps `framer-motion` scroll-reveal
  behavior so every section fades/slides in consistently; reduced-motion is
  respected globally in `globals.css`.

## Database model highlights

`prisma/schema.prisma` covers Phase 1 needs plus groundwork for later phases:

- `User` / `Account` / `Session` — NextAuth-compatible admin auth with `Role`.
- `Project` — bilingual project records (drives `[slug]` routing once the
  example Trinity Village page is generalized in Phase 2) with facilities,
  pricing, status, and soft delete.
- `ProjectProgress` — monthly image galleries per project (mocked in the UI
  via `components/ProgressGallery.tsx` for now).
- `NewsArticle` — bilingual SEO blog with slug, meta title/description,
  category, tags, publish state.
- `LeadInquiry` — contact/inquiry submissions with **PDPA consent trail**
  (`consentGiven`, `consentedAt`, `consentVersion`), status pipeline, and
  UTM/source tracking.
- `Event` / `EventRegistration` — open-house events with RSVP capacity and
  status tracking.

## POST /api/leads

Public endpoint used by `components/LeadForm.tsx`.

| Status | Body | Meaning |
|---|---|---|
| `201` | `{ ok: true, id }` | Lead stored |
| `400` | `{ ok: false, error: "INVALID_JSON" }` | Unparseable body |
| `404` | `{ ok: false, error: "PROJECT_NOT_FOUND" }` | `projectSlug` unknown or unpublished |
| `422` | `{ ok: false, error: "VALIDATION_FAILED", fields }` | Zod failure; `fields` maps to form inputs |
| `429` | `{ ok: false, error: "RATE_LIMITED", retryAfter }` | 5 submissions per IP per 10 min |
| `500` | `{ ok: false, error: "SERVER_ERROR" }` | Persist failed |

A hidden `company` honeypot field is accepted and silently discarded (`201`
with no record written) so bots don't learn the real shape.

**Rate limiting is per-process and in-memory** (`lib/rate-limit.ts`). A
multi-instance deploy effectively multiplies the limit by the instance count —
swap the store for Redis/Upstash before scaling horizontally, and wire up the
reCAPTCHA keys already present in `.env.example`.

## PDPA consent versioning

`siteConfig.legal.consentVersion` is the single source of truth. It is
rendered on `/[locale]/privacy-policy`, sent with every form submission, and
persisted to `LeadInquiry.consentVersion` alongside `consentedAt`, `ipAddress`
and `userAgent`. When the substance of the notice changes, **bump the version
string** (e.g. `privacy-policy-v2`) rather than editing in place — existing
consent records must keep pointing at the text they were given.

## Known Phase 3+ follow-ups (by design, not oversights)

- NextAuth route handlers (`app/api/auth/[...nextauth]/route.ts`) and the
  admin dashboard — deliberately deferred out of Phase 2.
- Nodemailer notification to `LEAD_NOTIFICATION_TO_EMAIL` and LINE OA push on
  new leads; neither should block the `201` response.
- reCAPTCHA verification on `POST /api/leads`, plus a Redis-backed rate limiter.
- Add `sitemap.ts`, `robots.ts`, and JSON-LD (`RealEstateListing`) structured
  data for SEO.
- Cookie consent banner (analytics/marketing cookies are named in the privacy
  notice but not yet gated).
- Have Thai counsel review `content/privacy-policy.ts` — retention periods and
  lawful bases are a working draft.
