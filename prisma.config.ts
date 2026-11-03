import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // CLI only (migrations, introspection): Neon direct connection.
    // The app connects at runtime with the pooled DATABASE_URL.
    url: env("DIRECT_URL"),
  },
});
