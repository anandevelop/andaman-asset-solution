-- OAuth for the AI connection, so it can be added as a connector that signs
-- in rather than one that is handed a key. See lib/mcp/oauth.ts.

ALTER TABLE "api_tokens" ADD COLUMN "oauthGrantId" TEXT;
CREATE INDEX "api_tokens_oauthGrantId_idx" ON "api_tokens"("oauthGrantId");

CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

CREATE TABLE "oauth_grants" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "oauth_grants_revokedAt_createdAt_idx" ON "oauth_grants"("revokedAt", "createdAt");

CREATE TABLE "oauth_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "state" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT,
    "codeHash" TEXT,
    "grantId" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_requests_codeHash_key" ON "oauth_requests"("codeHash");
CREATE INDEX "oauth_requests_expiresAt_idx" ON "oauth_requests"("expiresAt");

CREATE TABLE "oauth_refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_refresh_tokens_tokenHash_key" ON "oauth_refresh_tokens"("tokenHash");
CREATE INDEX "oauth_refresh_tokens_grantId_idx" ON "oauth_refresh_tokens"("grantId");
