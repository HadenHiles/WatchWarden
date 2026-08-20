ALTER TABLE "Title"
ADD COLUMN "radarrMovieId" INTEGER,
ADD COLUMN "radarrQuality" TEXT,
ADD COLUMN "radarrQualitySource" TEXT,
ADD COLUMN "radarrIsLowQualityTheatrical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "radarrQualityCheckedAt" TIMESTAMP(3);

CREATE INDEX "Title_radarrMovieId_idx" ON "Title"("radarrMovieId");
CREATE INDEX "Title_radarrIsLowQualityTheatrical_idx" ON "Title"("radarrIsLowQualityTheatrical");