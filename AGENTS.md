# AGENTS.md

Notes for AI coding agents working in this repository. Written for the
things that are not obvious from reading one file — the conventions, the
traps, and the checks that will fail if you ignore them.

Human-facing documentation lives in `README.md` and `docs/`. Read
`docs/HANDOFF.md` first if you need the architectural tour; this file
assumes you have the code in front of you.

---

## What this is

A bilingual-plus (th / en / zh / ru) marketing site and admin back-office
for a Phuket property developer, at `andamanassetsolution.com`. One
Next.js 15 App Router application serves both:

- **Public site** — `app/[locale]/(site)/`
- **Admin back-office** — `app/[locale]/admin/`
- **API routes** — `app/api/` (health, leads, uploads, LINE webhook, auth)

Stack: Next.js 15 (React 19), TypeScript strict, Tailwind, PostgreSQL 16
via Prisma, NextAuth v4 (credentials + JWT + TOTP), next-intl 4, Sentry,
DigitalOcean Spaces for media. Deployed as a Docker image on Node 22.

---

## Commands

```bash
npm run verify        # lint + typecheck + unit tests — run this before you finish
npm run dev           # dev server
npm run build         # production build
npm test              # vitest, unit only
npm run test:e2e      # playwright — needs a running Postgres, see below
npm run typecheck     # tsc --noEmit
npm run prisma:generate
npm run prisma:migrate
npm run db:up         # local Postgres via docker compose
```

`npm run verify` is the gate. Do not report work as done until it passes.

`npm run test:e2e` needs a database and a browser: `npm run db:up`, then
`npm run test:e2e:install` once, then `npm run test:e2e`. It builds the app
in CI mode, so it is slow — but it is the only thing that catches routing,
form and admin-flow regressions, and it is the check most worth running
after any change to middleware, auth, or a form.

**Stop `npm run dev` before running it.** The suite starts its own Next
server on port 3100, and two Next processes in this directory share
`.next/` and overwrite each other's build artefacts. What you get is 404s
and `PageNotFoundError` on routes that are perfectly fine — in the suite
*and* in the dev server you left running, which stays broken at 500 until
you restart it. Four specs failed that way before the cause was obvious.
Giving the suite its own `distDir` fixes the collision and was tried, but
Next rewrites `next-env.d.ts` to point at whichever directory ran last, so
every e2e run would leave a tracked file modified.

---

## Rules that are easy to break

### Translations must stay in parity across all four locales

`messages/{en,th,zh,ru}.json`. next-intl throws at **render time** for a
missing key, so a locale that has drifted takes a page down rather than
falling back. `tests/i18n.test.ts` enforces both directions: every key
present in every file, and every key referenced from source actually
existing. Adding one key means adding it four times.

### A new public page needs three edits, not one

Create the route, add it to the navigation in `config/site.ts`, and add it
to `app/sitemap.ts`. `tests/routes.test.ts` fails otherwise — it exists
because `/progress` sat in the primary nav as a 404 for five phases.

### Public data reads go through `safeQuery`

`lib/db.ts`. A marketing site should not return a 500 because Postgres
blinked, so read paths degrade to an empty state. The scope is deliberately
narrow — only connection-class errors are swallowed; query bugs and
constraint violations still throw. Do not widen it, and do not wrap writes
in it.

### Every admin page and server action re-checks authorisation

`lib/admin/guard.ts`. `middleware.ts` already redirects anonymous requests,
but middleware is a routing concern and does not protect a server action
invoked directly. Middleware is for UX; the guard is for security. A new
admin page or action without a guard call is a hole.

### `NEXT_PUBLIC_*` are compiled in at build time

They cannot be fixed by setting them on the container. They must be passed
as `--build-arg` (see the `ARG` block in `Dockerfile` and `IMAGE_BUILD_ARGS`
in `.github/workflows/ci.yml`). Code that reads one must write
`process.env.NEXT_PUBLIC_FOO` **literally** — a dynamic `process.env[name]`
lookup is not substituted by webpack and reads the runtime environment
instead, which for a correctly built image is empty. `lib/env.ts` has a
worked example of why this matters.

### The environment is validated at boot and the container exits on failure

`lib/env.ts`, called from `instrumentation.ts`. If you add a variable the
app genuinely cannot run without, add it to `REQUIRED`; if the app degrades
without it, add it to `RECOMMENDED` (a warning, never fatal). Cover it in
`tests/env.test.ts`. The check is skipped during `next build`, where the
environment is deliberately incomplete.

### Server actions revalidate in-process

