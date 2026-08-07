/* oxlint-disable no-use-before-define, require-await -- The fetch adapter preserves the public promise-based client interface; several methods return an existing request promise directly, and the factory intentionally precedes its private implementation. */
import { MetaAdsAmbiguousWriteError } from "./meta-ads-ambiguous-write-error.js";
import { MetaAdsApiError } from "./meta-ads-api-error.js";
import { MetaAdsContractDriftError } from "./meta-ads-contract-drift-error.js";
import { DEFAULT_META_GRAPH_API_VERSION } from "./provider-version.js";
import type {
  AdLibraryResult,
  AdvertiserSummary,
  AudienceSchemaField,
  BoostPostInput,
  BoostPostPlan,
  CampaignSummary,
  CreateAdCreativeInput,
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
  CreateCustomAudienceInput,
  CreateLookalikeAudienceInput,
  CustomAudienceAdAccount,
  CustomAudienceInfo,
  CustomAudienceSharingData,
  CustomAudienceSharingPermission,
  DebugTokenResult,
  GraphApiError,
  GraphApiResponse,
  LeadFieldData,
  LeadForm,
  LeadRecord,
  LongLivedUserTokenResult,
  ManagedPageInfo,
  MetaAdAccount,
  MetaAdAccountActivity,
  MetaAdAccountStatus,
  MetaAdLabel,
  MetaAdLabelApplyResult,
  MetaAdLabelSyncResult,
  MetaAdPreview,
  MetaAdPreviewFormat,
  MetaAsyncInsightsJob,
  MetaAsyncInsightsJobCreateResult,
  MetaAdsActionAttributionWindow,
  MetaAdsInsightBreakdownPreset,
  MetaAdsInsight,
  MetaAdsInsightLevel,
  MetaAutomatedRule,
  MetaAutomatedRuleStatus,
  MetaMutationIdResult,
  MetaMutationSuccessResult,
  MetaTargetingSentenceLine,
  ReachEstimateInput,
  ReachEstimateResult,
  SendConversionEventsInput,
  SendConversionEventsResult,
  ShareCustomAudienceResult,
  SyncAudienceUsersInput,
  SyncAudienceUsersResult,
  UpdateAdInput,
  UpdateAdSetInput,
  UpdateCampaignInput,
  UploadAdImageInput,
  UploadAdImageResult,
  UploadAdVideoInput,
  UploadAdVideoResult,
} from "./types.js";

const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com";
const GRAPH_RETRY_BASE_DELAY_MS = 500;
const GRAPH_RETRY_MAX_ATTEMPTS = 3;
const INSIGHTS_MAX_RESULTS = 5000;
const ASYNC_INSIGHTS_JOB_FIELDS = [
  "id",
  "account_id",
  "async_status",
  "async_percent_completion",
  "date_start",
  "date_stop",
  "time_ref",
  "time_completed",
  "error_code",
  "error_message",
  "error_subcode",
  "error_user_msg",
  "error_user_title",
].join(",");
const AD_ACCOUNT_FIELDS = [
  "id",
  "account_id",
  "name",
  "account_status",
  "currency",
  "timezone_id",
  "timezone_name",
  "timezone_offset_hours_utc",
  "spend_cap",
  "amount_spent",
  "balance",
  "funding_source",
].join(",");
// Local URL-construction hardening. Meta's Graph API overview does not
// prescribe this validation; we apply it before interpolating caller input.
const GRAPH_OBJECT_ID_PATTERN = /^[0-9_]+$/u;
const AD_ACCOUNT_REQUIRED_STRING_FIELDS = [
  "id",
  "account_id",
  "name",
  "currency",
] as const satisfies readonly (keyof MetaAdAccount)[];
const AD_ACCOUNT_OPTIONAL_STRING_FIELDS = [
  "spend_cap",
  "amount_spent",
  "balance",
  "funding_source",
] as const satisfies readonly (keyof MetaAdAccount)[];
const AD_ACCOUNT_STATUSES = new Set<number>([
  1, 2, 3, 7, 8, 9, 100, 101, 201, 202,
] as const satisfies readonly MetaAdAccountStatus[]);
const AD_ACCOUNT_ACTIVITY_FIELDS = [
  "actor_id",
  "actor_name",
  "application_id",
  "application_name",
  "date_time_in_timezone",
  "event_time",
  "event_type",
  "translated_event_type",
  "object_id",
  "object_name",
  "object_type",
  "extra_data",
].join(",");
const AUTOMATED_RULE_FIELDS = [
  "id",
  "name",
  "account_id",
  "status",
  "disable_error_code",
  "created_by",
  "created_time",
  "updated_time",
  "evaluation_spec",
  "execution_spec",
  "schedule_spec",
].join(",");
const AD_LABEL_FIELDS = ["id", "name"].join(",");
const LEAD_FORM_FIELDS = ["id", "name"].join(",");
const LEAD_FIELDS = [
  "id",
  "created_time",
  "ad_id",
  "form_id",
  "field_data",
].join(",");
const AUDIENCE_USERS_MAX_RECORDS = 10_000;
const CONVERSION_EVENTS_MAX_BATCH_SIZE = 1000;
const DIRECT_VIDEO_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const HASHED_CONVERSION_USER_DATA_FIELDS = [
  "country",
  "ct",
  "db",
  "em",
  "fn",
  "ge",
  "ln",
  "ph",
  "st",
  "zp",
] as const;
const HASHED_AUDIENCE_SCHEMA_FIELDS = new Set<AudienceSchemaField>([
  "COUNTRY",
  "CT",
  "DOBD",
  "DOBM",
  "DOBY",
  "EMAIL",
  "FI",
  "FN",
  "GEN",
  "LN",
  "PHONE",
  "ST",
  "ZIP",
]);
const NUMERIC_ID_PATTERN = /^\d+$/u;
const SHA256_HEX_PATTERN = /^[\da-f]{64}$/u;
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
const INSIGHT_BREAKDOWN_PRESETS: Record<
  MetaAdsInsightBreakdownPreset,
  { actionBreakdowns?: string[]; breakdowns?: string[] }
> = {
  action: { actionBreakdowns: ["action_type"] },
  age: { breakdowns: ["age"] },
  "age-gender": { breakdowns: ["age", "gender"] },
  device: { breakdowns: ["device_platform"] },
  gender: { breakdowns: ["gender"] },
  placement: { breakdowns: ["publisher_platform", "platform_position"] },
  platform: { breakdowns: ["publisher_platform"] },
  region: { breakdowns: ["region"] },
};

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

interface GraphRequestOptions extends MetaAdsRequestOptions {
  body?: Record<string, unknown>;
  method?: "DELETE" | "GET" | "POST";
  params?: Record<string, boolean | number | string | undefined>;
}

interface GraphFormDataRequestOptions extends MetaAdsRequestOptions {
  formData: FormData;
}

