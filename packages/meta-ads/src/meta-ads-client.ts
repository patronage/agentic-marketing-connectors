import { MetaAdsApiError } from "./meta-ads-api-error.js";
import type {
  AdLibraryResult,
  AdvertiserSummary,
  BoostPostInput,
  BoostPostPlan,
  BoostPostResult,
  CampaignSummary,
  CreateAdCreativeInput,
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
  CreateCustomAudienceInput,
  CreateLookalikeAudienceInput,
  CustomAudienceInfo,
  DebugTokenResult,
  GraphApiError,
  GraphApiResponse,
  LeadForm,
  LeadRecord,
  LongLivedUserTokenResult,
  ManagedPageInfo,
  MetaAdsInsight,
  MetaAdsInsightLevel,
  MetaMutationIdResult,
  ReachEstimateInput,
  ReachEstimateResult,
  SendConversionEventsInput,
  SendConversionEventsResult,
  SyncAudienceUsersInput,
  SyncAudienceUsersResult,
} from "./types.js";

const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_API_VERSION = "v21.0";
const GRAPH_RETRY_BASE_DELAY_MS = 500;
const GRAPH_RETRY_MAX_ATTEMPTS = 3;
const INSIGHTS_MAX_RESULTS = 5000;
const COMMON_FIELDS = [
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "cpp",
  "spend",
  "frequency",
  "unique_clicks",
  "unique_ctr",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "inline_post_engagement",
  "outbound_clicks",
  "outbound_clicks_ctr",
  "cost_per_inline_link_click",
  "cost_per_inline_post_engagement",
  "cost_per_outbound_click",
  "cost_per_unique_click",
  "actions",
  "cost_per_action_type",
  "unique_actions",
  "cost_per_unique_action_type",
  "action_values",
  "video_thruplay_watched_actions",
  "cost_per_thruplay",
  "video_play_actions",
  "video_avg_time_watched_actions",
  "video_continuous_2_sec_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "video_30_sec_watched_actions",
  "website_purchase_roas",
];
const INSIGHT_FIELDS_BY_LEVEL: Record<MetaAdsInsightLevel, string> = {
  ad: [
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    ...COMMON_FIELDS,
    "quality_ranking",
    "engagement_rate_ranking",
    "conversion_rate_ranking",
  ].join(","),
  adset: [
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "optimization_goal",
    ...COMMON_FIELDS,
  ].join(","),
  campaign: [
    "campaign_id",
    "campaign_name",
    "objective",
    ...COMMON_FIELDS,
  ].join(","),
};
const AD_LIBRARY_FIELDS = [
  "id",
  "ad_creation_time",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_creative_bodies",
  "ad_creative_link_captions",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_snapshot_url",
  "page_id",
  "page_name",
  "publisher_platforms",
  "estimated_audience_size",
  "impressions",
  "spend",
  "currency",
  "bylines",
  "languages",
].join(",");

export interface CreateMetaAdsClientOptions {
  accessToken: string;
  adAccountId: string;
  apiVersion?: string;
  appSecretProof?: string;
  fetch?: typeof fetch;
  graphBaseUrl?: string;
}

export interface MetaAdsRequestOptions {
  accessToken?: string;
  appSecretProof?: string;
}

export interface GraphRequestOptions extends MetaAdsRequestOptions {
  body?: Record<string, unknown>;
  method?: "DELETE" | "GET" | "POST";
  params?: Record<string, boolean | number | string | undefined>;
}

export interface GetInsightsInput extends MetaAdsRequestOptions {
  breakdown?: string;
  campaignId?: string;
  fields?: string;
  level: MetaAdsInsightLevel;
  since: string;
  until: string;
}

export interface SearchAdLibraryInput extends MetaAdsRequestOptions {
  activeOnly?: boolean;
  category?: string;
  count?: number;
  country?: string;
  pageId?: string;
  platform?: "ALL" | "FACEBOOK" | "INSTAGRAM";
  query: string;
}

export interface FindCampaignByNameInput extends MetaAdsRequestOptions {
  name: string;
}

