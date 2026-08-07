/* oxlint-disable no-use-before-define, require-await -- The factory intentionally precedes its private fetch implementation, and simple methods return the request promise directly. */
import { RedditAdsApiError } from "./reddit-ads-api-error.js";
import type {
  RedditAd,
  RedditAdAccount,
  RedditAdEffectiveStatus,
  RedditAdGroup,
  RedditAdGroupTargeting,
  RedditAdsPagination,
  RedditBusiness,
  RedditCampaign,
  RedditCommunity,
  RedditConfiguredStatus,
  RedditFundingInstrument,
  RedditFundingInstrumentMode,
  RedditInterest,
  RedditMe,
  RedditReportBreakdown,
  RedditReportField,
  RedditReportMetric,
} from "./types.js";

export const DEFAULT_REDDIT_ADS_API_BASE_URL =
  "https://ads-api.reddit.com/api/v3";

export interface CreateRedditAdsClientOptions {
  accessToken: string;
  adAccountId: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
}

interface RedditRequestOptions {
  jsonBody?: unknown;
  method?: "GET" | "POST";
  params?: Record<string, number | string | undefined>;
  pageUrl?: string;
}

export interface RedditPaginationInput {
  /** Follow a Reddit-provided pagination URL verbatim. */
  pageUrl?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface ListMyBusinessesInput extends RedditPaginationInput {
  adAccountId?: string;
  role?: "BUSINESS_ADMIN" | "CATALOG_ADMIN";
}

export interface ListBusinessAdAccountsInput extends RedditPaginationInput {
  ids?: string[];
}

export interface ListCampaignsInput extends RedditPaginationInput {
  ids?: string[];
}

export interface ListAdGroupsInput extends ListCampaignsInput {
  campaignId?: string;
}

export interface ListAdsInput extends ListCampaignsInput {
  adGroupIds?: string[];
  campaignIds?: string[];
  configuredStatuses?: RedditConfiguredStatus[];
  effectiveStatuses?: RedditAdEffectiveStatus[];
}

export interface GetReportInput {
  breakdowns?: RedditReportBreakdown[];
  endsAt: string;
  fields: RedditReportField[];
  pageSize?: number;
  pageToken?: string;
  startsAt: string;
  timeZoneId?: string;
}

export interface ListCommunitiesInput extends RedditPaginationInput {
  names?: string[];
}

/** @see https://ads-api.reddit.com/docs/v3/api/list-funding-instruments */
export interface ListFundingInstrumentsInput extends RedditPaginationInput {
  endTime?: string;
  fundingInstrumentIds?: string[];
  mode?: RedditFundingInstrumentMode;
  search?: string;
  startTime?: string;
  /** Official schema provides examples, but no closed enum. */
  types?: string[];
}

export interface RedditAdsClient {
  getAdAccount: () => Promise<RedditAdAccount>;
  getBusiness: (businessId: string) => Promise<RedditBusiness>;
  getCampaign: (campaignId: string) => Promise<RedditCampaign>;
  getMe: () => Promise<RedditMe>;
  getReport: (input: GetReportInput) => Promise<{
    metrics: RedditReportMetric[];
    metricsUpdatedAt?: string;
    pagination: RedditAdsPagination;
  }>;
  listBusinessAdAccounts: (
    businessId: string,
    input?: ListBusinessAdAccountsInput
  ) => Promise<{
    adAccounts: RedditAdAccount[];
    pagination: RedditAdsPagination;
  }>;
  listAdGroups: (input?: ListAdGroupsInput) => Promise<{
    adGroups: RedditAdGroup[];
    pagination: RedditAdsPagination;
  }>;
  listAds: (input?: ListAdsInput) => Promise<{
    ads: RedditAd[];
    pagination: RedditAdsPagination;
  }>;
  listCampaigns: (input?: ListCampaignsInput) => Promise<{
    campaigns: RedditCampaign[];
    pagination: RedditAdsPagination;
  }>;
  listCommunities: (input?: ListCommunitiesInput) => Promise<{
    communities: RedditCommunity[];
    pagination: RedditAdsPagination;
  }>;
  listFundingInstruments: (input?: ListFundingInstrumentsInput) => Promise<{
    fundingInstruments: RedditFundingInstrument[];
    pagination: RedditAdsPagination;
  }>;
  listInterests: () => Promise<RedditInterest[]>;
  listMyBusinesses: (input?: ListMyBusinessesInput) => Promise<{
    businesses: RedditBusiness[];
    pagination: RedditAdsPagination;
  }>;
}

export function createRedditAdsClient(
  options: CreateRedditAdsClientOptions
): RedditAdsClient {
  return new FetchRedditAdsClient(options);
}

class FetchRedditAdsClient implements RedditAdsClient {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CreateRedditAdsClientOptions) {
    if (!options.accessToken.trim()) {
      throw new Error("Reddit Ads accessToken is required.");
    }
    if (!options.adAccountId.trim()) {
      throw new Error("Reddit Ads adAccountId is required.");
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }

