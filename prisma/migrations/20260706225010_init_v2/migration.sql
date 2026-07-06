-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REVIEWER');

-- CreateEnum
CREATE TYPE "DepartmentKey" AS ENUM ('PRODUCT_RESEARCH', 'ENGINEERING', 'MARKETING', 'SALES', 'FINANCE', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('BUILT', 'RESERVED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'REVIEWER',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "key" "DepartmentKey" NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "DepartmentStatus" NOT NULL DEFAULT 'RESERVED',
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "goalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Knowledge" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "Department_key_key" ON "Department"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Department_order_key" ON "Department"("order");

-- CreateIndex
CREATE INDEX "Goal_departmentId_idx" ON "Goal"("departmentId");

-- CreateIndex
CREATE INDEX "Task_departmentId_idx" ON "Task"("departmentId");

-- CreateIndex
CREATE INDEX "Task_goalId_idx" ON "Task"("goalId");

-- CreateIndex
CREATE INDEX "Knowledge_departmentId_idx" ON "Knowledge"("departmentId");

-- CreateIndex
CREATE INDEX "Kpi_departmentId_idx" ON "Kpi"("departmentId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Knowledge" ADD CONSTRAINT "Knowledge_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
