import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional();

export const jobsQuerySchema = z.object({
  keyword: optionalText(100),
  location: optionalText(100),
  category: optionalText(50),
});

export type JobsQuery = z.infer<typeof jobsQuerySchema>;
