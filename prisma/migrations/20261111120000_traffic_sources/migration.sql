-- Traffic sources and contact clicks: where visits come from (AI as its
-- own channel) and which contact buttons they press.
CREATE TYPE "TrafficChannel" AS ENUM ('AI', 'SEARCH', 'SOCIAL', 'CAMPAIGN', 'REFERRAL', 'DIRECT');

CREATE TABLE "traffic_visit_days" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "channel" "TrafficChannel" NOT NULL,
    "source" TEXT NOT NULL,
    "landingPath" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "traffic_visit_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "traffic_visit_days_day_source_landingPath_key" ON "traffic_visit_days"("day", "source", "landingPath");
CREATE INDEX "traffic_visit_days_day_idx" ON "traffic_visit_days"("day");

CREATE TABLE "contact_click_days" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "channel" "TrafficChannel" NOT NULL,
    "source" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contact_click_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_click_days_day_action_path_source_key" ON "contact_click_days"("day", "action", "path", "source");
CREATE INDEX "contact_click_days_day_idx" ON "contact_click_days"("day");