export interface GetInsightsInput extends MetaAdsRequestOptions {
  actionAttributionWindows?: MetaAdsActionAttributionWindow[];
  breakdown?: string;
  breakdownPreset?: MetaAdsInsightBreakdownPreset;
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

export interface CreateAsyncInsightsJobInput extends GetInsightsInput {
  limit?: number;
}

export interface GetAsyncInsightsJobInput extends MetaAdsRequestOptions {
  fields?: string;
  reportRunId: string;
}

export interface GetAsyncInsightsJobResultsInput extends MetaAdsRequestOptions {
  fields?: string;
  /** @deprecated Use pageSize for Meta page size and maxResults for a local cap. */
  limit?: number;
  maxResults?: number;
  pageSize?: number;
  reportRunId: string;
}

export interface GetAdPreviewsInput extends MetaAdsRequestOptions {
  adFormat: MetaAdPreviewFormat;
  adId: string;
  dynamicCreativeSpec?: Record<string, unknown>;
  fields?: string;
  height?: number;
  locale?: string;
  width?: number;
}

export interface GenerateAdCreativePreviewsInput extends MetaAdsRequestOptions {
  adFormat: MetaAdPreviewFormat;
  creative: Record<string, unknown>;
  fields?: string;
  height?: number;
  locale?: string;
  width?: number;
}

export interface ListAdAccountActivitiesInput extends MetaAdsRequestOptions {
  businessId?: string;
  category?: string;
  fields?: string;
  /** @deprecated Use pageSize for Meta page size and maxResults for a local cap. */
  limit?: number;
  maxResults?: number;
  pageSize?: number;
  since?: number | string;
  until?: number | string;
}

export interface CreateAutomatedRuleInput extends MetaAdsRequestOptions {
  evaluationSpec: Record<string, unknown>;
  executionSpec: Record<string, unknown>;
  name: string;
  scheduleSpec: Record<string, unknown>;
  status?: MetaAutomatedRuleStatus;
}

export interface ListAutomatedRulesInput extends MetaAdsRequestOptions {
  fields?: string;
  /** @deprecated Use pageSize for Meta page size and maxResults for a local cap. */
  limit?: number;
  maxResults?: number;
  pageSize?: number;
}

export interface UpdateAutomatedRuleInput extends MetaAdsRequestOptions {
  evaluationSpec?: Record<string, unknown>;
  executionSpec?: Record<string, unknown>;
  name?: string;
  ruleId: string;
  scheduleSpec?: Record<string, unknown>;
  status?: MetaAutomatedRuleStatus;
}

export interface DeleteAutomatedRuleInput extends MetaAdsRequestOptions {
  ruleId: string;
}

export interface CreateAdLabelInput extends MetaAdsRequestOptions {
  name: string;
}

export interface ListAdLabelsInput extends MetaAdsRequestOptions {
  fields?: string;
  /** @deprecated Use pageSize for Meta page size and maxResults for a local cap. */
  limit?: number;
  maxResults?: number;
  pageSize?: number;
}

/**
 * Lists forms owned by a Page. The access token must be a Page access token.
 *
 * @see https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/create?version=v25.0#readform
 */
export interface ListLeadFormsInput extends MetaAdsRequestOptions {
  maxResults?: number;
  pageId: string;
  pageSize?: number;
}

/**
 * Lists the normalized targeting description for an ad.
 *
 * @see https://developers.facebook.com/documentation/ads-commerce/graph-api/reference/adgroup/targetingsentencelines?version=v25.0
 */
export interface ListAdTargetingSentenceLinesInput extends MetaAdsRequestOptions {
  adId: string;
  maxResults?: number;
  pageSize?: number;
}

/**
 * Retrieves lead data using a Page or User access token with lead access.
 *
 * @see https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/retrieving?version=v25.0#bulk-read
 */
export interface GetLeadsInput extends MetaAdsRequestOptions {
  createdAfterUnix?: number;
  formId: string;
  maxResults?: number;
  pageSize?: number;
}

/** @see https://developers.facebook.com/docs/marketing-api/reference/custom-audience/adaccounts/v25.0/ */
export interface ListCustomAudienceAdAccountsInput extends MetaAdsRequestOptions {
  audienceId: string;
  maxResults?: number;
  pageSize?: number;
  permissions?: CustomAudienceSharingPermission;
}

/** @see https://developers.facebook.com/docs/marketing-api/reference/custom-audience/ad_accounts/v25.0/ */
export interface ShareCustomAudienceInput extends MetaAdsRequestOptions {
  adAccountIds: string[];
  audienceId: string;
  permissions?: CustomAudienceSharingPermission;
  relationshipType?: string[];
  replace?: boolean;
}

export interface UnshareCustomAudienceInput extends MetaAdsRequestOptions {
  adAccountIds: string[];
  audienceId: string;
}

export interface SyncAdLabelsInput extends MetaAdsRequestOptions {
  fields?: string;
  names: string[];
}

export interface ApplyAdLabelsInput extends MetaAdsRequestOptions {
  labelIds: string[];
  objectIds: string[];
}

export interface MetaAdsClient {
  applyAdLabels: (
    input: ApplyAdLabelsInput
  ) => Promise<MetaAdLabelApplyResult[]>;
  createAd: (input: CreateAdInput) => Promise<MetaMutationIdResult>;
  createAdCreative: (
    input: CreateAdCreativeInput
  ) => Promise<MetaMutationIdResult>;
  createAdLabel: (input: CreateAdLabelInput) => Promise<MetaAdLabel>;
  createAdSet: (input: CreateAdSetInput) => Promise<MetaMutationIdResult>;
  createAsyncInsightsJob: (
    input: CreateAsyncInsightsJobInput
  ) => Promise<MetaAsyncInsightsJobCreateResult>;
  createAutomatedRule: (
    input: CreateAutomatedRuleInput
  ) => Promise<MetaMutationIdResult>;
  createCampaign: (input: CreateCampaignInput) => Promise<MetaMutationIdResult>;
  createCustomAudience: (
    input: CreateCustomAudienceInput
  ) => Promise<MetaMutationIdResult>;
  createLookalikeAudience: (
    input: CreateLookalikeAudienceInput
  ) => Promise<MetaMutationIdResult>;
  deleteCustomAudience: (audienceId: string) => Promise<{ success: boolean }>;
  deleteAutomatedRule: (
    input: DeleteAutomatedRuleInput
  ) => Promise<MetaMutationSuccessResult>;
  findCampaignByName: (
    input: FindCampaignByNameInput
  ) => Promise<CampaignSummary | undefined>;
  findAdByName: (input: {
    adSetId: string;
    name: string;
  }) => Promise<{ id: string; name?: string } | undefined>;
  findAdCreativeByName: (input: {
    name: string;
  }) => Promise<{ id: string; name?: string } | undefined>;
  findAdSetByName: (input: {
    campaignId: string;
    name: string;
  }) => Promise<{ id: string; name?: string } | undefined>;
  getAdAccount: (input?: MetaAdsRequestOptions) => Promise<MetaAdAccount>;
  getAdSetReachEstimate: (
    input: ReachEstimateInput
  ) => Promise<ReachEstimateResult>;
  generateAdCreativePreviews: (
    input: GenerateAdCreativePreviewsInput
  ) => Promise<MetaAdPreview[]>;
  getAdvertiserSummary: (
    input: SearchAdLibraryInput
  ) => Promise<AdvertiserSummary>;
  getAdPreviews: (input: GetAdPreviewsInput) => Promise<MetaAdPreview[]>;
  getAsyncInsightsJob: (
    input: GetAsyncInsightsJobInput
  ) => Promise<MetaAsyncInsightsJob>;
  getAsyncInsightsJobResults: (
    input: GetAsyncInsightsJobResultsInput
  ) => Promise<MetaAdsInsight[]>;
  getInsights: (input: GetInsightsInput) => Promise<MetaAdsInsight[]>;
  getLeads: (input: GetLeadsInput) => Promise<LeadRecord[]>;
  listAdAccountActivities: (
    input?: ListAdAccountActivitiesInput
  ) => Promise<MetaAdAccountActivity[]>;
  listAdTargetingSentenceLines: (
    input: ListAdTargetingSentenceLinesInput
  ) => Promise<MetaTargetingSentenceLine[]>;
  listAdLabels: (input?: ListAdLabelsInput) => Promise<MetaAdLabel[]>;
  listAutomatedRules: (
    input?: ListAutomatedRulesInput
  ) => Promise<MetaAutomatedRule[]>;
  inspectToken: (input: {
    appId: string;
    appSecret: string;
    token: string;
  }) => Promise<DebugTokenResult>;
  listCustomAudiences: () => Promise<CustomAudienceInfo[]>;
  listCustomAudienceAdAccounts: (
    input: ListCustomAudienceAdAccountsInput
  ) => Promise<CustomAudienceAdAccount[]>;
  listLeadForms: (input: ListLeadFormsInput) => Promise<LeadForm[]>;
  listManagedPages: (input?: {
    accessToken?: string;
  }) => Promise<ManagedPageInfo[]>;
  removeAudienceUsers: (
    audienceId: string,
    input: SyncAudienceUsersInput
  ) => Promise<SyncAudienceUsersResult>;
  searchAdLibrary: (input: SearchAdLibraryInput) => Promise<AdLibraryResult[]>;
  sendConversionEvents: (input: {
    events: SendConversionEventsInput;
    pixelId: string;
  }) => Promise<SendConversionEventsResult>;
  exchangeLongLivedUserToken: (input: {
    appId: string;
    appSecret: string;
    shortLivedToken: string;
  }) => Promise<LongLivedUserTokenResult>;
  syncAudienceUsers: (
    audienceId: string,
    input: SyncAudienceUsersInput
  ) => Promise<SyncAudienceUsersResult>;
  shareCustomAudience: (
    input: ShareCustomAudienceInput
  ) => Promise<ShareCustomAudienceResult>;
  syncAdLabels: (input: SyncAdLabelsInput) => Promise<MetaAdLabelSyncResult>;
  updateAd: (input: UpdateAdInput) => Promise<{ success: boolean }>;
  updateAdSet: (input: UpdateAdSetInput) => Promise<{ success: boolean }>;
  updateAutomatedRule: (
    input: UpdateAutomatedRuleInput
  ) => Promise<MetaMutationSuccessResult>;
  updateCampaign: (input: UpdateCampaignInput) => Promise<{ success: boolean }>;
  unshareCustomAudience: (
    input: UnshareCustomAudienceInput
  ) => Promise<MetaMutationSuccessResult>;
  uploadAdImage: (input: UploadAdImageInput) => Promise<UploadAdImageResult>;
  uploadAdVideo: (input: UploadAdVideoInput) => Promise<UploadAdVideoResult>;
}

export function createMetaAdsClient(
  options: CreateMetaAdsClientOptions
): MetaAdsClient {
  return new FetchMetaAdsClient(options);
}

export function extractAdPreviewUrl(
  preview: MetaAdPreview | string
): string | undefined {
  const body = typeof preview === "string" ? preview : preview.body;
  if (!body) {
    return undefined;
  }

  const match = body.match(
    /<iframe\b[^>]*\ssrc=(?:"(?<doubleQuoted>[^"]+)"|'(?<singleQuoted>[^']+)')[^>]*>/iu
  );
  const src = match?.groups?.doubleQuoted ?? match?.groups?.singleQuoted;
  if (!src) {
    return undefined;
  }

