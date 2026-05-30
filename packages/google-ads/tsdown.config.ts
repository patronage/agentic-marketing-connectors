import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    "src/index.ts",
    "src/core/index.ts",
    "src/rest/index.ts",
    "src/reports/index.ts",
    "src/cloudflare/index.ts",
    "src/workflows/negative-keywords.ts",
    "src/workflows/pause-ad-groups.ts",
    "src/workflows/add-keywords.ts",
    "src/workflows/shared-set-negative-keywords.ts",
    "src/workflows/update-ad-final-urls.ts",
    "src/workflows/deploy-campaign.ts",
    "src/deploy/parse-brief.ts",
    "src/deploy/types.ts",
  ],
  fixedExtension: false,
  format: ["esm"],
  platform: "neutral",
});
