import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

describe("connector safety contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads the root export without fetch access or runtime bootstrap", async () => {
    const fetchTrap = vi.fn(() => {
      throw new Error("root import must not touch fetch");
    });

    vi.stubGlobal("fetch", fetchTrap);

    vi.resetModules();
    const root = await import("./index.js");

    expect(Object.keys(root).toSorted()).toEqual([
      "MetaAdsApiError",
      "buildBoostPostPlan",
      "createMetaAdsClient",
    ]);
    expect(fetchTrap).not.toHaveBeenCalled();
  });

  it("does not require global fetch when callers inject fetch", async () => {
    vi.stubGlobal("fetch", undefined as never);

    vi.resetModules();
    const root = await import("./index.js");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
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
      "src/meta-ads-api-error.ts",
      "src/meta-ads-client.ts",
      "src/types.ts",
    ];
    const forbidden = [
      "@private-scope/config",
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
      const source = await readFile(path.join(packageRoot, file), "utf8");

      for (const token of forbidden) {
        expect(source, `${file} must not contain ${token}`).not.toContain(
          token
        );
      }
    }
  });
});
