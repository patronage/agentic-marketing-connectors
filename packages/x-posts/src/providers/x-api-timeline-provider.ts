import type { ListRecentPostsInput, ListRecentPostsResult } from "../types.js";
import type { XPostsProvider } from "./provider.js";

export class XApiTimelineProvider implements XPostsProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly input: ListRecentPostsInput;

  constructor(input: ListRecentPostsInput, fetchImpl: typeof fetch = fetch) {
    this.input = input;
    this.fetchImpl = fetchImpl;
  }

  async listRecentPosts(): Promise<ListRecentPostsResult> {
    if (!this.input.xApiBearerToken) {
      throw new Error("x-api provider requires xApiBearerToken.");
    }

    const userLookupResponse = await this.fetchImpl(
      buildUserLookupUrl(this.input.handle),
      {
        headers: createHeaders(this.input.xApiBearerToken),
      }
    );
    const userLookupJson =
      (await userLookupResponse.json()) as XUserLookupResponse;
    const userId = userLookupJson.data?.id;

    if (!userLookupResponse.ok || !userId) {
      const detail = userLookupJson.errors?.[0]?.detail;
      throw new Error(
        detail ??
          `X API user lookup failed for @${this.input.handle}: HTTP ${userLookupResponse.status}`
      );
    }

    const timelineResponse = await this.fetchImpl(
      this.buildTimelineUrl(userId),
      {
        headers: createHeaders(this.input.xApiBearerToken),
      }
    );
    const timelineJson = (await timelineResponse.json()) as XTimelineResponse;

    if (!timelineResponse.ok) {
      const detail = timelineJson.errors?.[0]?.detail;
      throw new Error(
        detail ??
          `X API timeline request failed for @${this.input.handle}: HTTP ${timelineResponse.status}`
      );
    }

    return {
      handle: this.input.handle,
      posts: normalizeTimelinePosts(this.input.handle, timelineJson),
      provider: "x-api",
      since: this.input.since,
      until: this.input.until,
      warnings: [],
    };
  }

  private buildTimelineUrl(userId: string): string {
    const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
    url.searchParams.set("exclude", "retweets,replies");
    url.searchParams.set("expansions", "attachments.media_keys");
    url.searchParams.set("max_results", String(clampLimit(this.input.limit)));
    url.searchParams.set(
      "media.fields",
      "duration_ms,media_key,preview_image_url,public_metrics,type,url"
    );
    url.searchParams.set(
      "tweet.fields",
      [
        "attachments",
        "created_at",
        "entities",
        "in_reply_to_user_id",
        "public_metrics",
        "referenced_tweets",
      ].join(",")
    );
    url.searchParams.set("start_time", `${this.input.since}T00:00:00.000Z`);
    url.searchParams.set("end_time", `${this.input.until}T23:59:59.999Z`);
    return url.toString();
  }
}

interface XApiError {
  detail?: string;
}

interface XApiMedia {
  media_key: string;
  public_metrics?: {
    view_count?: number;
  };
  type?: string;
}

interface XApiTweet {
  attachments?: {
    media_keys?: string[];
  };
  created_at?: string;
  entities?: {
    urls?: {
      expanded_url?: string;
      url?: string;
    }[];
  };
  id: string;
  in_reply_to_user_id?: string;
  public_metrics?: {
    like_count?: number;
    quote_count?: number;
    reply_count?: number;
    retweet_count?: number;
  };
  referenced_tweets?: {
    id: string;
    type: "quoted" | "replied_to" | "retweeted";
  }[];
  text: string;
}

interface XTimelineResponse {
  data?: XApiTweet[];
  errors?: XApiError[];
  includes?: {
    media?: XApiMedia[];
  };
}

interface XUserLookupResponse {
  data?: {
    id?: string;
    username?: string;
  };
  errors?: XApiError[];
}

function clampLimit(limit?: number): number {
  if (!limit) {
    return 10;
  }

  return Math.max(5, Math.min(100, Math.trunc(limit)));
}

function buildUserLookupUrl(handle: string): string {
  const url = new URL(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`
  );
  url.searchParams.set("user.fields", "username");
  return url.toString();
}

function createHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function extractSharedUrls(tweet: XApiTweet): string[] {
  const fromEntities =
    tweet.entities?.urls?.flatMap((entry) => {
      const url = entry.expanded_url ?? entry.url;
      return isNonEmptyString(url) ? [url] : [];
    }) ?? [];

  if (fromEntities.length > 0) {
    return fromEntities;
  }

  return Array.from(
    tweet.text.matchAll(/https?:\/\/\S+/gu),
    (match) => match[0]
  );
}

function normalizeTimelinePosts(
  handle: string,
  response: XTimelineResponse
): ListRecentPostsResult["posts"] {
  const mediaMap = new Map(
    (response.includes?.media ?? []).map((media) => [media.media_key, media])
  );

  return (response.data ?? []).flatMap((tweet) => {
    const referenceTypes = new Set(
      tweet.referenced_tweets?.map((reference) => reference.type)
    );
    if (referenceTypes.has("replied_to") || referenceTypes.has("retweeted")) {
      return [];
    }

    const tweetMedia = (tweet.attachments?.media_keys ?? []).flatMap((key) => {
      const media = mediaMap.get(key);
      return isXApiMedia(media) ? [media] : [];
    });
    const mediaTypes = tweetMedia.flatMap((media) =>
      isNonEmptyString(media.type) ? [media.type] : []
    );
    const viewCounts = tweetMedia.flatMap((media) => {
      const value = media.public_metrics?.view_count;
      return typeof value === "number" ? [value] : [];
    });

    return [
      {
        handle,
        hasVideo: mediaTypes.some(
          (type) => type === "video" || type === "animated_gif"
        ),
        id: tweet.id,
        isQuote: referenceTypes.has("quoted"),
        isReply:
          Boolean(tweet.in_reply_to_user_id) ||
          referenceTypes.has("replied_to"),
        isRetweet: referenceTypes.has("retweeted"),
        mediaTypes,
        metrics:
          tweet.public_metrics || viewCounts.length > 0
            ? {
                likeCount: tweet.public_metrics?.like_count,
                quoteCount: tweet.public_metrics?.quote_count,
                replyCount: tweet.public_metrics?.reply_count,
                repostCount: tweet.public_metrics?.retweet_count,
                viewCount:
                  viewCounts.length > 0 ? Math.max(...viewCounts) : undefined,
              }
            : undefined,
        provider: "x-api" as const,
        publishedAt: tweet.created_at ?? "",
        sharedUrls: extractSharedUrls(tweet),
        text: tweet.text,
        url: `https://x.com/${handle}/status/${tweet.id}`,
        warnings: [],
      },
    ];
  });
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function isXApiMedia(value: XApiMedia | undefined): value is XApiMedia {
  return value !== undefined;
}
