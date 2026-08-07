import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflowNames = [
  "add-ad-groups",
  "add-keywords",
  "asset-set-linkage",
  "audience-segments",
  "bidding-adjustments",
  "bidding-strategies",
  "campaign-assets",
  "campaign-criteria",
  "conversion-goals",
  "create-campaign-experiment",
  "deploy-campaign",
  "negative-keywords",
  "pause-ad-groups",
  "performance-max-asset-groups",
  "performance-max-listing-groups",
  "recommendations",
  "remove-keywords",
  "set-campaign-frequency-cap",
  "set-campaign-max-cpc",
  "shared-set-negative-keywords",
  "update-ad-final-urls",
  "update-ad-group-demographics",
  "update-campaign-bidding",
  "update-campaign-budget",
  "update-campaign-locations",
  "update-responsive-search-ads",
] as const;

interface ExportTarget {
  default: string;
  development: string;
  types: string;
}

interface PackageManifest {
  exports: Record<string, ExportTarget>;
}

const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
) as PackageManifest;

describe("workflow export contract", () => {
  it("exposes one explicit public subpath per supported operation", () => {
    const workflowExports = Object.keys(packageManifest.exports)
      .filter((subpath) => subpath.startsWith("./workflows/"))
      .toSorted();

    expect(workflowExports).toStrictEqual(
      workflowNames.map((name) => `./workflows/${name}`).toSorted()
    );
  });

  it("maps every workflow subpath directly to its operation module", () => {
    for (const name of workflowNames) {
      const sourceTarget = `./src/workflows/${name}.ts`;

      expect(packageManifest.exports[`./workflows/${name}`]).toStrictEqual({
        types: sourceTarget,
        development: sourceTarget,
        default: `./dist/workflows/${name}.js`,
      });
    }
  });

  it("does not expose workflow internals through a wildcard or barrel", () => {
    expect(packageManifest.exports).not.toHaveProperty("./workflows");
    expect(packageManifest.exports).not.toHaveProperty("./workflows/*");
    expect(packageManifest.exports).not.toHaveProperty("./workflows/shared");
  });
});
