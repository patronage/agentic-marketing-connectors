import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { TikTokAdsClient } from "./index.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

describe("connector safety contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps raw requests out of the client interface", () => {
    expectTypeOf<
      Extract<keyof TikTokAdsClient, "request">
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
      "DEFAULT_TIKTOK_API_VERSION",
      "TikTokAdsAmbiguousWriteError",
      "TikTokAdsApiError",
      "createTikTokAdsClient",
    ]);
    expect(fetchTrap).not.toHaveBeenCalled();
  });

  it("does not require global fetch when callers inject fetch", async () => {
    vi.stubGlobal("fetch", undefined as never);

    vi.resetModules();
    const root = await import("./index.js");
    const fetchMock = vi.fn<typeof fetch>();

    expect(() =>
      root.createTikTokAdsClient({
        accessToken: "token",
        advertiserId: "12345",
        fetch: fetchMock,
      })
    ).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a fetch implementation when callers do not inject one", async () => {
    vi.stubGlobal("fetch", undefined as never);

    vi.resetModules();
    const root = await import("./index.js");

    expect(() =>
      root.createTikTokAdsClient({
        accessToken: "token",
        advertiserId: "12345",
      })
    ).toThrow("A fetch implementation is required.");
  });

  it("preserves TikTok body errors even when HTTP succeeds", async () => {
    const { TikTokAdsApiError } = await import("./index.js");
    const error = new TikTokAdsApiError(200, {
      code: 40_001,
      message: "Invalid request",
      request_id: "request-123",
    });

    expect(error.code).toBe(40_001);
    expect(error.message).toBe("Invalid request");
    expect(error.requestId).toBe("request-123");
    expect(error.status).toBe(200);
  });

  it("keeps runtime source free of CLI, Node, and local repo boundaries", async () => {
    const runtimeFiles = [
      "src/index.ts",
      "src/internal/tiktok-ads-api-error.ts",
      "src/internal/tiktok-ads-client.ts",
      "src/internal/types.ts",
    ];
    const privateConfigPackage = ["@paitronage", "config"].join("/");
    const forbidden = [
      privateConfigPackage,
      "automation/tiktok",
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
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- imports are checked serially so a failing runtime boundary is attributable.
      const source = await readFile(path.join(packageRoot, file), "utf-8");

      for (const token of forbidden) {
        expect(source, `${file} must not contain ${token}`).not.toContain(
          token
        );
      }
    }
  });
});
