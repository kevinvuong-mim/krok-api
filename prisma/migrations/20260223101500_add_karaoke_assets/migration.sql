-- CreateEnum
CREATE TYPE "KaraokeAssetStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "karaoke_assets" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "jobId" TEXT,
    "instrumentalUrl" TEXT,
    "lyricsUrl" TEXT,
    "status" "KaraokeAssetStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "karaoke_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "karaoke_assets_videoId_key" ON "karaoke_assets"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "karaoke_assets_jobId_key" ON "karaoke_assets"("jobId");

-- CreateIndex
CREATE INDEX "karaoke_assets_status_idx" ON "karaoke_assets"("status");
