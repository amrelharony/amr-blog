import path from "node:path";
import { defineConfig } from "vitest/config";

// Node environment: tests cover pure lib logic only (no DOM, no Supabase).
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's `"@/*": ["./*"]`.
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    // node by default; component tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` pragma.
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
});
