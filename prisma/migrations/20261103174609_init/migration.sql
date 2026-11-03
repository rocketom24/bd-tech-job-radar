-- CreateEnum
CREATE TYPE "JobSourceType" AS ENUM ('GOVERNMENT', 'COMPANY', 'UNIVERSITY', 'NGO', 'PORTAL', 'OTHER');

-- CreateTable
CREATE TABLE "JobSource" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY,
    "name" TEXT NOT NULL,
    "type" "JobSourceType" NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "salary" TEXT NOT NULL DEFAULT '',
    "experience" TEXT NOT NULL DEFAULT '',
    "skills" TEXT[] NOT NULL DEFAULT '{}',
    "deadline" TIMESTAMPTZ,
    "sourceId" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY,
    "email" TEXT NOT NULL,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usage" (
    "id" INTEGER GENERATED ALWAYS AS IDENTITY,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_sourceId_idx" ON "Job"("sourceId");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Job_sector_idx" ON "Job"("sector");

-- CreateIndex
CREATE INDEX "Job_category_idx" ON "Job"("category");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Usage_userId_createdAt_idx" ON "Usage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
