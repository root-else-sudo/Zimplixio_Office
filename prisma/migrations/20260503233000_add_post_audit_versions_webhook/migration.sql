-- CreateEnum
CREATE TYPE "PostVersionSource" AS ENUM ('ORIGINAL', 'REGENERATED', 'EDITED');

-- CreateEnum
CREATE TYPE "WebhookKind" AS ENUM ('LINKEDIN_PUBLISH');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "Post"
    ADD COLUMN "approvedById"    TEXT,
    ADD COLUMN "approvedAt"      TIMESTAMP(3),
    ADD COLUMN "rejectedById"    TEXT,
    ADD COLUMN "rejectedAt"      TIMESTAMP(3),
    ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "Post_status_idx" ON "Post"("status");
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateTable
CREATE TABLE "PostVersion" (
    "id"        TEXT NOT NULL,
    "postId"    TEXT NOT NULL,
    "version"   INTEGER NOT NULL,
    "content"   TEXT NOT NULL,
    "source"    "PostVersionSource" NOT NULL,
    "feedback"  JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostVersion_postId_version_key" ON "PostVersion"("postId", "version");
CREATE INDEX "PostVersion_postId_createdAt_idx" ON "PostVersion"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "PostVersion" ADD CONSTRAINT "PostVersion_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Webhook" (
    "id"          TEXT NOT NULL,
    "kind"        "WebhookKind" NOT NULL,
    "status"      "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "payload"     JSONB NOT NULL,
    "attempts"    INTEGER NOT NULL DEFAULT 0,
    "lastError"   TEXT,
    "postId"      TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Webhook_status_kind_idx" ON "Webhook"("status", "kind");
CREATE INDEX "Webhook_createdAt_idx" ON "Webhook"("createdAt");

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
