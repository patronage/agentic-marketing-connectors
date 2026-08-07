import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const privateConfigPackage = ["@paitronage", "config"].join("/");
const forbiddenRuntimeImports = [
  privateConfigPackage,
  "@patronage/cli",
  "automation/meta",
  "axios",
  "child_process",
  "commander",
  "dotenv",
  'from "fb"',
  'import("fb")',
  "facebook-nodejs-business-sdk",
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
  it("exports the Meta Ads root surface", async () => {
    const root = await import("./index.js");

    expect(Object.keys(root).toSorted()).toStrictEqual([
      "DEFAULT_META_GRAPH_API_VERSION",
      "META_ADS_READ_VERIFICATION_MATRIX",
      "META_GRAPH_API_VERSION_POLICY",
      "MetaAdsAmbiguousWriteError",
      "MetaAdsApiError",
      "MetaAdsContractDriftError",
      "buildBoostPostPlan",
      "createMetaAdsClient",
      "extractAdPreviewUrl",
      "runMetaAdsReadCanary",
    ]);
  });

  it("keeps mutation smoke orchestration behind its explicit subpath", async () => {
    const mutationCanary = await import("./mutation-canary.js");

    expect(Object.keys(mutationCanary)).toStrictEqual([
      "runMetaAdsMutationCanary",
    ]);
  });

  it("exports deployment only from the explicit subpath entry", async () => {
    const deployment = await import("./deployment.js");

    expect(Object.keys(deployment).toSorted()).toStrictEqual([
      "deployMetaBoostPlan",
      "deployMetaCampaignPlan",
      "previewMetaCampaignPlan",
    ]);
  });

  it("keeps runtime source files free of Node and legacy Meta dependencies", () => {
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