export interface MetaAdsClient {
  boostPost(input: BoostPostInput): Promise<BoostPostResult>;
  createAd(input: CreateAdInput): Promise<MetaMutationIdResult>;
  createAdCreative(input: CreateAdCreativeInput): Promise<MetaMutationIdResult>;
  createAdSet(input: CreateAdSetInput): Promise<MetaMutationIdResult>;
  createCampaign(input: CreateCampaignInput): Promise<MetaMutationIdResult>;
  createCustomAudience(
    input: CreateCustomAudienceInput
  ): Promise<MetaMutationIdResult>;
  createLookalikeAudience(
    input: CreateLookalikeAudienceInput
  ): Promise<MetaMutationIdResult>;
  deleteCustomAudience(audienceId: string): Promise<{ success: boolean }>;
  findCampaignByName(
    input: FindCampaignByNameInput
  ): Promise<CampaignSummary | undefined>;
  getAdSetReachEstimate(
    input: ReachEstimateInput
  ): Promise<ReachEstimateResult>;
  getAdvertiserSummary(input: SearchAdLibraryInput): Promise<AdvertiserSummary>;
  getInsights(input: GetInsightsInput): Promise<MetaAdsInsight[]>;
  getLeads(input: {
    formId: string;
    pageAccessToken: string;
    since?: string;
  }): Promise<LeadRecord[]>;
  inspectToken(input: {
    appId: string;
    appSecret: string;
    token: string;
  }): Promise<DebugTokenResult>;
  listCustomAudiences(): Promise<CustomAudienceInfo[]>;
  listLeadForms(input: {
    pageAccessToken: string;
    pageId: string;
  }): Promise<LeadForm[]>;
  listManagedPages(input?: {
    accessToken?: string;
  }): Promise<ManagedPageInfo[]>;
  request<T>(path: string, options?: GraphRequestOptions): Promise<T>;
  searchAdLibrary(input: SearchAdLibraryInput): Promise<AdLibraryResult[]>;
  sendConversionEvents(input: {
    events: SendConversionEventsInput;
    pixelId: string;
  }): Promise<SendConversionEventsResult>;
  exchangeLongLivedUserToken(input: {
    appId: string;
    appSecret: string;
    shortLivedToken: string;
  }): Promise<LongLivedUserTokenResult>;
  syncAudienceUsers(
    audienceId: string,
    input: SyncAudienceUsersInput
  ): Promise<SyncAudienceUsersResult>;
}

export function createMetaAdsClient(
  options: CreateMetaAdsClientOptions
): MetaAdsClient {
  return new FetchMetaAdsClient(options);
}

export function buildBoostPostPlan(input: BoostPostInput): BoostPostPlan {
  if (!input.postId && !input.instagramMediaId) {
    throw new Error("Boost requires postId or instagramMediaId.");
  }
  if (input.postId && input.instagramMediaId) {
    throw new Error(
      "Boost accepts either postId or instagramMediaId, not both."
    );
  }
  if (input.instagramMediaId && !input.instagramUserId) {
    throw new Error("Instagram boosts require instagramUserId.");
  }

  const status = input.status ?? "PAUSED";
  const isInstagram = Boolean(input.instagramMediaId);
  const idLabel = input.instagramMediaId ?? input.postId ?? "post";
  const campaignName =
    input.name ??
    `Boost: ${isInstagram ? "IG" : "FB"} Post ${idLabel.split("_").pop()}`;
  const now = new Date();
  const end = new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000);
  const targeting =
    input.targeting ??
    buildBoostTargeting(input.platform ?? "auto", isInstagram);

  const campaign: CreateCampaignInput = {
    name: campaignName,
    objective: "OUTCOME_ENGAGEMENT",
    specialAdCategories: input.specialAdCategories,
    status,
  };
  const adSet: CreateAdSetInput = {
    billingEvent: "IMPRESSIONS",
    campaignId: "$campaignId",
    destinationType: "ON_POST",
    endTime: end.toISOString(),
    lifetimeBudget: input.budget,
    name: `${campaignName} - Ad Set`,
    optimizationGoal: "POST_ENGAGEMENT",
    promotedObject: { page_id: input.pageId },
    startTime: now.toISOString(),
    status,
    targeting,
  };
  const authorizationCategory = input.specialAdCategories?.includes(
    "ISSUES_ELECTIONS_POLITICS"
  )
    ? "POLITICAL"
    : undefined;
  const adCreative: CreateAdCreativeInput = input.instagramMediaId
    ? {
        authorizationCategory,
        instagramUserId: input.instagramUserId,
        name: campaignName,
        objectId: input.pageId,
        sourceInstagramMediaId: input.instagramMediaId,
      }
    : {
        authorizationCategory,
        name: campaignName,
        objectStoryId: input.postId,
      };

  return {
    ad: {
      adsetId: "$adSetId",
      creativeId: "$creativeId",
      name: `${campaignName} - Ad`,
      status,
    },
    adCreative,
    adSet,
    campaign,
  };
}

