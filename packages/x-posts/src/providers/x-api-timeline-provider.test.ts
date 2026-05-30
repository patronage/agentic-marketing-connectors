import { describe, expect, it, vi } from "vitest";

import { XApiTimelineProvider } from "./x-api-timeline-provider.js";

describe("XApiTimelineProvider", () => {
  it("normalizes authored posts from the user timeline", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "user-1", username: "ExampleCommunityFund" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              attachments: { media_keys: ["3_1"] },
              created_at: "2026-03-31T18:00:00.000Z",
              id: "2039058147386831350",
              public_metrics: {
                like_count: 10,
                quote_count: 2,
                reply_count: 3,
                retweet_count: 4,
              },
              text: "Local families deserve reliable support from their community. https://t.co/abc",
            },
          ],
          includes: {
            media: [
              {
                media_key: "3_1",
                public_metrics: {
                  view_count: 1200,
                },
                type: "video",
              },
            ],
          },
        }),
      });

    const provider = new XApiTimelineProvider(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xApiBearerToken: "token",
      },
      fetchMock as typeof fetch
    );

    const result = await provider.listRecentPosts();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "https://api.x.com/2/users/by/username/ExampleCommunityFund"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      "https://api.x.com/2/users/user-1/tweets"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      "exclude=retweets%2Creplies"
    );
    expect(result.provider).toBe("x-api");
    expect(result.posts).toEqual([
      expect.objectContaining({
        handle: "ExampleCommunityFund",
        hasVideo: true,
        id: "2039058147386831350",
        isQuote: false,
        isReply: false,
        isRetweet: false,
        mediaTypes: ["video"],
        metrics: {
          likeCount: 10,
          quoteCount: 2,
          replyCount: 3,
          repostCount: 4,
          viewCount: 1200,
        },
        provider: "x-api",
        publishedAt: "2026-03-31T18:00:00.000Z",
        sharedUrls: ["https://t.co/abc"],
        text: "Local families deserve reliable support from their community. https://t.co/abc",
        url: "https://x.com/ExampleCommunityFund/status/2039058147386831350",
        warnings: [],
      }),
    ]);
  });

  it("excludes replies and retweets but preserves quote tweets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "user-1", username: "ExampleCommunityFund" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              created_at: "2026-03-31T18:00:00.000Z",
              id: "reply-1",
              referenced_tweets: [{ id: "orig-1", type: "replied_to" }],
              text: "@user thanks",
            },
            {
              created_at: "2026-03-31T18:01:00.000Z",
              id: "retweet-1",
              referenced_tweets: [{ id: "orig-2", type: "retweeted" }],
              text: "RT @other great post",
            },
            {
              created_at: "2026-03-31T18:02:00.000Z",
              id: "quote-1",
              referenced_tweets: [{ id: "orig-3", type: "quoted" }],
              text: "This matters https://t.co/xyz",
            },
          ],
        }),
      });

    const provider = new XApiTimelineProvider(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xApiBearerToken: "token",
      },
      fetchMock as typeof fetch
    );

    const result = await provider.listRecentPosts();

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toEqual(
      expect.objectContaining({
        id: "quote-1",
        isQuote: true,
        isReply: false,
        isRetweet: false,
      })
    );
  });
});
