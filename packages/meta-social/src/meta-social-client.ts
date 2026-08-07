import { MetaSocialApiError } from "./meta-social-api-error.js";
import type {
  GraphApiError,
  GraphApiResponse,
  InstagramMedia,
  InstagramMediaContainerStatus,
  InstagramMediaPublishResult,
  InstagramVideoPublishMediaType,
  MetaComment,
  PageInfo,
  PageInsightMetric,
  PagePost,
} from "./types.js";

const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_API_VERSION = "v21.0";
const DEFAULT_PAGE_FIELDS =
  "id,name,category,fan_count,followers_count,link,access_token";
const DEFAULT_PAGE_POST_FIELDS =
  "id,created_time,message,permalink_url,status_type,attachments{media_type,type,target,url,title,description},is_published";
const DEFAULT_PAGE_INSIGHT_METRICS = [
  "page_impressions",
  "page_engaged_users",
  "page_post_engagements",
  "page_fan_adds",
  "page_views_total",
];
const DEFAULT_INSTAGRAM_MEDIA_FIELDS =
  "id,caption,timestamp,permalink,media_type,media_url,thumbnail_url";
const DEFAULT_COMMENT_FIELDS =
  "id,message,created_time,from,is_hidden,like_count,can_hide,can_remove,permalink_url,parent,user_likes";
const DEFAULT_INSTAGRAM_CONTAINER_STATUS_ATTEMPTS = 20;
const DEFAULT_INSTAGRAM_CONTAINER_STATUS_INTERVAL_MS = 3000;

export interface CreateMetaSocialClientOptions {
  accessToken: string;
  apiVersion?: string;
  appSecretProof?: string;
  fetch?: typeof fetch;
  graphBaseUrl?: string;
}

export interface MetaSocialRequestOptions {
  accessToken?: string;
  appSecretProof?: string;
}

export interface GraphRequestOptions extends MetaSocialRequestOptions {
  body?: Record<string, unknown>;
  method?: "GET" | "POST";
  params?: Record<string, boolean | number | string | undefined>;
}

export interface GetPageInsightsInput extends MetaSocialRequestOptions {
  metrics?: string[];
  pageId: string;
  period?: "day" | "days_28" | "lifetime" | "month" | "week";
  since: string | number;
  until: string | number;
}

export interface GetPagePostsInput extends MetaSocialRequestOptions {
  fields?: string;
  limit?: number;
  pageId: string;
  since?: string;
  until?: string;
}

export interface GetInstagramMediaInput extends MetaSocialRequestOptions {
  fields?: string;
  instagramUserId: string;
  limit?: number;
}

export interface ListCommentsInput extends MetaSocialRequestOptions {
  fields?: string;
  filter?: "stream" | "toplevel";
  /** @deprecated Use pageSize for Meta page size and maxResults for a local cap. */
  limit?: number;
  maxResults?: number;
  objectId: string;
  order?: "chronological" | "reverse_chronological";
  pageSize?: number;
  since?: number | string;
}

export interface ModerateCommentInput extends MetaSocialRequestOptions {
  commentId: string;
  hidden: boolean;
}

export type PublishInstagramMediaInput =
  | PublishInstagramImageInput
  | PublishInstagramVideoInput;

export interface PublishInstagramImageInput extends MetaSocialRequestOptions {
  caption?: string;
  imageUrl: string;
  instagramUserId: string;
  maxStatusPollAttempts?: never;
  mediaType?: "IMAGE";
  statusPollIntervalMs?: never;
  videoUrl?: never;
}

export interface PublishInstagramVideoInput extends MetaSocialRequestOptions {
  caption?: string;
  imageUrl?: never;
  instagramUserId: string;
  maxStatusPollAttempts?: number;
  mediaType: InstagramVideoPublishMediaType;
  statusPollIntervalMs?: number;
  videoUrl: string;
}

