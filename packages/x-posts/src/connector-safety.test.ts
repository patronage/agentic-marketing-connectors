import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");

describe("connector safety contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads the root export without fetch access or runtime bootstrap", async () => {
    const fetchTrap = vi.fn<typeof fetch>(() => {
      throw new Error("root import must not touch fetch");
    });

    vi.stubGlobal("fetch", fetchTrap);

    vi.resetModules();
    const root = await import("./index.js");

    expect(Object.keys(root).toSorted()).toStrictEqual([
      "compareProviders",
      "listRecentPosts",
    ]);
    expect(fetchTrap).not.toHaveBeenCalled();
  });

  it("allows callers to avoid global fetch through provider injection", async () => {
    vi.stubGlobal("fetch", undefined as never);

    vi.resetModules();
    const root = await import("./index.js");
    const result = await root.listRecentPosts(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xApiBearerToken: "x-token",
      },
      {
        createProvider(provider) {
          return {
            async listRecentPosts() {
              return {
                handle: "ExampleCommunityFund",
                posts: [],
                provider,
                since: "2026-03-31",
                until: "2026-03-31",
                warnings: [],
              };
            },
          };
        },
      }
    );

    expect(result.provider).toBe("x-api");
  });

  it("keeps runtime source free of CLI, Node, and local repo boundaries", async () => {
    const runtimeFiles = [
      "src/index.ts",
      "src/list-recent-posts.ts",
      "src/compare-providers.ts",
      "src/types.ts",
      "src/providers/provider.ts",
      "src/providers/x-api-timeline-provider.ts",
      "src/providers/xai-grok-search-provider.ts",
    ];
    const privateConfigPackage = ["@paitronage", "config"].join("/");
    const forbidden = [
      "@patronage/cli",
      privateConfigPackage,
      "commander",
      "dotenv",
      "node:",
      "node-fetch",
      "process.env",
      'from "fs"',
      'from "http"',
      'from "https"',
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
