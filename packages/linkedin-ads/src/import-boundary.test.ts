import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const privateConfigPackage = ["@paitronage", "config"].join("/");
const forbiddenRuntimeImports = [
  privateConfigPackage,
  "@patronage/cli",
  "automation/linkedin",
  "axios",
  "cheerio",
  "child_process",
  "commander",
  "dotenv",
  "linkedin-api-client",
  "node-fetch",
  "node:",
  'from "fs"',
  'import("fs")',
  'from "http"',
  'import("http")',
  'from "https"',
  'import("https")',
  'from "path"',
  'import("path")',
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
  it("exports resumable deployment from an explicit subpath", async () => {
    const deployment = await import("./deployment.js");

    expect(Object.keys(deployment).toSorted()).toStrictEqual([
      "deployLinkedInBoostResumable",
      "deployLinkedInBriefResumable",
    ]);
  });

  it("exports the LinkedIn Ads root surface", async () => {
    const root = await import("./index.js");

    expect(Object.keys(root).toSorted()).toStrictEqual([
      "DEFAULT_LINKEDIN_MARKETING_API_VERSION",
      "DEFAULT_LINKEDIN_OPTIMIZATION_GUARDRAILS",
      "LINKEDIN_ADS_READ_VERIFICATION_MATRIX",
      "LinkedInAdsApiError",
      "LinkedInAllocationGuardrailError",
      "applyLinkedInOptimizationActions",
      "buildBoostPostPlan",
      "buildLinkedInBriefDeploymentPlan",
      "buildLinkedInOptimizationActions",
      "createLinkedInAdsClient",
      "detectLinkedInCreativeFatigue",
      "parseLinkedInCampaignBrief",
      "recommendLinkedInCreativeAllocation",
      "runLinkedInAdsReadCanary",
    ]);
  });

  it("exports targeting reads from an explicit subpath", async () => {
    const targeting = await import("./targeting.js");

    expect(Object.keys(targeting).toSorted()).toStrictEqual([
      "createLinkedInTargetingClient",
    ]);
  });

  it("exports reporting reads from an explicit subpath", async () => {
    const reporting = await import("./reporting.js");

    expect(Object.keys(reporting).toSorted()).toStrictEqual([
      "LINKEDIN_ANALYTICS_PIVOTS",
      "LINKEDIN_ANALYTICS_STATISTICS_PIVOTS",
      "LINKEDIN_TIME_GRANULARITIES",
      "createLinkedInReportingClient",
    ]);
  });

  it("exports account reads from an explicit subpath", async () => {
    const accounts = await import("./accounts.js");

    expect(Object.keys(accounts).toSorted()).toStrictEqual([
      "LINKEDIN_AD_ACCOUNT_ROLES",
      "LINKEDIN_AD_ACCOUNT_SERVING_STATUSES",
      "LINKEDIN_AD_ACCOUNT_STATUSES",
      "LINKEDIN_AD_ACCOUNT_TYPES",
      "createLinkedInAccountsClient",
    ]);
  });

  it("exports campaign reads from an explicit subpath", async () => {
    const campaigns = await import("./campaigns.js");

    expect(Object.keys(campaigns).toSorted()).toStrictEqual([
      "LINKEDIN_CAMPAIGN_GROUP_READ_STATUSES",
      "LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUSES",
      "LINKEDIN_CAMPAIGN_PACING_STRATEGIES",
      "LINKEDIN_CAMPAIGN_READ_STATUSES",
      "LINKEDIN_CAMPAIGN_SERVING_STATUSES",
      "createLinkedInCampaignsClient",
    ]);
  });

  it("exports conversion reads from an explicit subpath", async () => {
    const conversions = await import("./conversions.js");

    expect(Object.keys(conversions).toSorted()).toStrictEqual([
      "LINKEDIN_CONVERSION_ATTRIBUTION_TYPES",
      "LINKEDIN_CONVERSION_TYPES",
      "createLinkedInConversionsClient",
    ]);
  });

  it("exports current-model creative reads from an explicit subpath", async () => {
    const creatives = await import("./creatives.js");

    expect(Object.keys(creatives).toSorted()).toStrictEqual([
      "LINKEDIN_CREATIVE_INTENDED_STATUSES",
      "LINKEDIN_CREATIVE_REVIEW_STATUSES",
      "LINKEDIN_CREATIVE_SERVING_HOLD_REASONS",
      "createLinkedInCreativesClient",
    ]);
  });

  it("keeps runtime source files free of Node and legacy LinkedIn dependencies", () => {
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
});
