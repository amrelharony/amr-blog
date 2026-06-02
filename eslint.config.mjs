import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored verbatim third-party browser scripts (3D mascot, holiday engine, AI widget)
    // and Node CommonJS build/util scripts — not app source, so don't lint them.
    "public/**",
    "scripts/**",
  ]),
  {
    rules: {
      // react-hooks v6's set-state-in-effect fires on the SSR-safe "hydrate client-only
      // state (localStorage / feature-detection) on mount" pattern used across our client
      // islands. That pattern is correct and necessary (these values can't be read during
      // SSR/render), so keep the rule as a warning for visibility rather than a hard error.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
