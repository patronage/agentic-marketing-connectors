import { describe, expect, it, vi } from "vitest";

import type { MetaSocialApiError } from "./meta-social-api-error.js";
import { createMetaSocialClient } from "./meta-social-client.js";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, init);
}

describe("createMetaSocialClient", () => {
  it("lists managed pages through the Graph API with caller auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            access_token: "page-token",
            category: "Politician",
            fan_count: 10,
            followers_count: 12,
            id: "page-1",
            link: "https://www.facebook.com/example",
            name: "Example Page",
          },
        ],
      })
    );
    const client = createMetaSocialClient({
      accessToken: "user-token",
      fetch: fetchMock,
    });

    await expect(client.listManagedPages()).resolves.toEqual([
      {
        access_token: "page-token",
        category: "Politician",
        fan_count: 10,
        followers_count: 12,
        id: "page-1",
        link: "https://www.facebook.com/example",
        name: "Example Page",
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.href).toContain(
      "https://graph.facebook.com/v21.0/me/accounts"
    );
    expect(requestUrl.searchParams.get("access_token")).toBe("user-token");
    expect(requestUrl.searchParams.get("fields")).toBe(
      "id,name,category,fan_count,followers_count,link,access_token"
    );
  });

  it("fetches page posts with page token overrides and date filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            created_time: "2026-03-31T18:00:00+0000",
            id: "page-1_post-1",
            message: "Post body",
            permalink_url: "https://www.facebook.com/page/posts/post-1",
          },
        ],
      })
    );
    const client = createMetaSocialClient({
      accessToken: "user-token",
      fetch: fetchMock,
    });

    const posts = await client.getPagePosts({
      accessToken: "page-token",
      limit: 5,
      pageId: "page-1",
      since: "2026-03-31",
      until: "2026-03-31",
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("page-1_post-1");

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/page-1/posts");
    expect(requestUrl.searchParams.get("access_token")).toBe("page-token");
    expect(requestUrl.searchParams.get("limit")).toBe("5");
    expect(requestUrl.searchParams.get("since")).toBe("2026-03-31");
    expect(requestUrl.searchParams.get("until")).toBe("2026-03-31");
    expect(requestUrl.searchParams.get("fields")).toContain("attachments");
  });

  it("does not reuse default appsecret proof for overridden tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = createMetaSocialClient({
      accessToken: "user-token",
      appSecretProof: "user-token-proof",
      fetch: fetchMock,
    });

    await client.getPagePosts({
      accessToken: "page-token",
      limit: 5,
      pageId: "page-1",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("access_token")).toBe("page-token");
    expect(requestUrl.searchParams.has("appsecret_proof")).toBe(false);
  });

  it("uses per-request appsecret proof for overridden tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = createMetaSocialClient({
      accessToken: "user-token",
      appSecretProof: "user-token-proof",
      fetch: fetchMock,
    });

    await client.getPagePosts({
      accessToken: "page-token",
      appSecretProof: "page-token-proof",
      limit: 5,
      pageId: "page-1",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("access_token")).toBe("page-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe(
      "page-token-proof"
    );
  });

  it("fetches page insights with explicit windows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            name: "page_impressions",
            period: "day",
            values: [{ end_time: "2026-03-31T07:00:00+0000", value: 123 }],
          },
        ],
      })
    );
    const client = createMetaSocialClient({
      accessToken: "page-token",
      appSecretProof: "proof",
      fetch: fetchMock,
    });

    await expect(
      client.getPageInsights({
        pageId: "page-1",
        since: "1774857600",
        until: "1774943999",
      })
    ).resolves.toEqual([
      {
        name: "page_impressions",
        period: "day",
        values: [{ end_time: "2026-03-31T07:00:00+0000", value: 123 }],
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/page-1/insights");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("proof");
    expect(requestUrl.searchParams.get("metric")).toContain(
      "page_post_engagements"
    );
  });

  it("normalizes Instagram media permalinks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            caption: "Caption",
            id: "ig-1",
            media_type: "REELS",
            permalink: "https://www.instagram.com/reel/example/?utm=x",
            timestamp: "2026-03-31T18:00:00+0000",
          },
        ],
      })
    );
    const client = createMetaSocialClient({
      accessToken: "page-token",
      fetch: fetchMock,
    });

    await expect(
      client.getInstagramMedia({ instagramUserId: "ig-user", limit: 3 })
    ).resolves.toEqual([
      {
        caption: "Caption",
        id: "ig-1",
        media_type: "REELS",
        permalink: "https://www.instagram.com/reel/example/",
        timestamp: "2026-03-31T18:00:00+0000",
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/ig-user/media");
    expect(requestUrl.searchParams.get("limit")).toBe("3");
    expect(requestUrl.searchParams.get("fields")).toContain("thumbnail_url");
  });

  it("throws structured Graph API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        error: {
          code: 190,
          error_subcode: 460,
          error_user_msg: "Token expired",
          fbtrace_id: "trace-1",
          message: "Invalid OAuth 2.0 Access Token",
          type: "OAuthException",
        },
      })
    );
    const client = createMetaSocialClient({
      accessToken: "expired-token",
      fetch: fetchMock,
    });

    await expect(client.listManagedPages()).rejects.toMatchObject({
      code: 190,
      errorSubcode: 460,
      fbtraceId: "trace-1",
      message: "Invalid OAuth 2.0 Access Token",
      name: "MetaSocialApiError",
      type: "OAuthException",
      userMessage: "Token expired",
    } satisfies Partial<MetaSocialApiError>);
  });
});
