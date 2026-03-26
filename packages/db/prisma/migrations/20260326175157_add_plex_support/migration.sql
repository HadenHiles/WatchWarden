-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "plexRatingKey" TEXT;

-- CreateTable
CREATE TABLE "PlexCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plexKey" TEXT,
    "sectionId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "filter" TEXT NOT NULL DEFAULT 'ACTIVE_TRENDING',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlexCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlexCollection_sectionId_idx" ON "PlexCollection"("sectionId");