class FetchMetaAdsClient implements MetaAdsClient {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiVersion: string;
  private readonly appSecretProof: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly graphBaseUrl: string;

  constructor(options: CreateMetaAdsClientOptions) {
    if (!options.accessToken.trim()) {
      throw new Error("Meta accessToken is required.");
    }
    if (!options.adAccountId.trim()) {
      throw new Error("Meta adAccountId is required.");
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }

    this.accessToken = options.accessToken;
    this.adAccountId = options.adAccountId;
    this.apiVersion = options.apiVersion ?? DEFAULT_GRAPH_API_VERSION;
    this.appSecretProof = options.appSecretProof;
    this.fetchImpl = fetchImpl;
    this.graphBaseUrl = options.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL;
  }

  async request<T>(
    path: string,
    options: GraphRequestOptions = {}
  ): Promise<T> {
    const body = buildRequestBody(options.body);
    const { json, response } = await this.fetchJsonWithRetry<
      GraphApiResponse<T> | T
    >(this.buildUrl(path, options), {
      body,
      headers: body
        ? { "content-type": "application/x-www-form-urlencoded" }
        : undefined,
      method: options.method ?? "GET",
    });

    if (isGraphApiErrorResponse<T>(json)) {
      throw new MetaAdsApiError(json.error);
    }

    if (!response.ok) {
      throw new MetaAdsApiError({
        code: response.status,
        message: `Meta Graph API request failed: HTTP ${response.status}`,
        type: "HTTPError",
      });
    }

    return json as T;
  }

  async createCampaign(
    input: CreateCampaignInput
  ): Promise<MetaMutationIdResult> {
    return this.request<MetaMutationIdResult>(
      `/${this.adAccountId}/campaigns`,
      {
        body: {
          buying_type: "AUCTION",
          daily_budget: toMinorCurrency(input.dailyBudget),
          end_time: input.endTime,
          name: input.name,
          objective: input.objective,
          special_ad_categories: JSON.stringify(
            input.specialAdCategories ?? []
          ),
          start_time: input.startTime,
          status: input.status ?? "PAUSED",
        },
        method: "POST",
      }
    );
  }

  async createAdSet(input: CreateAdSetInput): Promise<MetaMutationIdResult> {
    return this.request<MetaMutationIdResult>(`/${this.adAccountId}/adsets`, {
      body: {
        billing_event: input.billingEvent,
        campaign_id: input.campaignId,
        daily_budget: toMinorCurrency(input.dailyBudget),
        destination_type: input.destinationType,
        end_time: input.endTime,
        lifetime_budget: toMinorCurrency(input.lifetimeBudget),
        name: input.name,
        optimization_goal: input.optimizationGoal,
        promoted_object: input.promotedObject
          ? JSON.stringify(input.promotedObject)
          : undefined,
        start_time: input.startTime,
        status: input.status ?? "PAUSED",
        targeting: JSON.stringify(input.targeting),
      },
      method: "POST",
    });
  }

  async createAdCreative(
    input: CreateAdCreativeInput
  ): Promise<MetaMutationIdResult> {
    return this.request<MetaMutationIdResult>(
      `/${this.adAccountId}/adcreatives`,
      {
        body: {
          authorization_category: input.authorizationCategory,
          instagram_user_id: input.instagramUserId,
          name: input.name,
          object_id: input.objectId,
          object_story_id: input.objectStoryId,
          source_instagram_media_id: input.sourceInstagramMediaId,
        },
        method: "POST",
      }
    );
  }