    this.accessToken = options.accessToken;
    this.adAccountId = options.adAccountId;
    this.apiBaseUrl = (
      options.apiBaseUrl ?? DEFAULT_REDDIT_ADS_API_BASE_URL
    ).replace(/\/+$/u, "");
    this.fetchImpl = fetchImpl;
  }

  async getMe(): Promise<RedditMe> {
    return this.requestResource("/me", isRedditMe, "me read");
  }

  async listMyBusinesses(input: ListMyBusinessesInput = {}): Promise<{
    businesses: RedditBusiness[];
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    const result = await this.requestPage(
      "/me/businesses",
      isRedditBusiness,
      "business listing",
      {
        params: {
          ad_account_id: input.adAccountId,
          "page.size": input.pageSize,
          "page.token": input.pageToken,
          role: input.role,
        },
        pageUrl: input.pageUrl,
      }
    );
    return { businesses: result.data, pagination: result.pagination };
  }

  async getBusiness(businessId: string): Promise<RedditBusiness> {
    return this.requestResource(
      `/businesses/${encodeId(businessId, "businessId")}`,
      isRedditBusiness,
      "business read"
    );
  }

  async listBusinessAdAccounts(
    businessId: string,
    input: ListBusinessAdAccountsInput = {}
  ): Promise<{
    adAccounts: RedditAdAccount[];
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    const result = await this.requestPage(
      `/businesses/${encodeId(businessId, "businessId")}/ad_accounts`,
      isRedditAdAccount,
      "business ad account listing",
      {
        params: {
          ids: input.ids?.join(","),
          "page.size": input.pageSize,
          "page.token": input.pageToken,
        },
        pageUrl: input.pageUrl,
      }
    );
    return {
      adAccounts: result.data,
      pagination: result.pagination,
    };
  }

  async getAdAccount(): Promise<RedditAdAccount> {
    return this.requestResource(
      `/ad_accounts/${encodeURIComponent(this.adAccountId)}`,
      isRedditAdAccount,
      "ad account read"
    );
  }

  // Official contract, including report pagination and time_zone_id:
  // https://ads-api.reddit.com/api/v3/openapi.json
  async getReport(input: GetReportInput): Promise<{
    metrics: RedditReportMetric[];
    metricsUpdatedAt?: string;
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    assertReportHour(input.startsAt, "startsAt");
    assertReportHour(input.endsAt, "endsAt");
    assertReportBreakdowns(input.breakdowns);
    const timeZoneId = await this.resolveReportTimeZone(input.timeZoneId);

    const payload = await this.request(
      `/ad_accounts/${encodeURIComponent(this.adAccountId)}/reports`,
      {
        jsonBody: {
          data: {
            breakdowns: input.breakdowns,
            ends_at: input.endsAt,
            fields: input.fields,
            starts_at: input.startsAt,
            time_zone_id: timeZoneId,
          },
        },
        method: "POST",
        params: {
          "page.size": input.pageSize,
          "page.token": input.pageToken,
        },
      }
    );

    return parseReportResponse(payload);
  }

