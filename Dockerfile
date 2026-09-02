# ─────────────────────────────────────────────────────────────────────────
# Andaman Asset Solution — production image
#
# Four stages, each existing to keep something out of the final image:
#
#   deps    — node_modules for the build. Cached on package*.json alone, so
#             editing a component does not reinstall the dependency tree.
#   builder — next build. Needs devDependencies and the Prisma schema.
#   runner  — .next/standalone only. No source, no devDependencies, no npm.
#
# The result runs as a non-root user with a tini-style init and a healthcheck
# pointed at /api/health.
# ─────────────────────────────────────────────────────────────────────────

# Alpine keeps the image small; libc6-compat covers the glibc-linked
# binaries Prisma and SWC ship.
#
# Node 22, not 20: Node 20 left even maintenance LTS in April 2026, so it
# no longer receives security patches — shipping on it means running an
# unpatched runtime by choice. 22 is what CI builds and tests against.
FROM node:22-alpine AS base
#
# openssl is not optional, despite Alpine shipping libssl.so.3 already.
#
# Prisma picks its query engine by sniffing the installed OpenSSL at
# `prisma generate` time. With no openssl package present it cannot tell,
# says so, and falls back:
#
#   prisma:warn Prisma failed to detect the libssl/openssl version to use,
#               and may not work as expected. Defaulting to "openssl-1.1.x".
#
# Alpine 3.24 has no libssl.so.1.1, so the engine it then ships cannot load
# and every query in the container fails at PrismaClient construction. The
# site still starts and still serves pages — every one of them empty, since
# lib/db.ts is built to degrade rather than crash — and /api/health answers
# 503, which is the same answer it gives when no database is configured at
# all. That is why this survived a green smoke test.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app


# ── Dependencies ─────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json* ./
# `npm ci` for a lockfile-exact, reproducible install.
RUN npm ci


# ── Build ────────────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client is generated code — it must exist before next build type-checks.
RUN npx prisma generate

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# they have to be present here rather than at runtime. Pass them with
# --build-arg, or bake them into the CI environment.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MEDIA_DOMAIN
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_LINE_ADD_FRIEND_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MEDIA_DOMAIN=$NEXT_PUBLIC_MEDIA_DOMAIN \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID \
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY \
    NEXT_PUBLIC_LINE_ADD_FRIEND_URL=$NEXT_PUBLIC_LINE_ADD_FRIEND_URL \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Pages that read the database are `force-dynamic` or wrapped in safeQuery,
# so the build completes without a reachable Postgres. This placeholder only
# satisfies Prisma Client's constructor.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN npm run build


# ── Runtime ──────────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Never run the server as root. A container escape via the application
# should not land on a root shell.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Public assets and the prerendered static output are not part of the
# standalone bundle and have to be copied separately.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Schema and migrations, so `prisma migrate deploy` can run from this image
# as a release step. The engine binaries come along inside standalone's
# node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Creating the first admin is a first-deployment step, so the tool for it
# has to run where the deployment is:
#
#   docker compose exec app node scripts/create-admin.mjs --email you@…
#
# docs/DEPLOYMENT.md used to point at `node_modules/.bin/tsx
# scripts/create-admin.ts` inside this image, which could not work — tsx is
# a devDependency and no source tree is copied here. The script is plain
# JavaScript for that reason.
#
# bcryptjs is copied explicitly because Next bundles it into the server
# chunks rather than leaving it in standalone's node_modules: the running
# app can hash a password, a separate script cannot import the package. It
# is pure JavaScript with no native build, so this costs a few kilobytes.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/create-admin.mjs ./scripts/create-admin.mjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

USER nextjs

EXPOSE 3000

# Orchestrators generally have their own probes, but this makes
# `docker ps` honest when running standalone.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node runs as PID 1. Next's standalone server registers its own SIGTERM
# and SIGINT handlers, so a deploy shuts down gracefully rather than
# waiting out the 10s kill timeout — but PID 1 still does not reap
# orphaned children, so run the container with an init process:
# `docker run --init`, or `init: true` in compose (already set in
# docker-compose.prod.yml).
ENTRYPOINT ["node", "--enable-source-maps"]
CMD ["server.js"]
