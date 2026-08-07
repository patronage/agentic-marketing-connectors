/* oxlint-disable vitest/require-mock-type-parameters -- Legacy workflow mocks are inferred from their fetch fixtures. */

import { describe, expect, it, vi } from "vitest";

import type { MetaSocialApiError } from "./meta-social-api-error.js";
import { createMetaSocialClient } from "./meta-social-client.js";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, init);
}

describe(createMetaSocialClient, () => {
  it("lists managed pages through the Graph API with caller auth", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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

    await expect(client.listManagedPages()).resolves.toStrictEqual([
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [] }));
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
    expect(requestUrl.searchParams.has("appsecret_proof")).toBeFalsy();
  });

  it("uses per-request appsecret proof for overridden tokens", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [] }));
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    ).resolves.toStrictEqual([
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    ).resolves.toStrictEqual([
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

  it("lists comments for Page or Instagram objects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            created_time: "2026-05-01T12:00:00+0000",
            from: { id: "user-1", name: "Commenter" },
            id: "comment-1",
            is_hidden: false,
            message: "Great post",
          },
        ],
      })
    );
    const client = createMetaSocialClient({
      accessToken: "page-token",
      fetch: fetchMock,
    });

    await expect(
      client.listComments({
        accessToken: "moderation-token",
        appSecretProof: "moderation-proof",
        filter: "stream",
        objectId: "page-1_post-1",
        order: "reverse_chronological",
        pageSize: 25,
        since: "2026-05-01",
      })
    ).resolves.toStrictEqual([
      {
        created_time: "2026-05-01T12:00:00+0000",
        from: { id: "user-1", name: "Commenter" },
        id: "comment-1",
        is_hidden: false,
        message: "Great post",
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/page-1_post-1/comments");
    expect(requestUrl.searchParams.get("access_token")).toBe(
      "moderation-token"
    );
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe(
      "moderation-proof"
    );
    expect(requestUrl.searchParams.get("fields")).toBe(
      "id,message,created_time,from,is_hidden,like_count,can_hide,can_remove,permalink_url,parent,user_likes"
    );
    expect(requestUrl.searchParams.get("filter")).toBe("stream");
    expect(requestUrl.searchParams.get("limit")).toBe("25");
    expect(requestUrl.searchParams.get("order")).toBe("reverse_chronological");
    expect(requestUrl.searchParams.get("since")).toBe("2026-05-01");
  });

  it("follows comment pages beyond the requested page size", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { id: "comment-1", is_hidden: false, message: "One" },
            { id: "comment-2", is_hidden: false, message: "Two" },
          ],
          paging: {
            next: "https://graph.facebook.com/v21.0/page-1_post-1/comments?limit=2&after=abc",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "comment-3", is_hidden: true, message: "Three" }],
        })
      );
    const client = createMetaSocialClient({
      accessToken: "page-token",
      appSecretProof: "page-proof",
      fetch: fetchMock,
    });

    await expect(
      client.listComments({
        maxResults: 3,
        objectId: "page-1_post-1",
        pageSize: 2,
      })
    ).resolves.toStrictEqual([
      { id: "comment-1", is_hidden: false, message: "One" },
      { id: "comment-2", is_hidden: false, message: "Two" },
      { id: "comment-3", is_hidden: true, message: "Three" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(firstUrl.searchParams.get("limit")).toBe("2");
    const nextUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(nextUrl.searchParams.get("after")).toBe("abc");
    expect(nextUrl.searchParams.get("access_token")).toBe("page-token");
    expect(nextUrl.searchParams.get("appsecret_proof")).toBe("page-proof");
  });

  it("caps comment results separately from page size", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { id: "comment-1", message: "One" },
            { id: "comment-2", message: "Two" },
          ],
          paging: {
            next: "https://graph.facebook.com/v21.0/page-1_post-1/comments?limit=2&after=abc",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "comment-3", message: "Three" }],
        })
      );
    const client = createMetaSocialClient({
      accessToken: "page-token",
      fetch: fetchMock,
    });

    await expect(
      client.listComments({
        maxResults: 2,
        objectId: "page-1_post-1",
        pageSize: 2,
      })
    ).resolves.toStrictEqual([
      { id: "comment-1", message: "One" },
      { id: "comment-2", message: "Two" },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("lists comments with custom fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ id: "comment-1", message: "Great post" }],
      })
    );
    const client = createMetaSocialClient({
      accessToken: "page-token",
      fetch: fetchMock,
    });

    await client.listComments({
      fields: "id,message",
      objectId: "ig-media-1",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/ig-media-1/comments");
    expect(requestUrl.searchParams.get("fields")).toBe("id,message");
    expect(requestUrl.searchParams.get("limit")).toBe("100");
  });

  it("hides and unhides comments", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const client = createMetaSocialClient({
      accessToken: "page-token",
      fetch: fetchMock,
    });

    await expect(
      client.hideComment({
        accessToken: "moderation-token",
        appSecretProof: "moderation-proof",
        commentId: "comment-1",
      })
    ).resolves.toStrictEqual({ success: true });
    await expect(
      client.moderateComment({
        commentId: "comment-1",
        hidden: false,
      })
    ).resolves.toStrictEqual({ success: true });

    const hideUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(hideUrl.pathname).toBe("/v21.0/comment-1");
    expect(hideUrl.searchParams.get("access_token")).toBe("moderation-token");
    expect(hideUrl.searchParams.get("appsecret_proof")).toBe(
      "moderation-proof"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    const hideBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect([...hideBody.entries()]).toStrictEqual([["is_hidden", "true"]]);

    const unhideBody = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect([...unhideBody.entries()]).toStrictEqual([["is_hidden", "false"]]);
  });

  it("publishes Instagram images through media creation and publish", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "ig-media-1" }));
    const client = createMetaSocialClient({
      accessToken: "page-token",
      fetch: fetchMock,
    });

    await expect(
      client.publishInstagramMedia({
        accessToken: "ig-token",
        appSecretProof: "ig-proof",
        caption: "Launch caption",
        imageUrl: "https://example.com/image.jpg",
        instagramUserId: "ig-user",
      })
    ).resolves.toStrictEqual({
      creationId: "creation-1",
      id: "ig-media-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const creationUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(creationUrl.pathname).toBe("/v21.0/ig-user/media");
    expect(creationUrl.searchParams.get("access_token")).toBe("ig-token");
    expect(creationUrl.searchParams.get("appsecret_proof")).toBe("ig-proof");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toStrictEqual({
      "content-type": "application/x-www-form-urlencoded",
    });
    const creationBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(creationBody.get("caption")).toBe("Launch caption");
    expect(creationBody.get("image_url")).toBe("https://example.com/image.jpg");
    expect(creationBody.has("video_url")).toBeFalsy();
    expect(creationBody.has("media_type")).toBeFalsy();

    const publishUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(publishUrl.pathname).toBe("/v21.0/ig-user/media_publish");
    expect(publishUrl.searchParams.get("access_token")).toBe("ig-token");
    expect(publishUrl.searchParams.get("appsecret_proof")).toBe("ig-proof");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    const publishBody = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect([...publishBody.entries()]).toStrictEqual([
      ["creation_id", "creation-1"],
    ]);
  });

  it("polls Instagram video containers before publishing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "creation-1", status_code: "IN_PROGRESS" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "creation-1", status_code: "FINISHED" })
      )
      .mockResolvedValueOnce(jsonResponse({ id: "ig-media-1" }));
    const client = createMetaSocialClient({
      accessToken: "ig-token",
      fetch: fetchMock,
    });

    await client.publishInstagramMedia({
      instagramUserId: "ig-user",
      maxStatusPollAttempts: 3,
      mediaType: "REELS",
      statusPollIntervalMs: 0,
      videoUrl: "https://example.com/reel.mp4",
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const creationBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(creationBody.get("video_url")).toBe("https://example.com/reel.mp4");
    expect(creationBody.get("media_type")).toBe("REELS");
    expect(creationBody.has("image_url")).toBeFalsy();
    const statusUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(statusUrl.pathname).toBe("/v21.0/creation-1");
    expect(statusUrl.searchParams.get("fields")).toBe("id,status,status_code");
    const publishUrl = new URL(String(fetchMock.mock.calls[3]?.[0]));
    expect(publishUrl.pathname).toBe("/v21.0/ig-user/media_publish");
  });

  it("rejects failed Instagram video containers before publish", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "creation-1", status_code: "ERROR" })
      );
    const client = createMetaSocialClient({
      accessToken: "ig-token",
      fetch: fetchMock,
    });

    await expect(
      client.publishInstagramMedia({
        instagramUserId: "ig-user",
        maxStatusPollAttempts: 3,
        mediaType: "REELS",
        statusPollIntervalMs: 0,
        videoUrl: "https://example.com/reel.mp4",
      })
    ).rejects.toThrow(
      "Instagram media container creation-1 failed with status ERROR."
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out waiting for Instagram video containers before publish", async () => {
    // oxlint-disable-next-line vitest/prefer-mock-return-shorthand, vitest/prefer-mock-promise-shorthand -- each poll needs a fresh Response body.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "creation-1" }))
      .mockImplementation(async () =>
        jsonResponse({ id: "creation-1", status_code: "IN_PROGRESS" })
      );
    const client = createMetaSocialClient({
      accessToken: "ig-token",
      fetch: fetchMock,
    });

    await expect(
      client.publishInstagramMedia({
        instagramUserId: "ig-user",
        maxStatusPollAttempts: 2,
        mediaType: "REELS",
        statusPollIntervalMs: 0,
        videoUrl: "https://example.com/reel.mp4",
      })
    ).rejects.toThrow(
      "Instagram media container creation-1 was not ready after 2 status checks."
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid Instagram publish sources before requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "creation-1" }));
    const client = createMetaSocialClient({
      accessToken: "ig-token",
      fetch: fetchMock,
    });

    await expect(
      client.publishInstagramMedia({ instagramUserId: "ig-user" } as never)
    ).rejects.toThrow("Instagram publish requires imageUrl or videoUrl.");
    await expect(
      client.publishInstagramMedia({
        imageUrl: "https://example.com/image.jpg",
        instagramUserId: "ig-user",
        videoUrl: "https://example.com/video.mp4",
      } as never)
    ).rejects.toThrow(
      "Instagram publish accepts imageUrl or videoUrl, not both."
    );
    await expect(
      client.publishInstagramMedia({
        instagramUserId: "ig-user",
        videoUrl: "https://example.com/video.mp4",
      } as never)
    ).rejects.toThrow(
      "Instagram video publish requires mediaType REELS or STORIES."
    );
    await expect(
      client.publishInstagramMedia({
        instagramUserId: "ig-user",
        mediaType: "VIDEO",
        videoUrl: "https://example.com/video.mp4",
      } as never)
    ).rejects.toThrow(
      "Instagram video publish mediaType must be REELS or STORIES."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects request bodies on non-POST calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "1" }));
    const client = createMetaSocialClient({
      accessToken: "token",
      fetch: fetchMock,
    });

    await expect(
      client.request("/me", { body: { message: "invalid" } })
    ).rejects.toThrow("Meta Social request bodies require POST.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not publish Instagram media when container creation fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        error: {
          code: 100,
          message: "Invalid image URL",
          type: "GraphMethodException",
        },
      })
    );
    const client = createMetaSocialClient({
      accessToken: "ig-token",
      fetch: fetchMock,
    });

    await expect(
      client.publishInstagramMedia({
        imageUrl: "https://example.com/not-image",
        instagramUserId: "ig-user",
      })
    ).rejects.toMatchObject({
      code: 100,
      message: "Invalid image URL",
      name: "MetaSocialApiError",
      type: "GraphMethodException",
    } satisfies Partial<MetaSocialApiError>);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws structured Graph API errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
