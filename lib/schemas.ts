import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // Postgres text cannot hold NUL; without this the query fails and the client gets a 500.
    .refine((value) => !value.includes("\0"), "Must not contain NUL characters")
    .transform((value) => value || undefined)
    .optional();

export const jobsQuerySchema = z.object({
  keyword: optionalText(100),
  location: optionalText(100),
  category: optionalText(50),
});

export type JobsQuery = z.infer<typeof jobsQuerySchema>;

// ---- Structured salary -------------------------------------------------------------
// Mirrors the CHECK constraints in migration 20261105172538_add_structured_salary.
// Keep the two in sync. Amounts are JS numbers here; Postgres stores DECIMAL(12,2).

export const SALARY_PERIODS = ["MONTHLY", "YEARLY", "HOURLY"] as const;
export const SALARY_DISCLOSURES = ["DISCLOSED", "NEGOTIABLE", "NOT_DISCLOSED"] as const;

const salaryAmount = z.number().min(0).max(9_999_999_999.99).multipleOf(0.01);

export const salarySchema = z
  .object({
    salaryMin: salaryAmount.nullish(),
    salaryMax: salaryAmount.nullish(),
    salaryCurrency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-letter uppercase currency code").nullish(),
    salaryPeriod: z.enum(SALARY_PERIODS).nullish(),
    salaryDisclosure: z.enum(SALARY_DISCLOSURES).nullish(),
  })
  .superRefine((s, ctx) => {
    const issue = (path: keyof typeof s, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const hasAmount = s.salaryMin != null || s.salaryMax != null;

    if (s.salaryMin != null && s.salaryMax != null && s.salaryMin > s.salaryMax) {
      issue("salaryMin", "salaryMin must not exceed salaryMax");
    }
    switch (s.salaryDisclosure) {
      case "DISCLOSED":
        if (!hasAmount) issue("salaryMin", "DISCLOSED requires salaryMin or salaryMax");
        if (s.salaryCurrency == null) issue("salaryCurrency", "DISCLOSED requires salaryCurrency");
        if (s.salaryPeriod == null) issue("salaryPeriod", "DISCLOSED requires salaryPeriod");
        break;
      case "NEGOTIABLE":
      case "NOT_DISCLOSED":
        if (hasAmount) issue("salaryMin", `${s.salaryDisclosure} must not have salary amounts`);
        if (s.salaryCurrency != null) issue("salaryCurrency", `${s.salaryDisclosure} must not have a currency`);
        break;
      default: // null/undefined = legacy row: no structured data at all
        if (hasAmount || s.salaryCurrency != null || s.salaryPeriod != null) {
          issue("salaryDisclosure", "salaryDisclosure is required when any structured salary field is set");
        }
    }
  });

export type SalaryInput = z.infer<typeof salarySchema>;
