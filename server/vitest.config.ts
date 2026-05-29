import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/types.ts",
        "src/config-schema-build.ts",
        "src/config-catalog-legacy.ts",
        "src/config-schema-wiki.ts",
        "src/config-yaml-supplement.ts",
      ],
    },
  },
});
