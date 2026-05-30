import { describe, expect, it } from "vitest";

import { compareProviders } from "./compare-providers.js";
import type { CompareProvidersInput, ListRecentPostsResult } from "./types.js";

function makeResult(
  provider: "x-api" | "xai-grok",
  overrides: Partial<ListRecentPostsResult> = {}
): ListRecentPostsResult {
  return {
    handle: "ExampleCommunityFund",
    posts: [],
    provider,
    since: "2026-03-31",
    until: "2026-03-31",
    warnings: [],
    ...overrides,
  };
}

describe("compareProviders", () => {
  it("returns partial results when one provider is unavailable", async () => {
    const result = await compareProviders(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xApiBearerToken: "x-token",
      },
      {
        listRecentPostsImpl(
          input: CompareProvidersInput & { provider?: "x-api" | "xai-grok" }
        ) {
          return Promise.resolve(makeResult(input.provider ?? "x-api"));
        },
      }
    );

    expect(result.results["x-api"]).toBeDefined();
    expect(result.results["xai-grok"]).toBeUndefined();
    expect(result.warnings).toContain("Skipped xai-grok: missing xAiApiKey.");
  });

  it("reports overlap and provider-specific gaps when both providers run", async () => {
    const result = await compareProviders(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
        xApiBearerToken: "x-token",
      },
      {
        async listRecentPostsImpl(input) {
          if (input.provider === "x-api") {
            return makeResult("x-api", {
              posts: [
                {
                  handle: "ExampleCommunityFund",
                  hasVideo: true,
                  id: "2039058147386831350",
                  isQuote: false,
                  isReply: false,
                  isRetweet: false,
                  mediaTypes: ["video"],
                  metrics: { viewCount: 1200 },
                  provider: "x-api",
                  publishedAt: "2026-03-31T18:00:00.000Z",
                  sharedUrls: [],
                  text: "Community update",
                  url: "https://x.com/ExampleCommunityFund/status/2039058147386831350",
                  warnings: [],
                },
              ],
            });
          }

          return makeResult("xai-grok", {
            posts: [
              {
                handle: "ExampleCommunityFund",
                hasVideo: true,
                id: "2039058147386831350",
                isQuote: false,
                isReply: false,
                isRetweet: false,
                mediaTypes: ["video"],
                provider: "xai-grok",
                publishedAt: "2026-03-31T18:00:00.000Z",
                sharedUrls: [],
                text: "Community update",
                url: "https://x.com/ExampleCommunityFund/status/2039058147386831350",
                warnings: [],
              },
            ],
          });
        },
      }
    );

    expect(result.comparison).toEqual({
      metricsAvailability: {
        "x-api": 1,
        "xai-grok": 0,
      },
      overlapUrls: [
        "https://x.com/ExampleCommunityFund/status/2039058147386831350",
      ],
      videoAgreement: {
        matched: 1,
        mismatched: 0,
      },
      xAiOnlyUrls: [],
      xApiOnlyUrls: [],
    });
  });
});
