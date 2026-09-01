# Deployment

How to get this application running on a server. For the pre-launch
sign-off, see [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md).

---

## What you are deploying

A Next.js 15 App Router application (React 19) built in `standalone` mode,
plus a PostgreSQL database. The image runs on Node 22 — Node 20 left
maintenance LTS in April 2026 and no longer receives security patches. The container serves both the public site and the
admin back-office; there is no separate API service.

| Piece | Where it runs |
|---|---|
| Web application | This Docker image, port 3000 |
| PostgreSQL 16 | Managed service (DigitalOcean Managed Databases, RDS, Neon) |
| Image storage | DigitalOcean Spaces, behind the Spaces CDN |
| Email | Not implemented — notifications go to LINE |

---

## 1. Prerequisites

- Docker 24+ on the host, or a platform that builds from a Dockerfile
- A PostgreSQL 16 database, reachable from the container
- An S3 bucket and CloudFront distribution — see §6
- A domain with DNS pointed at the host
- **Outbound network from the build machine to `fonts.googleapis.com` and
  `fonts.gstatic.com`.** `app/[locale]/layout.tsx` loads Roboto through
  `next/font/google`, which downloads and self-hosts the font files *at
  build time*: the running container never contacts Google, but a build
  behind a restrictive egress policy fails outright with
  `Failed to fetch font 'Roboto'` and no fallback. The registry
  (`registry.npmjs.org`) and `binaries.prisma.sh` have to be reachable for
  the same reason.

### The container refuses to start on a bad environment

`instrumentation.ts` validates the environment before the first request
and exits non-zero when something required is missing or malformed — see
`lib/env.ts` for the list and LAUNCH_CHECKLIST §2. This is deliberate: the
alternative is a container that starts, answers every request with a 500,
and never triggers `restart:`. If the app exits immediately after a deploy,
read the last ten lines of `docker compose logs app` — the reason is
printed in full.

---

## 2. Environment

Copy `.env.example` and fill it in. Every variable is annotated there with
`[required]`, `[optional]` or `[not wired]`.

The five that must be correct before anything works:

```
DATABASE_URL
NEXTAUTH_URL          # exact public origin, no trailing slash
NEXTAUTH_SECRET       # openssl rand -base64 32
NEXT_PUBLIC_SITE_URL  # canonical origin
NEXT_PUBLIC_MEDIA_DOMAIN
```

### The build-time trap

`NEXT_PUBLIC_*` values are **compiled into the browser bundle**, not read
at runtime. Setting them only in the container environment leaves the
built JavaScript holding whatever they were at build time — usually
empty. They must be passed as build arguments:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL="https://andamanassetsolution.com" \
  --build-arg NEXT_PUBLIC_MEDIA_DOMAIN="d111111abcdef8.cloudfront.net" \
  --build-arg NEXT_PUBLIC_GA_ID="G-XXXXXXXXXX" \
  --build-arg NEXT_PUBLIC_META_PIXEL_ID="000000000000000" \
  --build-arg NEXT_PUBLIC_RECAPTCHA_SITE_KEY="6Lc..." \
  --build-arg NEXT_PUBLIC_LINE_ADD_FRIEND_URL="https://line.me/R/ti/p/@andamanasset" \
  --build-arg NEXT_PUBLIC_DEFAULT_LOCALE="th" \
  -t andaman-asset-solution:$(git rev-parse --short HEAD) .
```

Changing a GA ID later means a rebuild, not a restart.

---

## 3. Database migration

Migrations are **not** run automatically on container start. Doing that
means N replicas racing to migrate the same database during a rolling
deploy. Run it once, as a separate step, before the new image takes
traffic:

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://…" \
  andaman-asset-solution:TAG \
  node_modules/.bin/prisma migrate deploy
```

`migrate deploy` applies committed migrations only. It never generates
new ones and never prompts — the right command for production.
`migrate dev` is for your laptop.

### First deployment only

```bash
# Create the first admin account. Prints a generated password once.
docker run --rm -it \
  -e DATABASE_URL="postgresql://…" \
  andaman-asset-solution:TAG \
  node_modules/.bin/tsx scripts/create-admin.ts \
    --email you@andamanassetsolution.com \
    --name "Your Name" \
    --role SUPER_ADMIN
```

Store that password immediately — it is a bcrypt hash in the database
afterwards and cannot be recovered. Sign in at `/th/login` and change it
at `/th/admin/account`.

**Do not run `prisma db seed` in production.** The seed inserts the
demo Trinity Village project, a sample article and a sample event. It is
for local development.

