-- CreateTable
CREATE TABLE "GuidanceSummary" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidanceSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuidanceSummary_departmentId_key" ON "GuidanceSummary"("departmentId");

-- AddForeignKey
ALTER TABLE "GuidanceSummary" ADD CONSTRAINT "GuidanceSummary_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
