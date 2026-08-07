import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { MetaAdsClient } from "./index.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

describe("connector safety contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps raw requests and compound boost execution out of the client interface", () => {
    expectTypeOf<
      Extract<keyof MetaAdsClient, "boostPost" | "request">
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
    expect(fetchTrap).not.toHaveBeenCalled();
  });

  it("does not require global fetch when callers inject fetch", async () => {
    vi.stubGlobal("fetch", undefined as never);

    vi.resetModules();
    const root = await import("./index.js");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));
    const client = root.createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.getInsights({
      level: "campaign",
      since: "2026-03-31",
      until: "2026-04-01",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps runtime source free of CLI, Node, and local repo boundaries", async () => {
    const runtimeFiles = [
      "src/index.ts",
      "src/deployment.ts",
      "src/internal/boost-deployment.ts",
      "src/internal/campaign-deployment.ts",
      "src/internal/meta-ads-api-error.ts",
      "src/internal/meta-ads-client.ts",
      "src/internal/meta-ads-contract-drift-error.ts",
      "src/internal/mutation-canary.ts",
      "src/internal/provider-version.ts",
      "src/internal/read-canary.ts",
      "src/internal/types.ts",
    ];
    const privateConfigPackage = ["@paitronage", "config"].join("/");
    const forbidden = [
      privateConfigPackage,
      "automation/meta",
      "child_process",
      "commander",
      "dotenv",
      "node:",
      "process.env",
      'from "crypto"',
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
