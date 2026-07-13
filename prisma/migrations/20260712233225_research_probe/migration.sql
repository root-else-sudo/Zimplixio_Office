-- CreateEnum
CREATE TYPE "ProbeRunStatus" AS ENUM ('RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ProbeSignalSource" AS ENUM ('MANUAL', 'TAVILY_SEARCH', 'TAVILY_EXTRACT');

-- CreateEnum
CREATE TYPE "ProbeConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "ProbeRun" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "manualNotes" TEXT,
    "status" "ProbeRunStatus" NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProbeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbeSignalItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" "ProbeSignalSource" NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbeSignalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbeHypothesis" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "need" TEXT NOT NULL,
    "proposedService" TEXT NOT NULL,
    "basedOnSignal" TEXT[],
    "title" TEXT,
    "evidence" TEXT,
    "fitRationale" TEXT,
    "confidence" "ProbeConfidence",
    "disconfirmingEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbeHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProbeRun_departmentId_idx" ON "ProbeRun"("departmentId");

-- CreateIndex
CREATE INDEX "ProbeSignalItem_runId_idx" ON "ProbeSignalItem"("runId");

-- CreateIndex
CREATE INDEX "ProbeHypothesis_runId_idx" ON "ProbeHypothesis"("runId");

-- AddForeignKey
ALTER TABLE "ProbeRun" ADD CONSTRAINT "ProbeRun_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbeSignalItem" ADD CONSTRAINT "ProbeSignalItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProbeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbeHypothesis" ADD CONSTRAINT "ProbeHypothesis_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProbeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
