/* oxlint-disable no-use-before-define, require-await -- The fetch adapter preserves the public promise-based client interface; several methods return an existing request promise directly, and the factory intentionally precedes its private implementation. */
import { LinkedInAdsApiError } from "./linkedin-ads-api-error.js";
import {
  LINKEDIN_AD_ACCOUNT_ROLES,
  LINKEDIN_AD_ACCOUNT_SERVING_STATUSES,
  LINKEDIN_AD_ACCOUNT_STATUSES,
  LINKEDIN_AD_ACCOUNT_TYPES,
  LINKEDIN_ANALYTICS_PIVOTS,
  LINKEDIN_ANALYTICS_STATISTICS_PIVOTS,
  LINKEDIN_CAMPAIGN_PACING_STRATEGIES,
  LINKEDIN_CAMPAIGN_GROUP_READ_STATUSES,
  LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUSES,
  LINKEDIN_CAMPAIGN_READ_STATUSES,
  LINKEDIN_CAMPAIGN_SERVING_STATUSES,
  LINKEDIN_CREATIVE_INTENDED_STATUSES,
  LINKEDIN_CREATIVE_REVIEW_STATUSES,
  LINKEDIN_CREATIVE_SERVING_HOLD_REASONS,
  LINKEDIN_CONVERSION_ATTRIBUTION_TYPES,
  LINKEDIN_CONVERSION_TYPES,
  LINKEDIN_TIME_GRANULARITIES,
} from "./types.js";
import type {
  LinkedInAdAccountUser,
  LinkedInAdAccount,
  LinkedInAnalyticsElement,
  LinkedInAnalyticsPivot,
  LinkedInAnalyticsStatisticsPivot,
  LinkedInAudienceCount,
  LinkedInApiErrorBody,
  LinkedInCampaign,
  LinkedInCampaignConversionAssociation,
  LinkedInCampaignGroup,
  LinkedInCreative,
  LinkedInConversion,
  LinkedInDate,
  LinkedInElementsResponse,
  LinkedInLeadForm,
  LinkedInLeadFormResponse,
  LinkedInImageUploadInput,
  LinkedInMoney,
  LinkedInOrganizationPost,
  LinkedInTimeGranularity,
  LinkedInTargetingEntity,
  LinkedInTargetingFacet,
  BoostLinkedInPostInput,
  BoostLinkedInPostPlan,
  CreateLinkedInCampaignInput,
  CreateLinkedInCampaignGroupInput,
  CreateLinkedInCreativeInput,
  CreateLinkedInLeadFormInput,
  GetLinkedInAudienceCountsInput,
  GetLinkedInCampaignConversionInput,
  ListLeadFormResponsesInput,
  ListLinkedInCreativesInput,
  ListLinkedInTargetingEntitiesInput,
  SearchLinkedInTargetingEntitiesInput,
  SearchLinkedInAdAccountsInput,
  UpdateLinkedInCampaignInput,
} from "./types.js";

const DEFAULT_API_BASE_URL = "https://api.linkedin.com";
export const DEFAULT_LINKEDIN_MARKETING_API_VERSION = "202606";
const DEFAULT_ANALYTICS_FIELDS = [
  "pivotValues",
  "dateRange",
  "impressions",
  "clicks",
  "costInLocalCurrency",
  "oneClickLeads",
  "oneClickLeadFormOpens",
  "landingPageClicks",
  "totalEngagements",
  "reactions",
  "comments",
  "shares",
  "videoStarts",
  "videoCompletions",
];
const LINKEDIN_ANALYTICS_STATISTICS_PIVOT_SET = new Set<string>(
  LINKEDIN_ANALYTICS_STATISTICS_PIVOTS
);
const LINKEDIN_AD_ACCOUNT_ROLE_SET = new Set<string>(LINKEDIN_AD_ACCOUNT_ROLES);
const LINKEDIN_AD_ACCOUNT_SERVING_STATUS_SET = new Set<string>(
  LINKEDIN_AD_ACCOUNT_SERVING_STATUSES
);
const LINKEDIN_AD_ACCOUNT_STATUS_SET = new Set<string>(
  LINKEDIN_AD_ACCOUNT_STATUSES
);
const LINKEDIN_AD_ACCOUNT_TYPE_SET = new Set<string>(LINKEDIN_AD_ACCOUNT_TYPES);
const LINKEDIN_CAMPAIGN_PACING_STRATEGY_SET = new Set<string>(
  LINKEDIN_CAMPAIGN_PACING_STRATEGIES
);
const LINKEDIN_CAMPAIGN_GROUP_READ_STATUS_SET = new Set<string>(
  LINKEDIN_CAMPAIGN_GROUP_READ_STATUSES
);
const LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUS_SET = new Set<string>(
  LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUSES
);
const LINKEDIN_CAMPAIGN_READ_STATUS_SET = new Set<string>(
  LINKEDIN_CAMPAIGN_READ_STATUSES
);
const LINKEDIN_CAMPAIGN_SERVING_STATUS_SET = new Set<string>(
  LINKEDIN_CAMPAIGN_SERVING_STATUSES
);
const LINKEDIN_CREATIVE_INTENDED_STATUS_SET = new Set<string>(
  LINKEDIN_CREATIVE_INTENDED_STATUSES
);
const LINKEDIN_CREATIVE_REVIEW_STATUS_SET = new Set<string>(
  LINKEDIN_CREATIVE_REVIEW_STATUSES
);
const LINKEDIN_CREATIVE_SERVING_HOLD_REASON_SET = new Set<string>(
  LINKEDIN_CREATIVE_SERVING_HOLD_REASONS
);
const LINKEDIN_CONVERSION_ATTRIBUTION_TYPE_SET = new Set<string>(
  LINKEDIN_CONVERSION_ATTRIBUTION_TYPES
);
const LINKEDIN_CONVERSION_TYPE_SET = new Set<string>(LINKEDIN_CONVERSION_TYPES);

export interface CreateLinkedInAdsClientOptions {
  accessToken: string;
  adAccountId: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  fetch?: typeof fetch;
}

interface LinkedInRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  params?: Record<string, boolean | number | string | undefined>;
}

export interface GetAnalyticsInput {
  campaignGroups?: string[];
  campaigns?: string[];
  companies?: string[];
  creatives?: string[];
  fields?: string[];
  pivot: LinkedInAnalyticsPivot;
  shares?: string[];
  since: LinkedInDate;
  timeGranularity?: LinkedInTimeGranularity;
  until: LinkedInDate;
}

export interface GetAnalyticsStatisticsInput extends Omit<
  GetAnalyticsInput,
  "pivot"
> {
  pivots: LinkedInAnalyticsStatisticsPivot[];
}

export interface ListCampaignsInput {
  count?: number;
  start?: number;
  statuses?: string[];
}

export interface ListCampaignGroupsInput {
  count?: number;
  start?: number;
  statuses?: string[];
}

interface LinkedInCollectionRejections {
  rejected?: { count: number; reasons: string[] };
}