---

## 4. Running

```bash
docker run -d \
  --name andaman \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.production \
  -e TZ=Asia/Bangkok \
  andaman-asset-solution:TAG
```

`TZ=Asia/Bangkok` is not cosmetic. Event times are entered through
`<input type="datetime-local">` and parsed as **server-local** time. A
container running UTC shifts every event by seven hours.

Verify:

```bash
curl -fsS http://localhost:3000/api/health | jq
```

`200` with `"status":"ok"` means the database is reachable. `503` with
`"status":"degraded"` means it is not — check `checks.database.error`.

---

## 5. Reverse proxy

The container speaks plain HTTP. Terminate TLS in front of it and forward
the client address, or every rate limit will see one IP and every lead
will be recorded with the proxy's address:

```nginx
location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

`lib/rate-limit.ts` reads `x-forwarded-for` first, then
`cf-connecting-ip`, then `x-real-ip`.

---

## 6. S3 and CloudFront

The bucket must stay **private**. Public reads go through CloudFront with
an Origin Access Control.

**Bucket policy** — allow only the distribution to read:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontRead",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR-BUCKET/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DIST_ID"
      }
    }
  }]
}
```

**IAM policy for the application** — write only, nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::YOUR-BUCKET/*",
    "Condition": {
      "NumericLessThanEquals": { "s3:content-length-range": 15728640 }
    }
  }]
}
```

The size condition is the one that actually matters. The 15MB cap in
`lib/s3.ts` and the uploader is advisory — a presigned URL can be replayed
with any payload, and only the bucket policy stops it.

**CORS** — the browser PUTs directly, so the bucket must allow it:

```json
[{
  "AllowedOrigins": ["https://andamanassetsolution.com"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["content-type"],
  "MaxAgeSeconds": 3000
}]
```

Restrict `AllowedOrigins` to the real domain. `"*"` lets any site mint
uploads against your bucket using a stolen presigned URL.

---

## 7. LINE webhook

1. Set the webhook URL to `https://your-domain/api/line/webhook`
2. Enable "Use webhook" in the LINE console
3. Message the OA once, then read the server log:
   `[line/webhook] new follower — add to LINE_NOTIFY_TO … : U…`
4. Put that ID in `LINE_NOTIFY_TO` and restart

The endpoint rejects any request whose `X-Line-Signature` does not verify,
so it is safe to expose. LINE's own "Verify" button should return success.

---

## 8. Rolling out an update

```bash
# 1. Build with the same NEXT_PUBLIC_* build args
docker build --build-arg … -t andaman-asset-solution:NEW .

# 2. Migrate first — additive changes only, so the old image keeps working
docker run --rm -e DATABASE_URL="…" andaman-asset-solution:NEW \
  node_modules/.bin/prisma migrate deploy

# 3. Start the new container, wait for health, then cut over
docker run -d --name andaman-new -p 3001:3000 --env-file .env.production \
  -e TZ=Asia/Bangkok andaman-asset-solution:NEW

curl -fsS --retry 10 --retry-delay 3 http://localhost:3001/api/health

# 4. Swap the proxy upstream, then remove the old container
docker rm -f andaman && docker rename andaman-new andaman
```

A destructive migration — dropping or renaming a column — cannot be
deployed this way. Split it: deploy code that tolerates both shapes,
migrate, then remove the old path in a later release.

### Rollback

Re-run step 3 with the previous tag. Migrations do **not** roll back
automatically; if the release included one, restore from backup or write
a forward migration that reverses it.

---

## 9. What to watch

| Signal | Where |
|---|---|
| Application health | `GET /api/health` |
| Database reachability | `checks.database` in the same response |
| CSP violations | Browser console, until `CSP_ENFORCE=true` |
| Failed sign-ins | `[auth] sign-in temporarily locked for …` |
| LINE delivery failures | `[line] push rejected …` |
| reCAPTCHA fallbacks | `[POST /api/leads] recaptcha skipped (…)` |

A run of `recaptcha skipped` in the logs means verification is silently
not happening — usually a wrong secret key. Forms still work, which is
why it needs watching rather than alerting.

---

## 10. Local development

```bash
npm install
cp .env.example .env
npm run db:up            # Postgres via docker-compose
npm run prisma:migrate
npm run prisma:seed      # demo content — local only
npm run admin:create -- --email you@example.com --name "You"
npm run dev
```

Checks that must pass before pushing:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs all four plus `prisma validate` and a Docker build smoke test.
