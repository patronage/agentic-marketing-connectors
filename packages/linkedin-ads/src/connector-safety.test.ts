import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { LinkedInAdsClient } from "./index.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

describe("connector safety contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps raw requests and compound boost execution out of the client interface", () => {
    expectTypeOf<
      Extract<keyof LinkedInAdsClient, "boostPost" | "request">
    >().toEqualTypeOf<never>();
  });

  it("loads the root export without fetch access or runtime bootstrap", async () => {
    const fetchTrap = vi.fn<typeof fetch>(() => {
      throw new Error("root import must not touch fetch");
    });

    vi.stubGlobal("fetch", fetchTrap);

    vi.resetModules();
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
    expect(fetchTrap).not.toHaveBeenCalled();
  });

  it("does not require global fetch when callers inject fetch", async () => {
    vi.stubGlobal("fetch", undefined as never);

    vi.resetModules();
    const root = await import("./index.js");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ elements: [] }));
    const client = root.createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await client.listCampaigns();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps runtime source free of CLI, Node, and local repo boundaries", async () => {
    const runtimeFiles = [
      "src/accounts.ts",
      "src/campaigns.ts",
      "src/conversions.ts",
      "src/creatives.ts",
      "src/index.ts",
      "src/deployment.ts",
      "src/internal/brief-deployment.ts",
      "src/internal/linkedin-ads-api-error.ts",
      "src/internal/linkedin-ads-client.ts",
      "src/internal/optimization.ts",
      "src/internal/read-canary.ts",
      "src/internal/types.ts",
      "src/reporting.ts",
      "src/targeting.ts",
    ];
    const privateConfigPackage = ["@paitronage", "config"].join("/");
    const forbidden = [
      privateConfigPackage,
      "automation/linkedin",
      "cheerio",
      "child_process",
      "dotenv",
      "node:",
      "process.env",
      'from "fs"',
      'from "http"',
      'from "https"',
      'from "path"',
      'from "process"',
    ];

    for (const file of runtimeFiles) {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- imports are checked serially so a failing runtime boundary is attributable (#507).
      const source = await readFile(path.join(packageRoot, file), "utf-8");

      for (const token of forbidden) {
        expect(source, `${file} must not contain ${token}`).not.toContain(
          token
        );
      }
    }
  });
});
