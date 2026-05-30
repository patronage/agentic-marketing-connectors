import { MetaSocialApiError } from "./meta-social-api-error.js";
import type {
  GraphApiError,
  GraphApiResponse,
  InstagramMedia,
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

export interface MetaSocialClient {
  getInstagramMedia(input: GetInstagramMediaInput): Promise<InstagramMedia[]>;
  getPageInsights(input: GetPageInsightsInput): Promise<PageInsightMetric[]>;
  getPagePosts(input: GetPagePostsInput): Promise<PagePost[]>;
  listManagedPages(options?: MetaSocialRequestOptions): Promise<PageInfo[]>;
  request<T>(path: string, options?: GraphRequestOptions): Promise<T>;
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
    const response = await this.fetchImpl(url, {
      method: options.method ?? "GET",
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
      const response = await this.fetchImpl(new URL(nextUrl), {
        method: options.method ?? "GET",
      });
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

function normalizePermalink(url: string): string {
  return url.split("?")[0] ?? url;
}
