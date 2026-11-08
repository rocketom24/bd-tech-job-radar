import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // CLI only (migrations, introspection): Neon direct connection.
    // The app connects at runtime with the pooled DATABASE_URL.
    // Not env(): that throws when unset, which breaks `prisma generate` in a build (e.g. Vercel)
    // that has no DIRECT_URL. Migrate commands still fail without it, as they should.
    url: process.env.DIRECT_URL,
  },
});
