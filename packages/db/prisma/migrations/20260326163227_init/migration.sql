-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('MOVIE', 'SHOW');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('CANDIDATE', 'SUGGESTED', 'APPROVED', 'REJECTED', 'SNOOZED', 'REQUESTED', 'AVAILABLE', 'ACTIVE_TRENDING', 'CLEANUP_ELIGIBLE', 'EXPIRED', 'PINNED');

-- CreateEnum
CREATE TYPE "LifecyclePolicy" AS ENUM ('PERMANENT', 'TEMPORARY_TRENDING', 'WATCH_AND_EXPIRE', 'PINNED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SNOOZED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "DecisionAction" AS ENUM ('APPROVE', 'REJECT', 'SNOOZE', 'PIN', 'UNPIN', 'MARK_PERMANENT', 'MARK_TEMPORARY', 'EXTEND_RETENTION', 'FORCE_CLEANUP_ELIGIBLE', 'UNDO');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'AVAILABLE', 'FAILED', 'DECLINED', 'APPROVED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "tmdbId" INTEGER,
    "tvdbId" INTEGER,
    "imdbId" TEXT,
    "title" TEXT NOT NULL,
    "originalTitle" TEXT,
    "mediaType" "MediaType" NOT NULL,
    "year" INTEGER,
    "overview" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "genres" TEXT[],
    "status" "TitleStatus" NOT NULL DEFAULT 'CANDIDATE',
    "lifecyclePolicy" "LifecyclePolicy" NOT NULL DEFAULT 'TEMPORARY_TRENDING',
    "isTemporary" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "keepUntil" TIMESTAMP(3),
    "cleanupEligible" BOOLEAN NOT NULL DEFAULT false,
    "cleanupReason" TEXT,
    "inLibrary" BOOLEAN NOT NULL DEFAULT false,
    "libraryCheckedAt" TIMESTAMP(3),
    "isRequested" BOOLEAN NOT NULL DEFAULT false,
    "jellyseerrId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTrendSnapshot" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "region" TEXT,
    "rank" INTEGER,
    "trendScore" DOUBLE PRECISION NOT NULL,
    "rawMetadata" JSONB NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ExternalTrendSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalWatchSignal" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "recentWatchCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewerCount" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "watchSaturation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastWatchedAt" TIMESTAMP(3),
    "recencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "localInterestScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "multiUserBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completionPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rawData" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalWatchSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "externalTrendScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "localInterestScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freshnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "editorialBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoreExplanation" TEXT,
    "suggestedReasons" TEXT[],
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "snoozedUntil" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionDecision" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "action" "DecisionAction" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestRecord" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "jellyseerrRequestId" INTEGER,
    "requestStatus" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rootFolder" TEXT,
    "qualityProfileId" INTEGER,
    "requestedByBot" BOOLEAN NOT NULL DEFAULT true,
    "mediaType" "MediaType" NOT NULL,
    "overseerrMedia" JSONB,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "RequestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedExport" (
    "id" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "PublishedExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceConfig" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "region" TEXT,
    "mediaType" "MediaType",
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "titleId" TEXT,
    "details" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "itemsProcessed" INTEGER,
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Title_tmdbId_key" ON "Title"("tmdbId");

-- CreateIndex
CREATE INDEX "Title_status_idx" ON "Title"("status");

-- CreateIndex
CREATE INDEX "Title_mediaType_idx" ON "Title"("mediaType");

-- CreateIndex
CREATE INDEX "Title_tmdbId_idx" ON "Title"("tmdbId");

-- CreateIndex
CREATE INDEX "ExternalTrendSnapshot_titleId_idx" ON "ExternalTrendSnapshot"("titleId");

-- CreateIndex
CREATE INDEX "ExternalTrendSnapshot_source_region_idx" ON "ExternalTrendSnapshot"("source", "region");

-- CreateIndex
CREATE INDEX "ExternalTrendSnapshot_snapshotAt_idx" ON "ExternalTrendSnapshot"("snapshotAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalWatchSignal_titleId_key" ON "LocalWatchSignal"("titleId");

-- CreateIndex
CREATE INDEX "LocalWatchSignal_titleId_idx" ON "LocalWatchSignal"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_titleId_key" ON "Suggestion"("titleId");

-- CreateIndex
CREATE INDEX "Suggestion_status_idx" ON "Suggestion"("status");

-- CreateIndex
CREATE INDEX "Suggestion_finalScore_idx" ON "Suggestion"("finalScore");

-- CreateIndex
CREATE INDEX "Suggestion_titleId_idx" ON "Suggestion"("titleId");

-- CreateIndex
CREATE INDEX "SuggestionDecision_suggestionId_idx" ON "SuggestionDecision"("suggestionId");

-- CreateIndex
CREATE INDEX "SuggestionDecision_action_idx" ON "SuggestionDecision"("action");

-- CreateIndex
CREATE INDEX "SuggestionDecision_createdAt_idx" ON "SuggestionDecision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestRecord_titleId_key" ON "RequestRecord"("titleId");

-- CreateIndex
CREATE INDEX "RequestRecord_requestStatus_idx" ON "RequestRecord"("requestStatus");

-- CreateIndex
CREATE INDEX "RequestRecord_jellyseerrRequestId_idx" ON "RequestRecord"("jellyseerrRequestId");

-- CreateIndex
CREATE INDEX "PublishedExport_exportType_idx" ON "PublishedExport"("exportType");

-- CreateIndex
CREATE INDEX "PublishedExport_generatedAt_idx" ON "PublishedExport"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceConfig_sourceId_key" ON "SourceConfig"("sourceId");

-- CreateIndex
CREATE INDEX "SourceConfig_sourceId_idx" ON "SourceConfig"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "AppSetting_category_idx" ON "AppSetting"("category");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_titleId_idx" ON "AuditLog"("titleId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "JobRun_jobName_idx" ON "JobRun"("jobName");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- CreateIndex
CREATE INDEX "JobRun_startedAt_idx" ON "JobRun"("startedAt");

-- AddForeignKey
ALTER TABLE "ExternalTrendSnapshot" ADD CONSTRAINT "ExternalTrendSnapshot_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalWatchSignal" ADD CONSTRAINT "LocalWatchSignal_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionDecision" ADD CONSTRAINT "SuggestionDecision_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestRecord" ADD CONSTRAINT "RequestRecord_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE SET NULL ON UPDATE CASCADE;
