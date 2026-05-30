import { LinkedInAdsApiError } from "./linkedin-ads-api-error.js";
import type {
  LinkedInAnalyticsElement,
  LinkedInAnalyticsPivot,
  LinkedInApiErrorBody,
  LinkedInCampaign,
  LinkedInCreative,
  LinkedInDate,
  LinkedInElementsResponse,
  LinkedInLeadForm,
  LinkedInLeadFormResponse,
  LinkedInTimeGranularity,
  BoostLinkedInPostInput,
  BoostLinkedInPostPlan,
  BoostLinkedInPostResult,
  CreateLinkedInCampaignInput,
  CreateLinkedInCreativeInput,
  CreateLinkedInLeadFormInput,
  ListLeadFormResponsesInput,
  UpdateLinkedInCampaignInput,
} from "./types.js";

const DEFAULT_API_BASE_URL = "https://api.linkedin.com";
const DEFAULT_API_VERSION = "202506";
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

export interface CreateLinkedInAdsClientOptions {
  accessToken: string;
  adAccountId: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  fetch?: typeof fetch;
}

export interface LinkedInRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  params?: Record<string, boolean | number | string | undefined>;
}

export interface GetAnalyticsInput {
  campaigns?: string[];
  creatives?: string[];
  fields?: string[];
  pivot: LinkedInAnalyticsPivot;
  since: LinkedInDate;
  timeGranularity?: LinkedInTimeGranularity;
  until: LinkedInDate;
}

export interface ListCampaignsInput {
  count?: number;
  start?: number;
  statuses?: string[];
}

export interface LinkedInAdsClient {
  boostPost(input: BoostLinkedInPostInput): Promise<BoostLinkedInPostResult>;
  checkToken(): Promise<{ valid: boolean }>;
  createCampaign(input: CreateLinkedInCampaignInput): Promise<LinkedInCampaign>;
  createCreative(input: CreateLinkedInCreativeInput): Promise<LinkedInCreative>;
  createLeadForm(input: CreateLinkedInLeadFormInput): Promise<LinkedInLeadForm>;
  getAdAccount(): Promise<Record<string, unknown>>;
  getAnalytics(input: GetAnalyticsInput): Promise<LinkedInAnalyticsElement[]>;
  getLeadFormResponses(
    input: ListLeadFormResponsesInput
  ): Promise<{ leads: LinkedInLeadFormResponse[]; total: number }>;
  listCampaigns(input?: ListCampaignsInput): Promise<{
    campaigns: LinkedInCampaign[];
    total: number;
  }>;
  listLeadForms(input?: {
    count?: number;
    start?: number;
  }): Promise<{ forms: LinkedInLeadForm[]; total: number }>;
  pauseCampaign(campaignId: string): Promise<void>;
  request<T>(endpoint: string, options?: LinkedInRequestOptions): Promise<T>;
  updateCampaign(
    campaignId: string,
    input: UpdateLinkedInCampaignInput
  ): Promise<void>;
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
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.fetchImpl = fetchImpl;
  }

  async request<T>(
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

    return JSON.parse(text) as T;
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

  async boostPost(
    input: BoostLinkedInPostInput
  ): Promise<BoostLinkedInPostResult> {
    const plan = buildBoostPostPlan(input, this.adAccountId);
    const campaign = await this.createCampaign(plan.campaign);
    const creative = await this.createCreative({
      ...plan.creative,
      campaign: campaign.id,
    });
    return { campaign, creative, plan };
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
        owner: this.adAccountId,
        q: "owner",
        start: input.start ?? 0,
      },
    });
    return {
      forms: response.elements ?? [],
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
    return {
      leads: response.elements ?? [],
      total: response.paging?.total ?? response.elements?.length ?? 0,
    };
  }

  async getAnalytics(
    input: GetAnalyticsInput
  ): Promise<LinkedInAnalyticsElement[]> {
    const params: Record<string, string> = {
      accounts: `List(${this.adAccountId})`,
      dateRange: formatDateRange(input.since, input.until),
      fields: (input.fields ?? DEFAULT_ANALYTICS_FIELDS).join(","),
      pivot: input.pivot,
      q: "analytics",
      timeGranularity: input.timeGranularity ?? "ALL",
    };

    if (input.campaigns?.length) {
      params.campaigns = `List(${input.campaigns.map(normalizeCampaign).join(",")})`;
    }

    if (input.creatives?.length) {
      params.creatives = `List(${input.creatives.map(normalizeCreative).join(",")})`;
    }

    const response = await this.request<
      LinkedInElementsResponse<LinkedInAnalyticsElement>
    >("/rest/adAnalytics", { params });

    return response.elements ?? [];
  }

  async listCampaigns(input: ListCampaignsInput = {}): Promise<{
    campaigns: LinkedInCampaign[];
    total: number;
  }> {
    const params: Record<string, number | string> = {
      count: Math.min(input.count ?? 25, 100),
      q: "search",
      search: formatCampaignSearch(this.adAccountId, input.statuses),
      start: input.start ?? 0,
    };

    const response = await this.request<
      LinkedInElementsResponse<LinkedInCampaign>
    >(`/rest/adAccounts/${this.adAccountNumericId}/adCampaigns`, { params });

    return {
      campaigns: response.elements ?? [],
      total: response.paging?.total ?? response.elements?.length ?? 0,
    };
  }

  private get adAccountNumericId(): string {
    return this.adAccountId.replace(/^urn:li:sponsoredAccount:/u, "");
  }

  private buildUrl(endpoint: string, options: LinkedInRequestOptions): URL {
    const url = new URL(`${this.apiBaseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }
}

function formatCampaignSearch(account: string, statuses?: string[]): string {
  if (statuses?.length) {
    return `(account:(values:List(${account})),status:(values:List(${statuses.join(",")})))`;
  }

  return `(account:(values:List(${account})))`;
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
  return campaignGroup.startsWith("urn:li:")
    ? campaignGroup
    : `urn:li:sponsoredCampaignGroup:${campaignGroup}`;
}

function normalizeLeadGenForm(form: string): string {
  return form.startsWith("urn:li:") ? form : `urn:li:leadGenForm:${form}`;
}

function normalizeSponsoredAccount(account: string): string {
  return account.startsWith("urn:li:")
    ? account
    : `urn:li:sponsoredAccount:${account}`;
}

function numericId(urnOrId: string): string {
  return urnOrId.split(":").pop() ?? urnOrId;
}
