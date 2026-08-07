import type { ListRecentPostsInput, ListRecentPostsResult } from "../types.js";
import type { XPostsProvider } from "./provider.js";

export class XaiGrokSearchProvider implements XPostsProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly input: ListRecentPostsInput;

  constructor(input: ListRecentPostsInput, fetchImpl: typeof fetch = fetch) {
    this.input = input;
    this.fetchImpl = fetchImpl;
  }

  async listRecentPosts(): Promise<ListRecentPostsResult> {
    if (!this.input.xAiApiKey) {
      throw new Error("xai-grok provider requires xAiApiKey.");
    }

    const response = await this.fetchImpl("https://api.x.ai/v1/responses", {
      body: JSON.stringify({
        input: [
          {
            content: buildUserPrompt(
              this.input.handle,
              this.input.since,
              this.input.until
            ),
            role: "user",
          },
        ],
        model: this.input.xAiModel ?? "grok-4-1-fast-reasoning",
        temperature: 0,
        tool_choice: "required",
        tools: [
          {
            allowed_x_handles: [this.input.handle],
            enable_video_understanding: true,
            from_date: this.input.since,
            to_date: this.input.until,
            type: "x_search",
          },
        ],
      }),
      headers: {
        Authorization: `Bearer ${this.input.xAiApiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const json = (await response.json()) as XaiResponsesApiResponse;

    if (!response.ok) {
      throw new Error(`xAI Responses API failed: HTTP ${response.status}`);
    }

    const citationUrls = extractCitationUrls(json);
    const parsed = parseResponsePayload(json);
    const droppedCitationlessCount = parsed.filter(
      (post, index) => !findGroundingCitation(post, citationUrls, index)
    ).length;

    return {
      handle: this.input.handle,
      posts: parsed.flatMap((post, index) => {
        const citationUrl = findGroundingCitation(post, citationUrls, index);

        if (!citationUrl) {
          return [];
        }

        return [
          {
            handle: this.input.handle,
            hasVideo:
              Boolean(post.hasVideo) ||
              post.mediaTypes.some(
                (type) => type === "video" || type === "animated_gif"
              ),
            id: post.id ?? extractIdFromUrl(citationUrl),
            isQuote: Boolean(post.isQuote),
            isReply: Boolean(post.isReply),
            isRetweet: Boolean(post.isRetweet),
            mediaTypes: post.mediaTypes,
            metrics: post.metrics,
            provider: "xai-grok" as const,
            publishedAt: post.timestamp,
            sharedUrls: post.sharedUrls,
            text: post.text,
            url: citationUrl,
            warnings: [],
          },
        ];
      }),
      provider: "xai-grok",
      since: this.input.since,
      until: this.input.until,
      warnings:
        droppedCitationlessCount > 0
          ? [
              `Dropped ${droppedCitationlessCount} xAI post result without citation grounding.`,
            ]
          : [],
    };
  }
}

interface XaiMetricShape {
  likeCount?: number;
  quoteCount?: number;
  replyCount?: number;
  repostCount?: number;
  viewCount?: number;
}

interface XaiResponsesApiResponse {
  citations?: string[];
  output?: {
    content?: {
      annotations?: {
        title?: string;
        type?: string;
        url?: string;
      }[];
      text?: string;
      type: string;
    }[];
    role?: string;
    type: string;
  }[];
}

interface XaiNormalizedPost {
  hasVideo?: boolean;
  id?: string;
  isQuote?: boolean;
  isReply?: boolean;
  isRetweet?: boolean;
  mediaTypes: string[];
  metrics?: XaiMetricShape;
  sharedUrls: string[];
  text: string;
  timestamp: string;
  url?: string;
}

function buildUserPrompt(handle: string, since: string, until: string): string {
  return [
    `Return only a JSON array of authored posts from @${handle} between ${since} and ${until}.`,
    "Use x_search only.",
    "Each item must include: id, text, timestamp, url, sharedUrls, hasVideo, mediaTypes, metrics, isReply, isRetweet, isQuote.",
    "Exclude retweets and replies. Preserve quote tweets.",
    "Only include posts directly supported by X citations.",
    "If none are found, return [].",
  ].join(" ");
}

function cleanJsonPayload(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function extractAssistantText(response: XaiResponsesApiResponse): string {
  let text = "";
  for (const output of response.output ?? []) {
    if (output.type !== "message" || output.role !== "assistant") {
      continue;
    }
    for (const content of output.content ?? []) {
      if (content.type === "output_text") {
        text += content.text ?? "";
      }
    }
  }
  return text;
}

function extractCitationUrls(response: XaiResponsesApiResponse): string[] {
  const topLevel = response.citations ?? [];
  const fromAnnotations: string[] = [];
  for (const output of response.output ?? []) {
    if (output.type !== "message" || output.role !== "assistant") {
      continue;
    }
    for (const content of output.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (isNonEmptyString(annotation.url)) {
          fromAnnotations.push(annotation.url);
        }
      }
    }
  }

  return [...new Set([...topLevel, ...fromAnnotations])];
}

function extractIdFromUrl(url?: string): string {
  const match = url?.match(/\/status\/(?<statusId>\d+)/u);
  return match?.groups?.statusId ?? "";
}

function findCitationForPost(
  id: string | undefined,
  citations?: string[]
): string {
  if (!id || !citations) {
    return "";
  }

  return citations.find((citation) => citation.includes(`/status/${id}`)) ?? "";
}

function findGroundingCitation(
  post: XaiNormalizedPost,
  citations: string[],
  index: number
): string {
  const postId = post.id || extractIdFromUrl(post.url);
  const citationById = findCitationForPost(postId, citations);
  if (citationById) {
    return citationById;
  }

  if (post.url && citations.includes(post.url)) {
    return post.url;
  }

  if (!postId) {
    return citations[index] ?? "";
  }

  return "";
}

function parseResponsePayload(
  response: XaiResponsesApiResponse
): XaiNormalizedPost[] {
  const assistantText = cleanJsonPayload(extractAssistantText(response));

  if (!assistantText || assistantText === "[]") {
    return [];
  }

  const parsed = JSON.parse(assistantText) as {
    hasVideo?: boolean;
    id?: string;
    isQuote?: boolean;
    isReply?: boolean;
    isRetweet?: boolean;
    mediaTypes?: string[];
    metrics?: XaiMetricShape;
    sharedUrls?: string[];
    text: string;
    timestamp: string;
    url?: string;
  }[];

  return parsed.map((post) => ({
    hasVideo: post.hasVideo,
    id: post.id,
    isQuote: post.isQuote,
    isReply: post.isReply,
    isRetweet: post.isRetweet,
    mediaTypes: post.mediaTypes ?? [],
    metrics: post.metrics,
    sharedUrls: post.sharedUrls ?? [],
    text: post.text,
    timestamp: post.timestamp,
    url: post.url,
  }));
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