  const decoded = decodeHtmlAttribute(src);
  try {
    const url = new URL(decoded);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
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
    this.apiVersion = options.apiVersion ?? DEFAULT_META_GRAPH_API_VERSION;
    this.appSecretProof = options.appSecretProof;
    this.fetchImpl = fetchImpl;
    this.graphBaseUrl = options.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL;
  }

  private async request<T>(
    path: string,
    options: GraphRequestOptions = {}
  ): Promise<T> {
    const result = await this.requestWithEvidence<T>(path, options);
    return result.data;
  }

  private async requestWithEvidence<T>(
    path: string,
    options: GraphRequestOptions = {}
  ): Promise<{ data: T; providerRequestId?: string }> {
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

    return {
      data: json as T,
      providerRequestId: getGraphTraceId(json) ?? getMetaRequestId(response),
    };
  }

  private async requestMutationId(
    path: string,
    options: GraphRequestOptions
  ): Promise<MetaMutationIdResult> {
    const { data, providerRequestId } =
      await this.requestWithEvidence<MetaMutationIdResult>(path, options);
    return providerRequestId ? { ...data, providerRequestId } : data;
  }

  private async requestFormData<T>(
    path: string,
    options: GraphFormDataRequestOptions
  ): Promise<T> {
    const { json, response } = await this.fetchJsonWithRetry<
      GraphApiResponse<T> | T
    >(this.buildUrl(path, options), {
      body: options.formData,
      method: "POST",
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
    return this.requestMutationId(`/${this.adAccountId}/campaigns`, {
      body: {
        buying_type: "AUCTION",
        daily_budget: toMinorCurrency(input.dailyBudget),
        name: input.name,
        objective: input.objective,
        special_ad_categories: JSON.stringify(input.specialAdCategories ?? []),
        start_time: input.startTime,
        stop_time: input.endTime,
        status: input.status ?? "PAUSED",
      },
      method: "POST",
    });
  }

  async createAdSet(input: CreateAdSetInput): Promise<MetaMutationIdResult> {
    return this.requestMutationId(`/${this.adAccountId}/adsets`, {
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
    assertAdCreativeInput(input);

    return this.requestMutationId(`/${this.adAccountId}/adcreatives`, {
      body: {
        asset_feed_spec: input.assetFeedSpec
          ? JSON.stringify(input.assetFeedSpec)
          : undefined,
        authorization_category: input.authorizationCategory,
        instagram_user_id: input.instagramUserId,
        name: input.name,
        object_id: input.objectId,
        object_story_id: input.objectStoryId,
        object_story_spec: input.objectStorySpec
          ? JSON.stringify(input.objectStorySpec)
          : undefined,
        source_instagram_media_id: input.sourceInstagramMediaId,
      },
      method: "POST",
    });
  }

  async createAd(input: CreateAdInput): Promise<MetaMutationIdResult> {
    return this.requestMutationId(`/${this.adAccountId}/ads`, {
      body: {
        adset_id: input.adsetId,
        creative: JSON.stringify({ creative_id: input.creativeId }),
        name: input.name,
        status: input.status ?? "PAUSED",
      },
      method: "POST",
    });
  }

  async createAdLabel(input: CreateAdLabelInput): Promise<MetaAdLabel> {
    assertNonBlankString(input.name, "Ad label name");

    const result = await this.request<MetaAdLabel>(
      `/${this.adAccountId}/adlabels`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        body: { name: input.name },
        method: "POST",
      }
    );

    return { ...result, name: result.name ?? input.name };
  }

  async createAutomatedRule(
    input: CreateAutomatedRuleInput
  ): Promise<MetaMutationIdResult> {
    return this.request<MetaMutationIdResult>(
      `/${this.adAccountId}/adrules_library`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        body: buildAutomatedRuleBody(input),
        method: "POST",
      }
    );
  }

  async updateCampaign(
    input: UpdateCampaignInput
  ): Promise<{ success: boolean }> {
    assertCompatibleBudgetUpdate(
      input.dailyBudget,
      input.lifetimeBudget,
      "Campaign update"
    );
    assertHasUpdateFields(
      {
        dailyBudget: input.dailyBudget,
        endTime: input.endTime,
        lifetimeBudget: input.lifetimeBudget,
        startTime: input.startTime,
        status: input.status,
      },
      "Campaign update"
    );

    return this.request<{ success: boolean }>(`/${input.campaignId}`, {
      body: {
        daily_budget: toMinorCurrency(input.dailyBudget),
        lifetime_budget: toMinorCurrency(input.lifetimeBudget),
        start_time: input.startTime,
        stop_time: input.endTime,
        status: input.status,
      },
      method: "POST",
    });
  }

  async updateAdSet(input: UpdateAdSetInput): Promise<{ success: boolean }> {
    assertCompatibleBudgetUpdate(
      input.dailyBudget,
      input.lifetimeBudget,
      "Ad set update"
    );
    assertHasUpdateFields(
      {
        dailyBudget: input.dailyBudget,
        endTime: input.endTime,
        lifetimeBudget: input.lifetimeBudget,
        startTime: input.startTime,
        status: input.status,
      },
      "Ad set update"
    );

    return this.request<{ success: boolean }>(`/${input.adSetId}`, {
      body: {
        daily_budget: toMinorCurrency(input.dailyBudget),
        end_time: input.endTime,
        lifetime_budget: toMinorCurrency(input.lifetimeBudget),
        start_time: input.startTime,
        status: input.status,
      },
      method: "POST",
    });
  }

  async updateAd(input: UpdateAdInput): Promise<{ success: boolean }> {
    assertHasUpdateFields({ status: input.status }, "Ad update");

    return this.request<{ success: boolean }>(`/${input.adId}`, {
      body: { status: input.status },
      method: "POST",
    });
  }

  async updateAutomatedRule(
    input: UpdateAutomatedRuleInput
  ): Promise<MetaMutationSuccessResult> {
    assertHasUpdateFields(
      {
        evaluationSpec: input.evaluationSpec,
        executionSpec: input.executionSpec,
        name: input.name,
        scheduleSpec: input.scheduleSpec,
        status: input.status,
      },
      "Automated rule update"
    );

    return this.request<MetaMutationSuccessResult>(`/${input.ruleId}`, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      body: buildAutomatedRuleBody(input),
      method: "POST",
    });
  }

  async deleteAutomatedRule(
    input: DeleteAutomatedRuleInput
  ): Promise<MetaMutationSuccessResult> {
    return this.request<MetaMutationSuccessResult>(`/${input.ruleId}`, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      method: "DELETE",
    });
  }

