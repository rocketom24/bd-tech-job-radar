-- CreateTable
CREATE TABLE "JobView" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplyClick" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplyClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobView_jobId_idx" ON "JobView"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobView_userId_jobId_key" ON "JobView"("userId", "jobId");

-- CreateIndex
CREATE INDEX "ApplyClick_userId_createdAt_idx" ON "ApplyClick"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplyClick_jobId_idx" ON "ApplyClick"("jobId");

-- AddForeignKey
ALTER TABLE "JobView" ADD CONSTRAINT "JobView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "JobView" ADD CONSTRAINT "JobView_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ApplyClick" ADD CONSTRAINT "ApplyClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ApplyClick" ADD CONSTRAINT "ApplyClick_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
