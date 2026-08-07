import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: { generator: "oxc" },
  entry: [
    "src/index.ts",
    "src/deployment.ts",
    "src/targeting.ts",
    "src/reporting.ts",
    "src/accounts.ts",
    "src/campaigns.ts",
    "src/conversions.ts",
    "src/creatives.ts",
  ],
  fixedExtension: false,
  format: ["esm"],
  platform: "neutral",
});
