import { describe, expect, it, vi } from "vitest";

import { XaiGrokSearchProvider } from "./xai-grok-search-provider.js";

function makeResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe(XaiGrokSearchProvider, () => {
  it("normalizes grounded x_search responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        output: [
          {
            content: [
              {
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://x.com/ExampleCommunityFund/status/2039058147386831350",
                  },
                ],
                text: JSON.stringify([
                  {
                    hasVideo: true,
                    id: "2039058147386831350",
                    mediaTypes: ["video"],
                    metrics: {
                      likeCount: 10,
                      viewCount: 1200,
                    },
                    sharedUrls: [],
                    text: "Local families deserve reliable support from their community.",
                    timestamp: "2026-03-31T18:00:00.000Z",
                  },
                ]),
                type: "output_text",
              },
            ],
            role: "assistant",
            type: "message",
          },
        ],
      })
    );

    const provider = new XaiGrokSearchProvider(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
      },
      fetchMock as typeof fetch
    );

    const result = await provider.listRecentPosts();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe("grok-4-1-fast-reasoning");
    expect(body.temperature).toBe(0);
    expect(body.tool_choice).toBe("required");
    expect(body.input).toStrictEqual([
      {
        content: expect.stringContaining(
          "Return only a JSON array of authored posts from @ExampleCommunityFund"
        ),
        role: "user",
      },
    ]);
    expect(body.tools[0]).toStrictEqual(
      expect.objectContaining({
        allowed_x_handles: ["ExampleCommunityFund"],
        enable_video_understanding: true,
        from_date: "2026-03-31",
        to_date: "2026-03-31",
        type: "x_search",
      })
    );
    expect(result.posts).toStrictEqual([
      expect.objectContaining({
        handle: "ExampleCommunityFund",
        hasVideo: true,
        id: "2039058147386831350",
        mediaTypes: ["video"],
        metrics: {
          likeCount: 10,
          viewCount: 1200,
        },
        provider: "xai-grok",
        publishedAt: "2026-03-31T18:00:00.000Z",
        url: "https://x.com/ExampleCommunityFund/status/2039058147386831350",
      }),
    ]);
  });

  it("falls back to citations when the model omits canonical urls", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        output: [
          {
            content: [
              {
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://x.com/ExampleCommunityFund/status/2039058147386831350",
                  },
                ],
                text: JSON.stringify([
                  {
                    id: "2039058147386831350",
                    sharedUrls: [],
                    text: "Community update",
                    timestamp: "2026-03-31T18:00:00.000Z",
                  },
                ]),
                type: "output_text",
              },
            ],
            role: "assistant",
            type: "message",
          },
        ],
      })
    );

    const provider = new XaiGrokSearchProvider(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
      },
      fetchMock as typeof fetch
    );

    const result = await provider.listRecentPosts();

    expect(result.posts[0]?.url).toBe(
      "https://x.com/ExampleCommunityFund/status/2039058147386831350"
    );
  });

  it("uses output annotations when top-level citations are absent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        output: [
          {
            content: [
              {
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://x.com/ExampleCommunityFund/status/2039018944766300656",
                  },
                ],
                text: JSON.stringify([
                  {
                    sharedUrls: [],
                    text: "Farmworkers Day post",
                    timestamp: "2026-03-31T16:36:14.000Z",
                  },
                ]),
                type: "output_text",
              },
            ],
            role: "assistant",
            type: "message",
          },
        ],
      })
    );

    const provider = new XaiGrokSearchProvider(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
      },
      fetchMock as typeof fetch
    );

    const result = await provider.listRecentPosts();

    expect(result.posts[0]).toStrictEqual(
      expect.objectContaining({
        id: "2039018944766300656",
        url: "https://x.com/ExampleCommunityFund/status/2039018944766300656",
        warnings: [],
      })
    );
  });

  it("drops model results that are not grounded by citations", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        output: [
          {
            content: [
              {
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://x.com/ExampleCommunityFund/status/2039018944766300656",
                  },
                ],
                text: JSON.stringify([
                  {
                    id: "2039018944766300656",
                    sharedUrls: [],
                    text: "Grounded post",
                    timestamp: "2026-03-31T16:36:14.000Z",
                  },
                  {
                    id: "9999999999999999999",
                    sharedUrls: [],
                    text: "Ungrounded model output",
                    timestamp: "2026-03-31T18:00:00.000Z",
                  },
                ]),
                type: "output_text",
              },
            ],
            role: "assistant",
            type: "message",
          },
        ],
      })
    );

    const provider = new XaiGrokSearchProvider(
      {
        handle: "ExampleCommunityFund",
        since: "2026-03-31",
        until: "2026-03-31",
        xAiApiKey: "xai-token",
      },
      fetchMock as typeof fetch
    );

    const result = await provider.listRecentPosts();

    expect(result.posts).toStrictEqual([
      expect.objectContaining({
        id: "2039018944766300656",
        url: "https://x.com/ExampleCommunityFund/status/2039018944766300656",
      }),
    ]);
    expect(result.warnings).toStrictEqual([
      "Dropped 1 xAI post result without citation grounding.",
    ]);
  });
});
