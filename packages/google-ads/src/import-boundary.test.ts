import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import * as core from "./core/index.js";
import * as root from "./index.js";
import * as reports from "./reports/index.js";
import * as rest from "./rest/index.js";

const forbiddenRuntimeImports = [
  "@private-scope/config",
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
  'from "http"',
  'from "https"',
  'from "process"',
  "process.env",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return sourceFiles(path);
    }

    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) {
      return [];
    }

    return [path];
  });
}

describe("worker-safe public boundary", () => {
  it("exports a small root surface without pulling report or test helpers into the root", () => {
    expect(Object.keys(root).toSorted()).toEqual(["createGoogleAdsClient"]);
    expect(root).not.toHaveProperty("getCampaignPerformance");
    expect(root).not.toHaveProperty("buildCampaignNegativeKeywordOperations");
  });

  it("keeps runtime source files free of Node and legacy Google Ads dependencies", () => {
    const files = sourceFiles(new URL(".", import.meta.url).pathname);

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const forbidden of forbiddenRuntimeImports) {
        expect(
          content,
          `${relative(process.cwd(), file)} should not include ${forbidden}`
        ).not.toContain(forbidden);
      }
    }
  });

  it("keeps core pure and exposes rest/report surfaces from their own subpaths", () => {
    expect(core).toHaveProperty("normalizeCustomerId");
    expect(rest).toHaveProperty("createGoogleAdsClient");
    expect(reports).toHaveProperty("getCampaignPerformance");
  });
});
