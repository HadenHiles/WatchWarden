-- AlterTable: add collectionType, streamingProvider, maxItems to PlexCollection
ALTER TABLE "PlexCollection" ADD COLUMN "collectionType" TEXT NOT NULL DEFAULT 'SMART';
ALTER TABLE "PlexCollection" ADD COLUMN "streamingProvider" TEXT;
ALTER TABLE "PlexCollection" ADD COLUMN "maxItems" INTEGER NOT NULL DEFAULT 5;
