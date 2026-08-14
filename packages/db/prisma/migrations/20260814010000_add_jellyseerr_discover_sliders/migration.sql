CREATE TABLE "JellyseerrDiscoverSlider" (
    "id" TEXT NOT NULL,
    "jellyseerrSliderId" INTEGER,
    "name" TEXT NOT NULL,
    "streamingProvider" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JellyseerrDiscoverSlider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JellyseerrDiscoverSlider_jellyseerrSliderId_key" ON "JellyseerrDiscoverSlider"("jellyseerrSliderId");
CREATE INDEX "JellyseerrDiscoverSlider_streamingProvider_idx" ON "JellyseerrDiscoverSlider"("streamingProvider");
CREATE INDEX "JellyseerrDiscoverSlider_mediaType_idx" ON "JellyseerrDiscoverSlider"("mediaType");
