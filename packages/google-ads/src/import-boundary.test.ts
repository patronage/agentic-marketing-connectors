import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as core from "./core/index.js";
import * as campaignBriefParser from "./deploy/parse-brief.js";
import * as root from "./index.js";
import type { GoogleAdsRecommendationClient } from "./index.js";
import * as mutationCanary from "./mutation-canary.js";
import * as reports from "./reports/index.js";
import * as rest from "./rest/index.js";

const privateConfigPackage = ["@paitronage", "config"].join("/");
const forbiddenRuntimeImports = [
  privateConfigPackage,
  "axios",
  "commander",
  "dotenv",
  "google-ads-api",
  "google-ads-node",
  "google-auth-library",
  "google-gax",
  "stream-json",
  "node:",
  'from "fs"',
  'import("fs")',
  'from "http"',
  'import("http")',
  'from "https"',
  'import("https")',
  'from "process"',
  'import("process")',
  "process.env",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = path.join(dir, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      return sourceFiles(filePath);
    }

    if (!filePath.endsWith(".ts") || filePath.endsWith(".test.ts")) {
      return [];
    }

    return [filePath];
  });
}

describe("worker-safe public boundary", () => {
  it("exports a small root surface without pulling report or test helpers into the root", () => {
    expect(Object.keys(root).toSorted()).toStrictEqual([
      "DEFAULT_GOOGLE_ADS_API_VERSION",
      "GoogleAdsContractError",
      "GoogleAdsRequestError",
      "createGoogleAdsClient",
      "runGoogleAdsReadCanary",
    ]);
    expect(root).not.toHaveProperty("getCampaignPerformance");
    expect(root).not.toHaveProperty("buildCampaignNegativeKeywordOperations");
  });

  it("keeps mutation smoke orchestration behind its explicit subpath", () => {
    expect(Object.keys(mutationCanary)).toStrictEqual([
      "googleAdsMutationSmokeFixtureKeys",
      "assertGoogleAdsMutationSmokeFixtures",
      "runGoogleAdsMutationCanary",
    ]);
  });

  it("keeps runtime source files free of Node and legacy Google Ads dependencies", () => {
    const files = sourceFiles(new URL(".", import.meta.url).pathname);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const forbidden of forbiddenRuntimeImports) {
        expect(
          content,
          `${path.relative(process.cwd(), file)} should not include ${forbidden}`
        ).not.toContain(forbidden);
      }
    }
  });

  it("keeps core pure and exposes rest/report surfaces from their own subpaths", () => {
    expect(core).toHaveProperty("normalizeCustomerId");
    expect(rest).toHaveProperty("createGoogleAdsClient");
    expect(reports).toHaveProperty("getCampaignPerformance");
  });

  it("keeps Campaign Brief grammar helpers behind one parser interface", () => {
    expect(Object.keys(campaignBriefParser).toSorted()).toStrictEqual([
      "CampaignBriefParseError",
      "parseCampaignBrief",
      "validateCampaignBrief",
    ]);
  });

  it("exposes recommendation client types from the root without adding runtime exports", () => {
    type RecommendationClientKeys = keyof GoogleAdsRecommendationClient;
    const expectedKeys = [
      "applyRecommendations",
      "dismissRecommendations",
    ] satisfies RecommendationClientKeys[];

    expect(expectedKeys).toStrictEqual([
      "applyRecommendations",
      "dismissRecommendations",
    ]);
    expect(Object.keys(root).toSorted()).toStrictEqual([
      "DEFAULT_GOOGLE_ADS_API_VERSION",
      "GoogleAdsContractError",
      "GoogleAdsRequestError",
      "createGoogleAdsClient",
      "runGoogleAdsReadCanary",
    ]);
  });
});