  async getCampaign(campaignId: string): Promise<RedditCampaign> {
    return this.requestResource(
      `/campaigns/${encodeId(campaignId, "campaignId")}`,
      isRedditCampaign,
      "campaign read"
    );
  }

  async listCampaigns(input: ListCampaignsInput = {}): Promise<{
    campaigns: RedditCampaign[];
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    assertListSize(input.ids, 200, "campaign ids");
    const result = await this.requestPage(
      `/ad_accounts/${encodeURIComponent(this.adAccountId)}/campaigns`,
      isRedditCampaign,
      "campaign listing",
      {
        params: {
          id: input.ids?.join(","),
          "page.size": input.pageSize,
          "page.token": input.pageToken,
        },
        pageUrl: input.pageUrl,
      }
    );
    return { campaigns: result.data, pagination: result.pagination };
  }

  async listAdGroups(input: ListAdGroupsInput = {}): Promise<{
    adGroups: RedditAdGroup[];
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    assertListSize(input.ids, 200, "ad group ids");
    const result = await this.requestPage(
      `/ad_accounts/${encodeURIComponent(this.adAccountId)}/ad_groups`,
      isRedditAdGroup,
      "ad group listing",
      {
        params: {
          campaign_id: input.campaignId,
          id: input.ids?.join(","),
          "page.size": input.pageSize,
          "page.token": input.pageToken,
        },
        pageUrl: input.pageUrl,
      }
    );
    return { adGroups: result.data, pagination: result.pagination };
  }

  async listAds(input: ListAdsInput = {}): Promise<{
    ads: RedditAd[];
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    assertListSize(input.ids, 200, "ad ids");
    assertListSize(input.adGroupIds, 200, "ad group ids");
    assertListSize(input.campaignIds, 200, "campaign ids");
    assertListSize(input.configuredStatuses, 4, "configured statuses");
    assertListSize(input.effectiveStatuses, 14, "effective statuses");
    const result = await this.requestPage(
      `/ad_accounts/${encodeURIComponent(this.adAccountId)}/ads`,
      isRedditAd,
      "ad listing",
      {
        params: {
          ad_group_id: input.adGroupIds?.join(","),
          campaign_id: input.campaignIds?.join(","),
          configured_status: input.configuredStatuses?.join(","),
          effective_status: input.effectiveStatuses?.join(","),
          id: input.ids?.join(","),
          "page.size": input.pageSize,
          "page.token": input.pageToken,
        },
        pageUrl: input.pageUrl,
      }
    );
    return { ads: result.data, pagination: result.pagination };
  }

  async listCommunities(input: ListCommunitiesInput = {}): Promise<{
    communities: RedditCommunity[];
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    const result = await this.requestPage(
      "/targeting/communities",
      isRedditCommunity,
      "community listing",
      {
        params: {
          names: input.names?.join(","),
          "page.size": input.pageSize,
          "page.token": input.pageToken,
        },
        pageUrl: input.pageUrl,
      }
    );
    return { communities: result.data, pagination: result.pagination };
  }

  async listInterests(): Promise<RedditInterest[]> {
    return this.requestList(
      "/targeting/interests",
      isRedditInterest,
      "interest listing"
    );
  }

  async listFundingInstruments(
    input: ListFundingInstrumentsInput = {}
  ): Promise<{
    fundingInstruments: RedditFundingInstrument[];
    pagination: RedditAdsPagination;
  }> {
    assertPageSize(input.pageSize);
    const result = await this.requestPage(
      `/ad_accounts/${encodeURIComponent(this.adAccountId)}/funding_instruments`,
      isRedditFundingInstrument,
      "funding instrument listing",
      {
        params: {
          funding_instrument_ids: input.fundingInstrumentIds?.join(","),
          types: input.types?.join(","),
          start_time: input.startTime,
          end_time: input.endTime,
          search: input.search,
          mode: input.mode,
          "page.size": input.pageSize,
          "page.token": input.pageToken,
        },
        pageUrl: input.pageUrl,
      }
    );
    return {
      fundingInstruments: result.data,
      pagination: result.pagination,
    };
  }

