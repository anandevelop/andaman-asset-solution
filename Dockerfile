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
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
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
ARG NEXT_PUBLIC_CLOUDFRONT_DOMAIN
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_LINE_ADD_FRIEND_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_CLOUDFRONT_DOMAIN=$NEXT_PUBLIC_CLOUDFRONT_DOMAIN \
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

USER nextjs

EXPOSE 3000

# Orchestrators generally have their own probes, but this makes
# `docker ps` honest when running standalone.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node as PID 1 with --init so signals reach it and zombies get reaped;
# without it, SIGTERM is ignored and every deploy waits out the 10s kill
# timeout.
ENTRYPOINT ["node", "--enable-source-maps"]
CMD ["server.js"]
