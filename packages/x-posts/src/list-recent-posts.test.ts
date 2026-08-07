import { describe, expect, it } from "vitest";

import { listRecentPosts } from "./list-recent-posts.js";
import type { ListRecentPostsResult, XProviderName } from "./types.js";

describe(listRecentPosts, () => {
  it("prefers the X API when both credential types are present", async () => {
    const result = await listRecentPosts(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
        xApiBearerToken: "x-token",
      },
      {
        createProvider(provider) {
          return {
            async listRecentPosts(): Promise<ListRecentPostsResult> {
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
    expect(result.warnings).toStrictEqual([]);
  });

  it("falls back to xAI when only xAI credentials are present", async () => {
    const result = await listRecentPosts(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
      },
      {
        createProvider(provider) {
          return {
            async listRecentPosts(): Promise<ListRecentPostsResult> {
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

    expect(result.provider).toBe("xai-grok");
  });

  it("fails deterministically when no provider credentials are configured", async () => {
    await expect(
      listRecentPosts({
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
      })
    ).rejects.toThrow(
      "No X provider credentials configured. Provide xApiBearerToken or xAiApiKey."
    );
  });

  it("honors an explicitly requested provider when credentials are present", async () => {
    const usedProviders: XProviderName[] = [];

    const result = await listRecentPosts(
      {
        handle: "ExampleCommunityFund",
        provider: "xai-grok",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
        xApiBearerToken: "x-token",
      },
      {
        createProvider(provider) {
          usedProviders.push(provider);
          return {
            async listRecentPosts(): Promise<ListRecentPostsResult> {
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

    expect(usedProviders).toStrictEqual(["xai-grok"]);
    expect(result.provider).toBe("xai-grok");
  });

  it("validates date windows before constructing a provider", async () => {
    await expect(
      listRecentPosts(
        {
          handle: "ExampleCommunityFund",
          since: "2026-04-01",
          until: "2026-03-31",
          xApiBearerToken: "x-token",
        },
        {
          createProvider() {
            throw new Error("provider should not be constructed");
          },
        }
      )
    ).rejects.toThrow("since must be on or before until.");
  });
});