  async createAd(input: CreateAdInput): Promise<MetaMutationIdResult> {
    return this.request<MetaMutationIdResult>(`/${this.adAccountId}/ads`, {
      body: {
        adset_id: input.adsetId,
        creative: JSON.stringify({ creative_id: input.creativeId }),
        name: input.name,
        status: input.status ?? "PAUSED",
      },
      method: "POST",
    });
  }

  async boostPost(input: BoostPostInput): Promise<BoostPostResult> {
    const plan = buildBoostPostPlan(input);
    const campaign = await this.createCampaign(plan.campaign);
    const adSet = await this.createAdSet({
      ...plan.adSet,
      campaignId: campaign.id,
    });
    const creative = await this.createAdCreative(plan.adCreative);
    const ad = await this.createAd({
      ...plan.ad,
      adsetId: adSet.id,
      creativeId: creative.id,
    });

    return {
      adId: ad.id,
      adSetId: adSet.id,
      campaignId: campaign.id,
      creativeId: creative.id,
      plan,
    };
  }

  async getInsights(input: GetInsightsInput): Promise<MetaAdsInsight[]> {
    const params: Record<string, string> = {
      fields: input.fields ?? INSIGHT_FIELDS_BY_LEVEL[input.level],
      level: input.level,
      time_range: JSON.stringify({ since: input.since, until: input.until }),
    };

    if (input.campaignId) {
      params.filtering = JSON.stringify([
        {
          field: "campaign.id",
          operator: "EQUAL",
          value: input.campaignId,
        },
      ]);
    } else if (input.level === "campaign") {
      params.filtering = JSON.stringify([
        {
          field: "campaign.delivery_info",
          operator: "NOT_IN",
          value: ["deleted"],
        },
      ]);
    }

    if (input.breakdown) {
      params.breakdowns = input.breakdown;
    }

    return this.requestPaginated<MetaAdsInsight>(
      `/${this.adAccountId}/insights`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          ...params,
          limit: INSIGHTS_MAX_RESULTS,
        },
      }
    );
  }

  async findCampaignByName(
    input: FindCampaignByNameInput
  ): Promise<CampaignSummary | undefined> {
    const result = await this.request<GraphApiResponse<CampaignSummary[]>>(
      `/${this.adAccountId}/campaigns`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: "id,name",
          filtering: JSON.stringify([
            {
              field: "name",
              operator: "CONTAIN",
              value: input.name,
            },
          ]),
        },
      }
    );

    return result.data?.[0];
  }

  async searchAdLibrary(
    input: SearchAdLibraryInput
  ): Promise<AdLibraryResult[]> {
    const count = input.count ?? 20;
    const params: Record<string, boolean | number | string | undefined> = {
      ad_active_status: input.activeOnly ? "ACTIVE" : "ALL",
      ad_reached_countries: JSON.stringify([input.country ?? "US"]),
      ad_type: input.category ?? "ALL",
      fields: AD_LIBRARY_FIELDS,
      limit: count,
      search_page_ids: input.pageId,
      search_terms: input.query,
    };

    if (input.platform && input.platform !== "ALL") {
      params.publisher_platform = input.platform;
    }

    const results = await this.requestPaginated<AdLibraryResult>(
      "/ads_archive",
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params,
      }
    );

    return results.slice(0, count);
  }

  async getAdvertiserSummary(
    input: SearchAdLibraryInput
  ): Promise<AdvertiserSummary> {
    const ads = await this.searchAdLibrary({
      ...input,
      count: input.count ?? 50,
    });
    const now = new Date();
    const activeAds = ads.filter(
      (ad) =>
        !ad.ad_delivery_stop_time || new Date(ad.ad_delivery_stop_time) > now
    );
    const platforms = new Set(
      ads.flatMap((ad) => ad.publisher_platforms ?? [])
    );
    const spendRange = { lower_bound: 0, upper_bound: 0 };
    for (const ad of ads) {
      spendRange.lower_bound += ad.spend?.lower_bound ?? 0;
      spendRange.upper_bound += ad.spend?.upper_bound ?? 0;
    }

    const [latestAd] = ads
      .map((ad) => ad.ad_creation_time)
      .filter(Boolean)
      .toSorted()
      .toReversed();

    return {
      activeAds: activeAds.length,
      latestAd,
      name: ads[0]?.page_name ?? input.query,
      platforms: [...platforms],
      spendRange: spendRange.upper_bound > 0 ? spendRange : undefined,
      totalAds: ads.length,
    };
  }

  async listCustomAudiences(): Promise<CustomAudienceInfo[]> {
    return this.requestPaginated<CustomAudienceInfo>(
      `/${this.adAccountId}/customaudiences`,
      {
        params: {
          fields: [
            "id",
            "name",
            "description",
            "subtype",
            "approximate_count_lower_bound",
            "approximate_count_upper_bound",
            "time_created",
            "time_updated",
            "delivery_status",
            "operation_status",
          ].join(","),
          limit: 500,
        },
      }
    );
  }

  async createCustomAudience(
    input: CreateCustomAudienceInput
  ): Promise<MetaMutationIdResult> {
    const rule =
      input.rule ??
      (input.subtype === "WEBSITE" && input.pixelId
        ? {
            inclusions: {
              operator: "or",
              rules: [
                {
                  event_sources: [{ id: input.pixelId, type: "pixel" }],
                  filter: { filters: [], operator: "and" },
                  retention_seconds: (input.retentionDays ?? 30) * 86_400,
                },
              ],
            },
          }
        : undefined);

    return this.request<MetaMutationIdResult>(
      `/${this.adAccountId}/customaudiences`,
      {
        body: {
          description: input.description,
          name: input.name,
          pixel_id: input.pixelId,
          retention_days: input.retentionDays,
          rule: rule ? JSON.stringify(rule) : undefined,
          subtype: input.subtype,
        },
        method: "POST",
      }
    );
  }

  async createLookalikeAudience(
    input: CreateLookalikeAudienceInput
  ): Promise<MetaMutationIdResult> {
    if (input.ratio < 0.01 || input.ratio > 0.2) {
      throw new Error("Lookalike ratio must be between 0.01 and 0.20.");
    }

    return this.request<MetaMutationIdResult>(
      `/${this.adAccountId}/customaudiences`,
      {
        body: {
          lookalike_spec: JSON.stringify({
            country: input.country,
            origin: [{ id: input.originAudienceId, type: "custom_audience" }],
            ratio: input.ratio,
          }),
          name: input.name,
          subtype: "LOOKALIKE",
        },
        method: "POST",
      }
    );
  }

  async deleteCustomAudience(
    audienceId: string
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/${audienceId}`, {
      method: "DELETE",
    });
  }

  async syncAudienceUsers(
    audienceId: string,
    input: SyncAudienceUsersInput
  ): Promise<SyncAudienceUsersResult> {
    return this.request<SyncAudienceUsersResult>(`/${audienceId}/users`, {
      body: {
        payload: JSON.stringify({
          data: input.data,
          schema: input.schema,
        }),
      },
      method: "POST",
    });
  }

  async getAdSetReachEstimate(
    input: ReachEstimateInput
  ): Promise<ReachEstimateResult> {
    return this.request<ReachEstimateResult>(
      `/${this.adAccountId}/reachestimate`,
      {
        params: {
          billing_event: input.billingEvent ?? "IMPRESSIONS",
          optimization_goal: input.optimizationGoal ?? "POST_ENGAGEMENT",
          targeting_spec: JSON.stringify(input.targeting),
        },
      }
    );
  }

  async listLeadForms(input: {
    pageAccessToken: string;
    pageId: string;
  }): Promise<LeadForm[]> {
    return this.requestPaginated<LeadForm>(`/${input.pageId}/leadgen_forms`, {
      accessToken: input.pageAccessToken,
      params: { fields: "id,name,status,leads_count", limit: 100 },
    });
  }

  async getLeads(input: {
    formId: string;
    pageAccessToken: string;
    since?: string;
  }): Promise<LeadRecord[]> {
    const params: Record<string, string | undefined> = {
      fields:
        "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name",
    };
    if (input.since) {
      params.filtering = JSON.stringify([
        {
          field: "time_created",
          operator: "GREATER_THAN",
          value: input.since,
        },
      ]);
    }

    return this.requestPaginated<LeadRecord>(`/${input.formId}/leads`, {
      accessToken: input.pageAccessToken,
      params: { ...params, limit: 100 },
    });
  }

  async sendConversionEvents(input: {
    events: SendConversionEventsInput;
    pixelId: string;
  }): Promise<SendConversionEventsResult> {
    return this.request<SendConversionEventsResult>(
      `/${input.pixelId}/events`,
      {
        body: {
          data: JSON.stringify(input.events.events),
          test_event_code: input.events.testEventCode,
        },
        method: "POST",
      }
    );
  }

  async exchangeLongLivedUserToken(input: {
    appId: string;
    appSecret: string;
    shortLivedToken: string;
  }): Promise<LongLivedUserTokenResult> {
    return this.request<LongLivedUserTokenResult>("/oauth/access_token", {
      params: {
        client_id: input.appId,
        client_secret: input.appSecret,
        fb_exchange_token: input.shortLivedToken,
        grant_type: "fb_exchange_token",
      },
    });
  }

  async inspectToken(input: {
    appId: string;
    appSecret: string;
    token: string;
  }): Promise<DebugTokenResult> {
    return this.request<DebugTokenResult>("/debug_token", {
      accessToken: `${input.appId}|${input.appSecret}`,
      params: { input_token: input.token },
    });
  }

  async listManagedPages(
    input: {
      accessToken?: string;
    } = {}
  ): Promise<ManagedPageInfo[]> {
    return this.requestPaginated<ManagedPageInfo>("/me/accounts", {
      accessToken: input.accessToken,
      params: {
        fields: "id,name,category,fan_count,followers_count,link,access_token",
        limit: 100,
      },
    });
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
    options: GraphRequestOptions
  ): Promise<T[]> {
    const all: T[] = [];
    let nextUrl: string | undefined = this.buildUrl(path, options).toString();
    const limit = Number(options.params?.limit ?? 100);

    while (nextUrl) {
      const result: {
        json: GraphApiResponse<T[]>;
        response: Response;
      } = await this.fetchJsonWithRetry<GraphApiResponse<T[]>>(
        new URL(nextUrl),
        {
          method: options.method ?? "GET",
        }
      );
      const { json, response } = result;

      if (json.error) {
        throw new MetaAdsApiError(json.error);
      }

      if (!response.ok) {
        throw new MetaAdsApiError({
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

  private async fetchJsonWithRetry<T>(
    url: URL,
    init: RequestInit
  ): Promise<{ json: T; response: Response }> {
    for (let attempt = 1; attempt <= GRAPH_RETRY_MAX_ATTEMPTS; attempt += 1) {
      const response = await this.fetchImpl(url, init);
      const json = (await response.json()) as T;

      if (
        isRetryableGraphStatus(response.status) &&
        attempt < GRAPH_RETRY_MAX_ATTEMPTS
      ) {
        await delay(resolveGraphRetryDelayMs(response, attempt));
        continue;
      }

      return { json, response };
    }

    throw new Error("Meta Graph API retry loop exhausted unexpectedly.");
  }
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

function toMinorCurrency(amount: number | undefined): number | undefined {
  if (amount === undefined) {
    return undefined;
  }
  return Math.round(amount * 100);
}

function buildBoostTargeting(
  platform: BoostPostInput["platform"],
  isInstagram: boolean
): BoostPostPlan["adSet"]["targeting"] {
  const targeting: BoostPostPlan["adSet"]["targeting"] = {
    geo_locations: { countries: ["US"] },
  };
  let resolved = platform;
  if (platform === "auto" || platform === undefined) {
    resolved = isInstagram ? "instagram" : "facebook";
  }

  if (resolved === "facebook") {
    targeting.publisher_platforms = ["facebook"];
    targeting.facebook_positions = ["feed"];
  } else if (resolved === "instagram") {
    targeting.publisher_platforms = ["instagram"];
    targeting.instagram_positions = ["stream"];
  }

  return targeting;
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

function isRetryableGraphStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function resolveGraphRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }
  }

  return GRAPH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

function delay(ms: number): Promise<void> {
  // eslint-disable-next-line promise/avoid-new -- Fetch retry backoff needs a small timer primitive.
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