They call `revalidatePath` directly. `/api/revalidate` exists only for
callers with no other way in (CI, external webhooks) and has a path
allowlist so a leaked secret cannot invalidate the whole site. Do not route
admin writes through it.

### The seed must never overwrite admin-owned content

`prisma/seed.ts` upserts. Every `update` branch either touches nothing
(`{}`) or is guarded by an existence check, because the fields it would
re-assert are now editable from `/admin`. An `update` branch that
re-asserts seed values silently reverts real content on the next
`npm run setup`. The seed also refuses to run when `NODE_ENV=production`.

### Adding a third-party script means editing the CSP

`next.config.js`, `CSP_DIRECTIVES`. It ships as **Report-Only** until
`CSP_ENFORCE=true`, so a wrong allowlist fails silently — the page renders,
the script just never runs. Add the host to the right directive when you
add the script, not after someone notices missing analytics.

---

## Patterns worth matching

**Translation tables and the `?lang=` pattern.** Content models pair with a
`*Translation` table. Admin edit forms show one locale at a time, selected
by `?lang=`, with completeness tabs. The shared plumbing is
`lib/admin/translated-form.ts` — use it rather than re-deriving the
fallback logic, and note that the admin form deliberately does *not* use
the public-facing fallback chain.

**Admin forms.** `useActionState` + `useFormStatus` against a server action
in an `actions.ts` file beside the page. Validation with zod in
`lib/validations.ts`. Not react-hook-form.

**Uploads.** The browser PUTs straight to Spaces with a presigned URL from
`/api/uploads/presign` (session-gated, rate limited per user). `lib/s3.ts`
stores an absolute `publicUrl` per upload rather than a bare object key, so
changing media host does not rewrite anything — old rows keep pointing at
the old host forever. That is why `next.config.js` carries more than one
hostname in `remotePatterns`, and why removing one is a data question, not
a config question: run `npm run media:legacy` first, and only drop a host
the scan reports as unreferenced.

**Sentry.** Three runtimes, one set of options in `lib/sentry.ts`, so PII
scrubbing cannot drift between them. `instrumentation.ts` wires the server
and edge SDKs and exports `onRequestError`; `instrumentation-client.ts` is
the browser half. Report handled-but-notable failures with `reportError()`.

**Comments.** This codebase explains *why*, in prose, at the top of files
and above non-obvious decisions — often citing the bug that motivated the
code. Match that. A comment restating what the next line does is noise
here; a comment recording why the obvious approach was rejected is the
house style.

---

## Testing

- **Unit** — `tests/`, vitest, Node environment by default. A test needing
  a DOM opts in with a `@vitest-environment jsdom` docblock on its first
  line (Vitest 4 removed `environmentMatchGlobs`).
- **E2E** — `e2e/`, Playwright, real Postgres and real Chromium.
  `e2e/global-setup.ts` refuses to run when `E2E_DATABASE_URL` matches
  `DATABASE_URL`, so it cannot wipe a development database.
- New behaviour gets a test. The suite's highest-value tests are the cheap
  structural ones — translation parity, nav/sitemap coverage, the XSS
  suite — because nothing in the type system catches what they catch.

---

## Do not

- Commit `.env`, or any real secret. `.env.example` is the documented one.
- Run `npm run prisma:seed` against production. It is guarded, but do not
  reach for `ALLOW_PRODUCTION_SEED=true` to get past the guard.
- Weaken `lib/rate-limit.ts` or set `RATE_LIMIT_DISABLED` outside the e2e
  suite — it is the only brute-force protection on the sign-in route, and
  it is in-memory, so a multi-instance deploy already gets N× the limit.
- Add tracing or session replay to Sentry without deciding the PDPA
  question first: replay records the DOM of pages carrying names, phone
  numbers and email addresses.
- Change `NEXTAUTH_SECRET` casually. TOTP secrets are encrypted with a key
  derived from it, so rotating it invalidates every enrolled authenticator
  at once.
- Assume the build machine has network. `next/font/google` downloads Roboto
  at build time and fails the build outright without it.

---

## Deployment

`docs/DEPLOYMENT.md` for the mechanics, `docs/LAUNCH_CHECKLIST.md` for the
pre-launch sign-off. In short: a Docker image built in `standalone` mode,
`prisma migrate deploy` as a separate service that must succeed before the
app starts, and a reverse proxy in front terminating TLS.

`/api/health` returns 200 or 503, and only the database gates readiness —
S3, LINE and reCAPTCHA are reported but never pull the container out of
rotation.
