CREATE TYPE "PlexShelfType" AS ENUM ('CULTURAL_TRENDING', 'PROVIDER_TRENDING', 'RECENTLY_RELEASED', 'SMART', 'CUSTOM');

ALTER TABLE "Title" ADD COLUMN "releaseDate" TIMESTAMP(3);

ALTER TABLE "PlexCollection"
  ADD COLUMN "shelfType" "PlexShelfType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "publishToHome" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishToSharedHome" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoPublish" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "homePriority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "maxItems" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "releaseWindowDays" INTEGER NOT NULL DEFAULT 90;

-- Preserve legacy behavior without publishing anything unexpectedly.
UPDATE "PlexCollection"
SET "shelfType" = CASE
  WHEN "collectionType" = 'TOP_TRENDING' THEN 'PROVIDER_TRENDING'::"PlexShelfType"
  WHEN "collectionType" = 'SMART' THEN 'SMART'::"PlexShelfType"
  ELSE 'CUSTOM'::"PlexShelfType"
END;

CREATE INDEX "PlexCollection_publishToHome_homePriority_idx"
  ON "PlexCollection"("publishToHome", "homePriority");
