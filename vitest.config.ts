import path from "node:path";
import { defineConfig } from "vitest/config";

// Node environment: tests cover pure lib logic only (no DOM, no Supabase).
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's `"@/*": ["./*"]`.
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Vitest 4 removed coverage.all — an explicit include is what makes
      // UNtested lib files show up in the report at 0%.
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
