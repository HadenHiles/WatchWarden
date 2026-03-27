-- Rename streamingProvider (nullable text) to streamingProviders (text array)
ALTER TABLE "PlexCollection" RENAME COLUMN "streamingProvider" TO "streamingProviders_old";
ALTER TABLE "PlexCollection" ADD COLUMN "streamingProviders" TEXT[] NOT NULL DEFAULT '{}';
-- Migrate existing single-provider rows into the new array column
UPDATE "PlexCollection"
SET "streamingProviders" = ARRAY["streamingProviders_old"]
WHERE "streamingProviders_old" IS NOT NULL;
ALTER TABLE "PlexCollection" DROP COLUMN "streamingProviders_old";
