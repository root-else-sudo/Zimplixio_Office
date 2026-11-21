-- Access management foundation: companies, account status, session versioning.
-- Hand-ordered so it succeeds on a populated User table (existing users become
-- staff of the internal company).

-- 1. Enums and Company table
CREATE TYPE "CompanyKind" AS ENUM ('INTERNAL', 'CLIENT');
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DEACTIVATED');

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CompanyKind" NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- 2. The single internal company
INSERT INTO "Company" ("id", "name", "kind", "updatedAt")
VALUES ('internal-zimplixio', 'Zimplixio', 'INTERNAL', CURRENT_TIMESTAMP);

-- 3. New User columns (companyId nullable until backfilled)
ALTER TABLE "User" ADD COLUMN "companyId" TEXT,
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Pre-flight checks (run BEFORE the backfill so failures are readable, not raw constraint errors)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE lower(trim("email")) NOT LIKE '%@zimplixio.com') THEN
    RAISE EXCEPTION 'Migration aborted: an existing user has a non-@zimplixio.com email, but all existing users become internal staff. Fix or remove that user and re-run.';
  END IF;
  IF (SELECT count(*) FROM "User" WHERE "role" = 'ADMIN') > 1 THEN
    RAISE EXCEPTION 'Migration aborted: more than one ADMIN user exists; the access model allows exactly one. Demote the extras and re-run.';
  END IF;
  IF (SELECT count(*) FROM "User") <> (SELECT count(DISTINCT lower(trim("email"))) FROM "User") THEN
    RAISE EXCEPTION 'Migration aborted: two users have emails that differ only by case or whitespace. Resolve the duplicate and re-run.';
  END IF;
END $$;

-- 4. Backfill: every existing user is internal staff; normalize emails
UPDATE "User" SET "companyId" = 'internal-zimplixio', "email" = lower(trim("email"));

-- 5. Enforce
ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;

-- 6. Foreign key and index
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. At most one INTERNAL company
CREATE UNIQUE INDEX "Company_single_internal" ON "Company"("kind") WHERE "kind" = 'INTERNAL';