export interface MetaSocialClient {
  getInstagramMedia: (
    input: GetInstagramMediaInput
  ) => Promise<InstagramMedia[]>;
  getPageInsights: (
    input: GetPageInsightsInput
  ) => Promise<PageInsightMetric[]>;
  getPagePosts: (input: GetPagePostsInput) => Promise<PagePost[]>;
  hideComment: (
    input: Omit<ModerateCommentInput, "hidden">
  ) => Promise<{ success: boolean }>;
  listComments: (input: ListCommentsInput) => Promise<MetaComment[]>;
  listManagedPages: (options?: MetaSocialRequestOptions) => Promise<PageInfo[]>;
  moderateComment: (
    input: ModerateCommentInput
  ) => Promise<{ success: boolean }>;
  publishInstagramMedia: (
    input: PublishInstagramMediaInput
  ) => Promise<InstagramMediaPublishResult>;
  request: <T>(path: string, options?: GraphRequestOptions) => Promise<T>;
}

export function createMetaSocialClient(
  options: CreateMetaSocialClientOptions
): MetaSocialClient {
  return new FetchMetaSocialClient(options);
}

class FetchMetaSocialClient implements MetaSocialClient {
  private readonly accessToken: string;
  private readonly apiVersion: string;
  private readonly appSecretProof: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly graphBaseUrl: string;

  constructor(options: CreateMetaSocialClientOptions) {
    if (!options.accessToken.trim()) {
      throw new Error("Meta accessToken is required.");
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }

    this.accessToken = options.accessToken;
    this.apiVersion = options.apiVersion ?? DEFAULT_GRAPH_API_VERSION;
    this.appSecretProof = options.appSecretProof;
    this.fetchImpl = fetchImpl;
    this.graphBaseUrl = options.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL;
  }

  async request<T>(
    path: string,
    options: GraphRequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options);
    const method = options.method ?? "GET";
    if (options.body && method !== "POST") {
      throw new Error("Meta Social request bodies require POST.");
    }
    const body = buildRequestBody(options.body);
    const response = await this.fetchImpl(url, {
      body,
      headers: body
        ? { "content-type": "application/x-www-form-urlencoded" }
        : undefined,
      method,
    });
    const json = (await response.json()) as GraphApiResponse<T> | T;

    if (isGraphApiErrorResponse<T>(json)) {
      throw new MetaSocialApiError(json.error);
    }

    if (!response.ok) {
      throw new MetaSocialApiError({
        code: response.status,
        message: `Meta Graph API request failed: HTTP ${response.status}`,
        type: "HTTPError",
      });
    }