  private async requestResource<T>(
    endpoint: string,
    guard: (value: unknown) => value is T,
    operation: string
  ): Promise<T> {
    const payload = await this.request(endpoint);
    if (!isRecord(payload) || !("data" in payload) || !guard(payload.data)) {
      throw invalidResponse(operation, "a data object");
    }
    return payload.data;
  }

  private async resolveReportTimeZone(
    requestedTimeZoneId: string | undefined
  ): Promise<string> {
    if (requestedTimeZoneId) {
      return requestedTimeZoneId;
    }

    const adAccount = await this.getAdAccount();
    if (!adAccount.time_zone_id) {
      throw new Error(
        "Reddit Ads cannot determine a report time zone because the configured ad account has none."
      );
    }
    return adAccount.time_zone_id;
  }

  private async requestList<T>(
    endpoint: string,
    guard: (value: unknown) => value is T,
    operation: string
  ): Promise<T[]> {
    const payload = await this.request(endpoint);
    if (
      !isRecord(payload) ||
      !Array.isArray(payload.data) ||
      !payload.data.every(guard)
    ) {
      throw invalidResponse(operation, "a data array");
    }
    return payload.data;
  }

  private async requestPage<T>(
    endpoint: string,
    guard: (value: unknown) => value is T,
    operation: string,
    options: RedditRequestOptions = {}
  ): Promise<{ data: T[]; pagination: RedditAdsPagination }> {
    const payload = await this.request(endpoint, options);
    if (
      !isRecord(payload) ||
      !Array.isArray(payload.data) ||
      !payload.data.every(guard) ||
      !isRecord(payload.pagination)
    ) {
      throw invalidResponse(operation, "data and pagination objects");
    }

    const nextUrl = optionalNullableString(payload.pagination.next_url);
    const previousUrl = optionalNullableString(payload.pagination.previous_url);
    if (nextUrl === INVALID || previousUrl === INVALID) {
      throw invalidResponse(operation, "nullable pagination URLs");
    }

    return {
      data: payload.data,
      pagination: { nextUrl, previousUrl },
    };
  }

  private async request(
    endpoint: string,
    options: RedditRequestOptions = {}
  ): Promise<unknown> {
    const method = options.method ?? "GET";
    const body =
      options.jsonBody === undefined
        ? undefined
        : JSON.stringify(options.jsonBody);
    const response = await this.fetchImpl(this.buildUrl(endpoint, options), {
      body,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      method,
    });

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch (error) {
      if (!response.ok) {
        throw new RedditAdsApiError(response.status);
      }
      throw new Error(
        `Reddit Ads returned malformed JSON for successful ${method} ${endpoint}.`,
        { cause: error }
      );
    }

    if (!response.ok) {
      throw new RedditAdsApiError(response.status, payload);
    }
    return payload;
  }

