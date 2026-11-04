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
