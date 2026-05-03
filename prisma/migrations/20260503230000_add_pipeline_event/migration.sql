-- AlterTable
ALTER TABLE "PipelineRun" ADD COLUMN "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "PipelineEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_idempotencyKey_key" ON "PipelineRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PipelineEvent_runId_createdAt_idx" ON "PipelineEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineEvent_eventType_idx" ON "PipelineEvent"("eventType");

-- AddForeignKey
ALTER TABLE "PipelineEvent" ADD CONSTRAINT "PipelineEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