  async applyAdLabels(
    input: ApplyAdLabelsInput
  ): Promise<MetaAdLabelApplyResult[]> {
    assertNonEmptyStringList(input.objectIds, "Ad label objectIds");
    assertNonEmptyStringList(input.labelIds, "Ad label labelIds");

    return Promise.all(
      input.objectIds.map(async (objectId) => {
        const result = await this.request<MetaMutationSuccessResult>(
          `/${objectId}/adlabels`,
          {
            accessToken: input.accessToken,
            appSecretProof: input.appSecretProof,
            body: {
              adlabels: JSON.stringify(
                input.labelIds.map((labelId) => ({ id: labelId }))
              ),
            },
            method: "POST",
          }
        );

        return { objectId, success: result.success };
      })
    );
  }

  async uploadAdImage(input: UploadAdImageInput): Promise<UploadAdImageResult> {
    assertSingleMediaSource(
      input.sourceUrl,
      input.bytes,
      "Ad image upload",
      "sourceUrl"
    );

    if (input.sourceUrl) {
      return this.request<UploadAdImageResult>(
        `/${this.adAccountId}/adimages`,
        {
          accessToken: input.accessToken,
          appSecretProof: input.appSecretProof,
          body: {
            filename: input.filename,
            url: input.sourceUrl,
          },
          method: "POST",
        }
      );
    }

    return this.request<UploadAdImageResult>(`/${this.adAccountId}/adimages`, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      body: {
        bytes: await encodeMediaUploadBytesToBase64(
          input.bytes,
          "Ad image upload"
        ),
        filename: input.filename,
      },
      method: "POST",
    });
  }

  async uploadAdVideo(input: UploadAdVideoInput): Promise<UploadAdVideoResult> {
    assertSingleMediaSource(
      input.fileUrl,
      input.bytes,
      "Ad video upload",
      "fileUrl"
    );

    if (input.fileUrl) {
      return this.request<UploadAdVideoResult>(
        `/${this.adAccountId}/advideos`,
        {
          accessToken: input.accessToken,
          appSecretProof: input.appSecretProof,
          body: {
            description: input.description,
            file_url: input.fileUrl,
            title: input.title,
          },
          method: "POST",
        }
      );
    }

    assertDirectVideoUploadSize(input.bytes);

    const formData = buildMediaUploadFormData({
      bytes: input.bytes,
      fieldName: "source",
      filename: input.filename ?? "video",
      label: "Ad video upload",
    });
    appendOptionalFormField(formData, "description", input.description);
    appendOptionalFormField(formData, "title", input.title);

    return this.requestFormData<UploadAdVideoResult>(
      `/${this.adAccountId}/advideos`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        formData,
      }
    );
  }

  async getAdPreviews(input: GetAdPreviewsInput): Promise<MetaAdPreview[]> {
    assertGraphObjectId(input.adId, "Ad ID");
    return this.requestPaginated<MetaAdPreview>(`/${input.adId}/previews`, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      params: buildAdPreviewParams(input),
    });
  }

  async generateAdCreativePreviews(
    input: GenerateAdCreativePreviewsInput
  ): Promise<MetaAdPreview[]> {
    return this.requestPaginated<MetaAdPreview>(
      `/${this.adAccountId}/generatepreviews`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          ...buildAdPreviewParams(input),
          creative: JSON.stringify(input.creative),
        },
      }
    );
  }

  async getInsights(input: GetInsightsInput): Promise<MetaAdsInsight[]> {
    return this.requestPaginated<MetaAdsInsight>(
      `/${this.adAccountId}/insights`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          ...buildInsightsParams(input),
          limit: INSIGHTS_MAX_RESULTS,
        },
      }
    );
  }

  async createAsyncInsightsJob(
    input: CreateAsyncInsightsJobInput
  ): Promise<MetaAsyncInsightsJobCreateResult> {
    return this.request<MetaAsyncInsightsJobCreateResult>(
      `/${this.adAccountId}/insights`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        body: {
          ...buildInsightsParams(input),
          async: true,
          limit: input.limit,
        },
        method: "POST",
      }
    );
  }

  async getAsyncInsightsJob(
    input: GetAsyncInsightsJobInput
  ): Promise<MetaAsyncInsightsJob> {
    return this.request<MetaAsyncInsightsJob>(`/${input.reportRunId}`, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      params: {
        fields: input.fields ?? ASYNC_INSIGHTS_JOB_FIELDS,
      },
    });
  }

  async getAsyncInsightsJobResults(
    input: GetAsyncInsightsJobResultsInput
  ): Promise<MetaAdsInsight[]> {
    return this.requestAllPages<MetaAdsInsight>(
      `/${input.reportRunId}/insights`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: input.fields,
          limit: input.pageSize ?? input.limit,
        },
      },
      { maxResults: input.maxResults }
    );
  }

  /**
   * Reads a fixed set of documented Ad Account fields. The reference lists
   * these fields but does not specify which may be omitted; this client accepts
   * absent monetary fields when validating a successful response.
   * @see https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/v25.0
   */
  async getAdAccount(
    input: MetaAdsRequestOptions = {}
  ): Promise<MetaAdAccount> {
    const operation = `/${this.adAccountId}`;
    const result = await this.requestWithEvidence<unknown>(operation, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      params: { fields: AD_ACCOUNT_FIELDS },
    });
    assertAdAccountResponse(result.data, {
      operation,
      providerRequestId: result.providerRequestId,
      providerVersion: this.apiVersion,
    });
    return result.data;
  }

  async listAdAccountActivities(
    input: ListAdAccountActivitiesInput = {}
  ): Promise<MetaAdAccountActivity[]> {
    return this.requestAllPages<MetaAdAccountActivity>(
      `/${this.adAccountId}/activities`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          business_id: input.businessId,
          category: input.category,
          fields: input.fields ?? AD_ACCOUNT_ACTIVITY_FIELDS,
          limit: input.pageSize ?? input.limit ?? 100,
          since: input.since,
          until: input.until,
        },
      },
      { maxResults: input.maxResults }
    );
  }

  async listAdTargetingSentenceLines(
    input: ListAdTargetingSentenceLinesInput
  ): Promise<MetaTargetingSentenceLine[]> {
    assertGraphObjectId(input.adId, "Ad ID");
    return this.requestAllPages<MetaTargetingSentenceLine>(
      `/${input.adId}/targetingsentencelines`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: { limit: input.pageSize ?? 100 },
      },
      {
        itemGuard: isTargetingSentenceLine,
        maxResults: input.maxResults,
      }
    );
  }

  async listAutomatedRules(
    input: ListAutomatedRulesInput = {}
  ): Promise<MetaAutomatedRule[]> {
    return this.requestAllPages<MetaAutomatedRule>(
      `/${this.adAccountId}/adrules_library`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: input.fields ?? AUTOMATED_RULE_FIELDS,
          limit: input.pageSize ?? input.limit ?? 100,
        },
      },
      { maxResults: input.maxResults }
    );
  }

  async listAdLabels(input: ListAdLabelsInput = {}): Promise<MetaAdLabel[]> {
    return this.requestAllPages<MetaAdLabel>(
      `/${this.adAccountId}/adlabels`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: input.fields ?? AD_LABEL_FIELDS,
          limit: input.pageSize ?? input.limit ?? 100,
        },
      },
      { maxResults: input.maxResults }
    );
  }

  async syncAdLabels(input: SyncAdLabelsInput): Promise<MetaAdLabelSyncResult> {
    const names = uniqueNonBlankStrings(input.names, "Ad label names");
    const existingLabels = await this.listAdLabels({
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      fields: ensureFields(input.fields, AD_LABEL_FIELDS),
    });
    const existingByName = new Map<string, MetaAdLabel>();
    for (const label of existingLabels) {
      if (label.name) {
        existingByName.set(label.name, label);
      }
    }
    const existing: MetaAdLabel[] = [];
    const created: MetaAdLabel[] = [];

    for (const name of names) {
      const label = existingByName.get(name);
      if (label) {
        existing.push(label);
        continue;
      }

      let createdLabel: MetaAdLabel;
      try {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- labels must be created serially to recover duplicate-name races deterministically (#507).
        createdLabel = await this.createAdLabel({
          accessToken: input.accessToken,
          appSecretProof: input.appSecretProof,
          name,
        });
      } catch (error) {
        if (!isLikelyDuplicateAdLabelError(error)) {
          throw error;
        }

        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- duplicate recovery depends on the preceding create attempt (#507).
        const recoveredLabel = await this.findAdLabelByName({
          accessToken: input.accessToken,
          appSecretProof: input.appSecretProof,
          name,
        });
        if (!recoveredLabel) {
          throw error;
        }
        createdLabel = recoveredLabel;
      }
      created.push(createdLabel);
      existingByName.set(name, createdLabel);
    }

    return {
      created,
      existing,
      labels: names.map((name) => {
        const label = existingByName.get(name);
        if (!label) {
          throw new Error(`Ad label sync failed to resolve label: ${name}.`);
        }
        return label;
      }),
    };
  }

  private async findAdLabelByName(input: {
    accessToken?: string;
    appSecretProof?: string;
    name: string;
  }): Promise<MetaAdLabel | undefined> {
    const labels = await this.listAdLabels({
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      fields: AD_LABEL_FIELDS,
    });
    return labels.find((label) => label.name === input.name);
  }

  async findCampaignByName(
    input: FindCampaignByNameInput
  ): Promise<CampaignSummary | undefined> {
    const results = await this.requestAllPages<CampaignSummary>(
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

    return requireUniqueNamedResource(results, input.name);
  }

  async findAdSetByName(input: {
    campaignId: string;
    name: string;
  }): Promise<{ id: string; name?: string } | undefined> {
    return this.findNamedResource(`/${input.campaignId}/adsets`, input.name);
  }

  async findAdCreativeByName(input: {
    name: string;
  }): Promise<{ id: string; name?: string } | undefined> {
    return this.findNamedResource(
      `/${this.adAccountId}/adcreatives`,
      input.name
    );
  }

  async findAdByName(input: {
    adSetId: string;
    name: string;
  }): Promise<{ id: string; name?: string } | undefined> {
    return this.findNamedResource(`/${input.adSetId}/ads`, input.name);
  }

  private async findNamedResource(
    path: string,
    name: string
  ): Promise<{ id: string; name?: string } | undefined> {
    const results = await this.requestAllPages<{ id: string; name?: string }>(
      path,
      { params: { fields: "id,name", limit: 100 } }
    );
    return requireUniqueNamedResource(results, name);
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
      .flatMap((ad) => (ad.ad_creation_time ? [ad.ad_creation_time] : []))
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

  async listCustomAudienceAdAccounts(
    input: ListCustomAudienceAdAccountsInput
  ): Promise<CustomAudienceAdAccount[]> {
    assertGraphObjectId(input.audienceId, "Custom audience ID");
    return this.requestAllPages<CustomAudienceAdAccount>(
      `/${input.audienceId}/adaccounts`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          limit: input.pageSize ?? 100,
          permissions: input.permissions,
        },
      },
      {
        itemGuard: isCustomAudienceAdAccount,
        maxResults: input.maxResults,
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

    return this.requestMutationId(`/${this.adAccountId}/customaudiences`, {
      body: {
        customer_file_source: input.customerFileSource,
        description: input.description,
        name: input.name,
        pixel_id: input.pixelId,
        retention_days: input.retentionDays,
        rule: rule ? JSON.stringify(rule) : undefined,
        subtype: input.subtype,
      },
      method: "POST",
    });
  }

  async createLookalikeAudience(
    input: CreateLookalikeAudienceInput
  ): Promise<MetaMutationIdResult> {
    const lookalikeType = input.type;
    if (
      lookalikeType === undefined &&
      (input.ratio < 0.01 || input.ratio > 0.2)
    ) {
      throw new Error("Lookalike ratio must be between 0.01 and 0.20.");
    }

    const lookalikeSpec =
      lookalikeType === undefined
        ? { country: input.country, ratio: input.ratio }
        : { country: input.country, type: lookalikeType };

    return this.requestMutationId(`/${this.adAccountId}/customaudiences`, {
      body: {
        lookalike_spec: JSON.stringify(lookalikeSpec),
        name: input.name,
        origin_audience_id: input.originAudienceId,
        subtype: "LOOKALIKE",
      },
      method: "POST",
    });
  }

  async deleteCustomAudience(
    audienceId: string
  ): Promise<{ success: boolean }> {
    assertGraphObjectId(audienceId, "Custom audience ID");
    return this.request<{ success: boolean }>(`/${audienceId}`, {
      method: "DELETE",
    });
  }

  async shareCustomAudience(
    input: ShareCustomAudienceInput
  ): Promise<ShareCustomAudienceResult> {
    assertGraphObjectId(input.audienceId, "Custom audience ID");
    const operation = `/${input.audienceId}/ad_accounts`;
    const result = await this.requestWithEvidence<unknown>(operation, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      body: buildAudienceSharingBody(input),
      method: "POST",
    });
    return this.assertCompletedWriteResponse(
      result.data,
      assertShareCustomAudienceResponse,
      {
        method: "POST",
        operation,
        providerRequestId: result.providerRequestId,
        providerVersion: this.apiVersion,
      }
    );
  }

  async unshareCustomAudience(
    input: UnshareCustomAudienceInput
  ): Promise<MetaMutationSuccessResult> {
    assertGraphObjectId(input.audienceId, "Custom audience ID");
    const operation = `/${input.audienceId}/ad_accounts`;
    const result = await this.requestWithEvidence<unknown>(operation, {
      accessToken: input.accessToken,
      appSecretProof: input.appSecretProof,
      body: buildAudienceUnsharingBody(input),
      method: "DELETE",
    });
    return this.assertCompletedWriteResponse(
      result.data,
      assertMutationSuccessResponse,
      {
        method: "DELETE",
        operation,
        providerRequestId: result.providerRequestId,
        providerVersion: this.apiVersion,
      }
    );
  }

  async syncAudienceUsers(
    audienceId: string,
    input: SyncAudienceUsersInput
  ): Promise<SyncAudienceUsersResult> {
    assertGraphObjectId(audienceId, "Custom audience ID");
    return this.request<SyncAudienceUsersResult>(`/${audienceId}/users`, {
      body: buildAudienceUsersBody(input),
      method: "POST",
    });
  }

  async removeAudienceUsers(
    audienceId: string,
    input: SyncAudienceUsersInput
  ): Promise<SyncAudienceUsersResult> {
    assertGraphObjectId(audienceId, "Custom audience ID");
    return this.request<SyncAudienceUsersResult>(`/${audienceId}/users`, {
      body: buildAudienceUsersBody(input),
      method: "DELETE",
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

  async listLeadForms(input: ListLeadFormsInput): Promise<LeadForm[]> {
    assertGraphObjectId(input.pageId, "Page ID");
    return this.requestAllPages<LeadForm>(
      `/${input.pageId}/leadgen_forms`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: LEAD_FORM_FIELDS,
          limit: input.pageSize ?? 100,
        },
      },
      { itemGuard: isLeadForm, maxResults: input.maxResults }
    );
  }

  async getLeads(input: GetLeadsInput): Promise<LeadRecord[]> {
    assertGraphObjectId(input.formId, "Lead form ID");
    if (input.createdAfterUnix !== undefined) {
      assertUnixTimestamp(input.createdAfterUnix, "createdAfterUnix");
    }

    return this.requestAllPages<LeadRecord>(
      `/${input.formId}/leads`,
      {
        accessToken: input.accessToken,
        appSecretProof: input.appSecretProof,
        params: {
          fields: LEAD_FIELDS,
          filtering:
            input.createdAfterUnix === undefined
              ? undefined
              : JSON.stringify([
                  {
                    field: "time_created",
                    operator: "GREATER_THAN",
                    value: input.createdAfterUnix,
                  },
                ]),
          limit: input.pageSize ?? 100,
        },
      },
      { itemGuard: isLeadRecord, maxResults: input.maxResults }
    );
  }

  async sendConversionEvents(input: {
    events: SendConversionEventsInput;
    pixelId: string;
  }): Promise<SendConversionEventsResult> {
    assertGraphObjectId(input.pixelId, "Pixel ID");
    assertConversionEventsInput(input.events);

    const result = await this.requestWithEvidence<unknown>(
      `/${input.pixelId}/events`,
      {
        body: {
          data: JSON.stringify(input.events.events),
          test_event_code: input.events.testEventCode,
        },
        method: "POST",
      }
    );
    const operation = `/${input.pixelId}/events`;
    return this.assertCompletedWriteResponse(
      result.data,
      assertConversionEventsResponse,
      {
        method: "POST",
        operation,
        providerRequestId: result.providerRequestId,
        providerVersion: this.apiVersion,
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

  private assertCompletedWriteResponse<T>(
    value: unknown,
    assertion: (
      value: unknown,
      evidence: {
        operation: string;
        providerRequestId?: string;
        providerVersion: string;
      }
    ) => asserts value is T,
    evidence: {
      method: "DELETE" | "POST";
      operation: string;
      providerRequestId?: string;
      providerVersion: string;
    }
  ): T {
    try {
      assertion(value, evidence);
      return value;
    } catch (error) {
      if (error instanceof MetaAdsContractDriftError) {
        throw new MetaAdsAmbiguousWriteError({
          cause: error,
          method: evidence.method,
          path: `/${this.apiVersion}${evidence.operation}`,
          providerRequestId: evidence.providerRequestId,
        });
      }
      throw error;
    }
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
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- the next request depends on the prior page cursor or mutation result (#507).
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

      assertPaginatedResponse(json, {
        operation: path,
        providerRequestId: getGraphTraceId(json) ?? getMetaRequestId(response),
        providerVersion: this.apiVersion,
      });

      all.push(...json.data);

      if (all.length >= limit) {
        return all.slice(0, limit);
      }

      nextUrl = json.paging?.next
        ? this.buildNextPageUrl(json.paging.next, options).toString()
        : undefined;
    }

    return all;
  }

  private async requestAllPages<T>(
    path: string,
    options: GraphRequestOptions,
    pagination: {
      itemGuard?: (value: unknown) => value is T;
      maxResults?: number;
    } = {}
  ): Promise<T[]> {
    const all: T[] = [];
    let nextUrl: string | undefined = this.buildUrl(path, options).toString();

    while (nextUrl) {
      const result: {
        json: GraphApiResponse<T[]>;
        response: Response;
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- the next request depends on the prior page cursor or mutation result (#507).
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

      const evidence = {
        operation: path,
        providerRequestId: getGraphTraceId(json) ?? getMetaRequestId(response),
        providerVersion: this.apiVersion,
      };
      assertPaginatedResponse(json, evidence);

      if (
        pagination.itemGuard &&
        !json.data.every((item) => pagination.itemGuard?.(item))
      ) {
        throw new MetaAdsContractDriftError(evidence);
      }

      all.push(...json.data);

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
    options: MetaAdsRequestOptions
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

  private async fetchJsonWithRetry<T>(
    url: URL,
    init: RequestInit
  ): Promise<{ json: T; response: Response }> {
    const method = (init.method ?? "GET").toUpperCase();
    const isWrite = method !== "GET" && method !== "HEAD";

    for (let attempt = 1; attempt <= GRAPH_RETRY_MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- retries are sequential and reads depend on the prior response (#692).
        response = await this.fetchImpl(url, init);
      } catch (error) {
        if (isWrite) {
          throw new MetaAdsAmbiguousWriteError({
            cause: error,
            method,
            path: url.pathname,
          });
        }
        throw error;
      }

      let json: T;
      try {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- retries are sequential and reads depend on the prior response (#692).
        json = (await response.json()) as T;
      } catch (error) {
        if (isWrite) {
          throw new MetaAdsAmbiguousWriteError({
            cause: error,
            method,
            path: url.pathname,
            providerRequestId: getMetaRequestId(response),
            status: response.status,
          });
        }
        throw error;
      }

      if (isWrite && isRetryableGraphStatus(response.status)) {
        throw new MetaAdsAmbiguousWriteError({
          method,
          path: url.pathname,
          providerRequestId:
            getGraphTraceId(json) ?? getMetaRequestId(response),
          status: response.status,
        });
      }

      if (
        isRetryableGraphStatus(response.status) &&
        attempt < GRAPH_RETRY_MAX_ATTEMPTS
      ) {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- the next request depends on the prior page cursor or mutation result (#507).
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

function buildAudienceUsersBody(
  input: SyncAudienceUsersInput
): Record<string, unknown> {
  assertAudienceUsersInput(input);
  return {
    payload: JSON.stringify({
      app_ids: input.appIds,
      data: input.data,
      data_source: input.dataSource,
      ig_account_ids: input.igAccountIds,
      page_ids: input.pageIds,
      schema: input.schema,
    }),
    session: input.session ? JSON.stringify(input.session) : undefined,
  };
}

export function buildAudienceSharingBody(
  input: Pick<
    ShareCustomAudienceInput,
    | "adAccountIds"
    | "audienceId"
    | "permissions"
    | "relationshipType"
    | "replace"
  >
): Record<string, unknown> {
  assertNonBlankString(input.audienceId, "Custom audience ID");
  assertNumericStringList(input.adAccountIds, "Ad account IDs");
  if (input.relationshipType !== undefined) {
    assertNonEmptyStringList(input.relationshipType, "Relationship types");
  }
  return {
    adaccounts: JSON.stringify(input.adAccountIds),
    permissions: input.permissions,
    relationship_type: input.relationshipType
      ? JSON.stringify(input.relationshipType)
      : undefined,
    replace: input.replace,
  };
}

export function buildAudienceUnsharingBody(
  input: Pick<UnshareCustomAudienceInput, "adAccountIds" | "audienceId">
): Record<string, unknown> {
  assertNonBlankString(input.audienceId, "Custom audience ID");
  assertNumericStringList(input.adAccountIds, "Ad account IDs");
  return { adaccounts: JSON.stringify(input.adAccountIds) };
}

function assertAudienceUsersInput(input: SyncAudienceUsersInput): void {
  if (input.data.length === 0) {
    throw new Error("Audience user upload requires at least one record.");
  }
  if (input.data.length > AUDIENCE_USERS_MAX_RECORDS) {
    throw new Error(
      `Audience user upload accepts at most ${AUDIENCE_USERS_MAX_RECORDS} records per request.`
    );
  }
  for (const [rowIndex, row] of input.data.entries()) {
    if (row.length !== input.schema.length) {
      throw new Error(
        `Audience user upload row ${rowIndex + 1} must match the schema length.`
      );
    }
    for (const [columnIndex, field] of input.schema.entries()) {
      if (!HASHED_AUDIENCE_SCHEMA_FIELDS.has(field)) {
        continue;
      }
      const value = row[columnIndex];
      if (typeof value !== "string" || !SHA256_HEX_PATTERN.test(value)) {
        throw new Error(
          `Audience user upload field ${field} at row ${rowIndex + 1} must be a lowercase SHA-256 hexadecimal value.`
        );
      }
    }
  }
}

export function assertConversionEventsInput(
  input: SendConversionEventsInput
): void {
  if (input.events.length === 0) {
    throw new Error("Conversions API requires at least one event.");
  }
  if (input.events.length > CONVERSION_EVENTS_MAX_BATCH_SIZE) {
    throw new Error(
      `Conversions API accepts at most ${CONVERSION_EVENTS_MAX_BATCH_SIZE} events per request.`
    );
  }
  for (const [eventIndex, event] of input.events.entries()) {
    if (!hasConversionUserDataValue(event.user_data)) {
      throw new Error(
        `Conversions API event ${eventIndex + 1} requires at least one non-empty user_data value.`
      );
    }
    if (
      event.action_source === "website" &&
      (!event.event_source_url || !event.user_data.client_user_agent)
    ) {
      throw new Error(
        `Conversions API website event ${eventIndex + 1} requires event_source_url and client_user_agent.`
      );
    }
    for (const field of HASHED_CONVERSION_USER_DATA_FIELDS) {
      const value = event.user_data[field];
      if (value === undefined) {
        continue;
      }
      const values = Array.isArray(value) ? value : [value];
      if (
        values.length === 0 ||
        values.some((item) => !SHA256_HEX_PATTERN.test(item))
      ) {
        throw new Error(
          `Conversions API user_data.${field} on event ${eventIndex + 1} must contain lowercase SHA-256 hexadecimal values.`
        );
      }
    }
  }
}

function hasConversionUserDataValue(
  value: SendConversionEventsInput["events"][number]["user_data"]
): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).some((item) => {
    if (typeof item === "string") {
      return item.trim().length > 0;
    }
    if (typeof item === "number") {
      return Number.isSafeInteger(item) && item >= 0;
    }
    return (
      Array.isArray(item) &&
      item.length > 0 &&
      item.every(
        (arrayItem) =>
          typeof arrayItem === "string" && arrayItem.trim().length > 0
      )
    );
  });
}

function assertConversionEventsResponse(
  value: unknown,
  evidence: {
    operation: string;
    providerRequestId?: string;
    providerVersion: string;
  }
): asserts value is SendConversionEventsResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !("events_received" in value) ||
    typeof value.events_received !== "number" ||
    !Number.isInteger(value.events_received) ||
    value.events_received < 0 ||
    ("fbtrace_id" in value && typeof value.fbtrace_id !== "string") ||
    ("messages" in value &&
      (!Array.isArray(value.messages) ||
        value.messages.some((message) => typeof message !== "string")))
  ) {
    throw new MetaAdsContractDriftError(evidence);
  }
}

function assertAdAccountResponse(
  value: unknown,
  evidence: {
    operation: string;
    providerRequestId?: string;
    providerVersion: string;
  }
): asserts value is MetaAdAccount {
  if (!isRecord(value)) {
    throw new MetaAdsContractDriftError(evidence);
  }

  if (
    !hasValidAdAccountStringFields(value) ||
    !hasValidAdAccountStatus(value) ||
    !hasValidAdAccountTimezone(value)
  ) {
    throw new MetaAdsContractDriftError(evidence);
  }
}

function hasValidAdAccountStringFields(
  value: Record<string, unknown>
): boolean {
  return (
    AD_ACCOUNT_REQUIRED_STRING_FIELDS.every(
      (field) => typeof value[field] === "string"
    ) &&
    AD_ACCOUNT_OPTIONAL_STRING_FIELDS.every(
      (field) => value[field] === undefined || typeof value[field] === "string"
    ) &&
    typeof value.id === "string" &&
    value.id.startsWith("act_")
  );
}

function hasValidAdAccountStatus(value: Record<string, unknown>): boolean {
  return (
    typeof value.account_status === "number" &&
    Number.isInteger(value.account_status) &&
    AD_ACCOUNT_STATUSES.has(value.account_status)
  );
}

function hasValidAdAccountTimezone(value: Record<string, unknown>): boolean {
  return (
    typeof value.timezone_id === "number" &&
    Number.isInteger(value.timezone_id) &&
    value.timezone_id >= 0 &&
    value.timezone_id <= 4_294_967_295 &&
    typeof value.timezone_name === "string" &&
    typeof value.timezone_offset_hours_utc === "number" &&
    Number.isFinite(value.timezone_offset_hours_utc)
  );
}

function isCustomAudienceAdAccount(
  value: unknown
): value is CustomAudienceAdAccount {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    NUMERIC_ID_PATTERN.test(value.id)
  );
}

function isCustomAudienceSharingData(
  value: unknown
): value is CustomAudienceSharingData {
  return (
    isRecord(value) &&
    typeof value.ad_acct_id === "string" &&
    typeof value.business_id === "string" &&
    NUMERIC_ID_PATTERN.test(value.business_id) &&
    typeof value.audience_share_status === "string" &&
    isStringArray(value.errors)
  );
}

function assertNumericStringList(values: string[], label: string): void {
  assertNonEmptyStringList(values, label);
  if (values.some((value) => !NUMERIC_ID_PATTERN.test(value))) {
    throw new Error(`${label} must contain bare numeric IDs.`);
  }
}

function assertShareCustomAudienceResponse(
  value: unknown,
  evidence: {
    operation: string;
    providerRequestId?: string;
    providerVersion: string;
  }
): asserts value is ShareCustomAudienceResult {
  if (
    !isRecord(value) ||
    typeof value.success !== "boolean" ||
    !Array.isArray(value.sharing_data) ||
    !value.sharing_data.every(isCustomAudienceSharingData)
  ) {
    throw new MetaAdsContractDriftError(evidence);
  }
}

function assertMutationSuccessResponse(
  value: unknown,
  evidence: {
    operation: string;
    providerRequestId?: string;
    providerVersion: string;
  }
): asserts value is MetaMutationSuccessResult {
  if (!isRecord(value) || typeof value.success !== "boolean") {
    throw new MetaAdsContractDriftError(evidence);
  }
}

function assertUnixTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative Unix timestamp.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isLeadFieldData(value: unknown): value is LeadFieldData {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isStringArray(value.values)
  );
}

function isLeadForm(value: unknown): value is LeadForm {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isLeadRecord(value: unknown): value is LeadRecord {
  return (
    isRecord(value) &&
    (value.ad_id === undefined || typeof value.ad_id === "string") &&
    typeof value.created_time === "string" &&
    Array.isArray(value.field_data) &&
    value.field_data.every(isLeadFieldData) &&
    typeof value.form_id === "string" &&
    typeof value.id === "string"
  );
}

function isTargetingSentenceLine(
  value: unknown
): value is MetaTargetingSentenceLine {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecord(value.params) &&
    !Array.isArray(value.params) &&
    Array.isArray(value.targetingsentencelines)
  );
}

function assertPaginatedResponse<T>(
  value: GraphApiResponse<T[]>,
  evidence: {
    operation: string;
    providerRequestId?: string;
    providerVersion: string;
  }
): asserts value is GraphApiResponse<T[]> & { data: T[] } {
  const paging = value && typeof value === "object" ? value.paging : undefined;
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.data) ||
    (paging !== undefined &&
      (typeof paging !== "object" ||
        paging === null ||
        (paging.next !== undefined && typeof paging.next !== "string")))
  ) {
    throw new MetaAdsContractDriftError(evidence);
  }
}

function buildInsightsParams(input: GetInsightsInput): Record<string, string> {
  if (input.breakdown && input.breakdownPreset) {
    throw new Error("Insights accepts breakdown or breakdownPreset, not both.");
  }

  const params: Record<string, string> = {
    fields: input.fields ?? INSIGHT_FIELDS_BY_LEVEL[input.level],
    level: input.level,
    time_range: JSON.stringify({ since: input.since, until: input.until }),
  };

  if (input.actionAttributionWindows) {
    params.action_attribution_windows = JSON.stringify(
      input.actionAttributionWindows
    );
  }

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
  } else if (input.breakdownPreset) {
    const preset = INSIGHT_BREAKDOWN_PRESETS[input.breakdownPreset];
    if (preset.breakdowns) {
      params.breakdowns = preset.breakdowns.join(",");
    }
    if (preset.actionBreakdowns) {
      params.action_breakdowns = preset.actionBreakdowns.join(",");
    }
  }

  return params;
}

function buildAdPreviewParams(input: {
  adFormat: MetaAdPreviewFormat;
  dynamicCreativeSpec?: Record<string, unknown>;
  fields?: string;
  height?: number;
  locale?: string;
  width?: number;
}): Record<string, number | string | undefined> {
  return {
    ad_format: input.adFormat,
    dynamic_creative_spec: input.dynamicCreativeSpec
      ? JSON.stringify(input.dynamicCreativeSpec)
      : undefined,
    fields: input.fields ?? "body",
    height: input.height,
    locale: input.locale,
    width: input.width,
  };
}

function buildAutomatedRuleBody(
  input: CreateAutomatedRuleInput | UpdateAutomatedRuleInput
): Record<string, unknown> {
  return {
    evaluation_spec: input.evaluationSpec
      ? JSON.stringify(input.evaluationSpec)
      : undefined,
    execution_spec: input.executionSpec
      ? JSON.stringify(input.executionSpec)
      : undefined,
    name: input.name,
    schedule_spec: input.scheduleSpec
      ? JSON.stringify(input.scheduleSpec)
      : undefined,
    status: input.status,
  };
}

function toMinorCurrency(amount: number | undefined): number | undefined {
  if (amount === undefined) {
    return undefined;
  }
  return Math.round(amount * 100);
}

function assertCompatibleBudgetUpdate(
  dailyBudget: number | undefined,
  lifetimeBudget: number | undefined,
  label: string
): void {
  if (dailyBudget !== undefined && lifetimeBudget !== undefined) {
    throw new Error(
      `${label} accepts dailyBudget or lifetimeBudget, not both.`
    );
  }
}

function assertAdCreativeInput(input: CreateAdCreativeInput): void {
  if (input.objectStoryId && input.objectStorySpec) {
    throw new Error(
      "Ad creative accepts objectStoryId or objectStorySpec, not both."
    );
  }
  if (input.assetFeedSpec && !input.objectStorySpec) {
    throw new Error("Ad creative assetFeedSpec requires objectStorySpec.");
  }
}

function assertHasUpdateFields(
  fields: Record<string, unknown>,
  label: string
): void {
  if (Object.values(fields).every((value) => value === undefined)) {
    throw new Error(`${label} requires at least one field to update.`);
  }
}

function assertNonBlankString(value: string, label: string): void {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
}

function assertGraphObjectId(value: string, label: string): void {
  if (!GRAPH_OBJECT_ID_PATTERN.test(value)) {
    throw new Error(`${label} must contain only digits and underscores.`);
  }
}

function assertNonEmptyStringList(values: string[], label: string): void {
  if (values.length === 0) {
    throw new Error(`${label} must include at least one value.`);
  }
  if (values.some((value) => !value.trim())) {
    throw new Error(`${label} cannot include blank values.`);
  }
}

function uniqueNonBlankStrings(values: string[], label: string): string[] {
  assertNonEmptyStringList(values, label);
  return [...new Set(values.map((value) => value.trim()))];
}

function ensureFields(
  fields: string | undefined,
  requiredFields: string
): string {
  if (!fields) {
    return requiredFields;
  }

  const values = fields.split(",").flatMap((field) => {
    const trimmed = field.trim();
    return trimmed ? [trimmed] : [];
  });
  const valueSet = new Set(values);
  for (const field of requiredFields.split(",")) {
    if (!valueSet.has(field)) {
      values.push(field);
      valueSet.add(field);
    }
  }
  return values.join(",");
}

function isLikelyDuplicateAdLabelError(error: unknown): boolean {
  if (!(error instanceof MetaAdsApiError)) {
    return false;
  }

  // Meta does not expose a stable typed duplicate-label error here across API
  // versions, so recovery is limited to clear duplicate/conflict diagnostics.
  const text = `${error.message} ${error.userMessage ?? ""}`.toLowerCase();
  return (
    text.includes("already exists") ||
    text.includes("conflict") ||
    text.includes("duplicate") ||
    text.includes("same name")
  );
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function assertSingleMediaSource(
  remoteUrl: string | undefined,
  bytes: ArrayBuffer | Blob | undefined,
  label: string,
  remoteFieldName: string
): void {
  if (!remoteUrl && bytes === undefined) {
    throw new Error(`${label} requires ${remoteFieldName} or bytes.`);
  }
  if (remoteUrl && bytes !== undefined) {
    throw new Error(`${label} accepts ${remoteFieldName} or bytes, not both.`);
  }
}

function assertDirectVideoUploadSize(
  bytes: ArrayBuffer | Blob | undefined
): void {
  if (bytes === undefined) {
    throw new Error("Ad video upload requires fileUrl or bytes.");
  }

  const size = bytes instanceof Blob ? bytes.size : bytes.byteLength;
  if (size > DIRECT_VIDEO_UPLOAD_MAX_BYTES) {
    throw new Error(
      `Ad video upload bytes must be ${DIRECT_VIDEO_UPLOAD_MAX_BYTES} bytes or smaller; use fileUrl or a resumable upload workflow for larger videos.`
    );
  }
}

async function encodeMediaUploadBytesToBase64(
  bytes: ArrayBuffer | Blob | undefined,
  label: string
): Promise<string> {
  if (bytes === undefined) {
    throw new Error(`${label} requires sourceUrl or bytes.`);
  }

  const arrayBuffer = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes;
  const view = new Uint8Array(arrayBuffer);
  const chunkSize = 0x80_00;
  let binary = "";
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    binary += String.fromCodePoint(
      ...view.subarray(offset, offset + chunkSize)
    );
  }
  return btoa(binary);
}

function buildMediaUploadFormData(input: {
  bytes: ArrayBuffer | Blob | undefined;
  fieldName: string;
  filename: string;
  label: string;
}): FormData {
  if (input.bytes === undefined) {
    throw new Error(`${input.label} requires fileUrl or bytes.`);
  }

  const formData = new FormData();
  const blob =
    input.bytes instanceof Blob ? input.bytes : new Blob([input.bytes]);
  formData.append(input.fieldName, blob, input.filename);
  return formData;
}

function appendOptionalFormField(
  formData: FormData,
  key: string,
  value: string | undefined
): void {
  if (value !== undefined) {
    formData.append(key, value);
  }
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

function getGraphTraceId(json: unknown): string | undefined {
  if (!isGraphApiErrorResponse(json)) {
    return undefined;
  }
  return json.error.fbtrace_id;
}

function getMetaRequestId(response: Response): string | undefined {
  return (
    response.headers.get("x-fb-trace-id") ??
    response.headers.get("x-fb-request-id") ??
    undefined
  );
}

function requireUniqueNamedResource<T extends { id: string; name?: string }>(
  resources: T[],
  name: string
): T | undefined {
  const matches = resources.filter((resource) => resource.name === name);
  if (matches.length > 1) {
    throw new Error(
      `Meta Ads reconciliation found multiple resources named ${JSON.stringify(name)}.`
    );
  }
  return matches[0];
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
