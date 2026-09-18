# Launch checklist

Everything that must be true before this site is reachable at
`andamanassetsolution.com`. Grouped by owner so it can be split up.

Mechanics of deploying are in [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## ⛔ Known gaps — these ship broken unless handled

Tracked openly rather than buried. Each is a deliberate decision, not an
oversight, but none of them should reach production untouched.

- [x] ~~Favicon and app icons do not exist.~~ Generated from the brand
      mark and dropped into `public/`: `favicon.ico`, `icon-192.png`,
      `icon-512.png`, `icon-maskable-512.png` (mark rescaled to fit
      Android's 80%-safe-zone circle so it isn't clipped) and
      `apple-touch-icon.png`.
- [x] ~~Team page is fictional.~~ The "Our Team" section (invented names,
      roles and stock photographs) has been removed from `/about` entirely
      rather than populated with fake people. `config/team.ts` is left on
      disk, unused, in case a real team roster is added later.
- [ ] **`public/og-image.jpg` is a generated placeholder.** Typographic
      only, correct brand colours. Fine to launch with; replace when
      photography is available — no longer a deploy, since Admin →
      Settings → Branding & SEO uploads one over it. The committed file
      stays as the fallback behind that setting.
- [ ] **30 rows still point at the retired Supabase host.** Re-scanned
      2026-09-02 in local dev: 30 rows across 12 columns — every project's
      hero, gallery, concept and master-plan image, all three sales-team
      photos, both news covers, three hero-story slides, three floor plans,
      three facility images, two progress galleries and one event cover.
      They are reachable only because the Supabase hosts are back in
      `next.config.js` as `legacyMediaHosts` — a stopgap, not a fix. Run
      `npm run media:legacy` to list them, re-upload each through
      `/admin`, confirm the scan comes back clean, then delete
      `legacyMediaHosts`. Production has its own database and needs its own
      scan.
- [ ] **Email notifications are implemented but unconfigured by default.**
      `lib/email.ts` sends a staff copy on every lead/RSVP and the RSVP
      confirmation the copy promises the attendee ("we will confirm by
      email") — but it degrades to a silent no-op until `SMTP_HOST` is set.
      Set the SMTP block in section 2 below before launch, and confirm a
      real RSVP produces both the staff email and the attendee
      confirmation (see section 10).
- [x] ~~**Seed data must not reach production.**~~ `prisma/seed.ts` now
      refuses to run when `NODE_ENV=production` and exits non-zero, which
      also covers `npm run setup` calling it as its last step. Override
      with `ALLOW_PRODUCTION_SEED=true` only for a brand-new, still-empty
      production database. The demo project, article and event it inserts
      still have to be removed from any database that was seeded before
      this guard existed — see section 5.

---

## 1. Domain and TLS

- [ ] `A` / `AAAA` records point at the host
- [ ] `www` redirects to the apex (or the reverse) — pick one, permanently
- [ ] TLS certificate issued and auto-renewing
- [ ] HTTP redirects to HTTPS at the proxy
- [ ] HSTS confirmed — `Strict-Transport-Security` is already sent with
      `preload`, so **verify HTTPS works on every subdomain first**. This
      header is difficult to undo; browsers cache it for two years.
- [ ] `https://andamanassetsolution.com/api/health` returns `200`

---

## 2. Environment variables

Cross-check against `.env.example`, which annotates each one.

- [ ] `DATABASE_URL` points at production, with `sslmode=require`
- [ ] `NEXTAUTH_SECRET` freshly generated — **not** the value used in
      staging or development
- [ ] `NEXTAUTH_URL` exactly matches the public origin, no trailing slash
- [ ] `NEXT_PUBLIC_SITE_URL` likewise — it drives canonical URLs, hreflang,
      the sitemap and every JSON-LD block
- [x] All `NEXT_PUBLIC_*` values passed as **build args**, not just runtime
      env — see the build-time trap in DEPLOYMENT.md. Verified 2026-09-02:
      `Dockerfile` declares an `ARG` for each, and `IMAGE_BUILD_ARGS` in
      `.github/workflows/ci.yml` supplies them to both the smoke-test build
      and the published one. `NEXT_PUBLIC_GA_ID` is deliberately absent —
      see the analytics note in section 7 before you add it.
- [x] `TZ=Asia/Bangkok` set on the container — verified 2026-09-02 on
      both the `app` and `migrate` services in `docker-compose.prod.yml`
- [x] No `.env` file committed to the repository — verified 2026-09-02,
      `git ls-files .env` is empty and `.gitignore` covers it

> The container now checks this itself. `instrumentation.ts` runs
> `lib/env.ts` at server start and **exits non-zero** if `DATABASE_URL`,
> `NEXTAUTH_SECRET`, `NEXTAUTH_URL` or `NEXT_PUBLIC_SITE_URL` is missing,
> if the secret is under 32 characters, or if either URL is plain `http`
> or ends in a slash. Optional integrations (media domain, Spaces, SMTP,
> reCAPTCHA) are warned about in the startup log rather than fatal, so
> `docker compose logs app` on first boot is the fastest way to see what
> is still unset. The check is skipped during `next build`, where the
> environment is deliberately incomplete.

---

## 3. Database

- [ ] `prisma migrate deploy` run against production
- [ ] `prisma migrate status` reports no pending migrations
- [ ] **Automated backups enabled**, with retention agreed in writing
- [ ] A restore has actually been tested — an untested backup is a hope
- [ ] Connection limit checked against expected concurrency; add PgBouncer
      if the host is small
- [ ] Database is not reachable from the public internet

---

## 4. Admin access

- [ ] First `SUPER_ADMIN` created — from the deployed container, not your
      laptop: `docker compose -f docker-compose.prod.yml exec app node
      scripts/create-admin.mjs --email … --name "…"`. Add `--password '…'`
      to choose it yourself; otherwise one is generated and printed once.
      The full command is in [DEPLOYMENT.md](./DEPLOYMENT.md). Locally the
      same tool is `npm run admin:create`.
- [ ] Generated password changed at `/th/admin/account`
- [ ] Real accounts created at `/admin/users` for each team member, at the
      **lowest** role that does their job — `EDITOR` for content, `ADMIN`
      for projects and events, `SUPER_ADMIN` sparingly
- [ ] At least **two** active `SUPER_ADMIN` accounts. The system refuses to
      remove the last one, so a single account that loses its password is a
      shell-access recovery job.
- [ ] Sign-in tested on production
- [ ] **Two-factor enrolled for every account, `EDITOR` included.** Everyone
      is redirected to `/admin/account/security` and cannot reach anything
      else until they finish, so this happens whether or not it is planned
      for — better on a quiet afternoon than during a launch. Budget a few
      minutes per person on day one and have the authenticator app chosen
      before you start.

      `EDITOR` was exempt until it turned out that `/admin/leads` requires
      nothing above `EDITOR` and lists every enquiry's name, email and
      phone — the access the exemption was written to protect. See
      `lib/two-factor-policy.ts`.
- [ ] Recovery codes stored somewhere that is *not* the phone holding the
      authenticator. Both lost together means a `SUPER_ADMIN` reset from
      `/admin/users/<id>/edit`, and if the account locked out is the only
      `SUPER_ADMIN`, a database edit.
- [ ] `NEXTAUTH_SECRET` settled **before** anyone enrols. TOTP secrets are
      encrypted with a key derived from it, so rotating it later invalidates
      every enrolled authenticator at once.
- [ ] `/admin` confirmed to redirect to `/login` when signed out
- [ ] Brute-force lockout observed: eleven wrong passwords in fifteen
      minutes should be refused

---

## 5. Content

- [ ] Demo Trinity Village project removed or replaced with real data
- [ ] Sample article and sample event removed
- [ ] Every published project has: hero image, gallery, description in
      **both** languages, correct price and unit count
- [ ] `config/site.ts` verified line by line — phone, LINE OA ID, email,
      address, office hours, social links. This file feeds the footer,
      the contact page, JSON-LD and the LINE CTA.
- [ ] Privacy policy reviewed by someone who can speak to PDPA compliance
- [x] `siteConfig.legal.consentVersion` matches the published policy
      version — it is written into every lead record as the consent trail.
      Cannot drift by construction: `content/privacy-policy.ts` sets
      `PRIVACY_POLICY_VERSION = siteConfig.legal.consentVersion`, so the
      page renders whatever the leads are stamped with. Currently
      `privacy-policy-v1`. What still needs a human is whether the *text*
      on that page is the version the business intends to publish.
- [ ] Thai copy proofread by a native speaker
- [ ] English copy proofread

---

## 6. Media storage

- [ ] S3 bucket created, **public access blocked**
- [ ] CloudFront distribution in front, with Origin Access Control
- [ ] Bucket policy allows `s3:GetObject` **only** to that distribution
- [ ] IAM user limited to `s3:PutObject` on this bucket alone
- [ ] Bucket policy enforces `s3:content-length-range` — the client-side
      cap is advisory and a presigned URL can be replayed. **Use 31457280
      (30MB), not 15728640.** The app allows 30MB for a PDF
      (`MAX_DOCUMENT_BYTES`), so a 15MB condition refuses a legitimate
      brochure at the bucket while every layer of the app says it should
      work — and the browser reports that as a generic network failure, not
      a size error. See the note in DEPLOYMENT.md §6.
- [ ] CORS `AllowedOrigins` is the real domain, **not** `*`
- [ ] **`npm run spaces:cors` has been run against production**, and
      `npm run spaces:check` reports `CORS allows GET + range headers` for
      the real origin. This is not the same as the upload working: the
      e-brochure viewer reads the PDF back with `fetch` and range requests,
      and pdf.js decides whether it may use ranges by reading
      `Accept-Ranges` and `Content-Encoding` off the response — headers
      cross-origin JavaScript cannot see unless the bucket exposes them.
      The failure mode is not an error, it is every brochure downloading in
      full before its first page appears.
- [ ] Upload tested end to end from `/admin/projects/new`
- [ ] Uploaded image renders on the public page through CloudFront
- [ ] A brochure opens at `/e-brochure/<slug>` on production and turns a
      page — this exercises the CORS read path, the same-origin pdf.js
      worker and the range requests in one go
- [ ] Lifecycle rule considered for orphaned objects — removing an image
      from a record does **not** delete it from the bucket

---

## 7. Third-party integrations

### LINE
- [ ] Webhook URL set and "Use webhook" enabled
- [ ] LINE's "Verify" button succeeds
- [ ] `LINE_NOTIFY_TO` holds the real user or group ID
- [ ] A test lead produced a Flex Message in the right chat
- [ ] The "call back" button in that message dials correctly

### reCAPTCHA v3
- [ ] Site and secret keys are for the **production domain**
- [ ] `andamanassetsolution.com` added to the allowed domains
- [ ] A real submission logs `verified score=…`, not `skipped`
- [ ] `RECAPTCHA_MIN_SCORE` agreed — 0.5 to start

### Analytics
- [ ] GA4 measurement ID is the real property, not a test one — either
      `NEXT_PUBLIC_GA_ID` at deploy time, or **Admin → Settings →
      Analytics & verification** (the admin field wins if both are set).
      This used to be env-only, which is why the note here said GA4 "does
      not load at all in production": the id is inlined at build time, CI
      leaves it out of `IMAGE_BUILD_ARGS` because no property existed yet,
      and switching it on therefore meant shipping a new image. It is now
      a runtime setting like the pixel below, so a real property can be
      turned on without a deploy.
- [ ] Meta Pixel ID is real — either `NEXT_PUBLIC_META_PIXEL_ID` at deploy
      time, or Admin → Settings → Analytics & verification (the admin field
      wins if both are set)
- [ ] Google Search Console verified — either `GOOGLE_SITE_VERIFICATION`
      at deploy time, or the same admin field
- [ ] Pageviews arriving in GA4 realtime, including after client-side
      navigation between pages
- [ ] `lead_submit` fires on a genuine enquiry
- [ ] Meta Pixel Helper reports `Lead` on the same submission
- [ ] Cookie consent banner (`components/CookieConsentBanner.tsx`) is built
      and opt-in: neither GA4 nor the Meta Pixel script mounts
      (`components/Analytics.tsx`) until a visitor grants the matching
      category, and the default before any decision is "neither". Confirm
      the banner actually appears on first visit and that DevTools shows no
      `googletagmanager.com`/`connect.facebook.net` request before a
      decision is made.
- [ ] Someone has confirmed the consent posture is acceptable: GA runs with
      `ad_storage` denied and IP anonymisation on regardless of consent; the
      Pixel does not run at all until marketing consent is granted.
- [ ] `siteConfig.legal.consentVersion` bump plan agreed: bumping it
      invalidates every stored cookie decision at once (banner reappears),
      so only bump it when the cookie section of the privacy policy
      actually changes — not for unrelated policy edits.

---

## 8. Security

- [ ] `CSP_ENFORCE=false` at launch — Report-Only first
- [ ] Console watched for CSP violations on real traffic for 1–2 weeks
- [ ] `next.config.js` allowlist corrected against those reports
- [ ] Only then set `CSP_ENFORCE=true` and re-test every page with a
      third-party script: home, contact, any project page
- [ ] **Include `/e-brochure/<slug>` in that re-test.** It is the page most
      exposed to an enforced CSP: it loads a module worker and imports
      pdf.js as a same-origin ESM URL, so it depends on `worker-src`,
      `child-src` and `connect-src` all being right. Everything works under
      Report-Only whether or not the policy is correct, so this cannot be
      verified before the flag is flipped — do it once locally with
      `CSP_ENFORCE=true npm run build && npm start` before production.
- [ ] `public/pdfjs/pdf.worker.min.mjs` is served as `text/javascript`.
      It is loaded as a module worker, so a proxy in front of `public/`
      with an old `mime.types` would serve `.mjs` as
      `application/octet-stream` and the browser would refuse it. Next's
      own static handler gets this right; only a hand-rolled proxy would
      not. `curl -I` the URL on production.
- [ ] Security headers verified on production — `securityheaders.com` or
      `curl -I`
- [x] `X-Powered-By` absent — `poweredByHeader: false` in
      `next.config.js`, and confirmed absent from a live response
      2026-09-02
- [x] `/admin` and `/login` return `X-Robots-Tag: noindex` — confirmed
      2026-09-02 against a running server, along with `/api/*`;
      `/en/admin` also answered `307` to the login page while signed out
- [ ] Rate limits observed on `/api/leads` (6th submission in 10 minutes
      returns `429`)
- [x] Dependency audit run: `npm audit --omit=dev`
      (`--production` is the deprecated spelling). Re-run 2026-09-02: two
      advisories, exactly the two accepted below and nothing new.
- [x] **Known outstanding advisories** reviewed and accepted. As of the
      Next 15 upgrade, `npm audit --omit=dev` reports two, neither with a
      fix short of Next 16:
      - `postcss` (high) — vendored inside `next` and used only to process
        this repository's own CSS at build time. The advisories are about
        attacker-controlled stylesheets; there are none here.
      - `next` (moderate) — the residue after 15.5.25, fixed in the 16.x
        line.

      Everything else was cleared: `next` 14→15.5.25, `@sentry/nextjs`
      8→10, `next-intl` 3→4 (open redirect), `sharp` 0.33→0.35 (libvips
      CVEs), `nodemailer` 7→9, `vitest` 2→4.

> **Note on rate limiting:** `lib/rate-limit.ts` is in-memory and
> per-process. Behind more than one replica each gets its own counters, so
> the effective limit multiplies. Move to Redis before scaling out.

---

## 9. SEO

- [x] `/sitemap.xml` loads and lists all seven static pages in **all four**
      locales, plus every published project, article and event. Verified
      2026-09-02 against a running server: 52 URLs — `/`, `/about`,
      `/contact`, `/projects`, `/progress`, `/news`, `/events` plus the
      three published projects, two articles and one event, each in th/en/
      zh/ru, all on `https://andamanassetsolution.com`. The count will
      differ on production; the shape is what this checks.
- [ ] `/robots.txt` **allows** crawling — confirm on the real deployment.
      The earlier wording here said it blocks everything unless `VERCEL_ENV`
      is `production`, which would have made a VPS deployment permanently
      uncrawlable. `app/robots.ts` does not do that: it treats
      `NODE_ENV=production` with no `VERCEL_ENV` at all as production, which
      is exactly this deployment, and the Dockerfile sets `NODE_ENV`. Still
      worth one `curl` against the live site, because the cost of being
      wrong is invisible and expensive.
- [ ] Google Search Console verified, sitemap submitted
- [ ] Rich Results Test passes for a project page (`RealEstateListing`),
      an article (`Article`) and an event (`Event`)
- [ ] `hreflang` pairs th/en correctly — check a project page's source
- [ ] Canonical URLs use the production domain, not staging
- [ ] Open Graph preview checked in the Facebook debugger and by pasting a
      link into LINE
- [ ] 404 page renders correctly at a nonsense URL in both locales

---

## 10. Functional testing on production

Not staging. Production, with real integrations connected.

- [ ] Enquiry form on a project page → record appears in `/admin/leads`
- [ ] Same submission → LINE notification received
- [ ] Same submission → staff notification email received at
      `LEAD_NOTIFICATION_TO_EMAIL` (skip if SMTP is intentionally unset)
- [ ] Contact page form → lead recorded with source `CONTACT_PAGE`
- [ ] Consent checkbox is genuinely required
- [ ] Event RSVP → registration appears on the event's admin page
- [ ] Same RSVP → confirmation email arrives at the address the visitor
      entered, in the language of the page they registered from, with the
      correct date/time/location
- [ ] RSVP capacity: fill an event to its limit, confirm the next attempt
      is refused with the seats-left message
- [ ] Duplicate RSVP with the same email updates rather than errors
- [ ] Admin: create, edit and unpublish a project; confirm the public page
      appears and disappears
- [ ] Admin: upload an image and confirm it renders publicly
- [ ] Admin: publish an article with a future date, confirm it stays hidden
- [ ] Language switch preserves the current page
- [ ] Every navigation item resolves — no 404s
- [ ] Tested on a real phone, not just a narrow browser window

---

## 10b. Accessibility

Automated scanning covers roughly a third of WCAG failures — the mechanical
third. `npm run test:e2e` runs axe-core (WCAG 2.1 AA) over the lead form,
the login form, the dashboard, the project listing and the open mobile
menu, and the Phase 11 contrast and focus fixes are recorded in
`docs/TESTING.md`. The rest of this section is the part a machine cannot do.

- [x] `npm run test:e2e` green — the axe scans are inside it. 65 passed,
      0 failed on 2026-09-02, including a dashboard contrast/label fix the
      suite had never reached before (the pie chart only renders with data,
      and no spec had put any there).
- [ ] Walked once end to end with the keyboard alone, no mouse: the skip
      link works, focus is always visible, nothing is reachable that is
      not visible, and the mobile menu can be closed with Escape
- [ ] Walked once with VoiceOver (⌘F5): headings describe the page, form
      errors are announced, the submit confirmation is announced, and the
      language switch says where it goes
- [ ] Zoomed to 200% — no horizontal scroll, nothing clipped
- [ ] Every meaningful image has honest alt text; decorative ones have
      `alt=""`. axe checks that alt exists, never that it is true
- [ ] Colour is never the only signal — check the lead status pills and
      the filter chips in particular

---

## 11. Performance

- [ ] Lighthouse ≥ 90 for Performance, Accessibility, Best Practices and
      SEO on home, a project page and contact — run against production,
      mobile profile
- [ ] LCP element is the hero image and it is `priority`
- [ ] No layout shift on image load — every `next/image` uses `fill` inside
      an aspect-ratio container
- [ ] Images served as AVIF/WebP through CloudFront
- [ ] `/_next/static/*` returns `immutable` cache headers

---

## 12. Operations

- [ ] Uptime monitor on `/api/health`, alerting somewhere a human reads
- [ ] Log aggregation configured, or at least log retention on the host
- [ ] Someone named is responsible for the 3am page
- [ ] Rollback procedure tested at least once
- [ ] Domain and TLS renewal reminders in a calendar
- [ ] Repository access reviewed; deploy credentials rotated after handover

---

## Sign-off

| Area | Owner | Date |
|---|---|---|
| Infrastructure and TLS | | |
| Database and backups | | |
| Content and copy | | |
| Integrations | | |
| Security review | | |
| Final approval | | |
