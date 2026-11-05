-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('MONTHLY', 'YEARLY', 'HOURLY');

-- CreateEnum
CREATE TYPE "SalaryDisclosure" AS ENUM ('DISCLOSED', 'NEGOTIABLE', 'NOT_DISCLOSED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "salaryCurrency" CHAR(3),
ADD COLUMN     "salaryDisclosure" "SalaryDisclosure",
ADD COLUMN     "salaryMax" DECIMAL(12,2),
ADD COLUMN     "salaryMin" DECIMAL(12,2),
ADD COLUMN     "salaryPeriod" "SalaryPeriod";

-- Salary consistency rules. Additive: every existing row has all-NULL structured
-- salary columns, so each constraint holds for legacy rows. Mirrored by salarySchema
-- in lib/schemas.ts; keep the two in sync.
ALTER TABLE "Job" ADD CONSTRAINT "Job_salary_amounts_nonnegative"
  CHECK (COALESCE("salaryMin", 0) >= 0 AND COALESCE("salaryMax", 0) >= 0);

ALTER TABLE "Job" ADD CONSTRAINT "Job_salary_min_le_max"
  CHECK ("salaryMin" IS NULL OR "salaryMax" IS NULL OR "salaryMin" <= "salaryMax");

ALTER TABLE "Job" ADD CONSTRAINT "Job_salary_currency_format"
  CHECK ("salaryCurrency" IS NULL OR "salaryCurrency" ~ '^[A-Z]{3}$');

ALTER TABLE "Job" ADD CONSTRAINT "Job_salary_disclosure_consistency"
  CHECK (
    CASE "salaryDisclosure"
      WHEN 'DISCLOSED' THEN
        "salaryCurrency" IS NOT NULL AND "salaryPeriod" IS NOT NULL
        AND ("salaryMin" IS NOT NULL OR "salaryMax" IS NOT NULL)
      WHEN 'NEGOTIABLE' THEN
        "salaryMin" IS NULL AND "salaryMax" IS NULL AND "salaryCurrency" IS NULL
      WHEN 'NOT_DISCLOSED' THEN
        "salaryMin" IS NULL AND "salaryMax" IS NULL AND "salaryCurrency" IS NULL
      ELSE -- NULL disclosure = legacy row: no structured data at all
        "salaryMin" IS NULL AND "salaryMax" IS NULL AND "salaryCurrency" IS NULL
        AND "salaryPeriod" IS NULL
    END
  );
