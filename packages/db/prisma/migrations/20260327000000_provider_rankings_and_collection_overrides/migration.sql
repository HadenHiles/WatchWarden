-- AlterTable
ALTER TABLE "ExternalTrendSnapshot" ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "providerRank" INTEGER;

-- AlterTable
ALTER TABLE "PlexCollection" DROP COLUMN "maxItems",
ADD COLUMN     "autoRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxItemsPerProvider" INTEGER NOT NULL DEFAULT 10,
ALTER COLUMN "streamingProviders" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PlexCollectionTitle" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "manuallyAdded" BOOLEAN NOT NULL DEFAULT false,
    "manuallyExcluded" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlexCollectionTitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlexCollectionTitle_collectionId_idx" ON "PlexCollectionTitle"("collectionId");

-- CreateIndex
CREATE INDEX "PlexCollectionTitle_titleId_idx" ON "PlexCollectionTitle"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "PlexCollectionTitle_collectionId_titleId_key" ON "PlexCollectionTitle"("collectionId", "titleId");

-- CreateIndex
CREATE INDEX "ExternalTrendSnapshot_providerId_providerRank_idx" ON "ExternalTrendSnapshot"("providerId", "providerRank");

-- CreateIndex
CREATE INDEX "PlexCollection_collectionType_idx" ON "PlexCollection"("collectionType");

-- AddForeignKey
ALTER TABLE "PlexCollectionTitle" ADD CONSTRAINT "PlexCollectionTitle_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "PlexCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlexCollectionTitle" ADD CONSTRAINT "PlexCollectionTitle_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
