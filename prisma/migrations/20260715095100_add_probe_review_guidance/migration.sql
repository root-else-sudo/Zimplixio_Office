-- AlterTable
ALTER TABLE "ProbeSignalItem" ADD COLUMN     "exclusionReason" TEXT,
ADD COLUMN     "includedInReasoning" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProbeReviewGuidance" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProbeReviewGuidance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProbeReviewGuidance_departmentId_key" ON "ProbeReviewGuidance"("departmentId");

-- AddForeignKey
ALTER TABLE "ProbeReviewGuidance" ADD CONSTRAINT "ProbeReviewGuidance_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