  private buildUrl(endpoint: string, options: RedditRequestOptions): URL {
    if (options.pageUrl !== undefined) {
      const pageUrl = new URL(options.pageUrl);
      const apiBaseUrl = new URL(this.apiBaseUrl);
      if (
        pageUrl.origin !== apiBaseUrl.origin ||
        !pageUrl.pathname.startsWith(`${apiBaseUrl.pathname}/`)
      ) {
        throw new Error(
          "Reddit Ads pageUrl must be a URL from the configured API base URL."
        );
      }
      return pageUrl;
    }

    const url = new URL(`${this.apiBaseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }
}

const INVALID = Symbol("invalid optional value");

function parseReportResponse(payload: unknown): {
  metrics: RedditReportMetric[];
  metricsUpdatedAt?: string;
  pagination: RedditAdsPagination;
} {
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !isRecord(payload.pagination)
  ) {
    throw invalidResponse("report read", "data and pagination objects");
  }

  const { data, pagination } = payload;
  const { metrics, metrics_updated_at: metricsUpdatedAt } = data;
  const {
    next_url: rawNextUrl,
    page_index: pageIndex,
    previous_url: rawPreviousUrl,
    total_count: totalCount,
  } = pagination;
  const nextUrl = optionalNullableString(rawNextUrl);
  const previousUrl = optionalNullableString(rawPreviousUrl);
  if (
    !isOptionalReportMetrics(metrics) ||
    (metricsUpdatedAt !== undefined && typeof metricsUpdatedAt !== "string") ||
    nextUrl === INVALID ||
    previousUrl === INVALID ||
    !isOptionalNullableInteger(pageIndex) ||
    !isOptionalNullableInteger(totalCount)
  ) {
    throw invalidResponse("report read", "valid report metrics and pagination");
  }

  return {
    metrics: metrics ?? [],
    metricsUpdatedAt,
    pagination: {
      nextUrl,
      pageIndex,
      previousUrl,
      totalCount,
    },
  };
}

function isOptionalReportMetrics(
  value: unknown
): value is RedditReportMetric[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every(isRedditReportMetric))
  );
}

function isRedditReportMetric(value: unknown): value is RedditReportMetric {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (metric) =>
        isRecord(metric) ||
        metric === null ||
        typeof metric === "number" ||
        typeof metric === "string"
    )
  );
}

function isRedditMe(value: unknown): value is RedditMe {
  return (
    isRecord(value) &&
    optionalLiteral(value.type, ["MEMBER"]) &&
    optionalNullableString(value.email) !== INVALID &&
    optionalNullableString(value.firstname) !== INVALID &&
    optionalString(value.id) &&
    optionalNullableString(value.lastname) !== INVALID &&
    optionalNullableString(value.phone) !== INVALID &&
    optionalString(value.reddit_user_id) &&
    optionalString(value.reddit_username)
  );
}

function isRedditBusiness(value: unknown): value is RedditBusiness {
  return (
    isRecord(value) &&
    optionalBoolean(value.agency_affiliated) &&
    optionalNullableString(value.country) !== INVALID &&
    optionalString(value.created_at) &&
    optionalNullableString(value.creator_id) !== INVALID &&
    optionalString(value.id) &&
    optionalString(value.industry) &&
    optionalString(value.modified_at) &&
    optionalString(value.name) &&
    optionalNullableString(value.phone) !== INVALID &&
    optionalNullableString(value.primary_contact_id) !== INVALID &&
    optionalNullableString(value.website_url) !== INVALID
  );
}

function isRedditAdAccount(value: unknown): value is RedditAdAccount {
  return (
    isRecord(value) &&
    optionalString(value.admin_approval) &&
    isAdAccountAttribution(value) &&
    optionalString(value.business_id) &&
    optionalString(value.created_at) &&
    optionalString(value.currency) &&
    optionalNullableStringArray(value.excluded_communities) &&
    optionalNullableStringArray(value.excluded_keywords) &&
    optionalString(value.id) &&
    optionalString(value.modified_at) &&
    optionalString(value.name) &&
    optionalNullableStringArray(value.pixel_partner_preferences) &&
    optionalString(value.primary_contact_member_id) &&
    optionalNullableString(value.spend_cap_type) !== INVALID &&
    optionalNullableString(value.suspension_reason) !== INVALID &&
    optionalNullableString(value.time_zone_id) !== INVALID &&
    optionalString(value.type)
  );
}

function isAdAccountAttribution(value: Record<string, unknown>): boolean {
  return (
    optionalString(value.app_attribution_type) &&
    optionalString(value.app_click_attribution_window) &&
    optionalString(value.app_view_attribution_window) &&
    optionalString(value.attribution_type) &&
    optionalString(value.click_attribution_window) &&
    optionalString(value.view_attribution_window)
  );
}

function isRedditCampaign(value: unknown): value is RedditCampaign {
  return (
    isRecord(value) &&
    optionalString(value.ad_account_id) &&
    optionalNullableString(value.bid_strategy) !== INVALID &&
    optionalNullableString(value.bid_type) !== INVALID &&
    optionalNullableNumber(value.bid_value) &&
    optionalString(value.configured_status) &&
    isCampaignLifecycle(value) &&
    optionalString(value.effective_status) &&
    optionalNullableString(value.funding_instrument_id) !== INVALID &&
    optionalNullableString(value.goal_type) !== INVALID &&
    optionalNullableNumber(value.goal_value) &&
    optionalString(value.id) &&
    optionalNullableBoolean(value.is_campaign_budget_optimization) &&
    optionalNullableString(value.name) !== INVALID &&
    optionalString(value.objective) &&
    optionalNullableNumber(value.spend_cap)
  );
}

function isCampaignLifecycle(value: Record<string, unknown>): boolean {
  return (
    optionalString(value.created_at) &&
    optionalNullableStringArray(value.delivery_status) &&
    optionalNullableString(value.end_time) !== INVALID &&
    optionalString(value.modified_at) &&
    optionalNullableString(value.optimization_goal) !== INVALID &&
    optionalNullableString(value.start_time) !== INVALID
  );
}

function isRedditAdGroup(value: unknown): value is RedditAdGroup {
  return (
    isRecord(value) &&
    optionalString(value.ad_account_id) &&
    optionalNullableString(value.bid_strategy) !== INVALID &&
    optionalNullableString(value.bid_type) !== INVALID &&
    optionalNullableNumber(value.bid_value) &&
    optionalString(value.campaign_id) &&
    optionalNullableString(value.configured_status) !== INVALID &&
    isAdGroupLifecycle(value) &&
    optionalNullableString(value.effective_status) !== INVALID &&
    optionalNullableString(value.goal_type) !== INVALID &&
    optionalNullableNumber(value.goal_value) &&
    optionalString(value.id) &&
    optionalNullableBoolean(value.is_campaign_budget_optimization) &&
    optionalNullableString(value.name) !== INVALID &&
    (value.targeting === undefined ||
      value.targeting === null ||
      isAdGroupTargeting(value.targeting))
  );
}

function isAdGroupLifecycle(value: Record<string, unknown>): boolean {
  return (
    optionalString(value.created_at) &&
    optionalNullableStringArray(value.delivery_status) &&
    optionalNullableString(value.end_time) !== INVALID &&
    optionalString(value.modified_at) &&
    optionalNullableString(value.optimization_goal) !== INVALID &&
    (value.schedule === undefined ||
      value.schedule === null ||
      isRecord(value.schedule)) &&
    optionalNullableString(value.start_time) !== INVALID
  );
}

function isAdGroupTargeting(value: unknown): value is RedditAdGroupTargeting {
  return (
    isRecord(value) &&
    optionalStringArray(value.communities) &&
    optionalStringArray(value.custom_audience_ids) &&
    optionalStringArray(value.excluded_communities) &&
    optionalStringArray(value.excluded_custom_audience_ids) &&
    optionalStringArray(value.geolocations) &&
    optionalStringArray(value.excluded_geolocations) &&
    optionalNullableStringArray(value.keywords) &&
    optionalNullableStringArray(value.excluded_keywords) &&
    optionalStringArray(value.interests)
  );
}

function isRedditAd(value: unknown): value is RedditAd {
  return (
    isRecord(value) &&
    optionalString(value.ad_account_id) &&
    optionalString(value.ad_group_id) &&
    optionalString(value.campaign_id) &&
    optionalNullableString(value.click_url) !== INVALID &&
    optionalString(value.configured_status) &&
    optionalString(value.created_at) &&
    optionalNullableString(value.effective_status) !== INVALID &&
    optionalString(value.id) &&
    optionalString(value.modified_at) &&
    optionalString(value.name) &&
    optionalNullableString(value.post_id) !== INVALID &&
    optionalNullableString(value.post_url) !== INVALID &&
    optionalNullableString(value.profile_id) !== INVALID &&
    optionalNullableString(value.preview_url) !== INVALID &&
    optionalNullableString(value.rejection_reason) !== INVALID &&
    optionalString(value.type)
  );
}

function isRedditCommunity(value: unknown): value is RedditCommunity {
  return (
    isRecord(value) &&
    optionalStringArray(value.categories) &&
    optionalNullableString(value.description) !== INVALID &&
    optionalNullableString(value.icon_url) !== INVALID &&
    optionalString(value.id) &&
    optionalString(value.name) &&
    optionalNonNegativeInteger(value.subscriber_count)
  );
}

function isRedditInterest(value: unknown): value is RedditInterest {
  return (
    isRecord(value) &&
    optionalString(value.category) &&
    optionalString(value.id) &&
    optionalString(value.name)
  );
}

function isRedditFundingInstrument(
  value: unknown
): value is RedditFundingInstrument {
  return (
    isRecord(value) &&
    optionalNullableString(value.authorize_status) !== INVALID &&
    optionalInteger(value.billable_amount) &&
    optionalNullableInteger(value.credit_limit) &&
    optionalString(value.currency) &&
    optionalNullableString(value.end_time) !== INVALID &&
    optionalString(value.id) &&
    optionalNullableString(value.invoice_group_status) !== INVALID &&
    optionalBoolean(value.is_servable) &&
    optionalNullableString(value.name) !== INVALID &&
    optionalStringArray(value.reasons_not_servable) &&
    optionalNullableString(value.start_time) !== INVALID
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalNullableString(
  value: unknown
): string | null | undefined | typeof INVALID {
  return value === undefined || value === null || typeof value === "string"
    ? value
    : INVALID;
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function optionalNullableBoolean(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "boolean";
}

function optionalNullableNumber(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "number";
}

function optionalNonNegativeInteger(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

function optionalInteger(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isInteger(value))
  );
}

function optionalNullableInteger(value: unknown): boolean {
  return value === null || optionalInteger(value);
}

function isOptionalNullableInteger(
  value: unknown
): value is null | number | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isInteger(value))
  );
}

function optionalStringArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function optionalNullableStringArray(value: unknown): boolean {
  return value === null || optionalStringArray(value);
}

function optionalLiteral<const T extends string>(
  value: unknown,
  values: readonly T[]
): value is T | undefined {
  return value === undefined || values.some((candidate) => candidate === value);
}

function assertPageSize(pageSize: number | undefined): void {
  if (
    pageSize !== undefined &&
    (!Number.isInteger(pageSize) || pageSize > 1000)
  ) {
    throw new Error(
      "Reddit Ads pageSize must be an integer no greater than 1000."
    );
  }
}

function assertReportHour(value: string, label: string): void {
  const parsed = new Date(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/u.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().replace(".000Z", "Z") !== value
  ) {
    throw new Error(
      `Reddit Ads ${label} must use the YYYY-MM-DDTHH:00:00Z format.`
    );
  }
}

function assertReportBreakdowns(
  breakdowns: RedditReportBreakdown[] | undefined
): void {
  if (
    breakdowns &&
    breakdowns.length > 3 &&
    !(
      breakdowns.length === 4 &&
      breakdowns.includes("COUNTRY") &&
      breakdowns.includes("REGION")
    )
  ) {
    throw new Error(
      "Reddit Ads reports accept up to 3 breakdowns, or 4 with COUNTRY and REGION."
    );
  }
}

function assertListSize(
  values: readonly unknown[] | undefined,
  maximum: number,
  label: string
): void {
  if (values && values.length > maximum) {
    throw new Error(`Reddit Ads ${label} accepts at most ${maximum} values.`);
  }
}

function encodeId(value: string, label: string): string {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return encodeURIComponent(value);
}

function invalidResponse(operation: string, expected: string): Error {
  return new Error(
    `Reddit Ads ${operation} returned an invalid success response: expected ${expected}.`
  );
}
