import { describe, it, expect } from "vitest";
import { checkEnv, REQUIRED_CORE, FEATURE_VARS } from "@/lib/env";

const FULL: Record<string, string> = Object.fromEntries(
  [...REQUIRED_CORE, ...Object.values(FEATURE_VARS).flat()].map((k) => [k, "set"]),
);

describe("checkEnv", () => {
  it("reports nothing when everything is set", () => {
    expect(checkEnv(FULL)).toEqual({ missing: [], degraded: [] });
  });

  it("reports all core vars and all features on an empty env", () => {
    const report = checkEnv({});
    expect(report.missing).toEqual([...REQUIRED_CORE]);
    expect(report.degraded.map((d) => d.feature).sort()).toEqual(
      Object.keys(FEATURE_VARS).sort(),
    );
  });

  it("treats empty string as missing", () => {
    const report = checkEnv({ ...FULL, NEXT_PUBLIC_SITE_URL: "" });
    expect(report.missing).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("reports only the missing vars of a partially configured feature", () => {
    const env = { ...FULL };
    delete env.EMBED_FN_SECRET;
    const report = checkEnv(env);
    expect(report.missing).toEqual([]);
    expect(report.degraded).toEqual([{ feature: "embeddings", missing: ["EMBED_FN_SECRET"] }]);
  });

  it("never throws on undefined values", () => {
    expect(() => checkEnv({ WHATEVER: undefined })).not.toThrow();
  });
});