    return json as T;
  }

  async listManagedPages(
    options: MetaSocialRequestOptions = {}
  ): Promise<PageInfo[]> {
    return this.requestPaginated<PageInfo>("/me/accounts", {
      ...options,
      params: { fields: DEFAULT_PAGE_FIELDS },
    });
  }

  async getPageInsights(
    input: GetPageInsightsInput
  ): Promise<PageInsightMetric[]> {
    const result = await this.request<GraphApiResponse<PageInsightMetric[]>>(
      `/${input.pageId}/insights`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          metric: (input.metrics ?? DEFAULT_PAGE_INSIGHT_METRICS).join(","),
          period: input.period ?? "day",
          since: input.since,
          until: input.until,
        },
      }
    );

    return result.data ?? [];
  }

  async getPagePosts(input: GetPagePostsInput): Promise<PagePost[]> {
    const result = await this.request<GraphApiResponse<PagePost[]>>(
      `/${input.pageId}/posts`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: input.fields ?? DEFAULT_PAGE_POST_FIELDS,
          limit: input.limit ?? 10,
          since: input.since,
          until: input.until,
        },
      }
    );

    return result.data ?? [];
  }

  async getInstagramMedia(
    input: GetInstagramMediaInput
  ): Promise<InstagramMedia[]> {
    const result = await this.request<GraphApiResponse<InstagramMedia[]>>(
      `/${input.instagramUserId}/media`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: input.fields ?? DEFAULT_INSTAGRAM_MEDIA_FIELDS,
          limit: input.limit ?? 10,
        },
      }
    );

    return (result.data ?? []).map((media) => ({
      ...media,
      permalink: normalizePermalink(media.permalink),
    }));
  }

  async listComments(input: ListCommentsInput): Promise<MetaComment[]> {
    return this.requestAllPages<MetaComment>(
      `/${input.objectId}/comments`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: input.fields ?? DEFAULT_COMMENT_FIELDS,
          filter: input.filter,
          limit: input.pageSize ?? input.limit ?? 100,
          order: input.order,
          since: input.since,
        },
      },
      { maxResults: input.maxResults }
    );
  }

  async moderateComment(
    input: ModerateCommentInput
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/${input.commentId}`, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      body: { is_hidden: input.hidden },
      method: "POST",
    });
  }

  async hideComment(
    input: Omit<ModerateCommentInput, "hidden">
  ): Promise<{ success: boolean }> {
    return this.moderateComment({ ...input, hidden: true });
  }

  async publishInstagramMedia(
    input: PublishInstagramMediaInput
  ): Promise<InstagramMediaPublishResult> {
    assertInstagramPublishInput(input);

    const creation = await this.request<{ id: string }>(
      `/${input.instagramUserId}/media`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        body: {
          caption: input.caption,
          image_url: input.imageUrl,
          media_type: input.mediaType,
          video_url: input.videoUrl,
        },
        method: "POST",
      }
    );

    if (input.videoUrl) {
      await this.waitForInstagramContainer(input, creation.id);
    }

    const published = await this.request<{ id: string }>(
      `/${input.instagramUserId}/media_publish`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        body: {
          creation_id: creation.id,
        },
        method: "POST",
      }
    );

    return {
      creationId: creation.id,
      id: published.id,
    };
  }

  private async waitForInstagramContainer(
    input: PublishInstagramVideoInput,
    creationId: string
  ): Promise<void> {
    const attempts =
      input.maxStatusPollAttempts ??
      DEFAULT_INSTAGRAM_CONTAINER_STATUS_ATTEMPTS;
    const intervalMs =
      input.statusPollIntervalMs ??
      DEFAULT_INSTAGRAM_CONTAINER_STATUS_INTERVAL_MS;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- each status poll depends on the prior container state (#507).
      const status = await this.request<InstagramMediaContainerStatus>(
        `/${creationId}`,
        {
          accessToken: input.accessToken,
          appSecretProof: input.appSecretProof,
          params: { fields: "id,status,status_code" },
        }
      );

      if (status.status_code === "FINISHED") {
        return;
      }

      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new Error(
          `Instagram media container ${creationId} failed with status ${status.status_code}.`
        );
      }

      if (attempt < attempts) {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- polling delay must complete before the next status request (#507).
        await delay(intervalMs);
      }
    }

    throw new Error(
      `Instagram media container ${creationId} was not ready after ${attempts} status checks.`
    );
  }

  private buildUrl(path: string, options: GraphRequestOptions): URL {
    const url = new URL(`${this.graphBaseUrl}/${this.apiVersion}${path}`);
    const accessToken = options.accessToken ?? this.accessToken;
    url.searchParams.set("access_token", accessToken);

    const appSecretProof =
      options.appSecretProof ??
      (accessToken === this.accessToken ? this.appSecretProof : undefined);
    if (appSecretProof) {
      url.searchParams.set("appsecret_proof", appSecretProof);
    }

    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url;
  }

  private async requestPaginated<T>(
    path: string,
    options: GraphRequestOptions = {}
  ): Promise<T[]> {
    const all: T[] = [];
    let nextUrl: string | undefined = this.buildUrl(path, options).toString();
    const limit = Number(options.params?.limit ?? 100);

    while (nextUrl) {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- the next request depends on the prior page cursor or mutation result (#507).
      const response = await this.fetchImpl(new URL(nextUrl), {
        method: options.method ?? "GET",
      });
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- the next request depends on the prior page cursor or mutation result (#507).
      const json = (await response.json()) as GraphApiResponse<T[]>;

      if (json.error) {
        throw new MetaSocialApiError(json.error);
      }

      if (!response.ok) {
        throw new MetaSocialApiError({
          code: response.status,
          message: `Meta Graph API request failed: HTTP ${response.status}`,
          type: "HTTPError",
        });
      }

      if (json.data) {
        all.push(...json.data);
      }

      if (all.length >= limit) {
        return all.slice(0, limit);
      }

      nextUrl = json.paging?.next;
    }

    return all;
  }

  private async requestAllPages<T>(
    path: string,
    options: GraphRequestOptions = {},
    pagination: { maxResults?: number } = {}
  ): Promise<T[]> {
    const all: T[] = [];
    let nextUrl: string | undefined = this.buildUrl(path, options).toString();

    while (nextUrl) {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- the next request depends on the prior page cursor (#507).
      const response = await this.fetchImpl(new URL(nextUrl), {
        method: options.method ?? "GET",
      });
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- response parsing must complete before advancing pagination (#507).
      const json = (await response.json()) as GraphApiResponse<T[]>;

      if (json.error) {
        throw new MetaSocialApiError(json.error);
      }

      if (!response.ok) {
        throw new MetaSocialApiError({
          code: response.status,
          message: `Meta Graph API request failed: HTTP ${response.status}`,
          type: "HTTPError",
        });
      }

      if (json.data) {
        all.push(...json.data);
      }

      if (
        pagination.maxResults !== undefined &&
        all.length >= pagination.maxResults
      ) {
        return all.slice(0, pagination.maxResults);
      }

      nextUrl = json.paging?.next
        ? this.buildNextPageUrl(json.paging.next, options).toString()
        : undefined;
    }

    return all;
  }

  private buildNextPageUrl(
    nextUrl: string,
    options: MetaSocialRequestOptions
  ): URL {
    const url = new URL(nextUrl);
    const accessToken = options.accessToken ?? this.accessToken;
    if (!url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", accessToken);
    }

    const appSecretProof =
      options.appSecretProof ??
      (accessToken === this.accessToken ? this.appSecretProof : undefined);
    if (appSecretProof && !url.searchParams.has("appsecret_proof")) {
      url.searchParams.set("appsecret_proof", appSecretProof);
    }

    return url;
  }
}

function isGraphApiErrorResponse<T>(
  json: GraphApiResponse<T> | T
): json is GraphApiResponse<T> & { error: GraphApiError } {
  return (
    typeof json === "object" &&
    json !== null &&
    "error" in json &&
    Boolean((json as GraphApiResponse<T>).error)
  );
}

function buildRequestBody(
  body: Record<string, unknown> | undefined
): URLSearchParams | undefined {
  if (!body) {
    return undefined;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params;
}

function assertInstagramPublishInput(input: PublishInstagramMediaInput): void {
  if (!input.imageUrl && !input.videoUrl) {
    throw new Error("Instagram publish requires imageUrl or videoUrl.");
  }
  if (input.imageUrl && input.videoUrl) {
    throw new Error(
      "Instagram publish accepts imageUrl or videoUrl, not both."
    );
  }
  if (input.videoUrl && !input.mediaType) {
    throw new Error(
      "Instagram video publish requires mediaType REELS or STORIES."
    );
  }
  if (
    input.videoUrl &&
    input.mediaType !== "REELS" &&
    input.mediaType !== "STORIES"
  ) {
    throw new Error(
      "Instagram video publish mediaType must be REELS or STORIES."
    );
  }
}

function normalizePermalink(url: string): string {
  return url.split("?")[0] ?? url;
}

function delay(ms: number): Promise<void> {
  // eslint-disable-next-line promise/avoid-new -- Polling waits for Meta video containers to finish processing.
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
