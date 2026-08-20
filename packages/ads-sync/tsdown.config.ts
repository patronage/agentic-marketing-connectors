import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: { generator: "tsgo" },
  entry: [
    "src/index.ts",
    "src/instance.ts",
    "src/providers.ts",
    "src/google-ads.ts",
    "src/google-search-console.ts",
    "src/meta-ads.ts",
    "src/run.ts",
    "src/sql.ts",
  ],
  format: ["esm"],
});
