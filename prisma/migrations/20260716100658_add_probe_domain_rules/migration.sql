-- CreateEnum
CREATE TYPE "ProbeDomainRuleMode" AS ENUM ('EXCLUDE', 'EXACT_MATCH');

-- CreateTable
CREATE TABLE "ProbeDomainRule" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "mode" "ProbeDomainRuleMode" NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceCompanyName" TEXT NOT NULL,
    "sourceRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbeDomainRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProbeDomainRule_departmentId_mode_idx" ON "ProbeDomainRule"("departmentId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ProbeDomainRule_departmentId_domain_key" ON "ProbeDomainRule"("departmentId", "domain");

-- AddForeignKey
ALTER TABLE "ProbeDomainRule" ADD CONSTRAINT "ProbeDomainRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