export interface LinkedInAdsClient {
  checkToken: () => Promise<{ valid: boolean }>;
  createCampaign: (
    input: CreateLinkedInCampaignInput
  ) => Promise<LinkedInCampaign>;
  createCampaignGroup: (
    input: CreateLinkedInCampaignGroupInput
  ) => Promise<LinkedInCampaignGroup>;
  createCreative: (
    input: CreateLinkedInCreativeInput
  ) => Promise<LinkedInCreative>;
  createLeadForm: (
    input: CreateLinkedInLeadFormInput
  ) => Promise<LinkedInLeadForm>;
  getAdAccount: () => Promise<Record<string, unknown>>;
  getAdAccountUser: (userUrn: string) => Promise<LinkedInAdAccountUser>;
  getImage: (imageUrn: string) => Promise<Record<string, unknown>>;
  getAnalytics: (
    input: GetAnalyticsInput
  ) => Promise<LinkedInAnalyticsElement[]>;
  getAnalyticsStatistics: (
    input: GetAnalyticsStatisticsInput
  ) => Promise<LinkedInAnalyticsElement[]>;
  getAudienceCounts: (
    input: GetLinkedInAudienceCountsInput
  ) => Promise<LinkedInAudienceCount[]>;
  getCampaign: (campaignId: string) => Promise<LinkedInCampaign>;
  getCampaignGroup: (campaignGroupId: string) => Promise<LinkedInCampaignGroup>;
  getCreative: (creativeUrn: string) => Promise<LinkedInCreative>;
  getConversion: (conversionId: string) => Promise<LinkedInConversion>;
  getCampaignConversion: (
    input: GetLinkedInCampaignConversionInput
  ) => Promise<LinkedInCampaignConversionAssociation>;
  getLeadFormResponses: (
    input: ListLeadFormResponsesInput
  ) => Promise<{ leads: LinkedInLeadFormResponse[]; total: number }>;
  listCampaigns: (input?: ListCampaignsInput) => Promise<{
    campaigns: LinkedInCampaign[];
    total: number;
  }>;
  listAdAccountUsers: () => Promise<
    {
      total: number;
      users: LinkedInAdAccountUser[];
    } & LinkedInCollectionRejections
  >;
  listAuthenticatedUserAdAccountAccess: () => Promise<
    {
      total: number;
      users: LinkedInAdAccountUser[];
    } & LinkedInCollectionRejections
  >;
  listCampaignGroups: (input?: ListCampaignGroupsInput) => Promise<{
    campaignGroups: LinkedInCampaignGroup[];
    total: number;
  }>;
  listCreatives: (input: ListLinkedInCreativesInput) => Promise<{
    creatives: LinkedInCreative[];
    total: number;
  }>;
  listLeadForms: (input?: {
    count?: number;
    start?: number;
  }) => Promise<{ forms: LinkedInLeadForm[]; total: number }>;
  listTargetingEntities: (
    input: ListLinkedInTargetingEntitiesInput
  ) => Promise<{ entities: LinkedInTargetingEntity[]; total: number }>;
  listTargetingFacets: () => Promise<LinkedInTargetingFacet[]>;
  listOrganizationPosts: (input: {
    count?: number;
    organizationUrn: string;
    start?: number;
  }) => Promise<{ posts: LinkedInOrganizationPost[]; total: number }>;
  pauseCampaign: (campaignId: string) => Promise<void>;
  setCreativeStatus: (
    creativeId: string,
    status: "ACTIVE" | "PAUSED"
  ) => Promise<void>;
  searchTargetingEntities: (
    input: SearchLinkedInTargetingEntitiesInput
  ) => Promise<{ entities: LinkedInTargetingEntity[]; total: number }>;
  searchAdAccounts: (input?: SearchLinkedInAdAccountsInput) => Promise<
    {
      accounts: LinkedInAdAccount[];
      nextPageToken?: string;
    } & LinkedInCollectionRejections
  >;
  uploadImage: (input: LinkedInImageUploadInput) => Promise<string>;
  updateCampaign: (
    campaignId: string,
    input: UpdateLinkedInCampaignInput
  ) => Promise<void>;
}

export function createLinkedInAdsClient(
  options: CreateLinkedInAdsClientOptions
): LinkedInAdsClient {
  return new FetchLinkedInAdsClient(options);
}

export function buildBoostPostPlan(
  input: BoostLinkedInPostInput,
  adAccountId: string
): BoostLinkedInPostPlan {
  const organizationUrn = requireOrganizationUrn(input.organizationUrn);
  const status = input.status ?? "PAUSED";
  const now = Date.now();
  const runSchedule: { end?: number; start: number } = { start: now };
  if (input.days) {
    runSchedule.end = now + input.days * 86_400_000;
  }
  const name =
    input.campaignName ?? `Boost: ${input.postUrn.split(":").pop() ?? "post"}`;
  const dailyBudget = input.dailyBudget ?? 25;

  const campaign: CreateLinkedInCampaignInput = {
    account: normalizeSponsoredAccount(adAccountId),
    associatedEntity: organizationUrn,
    audienceExpansionEnabled: false,
    campaignGroup: normalizeCampaignGroup(input.campaignGroup),
    costType: "CPM",
    creativeSelection: "OPTIMIZED",
    dailyBudget: {
      amount: String(dailyBudget),
      currencyCode: "USD",
    },
    name,
    objectiveType: input.objectiveType ?? "ENGAGEMENT",
    offsiteDeliveryEnabled: false,
    optimizationTargetType: "MAX_CLICK",
    runSchedule,
    status,
    targetingCriteria: input.targetingCriteria ?? {
      includedTargetingFacets: {
        interfaceLocales: ["urn:li:locale:en_US"],
        locations: ["urn:li:geo:103644278"],
      },
    },
    type: "SPONSORED_UPDATES",
    unitCost: {
      amount: "10",
      currencyCode: "USD",
    },
  };

  if (input.totalBudget) {
    campaign.totalBudget = {
      amount: String(input.totalBudget),
      currencyCode: "USD",
    };
  }

  return {
    campaign,
    creative: {
      account: normalizeSponsoredAccount(adAccountId),
      campaign: "$campaignId",
      content: { reference: input.postUrn },
      intendedStatus: "ACTIVE",
    },
  };
}

class FetchLinkedInAdsClient implements LinkedInAdsClient {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiBaseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CreateLinkedInAdsClientOptions) {
    if (!options.accessToken.trim()) {
      throw new Error("LinkedIn accessToken is required.");
    }
    if (!options.adAccountId.trim()) {
      throw new Error("LinkedIn adAccountId is required.");
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }

    this.accessToken = options.accessToken;
    this.adAccountId = normalizeSponsoredAccount(options.adAccountId);
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.apiVersion =
      options.apiVersion ?? DEFAULT_LINKEDIN_MARKETING_API_VERSION;
    this.fetchImpl = fetchImpl;
  }

  private async request<T>(
    endpoint: string,
    options: LinkedInRequestOptions = {}
  ): Promise<T> {
    const response = await this.fetchImpl(this.buildUrl(endpoint, options), {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "LinkedIn-Version": this.apiVersion,
        "X-Restli-Protocol-Version": "2.0.0",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      method: options.method ?? "GET",
    });

    if (!response.ok) {
      let body: LinkedInApiErrorBody | undefined;
      try {
        body = (await response.json()) as LinkedInApiErrorBody;
      } catch {
        body = undefined;
      }
      throw new LinkedInAdsApiError(response.status, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      const restliId = response.headers.get("x-restli-id");
      return (restliId ? { id: restliId } : undefined) as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(
        `LinkedIn returned malformed JSON for successful ${options.method ?? "GET"} ${endpoint}.`,
        { cause: error }
      );
    }
  }

  async checkToken(): Promise<{ valid: boolean }> {
    try {
      await this.request(`/rest/adAccounts/${this.adAccountNumericId}`);
      return { valid: true };
    } catch (error) {
      if (
        error instanceof LinkedInAdsApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        return { valid: false };
      }
      throw error;
    }
  }

  async getAdAccount(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/rest/adAccounts/${this.adAccountNumericId}`
    );
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-account-users?view=li-lms-2026-06
  async getAdAccountUser(userUrn: string): Promise<LinkedInAdAccountUser> {
    const user = requirePersonUrn(userUrn);
    // Live evidence (2026-08-03): the documented equals-sign example returns
    // 400, while `(account:urn%3Ali...,user:urn%3Ali...)` returns 200. Keep
    // encoded URNs and colon separators for this Rest.li composite key.
    const response = await this.request<unknown>(
      `/rest/adAccountUsers/(account:${encodeRfc3986(this.adAccountId)},user:${encodeRfc3986(user)})`
    );
    const [access] = parseAdAccountUsersResponse(
      { elements: [response] },
      true
    ).users;
    if (
      !access ||
      access.account !== this.adAccountId ||
      access.user !== user
    ) {
      throw new Error(
        "LinkedIn returned an invalid success response: ad account user identifiers did not match the request."
      );
    }
    return access;
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns?view=li-lms-2026-06
  async getCampaign(campaignId: string): Promise<LinkedInCampaign> {
    const id = requireNumericResourceId(campaignId, "campaignId");
    const response = await this.request<unknown>(
      `/rest/adAccounts/${this.adAccountNumericId}/adCampaigns/${id}`
    );
    return parseCampaignResponse(response);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaign-groups?view=li-lms-2026-06
  async getCampaignGroup(
    campaignGroupId: string
  ): Promise<LinkedInCampaignGroup> {
    const id = requireNumericResourceId(campaignGroupId, "campaignGroupId");
    const response = await this.request<unknown>(
      `/rest/adAccounts/${this.adAccountNumericId}/adCampaignGroups/${id}`
    );
    return parseCampaignGroupResponse(response);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives?view=li-lms-2026-06
  async getCreative(creativeUrn: string): Promise<LinkedInCreative> {
    const creative = requireCreativeUrn(creativeUrn);
    const response = await this.request<unknown>(
      `/rest/adAccounts/${this.adAccountNumericId}/creatives/${encodeRfc3986(creative)}`
    );
    return parseCreativeResponse(response, creative);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversion-tracking?view=li-lms-2026-06
  async getConversion(conversionId: string): Promise<LinkedInConversion> {
    const id = requirePositiveNumericResourceId(conversionId, "conversionId");
    const response = await this.request<unknown>(`/rest/conversions/${id}`, {
      params: { account: this.adAccountId },
    });
    return parseConversionResponse(response, id, this.adAccountId);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversion-tracking?view=li-lms-2026-06
  async getCampaignConversion(
    input: GetLinkedInCampaignConversionInput
  ): Promise<LinkedInCampaignConversionAssociation> {
    const campaign = requireCampaignConversionUrn(
      input.campaign,
      "urn:li:sponsoredCampaign:",
      "campaign"
    );
    const conversion = requireCampaignConversionUrn(
      input.conversion,
      "urn:lla:llaPartnerConversion:",
      "conversion"
    );
    const response = await this.request<unknown>(
      `/rest/campaignConversions/(campaign:${encodeRfc3986(campaign)},conversion:${encodeRfc3986(conversion)})`
    );
    return parseCampaignConversionResponse(response, campaign, conversion);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-account-users?view=li-lms-2026-06
  async listAdAccountUsers(): Promise<
    {
      total: number;
      users: LinkedInAdAccountUser[];
    } & LinkedInCollectionRejections
  > {
    const response = await this.request<unknown>("/rest/adAccountUsers", {
      params: {
        accounts: `List(${this.adAccountId})`,
        q: "accounts",
      },
    });
    return parseAdAccountUsersResponse(response);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-account-users?view=li-lms-2026-06
  async listAuthenticatedUserAdAccountAccess(): Promise<
    {
      total: number;
      users: LinkedInAdAccountUser[];
    } & LinkedInCollectionRejections
  > {
    const response = await this.request<unknown>("/rest/adAccountUsers", {
      params: { q: "authenticatedUser" },
    });
    return parseAdAccountUsersResponse(response);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-accounts?view=li-lms-2026-06
  async searchAdAccounts(input: SearchLinkedInAdAccountsInput = {}): Promise<
    {
      accounts: LinkedInAdAccount[];
      nextPageToken?: string;
    } & LinkedInCollectionRejections
  > {
    const response = await this.request<unknown>("/rest/adAccounts", {
      params: buildAdAccountSearchParams(input),
    });
    return parseAdAccountSearchResponse(response);
  }

  async getImage(imageUrn: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/rest/images/${encodeURIComponent(imageUrn)}`
    );
  }

  async createCampaign(
    input: CreateLinkedInCampaignInput
  ): Promise<LinkedInCampaign> {
    return this.request<LinkedInCampaign>(
      `/rest/adAccounts/${this.adAccountNumericId}/adCampaigns`,
      {
        body: {
          account: input.account ?? this.adAccountId,
          audienceExpansionEnabled: input.audienceExpansionEnabled ?? false,
          campaignGroup: normalizeCampaignGroup(input.campaignGroup),
          costType: input.costType ?? "CPM",
          creativeSelection: input.creativeSelection ?? "OPTIMIZED",
          dailyBudget: input.dailyBudget,
          locale: input.locale ?? { country: "US", language: "en" },
          name: input.name,
          objectiveType: input.objectiveType ?? "LEAD_GENERATION",
          offsiteDeliveryEnabled: input.offsiteDeliveryEnabled ?? false,
          optimizationTargetType: input.optimizationTargetType ?? "MAX_CLICK",
          runSchedule: input.runSchedule ?? { start: Date.now() },
          status: input.status ?? "DRAFT",
          targetingCriteria: input.targetingCriteria ?? {
            includedTargetingFacets: {},
          },
          totalBudget: input.totalBudget,
          type: input.type ?? "SPONSORED_UPDATES",
          unitCost: input.unitCost,
          ...(input.associatedEntity
            ? { associatedEntity: input.associatedEntity }
            : {}),
        },
        method: "POST",
      }
    );
  }

  async createCampaignGroup(
    input: CreateLinkedInCampaignGroupInput
  ): Promise<LinkedInCampaignGroup> {
    const group = await this.request<LinkedInCampaignGroup>(
      `/rest/adAccounts/${this.adAccountNumericId}/adCampaignGroups`,
      {
        body: {
          account: this.adAccountId,
          name: input.name,
          runSchedule: input.runSchedule ?? { start: Date.now() },
          status: input.status ?? "ACTIVE",
        },
        method: "POST",
      }
    );
    if (!group?.id) {
      throw new Error(
        "LinkedIn campaign group creation returned no resource ID."
      );
    }
    return {
      ...group,
      id: normalizeCampaignGroup(group.id),
      name: group.name ?? input.name,
    };
  }

  async updateCampaign(
    campaignId: string,
    input: UpdateLinkedInCampaignInput
  ): Promise<void> {
    await this.request<undefined>(
      `/rest/adAccounts/${this.adAccountNumericId}/adCampaigns/${numericId(campaignId)}`,
      {
        body: { patch: { $set: input } },
        headers: { "X-RestLi-Method": "PARTIAL_UPDATE" },
        method: "POST",
      }
    );
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    await this.updateCampaign(campaignId, { status: "PAUSED" });
  }

  async createCreative(
    input: CreateLinkedInCreativeInput
  ): Promise<LinkedInCreative> {
    return this.request<LinkedInCreative>(
      `/rest/adAccounts/${this.adAccountNumericId}/creatives`,
      {
        body: {
          account: input.account ?? this.adAccountId,
          campaign: normalizeCampaign(input.campaign),
          content: input.content ?? { reference: input.reference },
          intendedStatus: input.intendedStatus ?? input.status ?? "ACTIVE",
        },
        method: "POST",
      }
    );
  }

  async listCampaignGroups(
    input: ListCampaignGroupsInput = {}
  ): Promise<{ campaignGroups: LinkedInCampaignGroup[]; total: number }> {
    const response = await this.request<
      LinkedInElementsResponse<LinkedInCampaignGroup>
    >(`/rest/adAccounts/${this.adAccountNumericId}/adCampaignGroups`, {
      params: {
        pageSize: Math.min(input.count ?? 50, 100),
        q: "search",
        search: `(status:(values:List(${(input.statuses?.length ? input.statuses : ["ACTIVE", "PAUSED", "DRAFT"]).join(",")})))`,
      },
    });
    assertElementsResponse<LinkedInCampaignGroup>(
      response,
      "campaign group listing"
    );
    return {
      campaignGroups: (response.elements ?? []).map((group) => ({
        ...group,
        id: normalizeCampaignGroup(group.id),
      })),
      total: response.paging?.total ?? response.elements?.length ?? 0,
    };
  }

  async listCreatives(
    input: ListLinkedInCreativesInput
  ): Promise<{ creatives: LinkedInCreative[]; total: number }> {
    const response = await this.request<
      LinkedInElementsResponse<LinkedInCreative>
    >(`/rest/adAccounts/${this.adAccountNumericId}/creatives`, {
      params: {
        campaigns: `List(${normalizeCampaign(input.campaignId)})`,
        pageSize: Math.min(input.count ?? 100, 100),
        q: "criteria",
      },
    });
    assertElementsResponse<LinkedInCreative>(response, "creative listing");
    return {
      creatives: response.elements ?? [],
      total: response.paging?.total ?? response.elements?.length ?? 0,
    };
  }

  async setCreativeStatus(
    creativeId: string,
    status: "ACTIVE" | "PAUSED"
  ): Promise<void> {
    await this.request(
      `/rest/adAccounts/${this.adAccountNumericId}/creatives/${numericId(creativeId)}`,
      {
        body: { patch: { $set: { intendedStatus: status } } },
        headers: { "X-RestLi-Method": "PARTIAL_UPDATE" },
        method: "POST",
      }
    );
  }

  async uploadImage(input: LinkedInImageUploadInput): Promise<string> {
    const initialized = await this.request<{
      value?: {
        image?: string;
        uploadInstructions?: { image?: string; uploadUrl?: string };
        uploadUrl?: string;
      };
    }>("/rest/images?action=initializeUpload", {
      body: { initializeUploadRequest: { owner: this.adAccountId } },
      method: "POST",
    });
    const instructions =
      initialized.value?.uploadInstructions ?? initialized.value;
    if (!instructions?.uploadUrl || !instructions.image) {
      throw new Error(
        "LinkedIn image upload initialization returned no upload URL or image URN."
      );
    }
    const response = await this.fetchImpl(instructions.uploadUrl, {
      body: input.bytes as BodyInit,
      headers: { "Content-Type": input.contentType },
      method: "PUT",
    });
    if (!response.ok) {
      throw new LinkedInAdsApiError(response.status, {
        message: `LinkedIn image upload failed with status ${response.status}.`,
      });
    }
    return instructions.image;
  }

  async createLeadForm(
    input: CreateLinkedInLeadFormInput
  ): Promise<LinkedInLeadForm> {
    return this.request<LinkedInLeadForm>("/rest/leadForms", {
      body: {
        ...input,
        owner: input.owner ?? this.adAccountId,
      },
      method: "POST",
    });
  }

  async listLeadForms(input: { count?: number; start?: number } = {}): Promise<{
    forms: LinkedInLeadForm[];
    total: number;
  }> {
    const response = await this.request<
      LinkedInElementsResponse<LinkedInLeadForm>
    >("/rest/leadForms", {
      params: {
        count: Math.min(input.count ?? 25, 100),
        owner: `(sponsoredAccount:${this.adAccountId})`,
        q: "owner",
        start: input.start ?? 0,
      },
    });
    assertElementsResponse<LinkedInLeadForm>(response, "lead form listing");
    return {
      forms: response.elements ?? [],
      total: response.paging?.total ?? response.elements?.length ?? 0,
    };
  }

  async listOrganizationPosts(input: {
    count?: number;
    organizationUrn: string;
    start?: number;
  }): Promise<{ posts: LinkedInOrganizationPost[]; total: number }> {
    const response = await this.request<
      LinkedInElementsResponse<LinkedInOrganizationPost>
    >("/rest/posts", {
      params: {
        author: normalizeOrganization(input.organizationUrn),
        count: Math.min(input.count ?? 10, 100),
        q: "author",
        start: input.start ?? 0,
      },
    });
    assertElementsResponse<LinkedInOrganizationPost>(
      response,
      "organization post listing"
    );
    return {
      posts: response.elements ?? [],
      total: response.paging?.total ?? response.elements?.length ?? 0,
    };
  }

  async getLeadFormResponses(input: ListLeadFormResponsesInput): Promise<{
    leads: LinkedInLeadFormResponse[];
    total: number;
  }> {
    const response = await this.request<
      LinkedInElementsResponse<LinkedInLeadFormResponse>
    >("/rest/leadFormResponses", {
      params: {
        count: Math.min(input.count ?? 100, 100),
        form: normalizeLeadGenForm(input.formId),
        q: "form",
        start: input.start ?? 0,
        submittedAfter: input.submittedAfter,
        submittedBefore: input.submittedBefore,
      },
    });
    assertElementsResponse<LinkedInLeadFormResponse>(
      response,
      "lead form response listing"
    );
    return {
      leads: response.elements ?? [],
      total: response.paging?.total ?? response.elements?.length ?? 0,
    };
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/ads-targeting?view=li-lms-2026-06
  async listTargetingFacets(): Promise<LinkedInTargetingFacet[]> {
    const response = await this.request<unknown>("/rest/adTargetingFacets");
    return parseTargetingFacetsResponse(response);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/ads-targeting?view=li-lms-2026-06
  async listTargetingEntities(
    input: ListLinkedInTargetingEntitiesInput
  ): Promise<{ entities: LinkedInTargetingEntity[]; total: number }> {
    return this.findTargetingEntities("adTargetingFacet", input);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/ads-targeting?view=li-lms-2026-06
  async searchTargetingEntities(
    input: SearchLinkedInTargetingEntitiesInput
  ): Promise<{ entities: LinkedInTargetingEntity[]; total: number }> {
    if (!input.query.trim()) {
      throw new Error("LinkedIn targeting typeahead query is required.");
    }

    return this.findTargetingEntities("typeahead", input);
  }

  // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/audience-counts?view=li-lms-2026-06
  async getAudienceCounts(
    input: GetLinkedInAudienceCountsInput
  ): Promise<LinkedInAudienceCount[]> {
    if (!input || typeof input !== "object") {
      throw new TypeError(
        "LinkedIn audience counts requires targetingCriteria."
      );
    }
    const targetingCriteria = formatAudienceTargetingCriteria(
      input.targetingCriteria
    );
    const response = await this.request<unknown>("/rest/audienceCounts", {
      params: { q: "targetingCriteriaV2", targetingCriteria },
    });
    return parseAudienceCountsResponse(response);
  }

  async getAnalytics(
    input: GetAnalyticsInput
  ): Promise<LinkedInAnalyticsElement[]> {
    // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting?view=li-lms-2026-06
    const response = await this.request<unknown>("/rest/adAnalytics", {
      params: buildAnalyticsParams(this.adAccountId, input, "analytics"),
    });
    return parseAnalyticsResponse(response);
  }

  async getAnalyticsStatistics(
    input: GetAnalyticsStatisticsInput
  ): Promise<LinkedInAnalyticsElement[]> {
    if (input.pivots.length < 1 || input.pivots.length > 3) {
      throw new Error(
        "LinkedIn analytics statistics requires between one and three pivots."
      );
    }

    // API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting?view=li-lms-2026-06
    const response = await this.request<unknown>("/rest/adAnalytics", {
      params: buildAnalyticsParams(this.adAccountId, input, "statistics"),
    });
    return parseAnalyticsResponse(response);
  }

  async listCampaigns(input: ListCampaignsInput = {}): Promise<{
    campaigns: LinkedInCampaign[];
    total: number;
  }> {
    const params: Record<string, number | string> = {
      pageSize: Math.min(input.count ?? 25, 100),
      q: "search",
    };
    if (input.statuses?.length) {
      params.search = `(status:(values:List(${input.statuses.join(",")})))`;
    }

    const response = await this.request<unknown>(
      `/rest/adAccounts/${this.adAccountNumericId}/adCampaigns`,
      { params }
    );

    assertElementsResponse<unknown>(response, "campaign listing");
    return {
      campaigns: response.elements.map((campaign) =>
        parseCampaignResponse(campaign)
      ),
      total: response.paging?.total ?? response.elements.length,
    };
  }

  private get adAccountNumericId(): string {
    return this.adAccountId.replace(/^urn:li:sponsoredAccount:/u, "");
  }

  private async findTargetingEntities(
    finder: "adTargetingFacet" | "typeahead",
    input:
      | ListLinkedInTargetingEntitiesInput
      | SearchLinkedInTargetingEntitiesInput
  ): Promise<{ entities: LinkedInTargetingEntity[]; total: number }> {
    const response = await this.request<unknown>("/rest/adTargetingEntities", {
      params: {
        entityType: "entityType" in input ? input.entityType : undefined,
        facet: normalizeTargetingFacet(input.facet),
        locale: formatTargetingLocale(input.locale),
        q: finder,
        query: "query" in input ? input.query.trim() : undefined,
        queryVersion: "QUERY_USES_URNS",
        totals: input.totals,
      },
    });
    return parseTargetingEntitiesResponse(response);
  }

  private buildUrl(endpoint: string, options: LinkedInRequestOptions): URL {
    const params = Object.entries(options.params ?? {})
      .filter(
        (entry): entry is [string, boolean | number | string] =>
          entry[1] !== undefined
      )
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeLinkedInQueryValue(String(value))}`
      );
    const query =
      params.length === 0
        ? ""
        : `${endpoint.includes("?") ? "&" : "?"}${params.join("&")}`;

    // LinkedIn's Rest.li query grammar requires structural colons, commas, and
    // parentheses to remain literal, while URN values remain percent-encoded.
    // URLSearchParams encodes both classes, causing malformed finder values.
    // LinkedIn can report INVALID_ACCESS_TOKEN for unrecognized routes or
    // malformed queries, so a 401 is not conclusive token evidence here.
    return new URL(`${this.apiBaseUrl}${endpoint}${query}`);
  }
}

function assertElementsResponse<T>(
  value: unknown,
  operation: string
): asserts value is LinkedInElementsResponse<T> & { elements: T[] } {
  if (
    !value ||
    typeof value !== "object" ||
    !("elements" in value) ||
    !Array.isArray(value.elements)
  ) {
    throw new Error(
      `LinkedIn ${operation} returned an invalid success response: expected an elements array.`
    );
  }

  if (
    "paging" in value &&
    value.paging !== undefined &&
    (!value.paging || typeof value.paging !== "object")
  ) {
    throw new Error(
      `LinkedIn ${operation} returned an invalid success response: paging must be an object.`
    );
  }
}

function buildAnalyticsParams(
  account: string,
  input: GetAnalyticsInput,
  finder: "analytics"
): Record<string, string>;
function buildAnalyticsParams(
  account: string,
  input: GetAnalyticsStatisticsInput,
  finder: "statistics"
): Record<string, string>;
function buildAnalyticsParams(
  account: string,
  input: GetAnalyticsInput | GetAnalyticsStatisticsInput,
  finder: "analytics" | "statistics"
): Record<string, string> {
  const fields = input.fields ?? DEFAULT_ANALYTICS_FIELDS;
  if (fields.length < 1 || fields.length > 20) {
    throw new Error("LinkedIn ad analytics accepts between one and 20 fields.");
  }
  if (
    input.timeGranularity !== undefined &&
    !LINKEDIN_TIME_GRANULARITIES.includes(input.timeGranularity)
  ) {
    throw new Error(
      `Unsupported LinkedIn analytics time granularity: ${input.timeGranularity}`
    );
  }

  const params: Record<string, string> = {
    accounts: `List(${account})`,
    dateRange: formatDateRange(input.since, input.until),
    fields: fields.join(","),
    q: finder,
    timeGranularity: input.timeGranularity ?? "ALL",
  };

  if (finder === "analytics") {
    const analyticsInput = input as GetAnalyticsInput;
    if (!LINKEDIN_ANALYTICS_PIVOTS.includes(analyticsInput.pivot)) {
      throw new Error(
        `Unsupported LinkedIn analytics pivot: ${analyticsInput.pivot}`
      );
    }
    params.pivot = analyticsInput.pivot;
  } else {
    const statisticsInput = input as GetAnalyticsStatisticsInput;
    for (const pivot of statisticsInput.pivots) {
      if (!LINKEDIN_ANALYTICS_STATISTICS_PIVOT_SET.has(pivot)) {
        throw new Error(`Unsupported LinkedIn statistics pivot: ${pivot}`);
      }
    }
    params.pivots = `List(${statisticsInput.pivots.join(",")})`;
  }

  setListParam(params, "campaigns", input.campaigns, normalizeCampaign);
  setListParam(
    params,
    "campaignGroups",
    input.campaignGroups,
    normalizeCampaignGroup
  );
  setListParam(params, "companies", input.companies, normalizeOrganization);
  setListParam(params, "creatives", input.creatives, normalizeCreative);
  setListParam(params, "shares", input.shares, normalizeShare);
  return params;
}

function parseAdAccountUsersResponse(
  value: unknown,
  strict = false
): {
  total: number;
  users: LinkedInAdAccountUser[];
} & LinkedInCollectionRejections {
  assertElementsResponse<unknown>(value, "ad account user listing");
  const users: LinkedInAdAccountUser[] = [];
  const reasons: string[] = [];
  for (const [index, element] of value.elements.entries()) {
    try {
      const record = requireRecord(
        element,
        `ad account user at index ${index}`
      );
      const role = requireString(
        record.role,
        `ad account user at index ${index}.role`
      );
      if (!isLinkedInAdAccountRole(role)) {
        throw new Error(
          `LinkedIn returned an invalid success response: ad account user at index ${index}.role is unsupported.`
        );
      }

      const user: LinkedInAdAccountUser = {
        account: requireString(
          record.account,
          `ad account user at index ${index}.account`
        ),
        role,
        user: requireString(
          record.user,
          `ad account user at index ${index}.user`
        ),
      };
      if (record.createdAt !== undefined) {
        user.createdAt = requireNumber(
          record.createdAt,
          `ad account user at index ${index}.createdAt`
        );
      }
      if (record.lastModifiedAt !== undefined) {
        user.lastModifiedAt = requireNumber(
          record.lastModifiedAt,
          `ad account user at index ${index}.lastModifiedAt`
        );
      }
      if (record.changeAuditStamps !== undefined) {
        user.changeAuditStamps = requireRecord(
          record.changeAuditStamps,
          `ad account user at index ${index}.changeAuditStamps`
        );
      }
      if (record.version !== undefined) {
        const version = requireRecord(
          record.version,
          `ad account user at index ${index}.version`
        );
        user.version =
          version.versionTag === undefined
            ? {}
            : {
                versionTag: requireString(
                  version.versionTag,
                  `ad account user at index ${index}.version.versionTag`
                ),
              };
      }
      users.push(user);
    } catch (error) {
      if (strict) {
        throw error;
      }
      reasons.push(
        error instanceof Error
          ? error.message
          : `Rejected user at index ${index}.`
      );
    }
  }

  const total = value.paging?.total;
  return {
    total:
      total === undefined
        ? users.length
        : requireNumber(total, "ad account user listing paging.total"),
    users,
    ...(reasons.length === 0
      ? {}
      : { rejected: { count: reasons.length, reasons } }),
  };
}

function isLinkedInAdAccountRole(
  value: string
): value is LinkedInAdAccountUser["role"] {
  return LINKEDIN_AD_ACCOUNT_ROLE_SET.has(value);
}

function setListParam(
  params: Record<string, string>,
  key: string,
  values: string[] | undefined,
  normalize: (value: string) => string
): void {
  if (values?.length) {
    params[key] = `List(${values.map(normalize).join(",")})`;
  }
}

function parseAnalyticsResponse(value: unknown): LinkedInAnalyticsElement[] {
  assertElementsResponse<unknown>(value, "analytics read");
  return value.elements.map((element, index) => {
    const record = requireRecord(
      element,
      `analytics element at index ${index}`
    );
    if (
      record.pivotValues !== undefined &&
      (!Array.isArray(record.pivotValues) ||
        !record.pivotValues.every((item) => typeof item === "string"))
    ) {
      throw new Error(
        `LinkedIn returned an invalid success response: analytics element at index ${index}.pivotValues must be a string array.`
      );
    }
    if (
      record.costInLocalCurrency !== undefined &&
      typeof record.costInLocalCurrency !== "string"
    ) {
      throw new Error(
        `LinkedIn returned an invalid success response: analytics element at index ${index}.costInLocalCurrency must be a string.`
      );
    }
    return record as LinkedInAnalyticsElement;
  });
}

function parseTargetingFacetsResponse(
  value: unknown
): LinkedInTargetingFacet[] {
  assertElementsResponse<unknown>(value, "targeting facet listing");
  return value.elements.map((element, index) => {
    const record = requireRecord(element, `targeting facet at index ${index}`);
    return {
      adTargetingFacetUrn: requireString(
        record.adTargetingFacetUrn,
        `targeting facet at index ${index}.adTargetingFacetUrn`
      ),
      availableEntityFinders: requireStringArray(
        record.availableEntityFinders,
        `targeting facet at index ${index}.availableEntityFinders`
      ),
      entityTypes: requireStringArray(
        record.entityTypes,
        `targeting facet at index ${index}.entityTypes`
      ),
      facetName: requireString(
        record.facetName,
        `targeting facet at index ${index}.facetName`
      ),
    };
  });
}

function parseTargetingEntitiesResponse(value: unknown): {
  entities: LinkedInTargetingEntity[];
  total: number;
} {
  assertElementsResponse<unknown>(value, "targeting entity listing");
  const entities = value.elements.map((element, index) => {
    const record = requireRecord(element, `targeting entity at index ${index}`);
    return {
      facetUrn: requireString(
        record.facetUrn,
        `targeting entity at index ${index}.facetUrn`
      ),
      name: requireString(
        record.name,
        `targeting entity at index ${index}.name`
      ),
      urn: requireString(record.urn, `targeting entity at index ${index}.urn`),
    };
  });
  return {
    entities,
    total: value.paging?.total ?? entities.length,
  };
}

function parseAudienceCountsResponse(value: unknown): LinkedInAudienceCount[] {
  assertElementsResponse<unknown>(value, "audience count read");
  if (value.paging !== undefined) {
    const paging = requireRecord(value.paging, "audience count paging");
    if (paging.count !== undefined) {
      requireNonNegativeInteger(paging.count, "audience count paging.count");
    }
    if (paging.start !== undefined) {
      requireNonNegativeInteger(paging.start, "audience count paging.start");
    }
    if (paging.links !== undefined && !Array.isArray(paging.links)) {
      throw new Error(
        "LinkedIn returned an invalid success response: audience count paging.links must be an array."
      );
    }
  }

  return value.elements.map((element, index) => {
    const record = requireRecord(element, `audience count at index ${index}`);
    return {
      active: requireNonNegativeInteger(
        record.active,
        `audience count at index ${index}.active`
      ),
      total: requireNonNegativeInteger(
        record.total,
        `audience count at index ${index}.total`
      ),
    };
  });
}

function parseCampaignResponse(value: unknown): LinkedInCampaign {
  const record = requireRecord(value, "campaign read");
  const status =
    record.status === undefined
      ? undefined
      : requireString(record.status, "campaign read.status");
  if (status !== undefined && !LINKEDIN_CAMPAIGN_READ_STATUS_SET.has(status)) {
    throw new Error(
      `LinkedIn returned an invalid success response: campaign read.status is unsupported: ${status}.`
    );
  }
  const dailyBudget = parseCampaignMoney(
    record.dailyBudget,
    "campaign read.dailyBudget",
    true
  );
  const totalBudget = parseCampaignMoney(
    record.totalBudget,
    "campaign read.totalBudget",
    true
  );
  const unitCost = parseCampaignMoney(
    record.unitCost,
    "campaign read.unitCost",
    false
  );
  const runSchedule = parseCampaignRunSchedule(record.runSchedule);
  const pacingStrategy = parseCampaignPacingStrategy(record.pacingStrategy);
  const servingStatuses = parseCampaignServingStatuses(record.servingStatuses);
  const locale = parseCampaignLocale(record.locale);

  return {
    ...(record.account === undefined
      ? {}
      : { account: requireString(record.account, "campaign read.account") }),
    ...(record.campaignGroup === undefined
      ? {}
      : {
          campaignGroup: requireString(
            record.campaignGroup,
            "campaign read.campaignGroup"
          ),
        }),
    ...(record.costType === undefined
      ? {}
      : { costType: requireString(record.costType, "campaign read.costType") }),
    ...(record.creativeSelection === undefined
      ? {}
      : {
          creativeSelection: requireString(
            record.creativeSelection,
            "campaign read.creativeSelection"
          ),
        }),
    id: parseCampaignId(record.id),
    ...(locale === undefined ? {} : { locale }),
    name: requireString(record.name, "campaign read.name"),
    ...(record.objectiveType === undefined
      ? {}
      : {
          objectiveType: requireString(
            record.objectiveType,
            "campaign read.objectiveType"
          ),
        }),
    ...(status === undefined
      ? {}
      : { status: status as LinkedInCampaign["status"] }),
    ...(dailyBudget === undefined ? {} : { dailyBudget }),
    ...(pacingStrategy === undefined ? {} : { pacingStrategy }),
    ...(runSchedule === undefined ? {} : { runSchedule }),
    ...(servingStatuses === undefined ? {} : { servingStatuses }),
    ...(totalBudget === undefined ? {} : { totalBudget }),
    ...(record.type === undefined
      ? {}
      : { type: requireString(record.type, "campaign read.type") }),
    ...(unitCost === undefined ? {} : { unitCost }),
  };
}

function parseCampaignLocale(value: unknown): LinkedInCampaign["locale"] {
  if (value === undefined) {
    return undefined;
  }
  const locale = requireRecord(value, "campaign read.locale");
  return {
    country: requireString(locale.country, "campaign read.locale.country"),
    language: requireString(locale.language, "campaign read.locale.language"),
  };
}

function parseAdAccountSearchResponse(value: unknown): {
  accounts: LinkedInAdAccount[];
  nextPageToken?: string;
} & LinkedInCollectionRejections {
  const response = requireRecord(value, "ad account search");
  if (!Array.isArray(response.elements)) {
    throw new TypeError(
      "LinkedIn returned an invalid success response: ad account search.elements must be an array."
    );
  }
  const accounts: LinkedInAdAccount[] = [];
  const reasons: string[] = [];
  for (const [index, element] of response.elements.entries()) {
    try {
      accounts.push(parseAdAccount(element, index));
    } catch (error) {
      reasons.push(
        error instanceof Error
          ? error.message
          : `Rejected ad account at index ${index}.`
      );
    }
  }
  const rejected =
    reasons.length === 0
      ? {}
      : { rejected: { count: reasons.length, reasons } };
  if (response.metadata === undefined) {
    return { accounts, ...rejected };
  }
  const metadata = requireRecord(
    response.metadata,
    "ad account search.metadata"
  );
  if (metadata.nextPageToken === undefined) {
    return { accounts, ...rejected };
  }
  return {
    accounts,
    ...rejected,
    nextPageToken: requireString(
      metadata.nextPageToken,
      "ad account search.metadata.nextPageToken"
    ),
  };
}

function parseAdAccount(value: unknown, index: number): LinkedInAdAccount {
  const field = `ad account at index ${index}`;
  const record = requireRecord(value, field);
  const status = requireString(record.status, `${field}.status`);
  if (!LINKEDIN_AD_ACCOUNT_STATUS_SET.has(status)) {
    throw new Error(
      `LinkedIn returned an invalid success response: ${field}.status is unsupported: ${status}.`
    );
  }
  const type = requireString(record.type, `${field}.type`);
  if (!LINKEDIN_AD_ACCOUNT_TYPE_SET.has(type)) {
    throw new Error(
      `LinkedIn returned an invalid success response: ${field}.type is unsupported: ${type}.`
    );
  }
  const servingStatuses = parseAdAccountServingStatuses(
    record.servingStatuses,
    field
  );
  return {
    currency: requireString(record.currency, `${field}.currency`),
    id: parseAdAccountId(record.id, field),
    name: requireString(record.name, `${field}.name`),
    status: status as LinkedInAdAccount["status"],
    test: requireBoolean(record.test, `${field}.test`),
    type: type as LinkedInAdAccount["type"],
    ...(record.reference === undefined
      ? {}
      : { reference: requireString(record.reference, `${field}.reference`) }),
    ...(servingStatuses === undefined ? {} : { servingStatuses }),
  };
}

function parseAdAccountId(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/u.test(value) && value !== "0") {
    return value;
  }
  throw new TypeError(
    `LinkedIn returned an invalid success response: ${field}.id must be a positive safe integer.`
  );
}

function parseAdAccountServingStatuses(
  value: unknown,
  field: string
): LinkedInAdAccount["servingStatuses"] {
  if (value === undefined) {
    return undefined;
  }
  const statuses = requireStringArray(value, `${field}.servingStatuses`);
  for (const status of statuses) {
    if (!LINKEDIN_AD_ACCOUNT_SERVING_STATUS_SET.has(status)) {
      throw new Error(
        `LinkedIn returned an invalid success response: ${field}.servingStatuses contains unsupported value: ${status}.`
      );
    }
  }
  return statuses as LinkedInAdAccount["servingStatuses"];
}

function parseCampaignConversionResponse(
  value: unknown,
  expectedCampaign: string,
  expectedConversion: string
): LinkedInCampaignConversionAssociation {
  const record = requireRecord(value, "campaign conversion read");
  const campaign = requireString(
    record.campaign,
    "campaign conversion read.campaign"
  );
  const conversion = requireString(
    record.conversion,
    "campaign conversion read.conversion"
  );
  if (campaign !== expectedCampaign || conversion !== expectedConversion) {
    throw new Error(
      "LinkedIn returned an invalid success response: campaign conversion identifiers did not match the request."
    );
  }
  return {
    associatedAt: requireNonNegativeInteger(
      record.associatedAt,
      "campaign conversion read.associatedAt"
    ),
    campaign,
    conversion,
  };
}

function parseCampaignGroupResponse(value: unknown): LinkedInCampaignGroup {
  const record = requireRecord(value, "campaign group read");
  const status = requireString(record.status, "campaign group read.status");
  if (!LINKEDIN_CAMPAIGN_GROUP_READ_STATUS_SET.has(status)) {
    throw new Error(
      `LinkedIn returned an invalid success response: campaign group read.status is unsupported: ${status}.`
    );
  }
  const runSchedule = parseCampaignGroupRunSchedule(record.runSchedule);
  const servingStatuses = parseCampaignGroupServingStatuses(
    record.servingStatuses
  );
  const totalBudget = parseCampaignMoney(
    record.totalBudget,
    "campaign group read.totalBudget",
    true
  );
  return {
    account: requireString(record.account, "campaign group read.account"),
    id: parseCampaignGroupId(record.id),
    name: requireString(record.name, "campaign group read.name"),
    status: status as LinkedInCampaignGroup["status"],
    ...(record.backfilled === undefined
      ? {}
      : {
          backfilled: requireBoolean(
            record.backfilled,
            "campaign group read.backfilled"
          ),
        }),
    ...(runSchedule === undefined ? {} : { runSchedule }),
    ...(servingStatuses === undefined ? {} : { servingStatuses }),
    ...(record.test === undefined
      ? {}
      : { test: requireBoolean(record.test, "campaign group read.test") }),
    ...(totalBudget === undefined ? {} : { totalBudget }),
  };
}

function parseCampaignGroupId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return requireString(value, "campaign group read.id");
}

function parseCampaignGroupRunSchedule(
  value: unknown
): LinkedInCampaignGroup["runSchedule"] {
  if (value === undefined) {
    return undefined;
  }
  const schedule = requireRecord(value, "campaign group read.runSchedule");
  return {
    start: requireNonNegativeInteger(
      schedule.start,
      "campaign group read.runSchedule.start"
    ),
    ...(schedule.end === undefined
      ? {}
      : {
          end: requireNonNegativeInteger(
            schedule.end,
            "campaign group read.runSchedule.end"
          ),
        }),
  };
}

function parseCampaignGroupServingStatuses(
  value: unknown
): LinkedInCampaignGroup["servingStatuses"] {
  if (value === undefined) {
    return undefined;
  }
  const servingStatuses = requireStringArray(
    value,
    "campaign group read.servingStatuses"
  );
  for (const servingStatus of servingStatuses) {
    if (!LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUS_SET.has(servingStatus)) {
      throw new Error(
        `LinkedIn returned an invalid success response: campaign group read.servingStatuses contains unsupported value: ${servingStatus}.`
      );
    }
  }
  return servingStatuses as LinkedInCampaignGroup["servingStatuses"];
}

function parseCreativeResponse(
  value: unknown,
  expectedCreative: string
): LinkedInCreative {
  const record = requireRecord(value, "creative read");
  const id = requireString(record.id, "creative read.id");
  if (id !== expectedCreative) {
    throw new Error(
      "LinkedIn returned an invalid success response: creative read.id did not match the request."
    );
  }
  const intendedStatus = parseCreativeIntendedStatus(record.intendedStatus);
  const review = parseCreativeReview(record.review);
  const servingHoldReasons = parseCreativeServingHoldReasons(
    record.servingHoldReasons
  );
  return {
    account: requireString(record.account, "creative read.account"),
    campaign: requireString(record.campaign, "creative read.campaign"),
    content: requireRecord(record.content, "creative read.content"),
    id,
    ...(record.createdAt === undefined
      ? {}
      : {
          createdAt: requireNonNegativeInteger(
            record.createdAt,
            "creative read.createdAt"
          ),
        }),
    ...(record.createdBy === undefined
      ? {}
      : {
          createdBy: requireString(record.createdBy, "creative read.createdBy"),
        }),
    ...(intendedStatus === undefined ? {} : { intendedStatus }),
    ...(record.isServing === undefined
      ? {}
      : {
          isServing: requireBoolean(
            record.isServing,
            "creative read.isServing"
          ),
        }),
    ...(record.isTest === undefined
      ? {}
      : { isTest: requireBoolean(record.isTest, "creative read.isTest") }),
    ...(record.lastModifiedAt === undefined
      ? {}
      : {
          lastModifiedAt: requireNonNegativeInteger(
            record.lastModifiedAt,
            "creative read.lastModifiedAt"
          ),
        }),
    ...(record.lastModifiedBy === undefined
      ? {}
      : {
          lastModifiedBy: requireString(
            record.lastModifiedBy,
            "creative read.lastModifiedBy"
          ),
        }),
    ...(record.name === undefined
      ? {}
      : { name: requireString(record.name, "creative read.name") }),
    ...(review === undefined ? {} : { review }),
    ...(servingHoldReasons === undefined ? {} : { servingHoldReasons }),
  };
}

function parseCreativeIntendedStatus(
  value: unknown
): LinkedInCreative["intendedStatus"] {
  if (value === undefined) {
    return undefined;
  }
  const status = requireString(value, "creative read.intendedStatus");
  if (!LINKEDIN_CREATIVE_INTENDED_STATUS_SET.has(status)) {
    throw new Error(
      `LinkedIn returned an invalid success response: creative read.intendedStatus is unsupported: ${status}.`
    );
  }
  return status as LinkedInCreative["intendedStatus"];
}

function parseCreativeReview(value: unknown): LinkedInCreative["review"] {
  if (value === undefined || value === null) {
    return undefined;
  }
  const record = requireRecord(value, "creative read.review");
  const status = requireString(record.status, "creative read.review.status");
  if (!LINKEDIN_CREATIVE_REVIEW_STATUS_SET.has(status)) {
    throw new Error(
      `LinkedIn returned an invalid success response: creative read.review.status is unsupported: ${status}.`
    );
  }
  return {
    status: status as NonNullable<LinkedInCreative["review"]>["status"],
    ...(record.rejectionReasons === undefined
      ? {}
      : {
          rejectionReasons: requireStringArray(
            record.rejectionReasons,
            "creative read.review.rejectionReasons"
          ),
        }),
  };
}

function parseCreativeServingHoldReasons(
  value: unknown
): LinkedInCreative["servingHoldReasons"] {
  if (value === undefined || value === null) {
    return undefined;
  }
  const reasons = requireStringArray(value, "creative read.servingHoldReasons");
  for (const reason of reasons) {
    if (!LINKEDIN_CREATIVE_SERVING_HOLD_REASON_SET.has(reason)) {
      throw new Error(
        `LinkedIn returned an invalid success response: creative read.servingHoldReasons contains unsupported value: ${reason}.`
      );
    }
  }
  return reasons as LinkedInCreative["servingHoldReasons"];
}

function parseConversionResponse(
  value: unknown,
  expectedId: string,
  expectedAccount: string
): LinkedInConversion {
  const record = requireRecord(value, "conversion read");
  const account = requireString(record.account, "conversion read.account");
  const id = parseConversionId(record.id);
  if (account !== expectedAccount || id !== expectedId) {
    throw new Error(
      "LinkedIn returned an invalid success response: conversion identifiers did not match the request."
    );
  }
  const attributionType = requireString(
    record.attributionType,
    "conversion read.attributionType"
  );
  if (!LINKEDIN_CONVERSION_ATTRIBUTION_TYPE_SET.has(attributionType)) {
    throw new Error(
      `LinkedIn returned an invalid success response: conversion read.attributionType is unsupported: ${attributionType}.`
    );
  }
  const type = requireString(record.type, "conversion read.type");
  if (!LINKEDIN_CONVERSION_TYPE_SET.has(type)) {
    throw new Error(
      `LinkedIn returned an invalid success response: conversion read.type is unsupported: ${type}.`
    );
  }
  return {
    account,
    attributionType: attributionType as LinkedInConversion["attributionType"],
    enabled: requireBoolean(record.enabled, "conversion read.enabled"),
    id,
    name: requireString(record.name, "conversion read.name"),
    type: type as LinkedInConversion["type"],
  };
}

function parseConversionId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/u.test(value) && value !== "0") {
    return value;
  }
  throw new TypeError(
    "LinkedIn returned an invalid success response: conversion read.id must be a positive safe integer."
  );
}

function parseCampaignRunSchedule(
  value: unknown
): LinkedInCampaign["runSchedule"] {
  if (value === undefined) {
    return undefined;
  }
  const schedule = requireRecord(value, "campaign read.runSchedule");
  return {
    start: requireNonNegativeInteger(
      schedule.start,
      "campaign read.runSchedule.start"
    ),
    ...(schedule.end === undefined
      ? {}
      : {
          end: requireNonNegativeInteger(
            schedule.end,
            "campaign read.runSchedule.end"
          ),
        }),
  };
}

function parseCampaignPacingStrategy(
  value: unknown
): LinkedInCampaign["pacingStrategy"] {
  if (value === undefined) {
    return undefined;
  }
  const pacingStrategy = requireString(value, "campaign read.pacingStrategy");
  if (!LINKEDIN_CAMPAIGN_PACING_STRATEGY_SET.has(pacingStrategy)) {
    throw new Error(
      `LinkedIn returned an invalid success response: campaign read.pacingStrategy is unsupported: ${pacingStrategy}.`
    );
  }
  return pacingStrategy as LinkedInCampaign["pacingStrategy"];
}

function parseCampaignServingStatuses(
  value: unknown
): LinkedInCampaign["servingStatuses"] {
  if (value === undefined) {
    return undefined;
  }
  const servingStatuses = requireStringArray(
    value,
    "campaign read.servingStatuses"
  );
  for (const servingStatus of servingStatuses) {
    if (!LINKEDIN_CAMPAIGN_SERVING_STATUS_SET.has(servingStatus)) {
      throw new Error(
        `LinkedIn returned an invalid success response: campaign read.servingStatuses contains unsupported value: ${servingStatus}.`
      );
    }
  }
  return servingStatuses as LinkedInCampaign["servingStatuses"];
}

function parseCampaignId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return requireString(value, "campaign read.id");
}

function parseCampaignMoney(
  value: unknown,
  field: string,
  requireCurrency: true
): LinkedInMoney | undefined;
function parseCampaignMoney(
  value: unknown,
  field: string,
  requireCurrency: false
): { amount: string; currencyCode?: string } | undefined;
function parseCampaignMoney(
  value: unknown,
  field: string,
  requireCurrency: boolean
): { amount: string; currencyCode?: string } | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = requireRecord(value, field);
  const currencyCode =
    record.currencyCode === undefined
      ? undefined
      : requireString(record.currencyCode, `${field}.currencyCode`);
  if (requireCurrency && currencyCode === undefined) {
    throw new Error(
      `LinkedIn returned an invalid success response: ${field}.currencyCode must be a non-empty string.`
    );
  }
  return {
    amount: requireString(record.amount, `${field}.amount`),
    ...(currencyCode === undefined ? {} : { currencyCode }),
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `LinkedIn returned an invalid success response: ${field} must be an object.`
    );
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(
      `LinkedIn returned an invalid success response: ${field} must be a non-empty string.`
    );
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `LinkedIn returned an invalid success response: ${field} must be a boolean.`
    );
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(
      `LinkedIn returned an invalid success response: ${field} must be a finite number.`
    );
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(
      `LinkedIn returned an invalid success response: ${field} must be a non-negative integer.`
    );
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(
      `LinkedIn returned an invalid success response: ${field} must be a string array.`
    );
  }
  return value;
}

function buildAdAccountSearchParams(
  input: SearchLinkedInAdAccountsInput
): Record<string, boolean | number | string | undefined> {
  const search: string[] = [];
  if (input.types?.length) {
    requireSupportedSearchValues(
      input.types,
      LINKEDIN_AD_ACCOUNT_TYPE_SET,
      "types"
    );
    search.push(`type:(values:List(${input.types.join(",")}))`);
  }
  if (input.statuses?.length) {
    requireSupportedSearchValues(
      input.statuses,
      LINKEDIN_AD_ACCOUNT_STATUS_SET,
      "statuses"
    );
    search.push(`status:(values:List(${input.statuses.join(",")}))`);
  }
  if (input.test !== undefined) {
    search.push(`test:${input.test}`);
  }
  const pageSize = input.pageSize ?? 100;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error(
      "LinkedIn ad account search pageSize must be from 1 to 1000."
    );
  }
  const params: Record<string, boolean | number | string | undefined> = {
    pageSize,
    q: "search",
  };
  if (search.length) {
    params.search = `(${search.join(",")})`;
  }
  if (input.pageToken) {
    params.pageToken = input.pageToken;
  }
  if (input.sortOrder) {
    params.sortOrder = input.sortOrder;
  }
  return params;
}

function requireSupportedSearchValues(
  values: string[],
  supported: Set<string>,
  field: string
): void {
  for (const value of values) {
    if (!supported.has(value)) {
      throw new Error(
        `LinkedIn ad account search ${field} contains unsupported value: ${value}.`
      );
    }
  }
}

function formatDate(date: LinkedInDate): string {
  return `year:${date.year},month:${date.month},day:${date.day}`;
}

function requireOrganizationUrn(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(
      "organizationUrn is required for LinkedIn sponsored content boosts."
    );
  }
  return value.trim();
}

function requireNumericResourceId(value: string, field: string): string {
  const id = numericId(value.trim());
  if (!/^\d+$/u.test(id)) {
    throw new Error(`LinkedIn ${field} must be a numeric ID or URN.`);
  }
  return id;
}

function requirePositiveNumericResourceId(
  value: string,
  field: string
): string {
  const id = requireNumericResourceId(value, field);
  if (/^0+$/u.test(id)) {
    throw new Error(`LinkedIn ${field} must be positive.`);
  }
  return id;
}

function requireCampaignConversionUrn(
  value: unknown,
  prefix: string,
  field: string
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    value.length === prefix.length ||
    /\s/u.test(value)
  ) {
    throw new Error(
      `LinkedIn campaign conversion ${field} must be a ${prefix} URN without whitespace.`
    );
  }
  return value;
}

function requireCreativeUrn(value: unknown): string {
  const prefix = "urn:li:sponsoredCreative:";
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    value.length === prefix.length ||
    /\s/u.test(value)
  ) {
    throw new Error(
      "LinkedIn creativeUrn must be a full urn:li:sponsoredCreative: URN without whitespace."
    );
  }
  return value;
}

function requirePersonUrn(value: unknown): string {
  const prefix = "urn:li:person:";
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    value.length === prefix.length ||
    /\s/u.test(value)
  ) {
    throw new Error(
      "LinkedIn userUrn must be a full urn:li:person: URN without whitespace."
    );
  }
  return value;
}

function formatDateRange(start: LinkedInDate, end: LinkedInDate): string {
  return `(start:(${formatDate(start)}),end:(${formatDate(end)}))`;
}

function normalizeCampaign(campaign: string): string {
  return campaign.startsWith("urn:li:")
    ? campaign
    : `urn:li:sponsoredCampaign:${campaign}`;
}

function normalizeCreative(creative: string): string {
  return creative.startsWith("urn:li:")
    ? creative
    : `urn:li:sponsoredCreative:${creative}`;
}

function normalizeCampaignGroup(campaignGroup: string): string {
  const value = String(campaignGroup);
  return value.startsWith("urn:li:")
    ? value
    : `urn:li:sponsoredCampaignGroup:${value}`;
}

function normalizeLeadGenForm(form: string): string {
  return form.startsWith("urn:li:") ? form : `urn:li:leadGenForm:${form}`;
}

function normalizeOrganization(organization: string): string {
  return organization.startsWith("urn:li:")
    ? organization
    : `urn:li:organization:${organization}`;
}

function normalizeShare(share: string): string {
  return share.startsWith("urn:li:") ? share : `urn:li:share:${share}`;
}

function normalizeTargetingFacet(facet: string): string {
  const value = facet.trim();
  if (!value) {
    throw new Error("LinkedIn targeting facet is required.");
  }
  return value.startsWith("urn:li:")
    ? value
    : `urn:li:adTargetingFacet:${value}`;
}

function formatTargetingLocale(
  locale: { country: string; language: string } | undefined
): string {
  const value = locale ?? { country: "US", language: "en" };
  return `(language:${value.language},country:${value.country})`;
}

function formatAudienceTargetingCriteria(
  criteria: GetLinkedInAudienceCountsInput["targetingCriteria"]
): string {
  if (!criteria?.include || !Array.isArray(criteria.include.and)) {
    throw new TypeError(
      "LinkedIn audience targeting criteria must include an and array."
    );
  }
  if (criteria.include.and.length === 0) {
    throw new Error(
      "LinkedIn audience targeting criteria must include at least one and group."
    );
  }

  const include = criteria.include.and
    .map(
      (group, index) =>
        `(or:(${formatAudienceTargetingFacets(group?.or, `include.and[${index}].or`)}))`
    )
    .join(",");
  const excludeEntries = criteria.exclude
    ? Object.keys(criteria.exclude.or ?? {})
    : [];
  const exclude = excludeEntries.length
    ? `,exclude:(or:(${formatAudienceTargetingFacets(criteria.exclude?.or, "exclude.or")}))`
    : "";
  return `(include:(and:List(${include}))${exclude})`;
}

function formatAudienceTargetingFacets(
  facets: Record<string, string[]> | undefined,
  field: string
): string {
  if (!facets || Array.isArray(facets) || typeof facets !== "object") {
    throw new TypeError(
      `LinkedIn audience targeting criteria ${field} must be an object.`
    );
  }
  const entries = Object.entries(facets);
  if (entries.length === 0) {
    throw new Error(
      `LinkedIn audience targeting criteria ${field} must not be empty.`
    );
  }

  return entries
    .map(([facet, values]) => {
      requireTargetingUrn(facet, "urn:li:adTargetingFacet:", `${field} facet`);
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `LinkedIn audience targeting criteria ${field}.${facet} must contain at least one entity URN.`
        );
      }
      const encodedValues = values.map((value, index) => {
        requireTargetingUrn(value, "urn:li:", `${field}.${facet}[${index}]`);
        return encodeRfc3986(value);
      });
      return `${encodeRfc3986(facet)}:List(${encodedValues.join(",")})`;
    })
    .join(",");
}

function requireTargetingUrn(
  value: unknown,
  prefix: string,
  field: string
): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    value.length === prefix.length ||
    /\s/u.test(value)
  ) {
    throw new Error(
      `LinkedIn audience targeting criteria ${field} must be a ${prefix} URN without whitespace.`
    );
  }
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replaceAll(/[!'()*]/gu, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Cannot encode an empty URI character.");
    }
    return `%${codePoint.toString(16).toUpperCase()}`;
  });
}

function encodeLinkedInQueryValue(value: string): string {
  return value
    .split(/(?<escape>%[0-9a-f]{2})/iu)
    .map((part) => {
      if (/^%[0-9a-f]{2}$/iu.test(part)) {
        return part.toUpperCase();
      }
      return part
        .split(/(?<urn>urn:li:[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+)/gu)
        .map((fragment) =>
          fragment.startsWith("urn:li:")
            ? encodeRfc3986(fragment)
            : encodeURIComponent(fragment)
                .replaceAll("%28", "(")
                .replaceAll("%29", ")")
                .replaceAll("%2C", ",")
                .replaceAll("%3A", ":")
        )
        .join("");
    })
    .join("");
}

function normalizeSponsoredAccount(account: string): string {
  return account.startsWith("urn:li:")
    ? account
    : `urn:li:sponsoredAccount:${account}`;
}

function numericId(urnOrId: string): string {
  return urnOrId.split(":").pop() ?? urnOrId;
}
