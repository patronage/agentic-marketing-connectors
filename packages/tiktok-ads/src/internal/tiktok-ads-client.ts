import { TikTokAdsAmbiguousWriteError } from "./tiktok-ads-ambiguous-write-error.js";
import { TikTokAdsApiError } from "./tiktok-ads-api-error.js";
import {
  TIKTOK_CAMPAIGN_OPERATION_STATUSES,
  TIKTOK_CREATIVE_PORTFOLIO_TYPES,
  TIKTOK_IDENTITY_TYPES,
  TIKTOK_PLACEMENTS,
  TIKTOK_POSTBACK_WINDOW_MODES,
  TIKTOK_SPECIAL_INDUSTRIES,
} from "./types.js";
import type {
  TikTokApiErrorBody,
  TikTokAdCreationResult,
  TikTokAdFormat,
  TikTokAdvertiserInfo,
  TikTokAuthorizedAdvertiser,
  TikTokBasicReportDataLevel,
  TikTokBasicReportDimension,
  TikTokBasicReportMetric,
  TikTokBasicReportResult,
  TikTokCampaignBudgetMode,
  TikTokCampaign,
  TikTokCampaignCreationResult,
  TikTokCampaignListResult,
  TikTokCampaignObjectiveType,
  TikTokCampaignOperationStatus,
  TikTokCampaignStatus,
  TikTokCampaignStatusUpdateResult,
  TikTokCreativePortfolio,
  TikTokCreativePortfolioFilterType,
  TikTokCreativePortfolioListResult,
  TikTokCreateOperationStatus,
  TikTokCustomAudienceCalculateType,
  TikTokCustomAudienceCreationResult,
  TikTokCustomAudienceFileUploadResult,
  TikTokIdentityCreationResult,
  TikTokIdentity,
  TikTokIdentityListResult,
  TikTokIdentityType,
  TikTokInterestCategory,
  TikTokInterestCategoryLanguage,
  TikTokInterestCategoryVersion,
  TikTokLookalikeAudienceSize,
  TikTokLookalikeLocationId,
  TikTokLookalikeMobileOs,
  TikTokLookalikePlacement,
  TikTokPageInfo,
  TikTokPixel,
  TikTokPixelListResult,
  TikTokPlacement,
  TikTokPostbackWindowMode,
  TikTokReportFilter,
  TikTokReportOrderType,
  TikTokReportRow,
  TikTokSparkPullCallToAction,
  TikTokSpecialIndustry,
  TikTokTargetingLanguage,
  TikTokWebEvent,
} from "./types.js";

const DEFAULT_API_BASE_URL = "https://business-api.tiktok.com/open_api";
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * TikTok API for Business uses the v1.3 path under `/open_api` for this client.
 * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CampaignCreationApi.md
 */
export const DEFAULT_TIKTOK_API_VERSION = "v1.3";

export interface CreateTikTokAdsClientOptions {
  accessToken: string;
  advertiserId: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  fetch?: typeof fetch;
}

export interface ListAuthorizedAdvertisersInput {
  appId: string;
  secret: string;
}

export interface CreateTikTokPixelInput {
  name: string;
}

export interface CreateTikTokIdentityInput {
  displayName: string;
  imageUri: string;
}

export type CreateTikTokCampaignInput = {
  campaignName: string;
  objectiveType: Extract<TikTokCampaignObjectiveType, "TRAFFIC">;
  /**
   * Package safety policy: TikTok defaults this optional field to ENABLE, so
   * callers must choose a state explicitly.
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CampaignCreateBody.md
   */
  operationStatus: TikTokCreateOperationStatus;
} & (
  | {
      budget?: never;
      budgetMode: Extract<TikTokCampaignBudgetMode, "BUDGET_MODE_INFINITE">;
    }
  | {
      /** TikTok budgets use whole account-currency units, not minor units. */
      budget: number;
      budgetMode: Exclude<TikTokCampaignBudgetMode, "BUDGET_MODE_INFINITE">;
    }
);

export interface CreateTikTokAdInput {
  adFormat: Extract<TikTokAdFormat, "SINGLE_VIDEO">;
  adGroupId: string;
  adName: string;
  callToAction: TikTokSparkPullCallToAction;
  /**
   * Package policy for this Spark Pull-only surface. The generic TikTok creative
   * schema marks identity fields optional for other ad types.
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AdcreateCreatives.md
   */
  identityId: string;
  identityType: Extract<TikTokIdentityType, "TT_USER">;
  landingPageUrl?: string;
  /**
   * Package safety policy: TikTok defaults this optional field to ENABLE, so
   * callers must choose a state explicitly.
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AdcreateCreatives.md
   */
  operationStatus: TikTokCreateOperationStatus;
  tiktokItemId: string;
}

export interface CreateTikTokCustomAudienceInput {
  calculateType: TikTokCustomAudienceCalculateType;
  filePaths: string[];
  name: string;
}

export interface UploadTikTokCustomAudienceFileInput {
  calculateType: TikTokCustomAudienceCalculateType;
  file: Blob;
  fileName: string;
  fileSignature: string;
}

export interface CreateTikTokLookalikeAudienceInput {
  audienceSize: TikTokLookalikeAudienceSize;
  includeSource: boolean;
  locationIds: TikTokLookalikeLocationId[];
  mobileOs: TikTokLookalikeMobileOs;
  name: string;
  placements: TikTokLookalikePlacement[];
  sourceAudienceId: string;
}

export interface ListTikTokPixelsInput {
  availableForCatalogOnly?: boolean;
  code?: string;
  name?: string;
  orderBy?: "EARLIEST_CREATE" | "LATEST_CREATE";
  page?: number;
  pageSize?: number;
  pixelId?: string;
}

interface UpdateTikTokCampaignStatusBaseInput {
  campaignIds: string[];
  postbackWindowMode?: TikTokPostbackWindowMode;
}

export type UpdateTikTokCampaignStatusInput =
  | (UpdateTikTokCampaignStatusBaseInput & {
      confirmDelete: true;
      operationStatus: "DELETE";
    })
  | (UpdateTikTokCampaignStatusBaseInput & {
      confirmDelete?: never;
      operationStatus: Exclude<TikTokCampaignOperationStatus, "DELETE">;
    });

export interface TrackTikTokWebEventsInput {
  eventSourceId: string;
  events: TikTokWebEvent[];
}

export interface GetTikTokBasicReportInput {
  dataLevel: TikTokBasicReportDataLevel;
  dimensions: TikTokBasicReportDimension[];
  enableTotalMetrics?: boolean;
  endDate: string;
  filtering?: TikTokReportFilter[];
  metrics?: TikTokBasicReportMetric[];
  orderField?: TikTokBasicReportMetric;
  orderType?: TikTokReportOrderType;
  page?: number;
  pageSize?: number;
  startDate: string;
}

export interface ListTikTokCreativePortfoliosInput {
  creativePortfolioIds?: string[];
  creativePortfolioTypes?: TikTokCreativePortfolioFilterType[];
  page?: number;
  pageSize?: number;
}

export interface ListTikTokInterestCategoriesInput {
  language?: TikTokInterestCategoryLanguage;
  placements?: TikTokPlacement[];
  specialIndustries?: TikTokSpecialIndustry[];
  version?: TikTokInterestCategoryVersion;
}

export interface ListTikTokIdentitiesInput {
  identityAuthorizedBcId?: string;
  identityType?: TikTokIdentityType;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface ListTikTokCampaignsInput {
  campaignIds?: string[];
  page?: number;
  pageSize?: number;
}

export interface TikTokAdsClient {
  createAd: (input: CreateTikTokAdInput) => Promise<TikTokAdCreationResult>;
  createCampaign: (
    input: CreateTikTokCampaignInput
  ) => Promise<TikTokCampaignCreationResult>;
  createCustomAudience: (
    input: CreateTikTokCustomAudienceInput
  ) => Promise<TikTokCustomAudienceCreationResult>;
  createIdentity: (
    input: CreateTikTokIdentityInput
  ) => Promise<TikTokIdentityCreationResult>;
  createLookalikeAudience: (
    input: CreateTikTokLookalikeAudienceInput
  ) => Promise<TikTokCustomAudienceCreationResult>;
  createPixel: (input: CreateTikTokPixelInput) => Promise<TikTokPixel>;
  getBasicReport: (
    input: GetTikTokBasicReportInput
  ) => Promise<TikTokBasicReportResult>;
  getAdvertiserInfo: () => Promise<TikTokAdvertiserInfo>;
  listAuthorizedAdvertisers: (
    input: ListAuthorizedAdvertisersInput
  ) => Promise<TikTokAuthorizedAdvertiser[]>;
  listCampaigns: (
    input?: ListTikTokCampaignsInput
  ) => Promise<TikTokCampaignListResult>;
  listCreativePortfolios: (
    input?: ListTikTokCreativePortfoliosInput
  ) => Promise<TikTokCreativePortfolioListResult>;
  listIdentities: (
    input?: ListTikTokIdentitiesInput
  ) => Promise<TikTokIdentityListResult>;
  listInterestCategories: (
    input?: ListTikTokInterestCategoriesInput
  ) => Promise<TikTokInterestCategory[]>;
  listPixels: (input?: ListTikTokPixelsInput) => Promise<TikTokPixelListResult>;
  listTargetingLanguages: () => Promise<TikTokTargetingLanguage[]>;
  trackWebEvents: (input: TrackTikTokWebEventsInput) => Promise<void>;
  uploadCustomAudienceFile: (
    input: UploadTikTokCustomAudienceFileInput
  ) => Promise<TikTokCustomAudienceFileUploadResult>;
  updateCampaignStatus: (
    input: UpdateTikTokCampaignStatusInput
  ) => Promise<TikTokCampaignStatusUpdateResult>;
}

export function createTikTokAdsClient(
  options: CreateTikTokAdsClientOptions
): TikTokAdsClient {
  if (!options.accessToken.trim()) {
    throw new Error("TikTok accessToken is required.");
  }
  if (!options.advertiserId.trim()) {
    throw new Error("TikTok advertiserId is required.");
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("A fetch implementation is required.");
  }

  // oxlint-disable-next-line no-use-before-define -- The public factory intentionally precedes its private fetch implementation.
  return new FetchTikTokAdsClient(options, fetchImpl);
}

interface TikTokRequestOptions {
  body?: Record<string, unknown>;
  formData?: FormData;
  method?: "GET" | "POST";
  params?: Record<string, string | undefined>;
}

class FetchTikTokAdsClient implements TikTokAdsClient {
  private readonly accessToken: string;
  private readonly advertiserId: string;
  private readonly apiBaseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CreateTikTokAdsClientOptions, fetchImpl: typeof fetch) {
    this.accessToken = options.accessToken;
    this.advertiserId = options.advertiserId;
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.apiVersion = options.apiVersion ?? DEFAULT_TIKTOK_API_VERSION;
    this.fetchImpl = fetchImpl;
  }

  /**
   * Creates a Spark Pull ad using this package's required TT_USER identity policy.
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AdApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AdcreateCreatives.md
   */
  async createAd(input: CreateTikTokAdInput): Promise<TikTokAdCreationResult> {
    const data = await this.request("ad/create/", {
      body: {
        advertiser_id: this.advertiserId,
        adgroup_id: input.adGroupId,
        creatives: [
          {
            ad_name: input.adName,
            identity_type: input.identityType,
            identity_id: input.identityId,
            ad_format: input.adFormat,
            tiktok_item_id: input.tiktokItemId,
            call_to_action: input.callToAction,
            operation_status: input.operationStatus,
            ...(input.landingPageUrl === undefined
              ? {}
              : { landing_page_url: input.landingPageUrl }),
          },
        ],
      },
      method: "POST",
    });
    return parseAdCreationResult(data);
  }

  /**
   * Creates a Traffic campaign using this client's v1.3 campaign surface.
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CampaignCreationApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CampaignCreateBody.md
   */
  async createCampaign(
    input: CreateTikTokCampaignInput
  ): Promise<TikTokCampaignCreationResult> {
    if (
      input.budget !== undefined &&
      (!Number.isFinite(input.budget) ||
        input.budget <= 0 ||
        !Number.isInteger(input.budget))
    ) {
      throw new Error(
        "TikTok campaign budget must be a positive whole account-currency unit."
      );
    }
    const data = await this.request("campaign/create/", {
      body: {
        advertiser_id: this.advertiserId,
        objective_type: input.objectiveType,
        campaign_name: input.campaignName,
        budget_mode: input.budgetMode,
        operation_status: input.operationStatus,
        ...(input.budget === undefined ? {} : { budget: input.budget }),
      },
      method: "POST",
    });
    return parseCampaignCreationResult(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AudienceApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CustomAudienceCreateBody.md
   */
  async createCustomAudience(
    input: CreateTikTokCustomAudienceInput
  ): Promise<TikTokCustomAudienceCreationResult> {
    const data = await this.request("dmp/custom_audience/create/", {
      body: {
        advertiser_id: this.advertiserId,
        custom_audience_name: input.name,
        file_paths: input.filePaths,
        calculate_type: input.calculateType,
      },
      method: "POST",
    });
    return parseCustomAudienceCreationResult(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/yml_files/dmp_custom_audience_file_upload.yml
   */
  async uploadCustomAudienceFile(
    input: UploadTikTokCustomAudienceFileInput
  ): Promise<TikTokCustomAudienceFileUploadResult> {
    const formData = new FormData();
    formData.append("advertiser_id", this.advertiserId);
    formData.append("calculate_type", input.calculateType);
    formData.append("file", input.file, input.fileName);
    formData.append("file_name", input.fileName);
    formData.append("file_signature", input.fileSignature);

    const data = await this.request("dmp/custom_audience/file/upload/", {
      formData,
      method: "POST",
    });
    return parseCustomAudienceFileUploadResult(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AudienceApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/DmpcustomAudiencelookalikecreateLookalikeSpec.md
   */
  async createLookalikeAudience(
    input: CreateTikTokLookalikeAudienceInput
  ): Promise<TikTokCustomAudienceCreationResult> {
    const data = await this.request("dmp/custom_audience/lookalike/create/", {
      body: {
        advertiser_id: this.advertiserId,
        custom_audience_name: input.name,
        lookalike_spec: {
          source_audience_id: input.sourceAudienceId,
          include_source: input.includeSource,
          mobile_os: input.mobileOs,
          placements: input.placements,
          location_ids: input.locationIds,
          audience_size: input.audienceSize,
        },
      },
      method: "POST",
    });
    return parseCustomAudienceCreationResult(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/IdentityApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/IdentityCreateBody.md
   */
  async createIdentity(
    input: CreateTikTokIdentityInput
  ): Promise<TikTokIdentityCreationResult> {
    const data = await this.request("identity/create/", {
      body: {
        advertiser_id: this.advertiserId,
        display_name: input.displayName,
        image_uri: input.imageUri,
      },
      method: "POST",
    });
    return parseIdentityCreationResult(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/ReportingApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/FilteringReportIntegratedGet.md
   */
  async getBasicReport(
    input: GetTikTokBasicReportInput
  ): Promise<TikTokBasicReportResult> {
    const filtering = input.filtering?.map((filter) => ({
      field_name: filter.fieldName,
      filter_type: filter.filterType,
      filter_value: filter.filterValue,
    }));
    const data = await this.request("report/integrated/get/", {
      params: {
        advertiser_id: this.advertiserId,
        data_level: input.dataLevel,
        dimensions: JSON.stringify(input.dimensions),
        enable_total_metrics:
          input.enableTotalMetrics === undefined
            ? undefined
            : String(input.enableTotalMetrics),
        end_date: input.endDate,
        filtering:
          filtering === undefined ? undefined : JSON.stringify(filtering),
        metrics:
          input.metrics === undefined
            ? undefined
            : JSON.stringify(input.metrics),
        order_field: input.orderField,
        order_type: input.orderType,
        page: input.page === undefined ? undefined : String(input.page),
        page_size:
          input.pageSize === undefined ? undefined : String(input.pageSize),
        report_type: "BASIC",
        start_date: input.startDate,
      },
    });
    return parseBasicReport(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AccountManagementApi.md
   */
  async getAdvertiserInfo(): Promise<TikTokAdvertiserInfo> {
    const data = await this.request("advertiser/info/", {
      params: {
        advertiser_ids: JSON.stringify([this.advertiserId]),
        fields: JSON.stringify(["advertiser_id", "name"]),
      },
    });
    return parseAdvertiserInfo(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AuthenticationApi.md
   */
  async listAuthorizedAdvertisers(
    input: ListAuthorizedAdvertisersInput
  ): Promise<TikTokAuthorizedAdvertiser[]> {
    const data = await this.request("oauth2/advertiser/get/", {
      params: { app_id: input.appId, secret: input.secret },
    });
    return parseAuthorizedAdvertisers(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CampaignCreationApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/FilteringCampaignGet.md
   */
  async listCampaigns(
    input: ListTikTokCampaignsInput = {}
  ): Promise<TikTokCampaignListResult> {
    const data = await this.request("campaign/get/", {
      params: {
        advertiser_id: this.advertiserId,
        fields: JSON.stringify([
          "advertiser_id",
          "campaign_id",
          "campaign_name",
        ]),
        filtering:
          input.campaignIds === undefined
            ? undefined
            : JSON.stringify({ campaign_ids: input.campaignIds }),
        page: input.page === undefined ? undefined : String(input.page),
        page_size:
          input.pageSize === undefined ? undefined : String(input.pageSize),
      },
    });
    return parseCampaignList(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CreativeManagementApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/FilteringCreativePortfolioList.md
   */
  async listCreativePortfolios(
    input: ListTikTokCreativePortfoliosInput = {}
  ): Promise<TikTokCreativePortfolioListResult> {
    const filtering =
      input.creativePortfolioIds === undefined &&
      input.creativePortfolioTypes === undefined
        ? undefined
        : JSON.stringify({
            ...(input.creativePortfolioTypes === undefined
              ? {}
              : { creative_portfolio_types: input.creativePortfolioTypes }),
            ...(input.creativePortfolioIds === undefined
              ? {}
              : { creative_portfolio_ids: input.creativePortfolioIds }),
          });
    const data = await this.request("creative/portfolio/list/", {
      params: {
        advertiser_id: this.advertiserId,
        filtering,
        page: input.page === undefined ? undefined : String(input.page),
        page_size:
          input.pageSize === undefined ? undefined : String(input.pageSize),
      },
    });
    return parseCreativePortfolioList(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/IdentityApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/IdentityList.md
   */
  async listIdentities(
    input: ListTikTokIdentitiesInput = {}
  ): Promise<TikTokIdentityListResult> {
    const data = await this.request("identity/get/", {
      params: {
        advertiser_id: this.advertiserId,
        identity_type: input.identityType,
        identity_authorized_bc_id: input.identityAuthorizedBcId,
        filtering:
          input.keyword === undefined
            ? undefined
            : JSON.stringify({ keyword: input.keyword }),
        page: input.page === undefined ? undefined : String(input.page),
        page_size:
          input.pageSize === undefined ? undefined : String(input.pageSize),
      },
    });
    return parseIdentityList(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/ToolApi.md
   */
  async listInterestCategories(
    input: ListTikTokInterestCategoriesInput = {}
  ): Promise<TikTokInterestCategory[]> {
    const data = await this.request("tool/interest_category/", {
      params: {
        advertiser_id: this.advertiserId,
        version:
          input.version === undefined ? undefined : String(input.version),
        language: input.language,
        placements:
          input.placements === undefined
            ? undefined
            : JSON.stringify(input.placements),
        special_industries:
          input.specialIndustries === undefined
            ? undefined
            : JSON.stringify(input.specialIndustries),
      },
    });
    return parseInterestCategories(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/MeasurementApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/PixelCreateBody.md
   */
  async createPixel(input: CreateTikTokPixelInput): Promise<TikTokPixel> {
    const data = await this.request("pixel/create/", {
      body: {
        advertiser_id: this.advertiserId,
        pixel_name: input.name,
      },
      method: "POST",
    });
    return parsePixel(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/MeasurementApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/FilteringPixelList.md
   */
  async listPixels(
    input: ListTikTokPixelsInput = {}
  ): Promise<TikTokPixelListResult> {
    const data = await this.request("pixel/list/", {
      params: {
        advertiser_id: this.advertiserId,
        code: input.code,
        filtering:
          input.availableForCatalogOnly === undefined
            ? undefined
            : JSON.stringify({
                available_for_catalog_only: input.availableForCatalogOnly,
              }),
        name: input.name,
        order_by: input.orderBy,
        page: input.page === undefined ? undefined : String(input.page),
        page_size:
          input.pageSize === undefined ? undefined : String(input.pageSize),
        pixel_id: input.pixelId,
      },
    });
    return parsePixelList(data);
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/ToolApi.md
   */
  async listTargetingLanguages(): Promise<TikTokTargetingLanguage[]> {
    const data = await this.request("tool/language/", {
      params: { advertiser_id: this.advertiserId },
    });
    return parseTargetingLanguages(data);
  }

  /**
   * The portal documentation for this event surface is login-gated and the
   * accessible SDK does not model Events API 2.0, so no external citation is
   * asserted here.
   */
  async trackWebEvents(input: TrackTikTokWebEventsInput): Promise<void> {
    if (input.events.length > 1000) {
      throw new Error(
        "TikTok event tracking supports at most 1,000 events per request."
      );
    }
    for (const event of input.events) {
      assertWebEventUserHashes(event.user);
    }

    const data = await this.request("event/track/", {
      body: {
        data: input.events,
        event_source: "web",
        event_source_id: input.eventSourceId,
      },
      method: "POST",
    });
    if (!isRecord(data) || Array.isArray(data)) {
      throw new Error("TikTok event tracking returned invalid response data.");
    }
  }

  /**
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CampaignCreationApi.md
   * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/CampaignStatusUpdateBody.md
   */
  async updateCampaignStatus(
    input: UpdateTikTokCampaignStatusInput
  ): Promise<TikTokCampaignStatusUpdateResult> {
    if (input.operationStatus === "DELETE" && input.confirmDelete !== true) {
      throw new Error("TikTok campaign deletion requires confirmDelete: true.");
    }
    if (input.campaignIds.length < 1 || input.campaignIds.length > 20) {
      throw new Error(
        "TikTok campaign status updates require 1 to 20 campaign IDs."
      );
    }
    const data = await this.request("campaign/status/update/", {
      body: {
        advertiser_id: this.advertiserId,
        campaign_ids: input.campaignIds,
        operation_status: input.operationStatus,
        ...(input.postbackWindowMode === undefined
          ? {}
          : { postback_window_mode: input.postbackWindowMode }),
      },
      method: "POST",
    });
    return parseCampaignStatusUpdateResult(data);
  }

  private async request(
    endpoint: string,
    options: TikTokRequestOptions = {}
  ): Promise<unknown> {
    const method = options.method ?? "GET";
    const isWrite = method === "POST";
    const requestBody =
      options.body === undefined
        ? options.formData
        : JSON.stringify(options.body);
    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(endpoint, options), {
        ...(requestBody === undefined ? {} : { body: requestBody }),
        headers: {
          "Access-Token": this.accessToken,
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        method,
      });
    } catch (error) {
      if (isWrite) {
        throw new TikTokAdsAmbiguousWriteError({
          cause: error,
          method,
          path: endpoint,
        });
      }
      throw error;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (isWrite) {
        throw new TikTokAdsAmbiguousWriteError({
          cause: error,
          method,
          path: endpoint,
          status: response.status,
        });
      }
      throw new Error(
        `TikTok returned malformed JSON for ${method} ${endpoint}.`,
        {
          cause: error,
        }
      );
    }

    if (isWrite && isRetryableTikTokStatus(response.status)) {
      throw new TikTokAdsAmbiguousWriteError({
        method,
        path: endpoint,
        providerRequestId: isTikTokApiResponse(body)
          ? body.request_id
          : undefined,
        status: response.status,
      });
    }

    if (!isTikTokApiResponse(body)) {
      throw new Error(
        `TikTok returned an invalid response envelope for ${method} ${endpoint}.`
      );
    }
    if (body.code !== 0 || !response.ok) {
      throw new TikTokAdsApiError(response.status, body);
    }

    return body.data;
  }

  private buildUrl(endpoint: string, options: TikTokRequestOptions): URL {
    const url = new URL(
      `${this.apiBaseUrl}/${this.apiVersion}/${endpoint.replace(/^\/+/u, "")}`
    );
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    return url;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertWebEventUserHashes(user: TikTokWebEvent["user"]): void {
  if (user === undefined) {
    return;
  }
  assertHashedIdentifier(user.email, "email");
  assertHashedIdentifier(user.external_id, "external_id");
  assertHashedIdentifier(user.phone, "phone");
}

function assertHashedIdentifier(
  value: string | string[] | undefined,
  field: "email" | "external_id" | "phone"
): void {
  if (value === undefined) {
    return;
  }
  const values = Array.isArray(value) ? value : [value];
  for (const identifier of values) {
    if (!SHA256_HEX_PATTERN.test(identifier)) {
      throw new Error(
        `TikTok web event user.${field} must be a lowercase SHA-256 hex digest.`
      );
    }
  }
}

function isTikTokApiResponse(value: unknown): value is TikTokApiErrorBody {
  return (
    isRecord(value) &&
    typeof value.code === "number" &&
    typeof value.message === "string" &&
    (value.request_id === undefined || typeof value.request_id === "string")
  );
}

function isRetryableTikTokStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseAuthorizedAdvertisers(
  value: unknown
): TikTokAuthorizedAdvertiser[] {
  if (!isRecord(value) || !Array.isArray(value.list)) {
    throw new Error(
      "TikTok authorized advertiser listing returned no advertiser list."
    );
  }

  const advertisers: TikTokAuthorizedAdvertiser[] = [];
  for (const advertiser of value.list) {
    if (
      !isRecord(advertiser) ||
      typeof advertiser.advertiser_id !== "string" ||
      typeof advertiser.advertiser_name !== "string"
    ) {
      throw new Error(
        "TikTok authorized advertiser listing returned an invalid advertiser."
      );
    }
    advertisers.push({
      advertiser_id: advertiser.advertiser_id,
      advertiser_name: advertiser.advertiser_name,
    });
  }
  return advertisers;
}

function parseAdCreationResult(value: unknown): TikTokAdCreationResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.ad_ids) ||
    value.ad_ids.length !== 1 ||
    typeof value.ad_ids[0] !== "string"
  ) {
    throw new Error("TikTok ad creation returned an invalid result.");
  }
  return { ad_ids: [value.ad_ids[0]] };
}

function parseAdvertiserInfo(value: unknown): TikTokAdvertiserInfo {
  if (
    !isRecord(value) ||
    !Array.isArray(value.list) ||
    value.list.length !== 1
  ) {
    throw new Error(
      "TikTok advertiser information returned an invalid advertiser."
    );
  }
  const [advertiser] = value.list;
  if (
    !isRecord(advertiser) ||
    typeof advertiser.advertiser_id !== "string" ||
    typeof advertiser.name !== "string"
  ) {
    throw new Error(
      "TikTok advertiser information returned an invalid advertiser."
    );
  }
  return { advertiser_id: advertiser.advertiser_id, name: advertiser.name };
}

function parseCreativePortfolio(value: unknown): TikTokCreativePortfolio {
  if (
    !isRecord(value) ||
    typeof value.creative_portfolio_id !== "string" ||
    typeof value.creative_portfolio_preview_url !== "string" ||
    !isCreativePortfolioType(value.creative_portfolio_type)
  ) {
    throw new Error(
      "TikTok creative portfolio listing returned an invalid portfolio."
    );
  }
  return {
    creative_portfolio_id: value.creative_portfolio_id,
    creative_portfolio_preview_url: value.creative_portfolio_preview_url,
    creative_portfolio_type: value.creative_portfolio_type,
  };
}

function parseCreativePortfolioList(
  value: unknown
): TikTokCreativePortfolioListResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.creative_portfolios) ||
    !isTikTokPageInfo(value.page_info)
  ) {
    throw new Error(
      "TikTok creative portfolio listing returned an invalid portfolio list."
    );
  }
  return {
    pageInfo: value.page_info,
    portfolios: value.creative_portfolios.map(parseCreativePortfolio),
  };
}

function isCreativePortfolioType(
  value: unknown
): value is TikTokCreativePortfolio["creative_portfolio_type"] {
  return TIKTOK_CREATIVE_PORTFOLIO_TYPES.some((type) => type === value);
}

function parseIdentityCreationResult(
  value: unknown
): TikTokIdentityCreationResult {
  if (!isRecord(value) || typeof value.identity_id !== "string") {
    throw new Error("TikTok identity creation returned an invalid identity.");
  }
  return { identity_id: value.identity_id };
}

function parseIdentity(value: unknown): TikTokIdentity {
  if (
    !isRecord(value) ||
    typeof value.display_name !== "string" ||
    typeof value.identity_id !== "string" ||
    !isIdentityType(value.identity_type) ||
    typeof value.profile_image !== "string"
  ) {
    throw new Error("TikTok identity listing returned an invalid identity.");
  }
  return {
    display_name: value.display_name,
    identity_id: value.identity_id,
    identity_type: value.identity_type,
    profile_image: value.profile_image,
  };
}

function parseIdentityList(value: unknown): TikTokIdentityListResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.identity_list) ||
    !isTikTokPageInfo(value.page_info)
  ) {
    throw new Error("TikTok identity listing returned an invalid list.");
  }
  return {
    identities: value.identity_list.map(parseIdentity),
    pageInfo: value.page_info,
  };
}

function isIdentityType(value: unknown): value is TikTokIdentityType {
  return TIKTOK_IDENTITY_TYPES.some((type) => type === value);
}

function parseInterestCategory(value: unknown): TikTokInterestCategory {
  if (
    !isRecord(value) ||
    typeof value.interest_category_id !== "string" ||
    typeof value.interest_category_name !== "string" ||
    typeof value.level !== "number" ||
    !Array.isArray(value.placements) ||
    !value.placements.every(isPlacement) ||
    !Array.isArray(value.special_industries) ||
    !value.special_industries.every(isSpecialIndustry) ||
    !Array.isArray(value.sub_category_ids) ||
    !value.sub_category_ids.every((id) => typeof id === "string")
  ) {
    throw new Error(
      "TikTok interest category listing returned an invalid category."
    );
  }
  return {
    interest_category_id: value.interest_category_id,
    interest_category_name: value.interest_category_name,
    level: value.level,
    placements: value.placements,
    special_industries: value.special_industries,
    sub_category_ids: value.sub_category_ids,
  };
}

function parseInterestCategories(value: unknown): TikTokInterestCategory[] {
  if (!isRecord(value) || !Array.isArray(value.interest_categories)) {
    throw new Error(
      "TikTok interest category listing returned no interest categories."
    );
  }
  return value.interest_categories.map(parseInterestCategory);
}

function isPlacement(value: unknown): value is TikTokPlacement {
  return TIKTOK_PLACEMENTS.some((placement) => placement === value);
}

function isSpecialIndustry(value: unknown): value is TikTokSpecialIndustry {
  return TIKTOK_SPECIAL_INDUSTRIES.some((industry) => industry === value);
}

function parseCampaignStatus(value: unknown): TikTokCampaignStatus {
  if (
    !isRecord(value) ||
    typeof value.campaign_id !== "string" ||
    (value.status !== undefined && !isCampaignOperationStatus(value.status)) ||
    (value.postback_window_mode !== undefined &&
      !isPostbackWindowMode(value.postback_window_mode))
  ) {
    throw new Error(
      "TikTok campaign status update returned an invalid result."
    );
  }
  return {
    campaign_id: value.campaign_id,
    ...(value.postback_window_mode === undefined
      ? {}
      : { postback_window_mode: value.postback_window_mode }),
    ...(value.status === undefined ? {} : { status: value.status }),
  };
}

function parseCampaign(value: unknown): TikTokCampaign {
  if (
    !isRecord(value) ||
    typeof value.advertiser_id !== "string" ||
    typeof value.campaign_id !== "string" ||
    typeof value.campaign_name !== "string"
  ) {
    throw new Error("TikTok campaign listing returned an invalid result.");
  }
  return {
    advertiser_id: value.advertiser_id,
    campaign_id: value.campaign_id,
    campaign_name: value.campaign_name,
  };
}

function parseCampaignList(value: unknown): TikTokCampaignListResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.list) ||
    !isTikTokPageInfo(value.page_info)
  ) {
    throw new Error("TikTok campaign listing returned an invalid result.");
  }
  return {
    campaigns: value.list.map(parseCampaign),
    pageInfo: value.page_info,
  };
}

function parseCampaignCreationResult(
  value: unknown
): TikTokCampaignCreationResult {
  // The accessible generated SDK defines `data` as a generic object, so the
  // client only requires the identifier it returns to callers.
  // @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/InlineResponse200.md
  if (!isRecord(value) || typeof value.campaign_id !== "string") {
    throw new Error("TikTok campaign creation returned an invalid campaign.");
  }
  return { campaign_id: value.campaign_id };
}

function parseCustomAudienceCreationResult(
  value: unknown
): TikTokCustomAudienceCreationResult {
  if (
    !isRecord(value) ||
    Array.isArray(value) ||
    typeof value.custom_audience_id !== "string"
  ) {
    throw new Error(
      "TikTok custom audience creation returned invalid response data."
    );
  }
  return { custom_audience_id: value.custom_audience_id };
}

function parseCustomAudienceFileUploadResult(
  value: unknown
): TikTokCustomAudienceFileUploadResult {
  if (!isRecord(value) || typeof value.file_path !== "string") {
    throw new Error("TikTok custom audience upload returned no file path.");
  }
  return { file_path: value.file_path };
}

function parseBasicReport(value: unknown): TikTokBasicReportResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.list) ||
    !isTikTokPageInfo(value.page_info) ||
    (value.total_metrics !== undefined && !isStringRecord(value.total_metrics))
  ) {
    throw new Error("TikTok basic report returned an invalid result.");
  }

  const list: TikTokReportRow[] = value.list.map((row) => {
    if (
      !isRecord(row) ||
      !isStringRecord(row.dimensions) ||
      !isStringRecord(row.metrics)
    ) {
      throw new Error("TikTok basic report returned an invalid result.");
    }
    return { dimensions: row.dimensions, metrics: row.metrics };
  });
  return {
    list,
    pageInfo: value.page_info,
    ...(value.total_metrics === undefined
      ? {}
      : { totalMetrics: value.total_metrics }),
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function parseCampaignStatusUpdateResult(
  value: unknown
): TikTokCampaignStatusUpdateResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.campaign_ids) ||
    !value.campaign_ids.every((id) => typeof id === "string") ||
    (value.status !== undefined && !isCampaignOperationStatus(value.status)) ||
    (value.campaign_list !== undefined && !Array.isArray(value.campaign_list))
  ) {
    throw new Error(
      "TikTok campaign status update returned an invalid result."
    );
  }
  return {
    campaign_ids: value.campaign_ids,
    ...(value.campaign_list === undefined
      ? {}
      : { campaign_list: value.campaign_list.map(parseCampaignStatus) }),
    ...(value.status === undefined ? {} : { status: value.status }),
  };
}

function isCampaignOperationStatus(
  value: unknown
): value is TikTokCampaignOperationStatus {
  return TIKTOK_CAMPAIGN_OPERATION_STATUSES.some((status) => status === value);
}

function isPostbackWindowMode(
  value: unknown
): value is TikTokPostbackWindowMode {
  return TIKTOK_POSTBACK_WINDOW_MODES.some((mode) => mode === value);
}

function parsePixel(value: unknown): TikTokPixel {
  if (
    !isRecord(value) ||
    typeof value.pixel_code !== "string" ||
    typeof value.pixel_id !== "string" ||
    typeof value.pixel_name !== "string" ||
    (value.settings !== undefined && !isRecord(value.settings))
  ) {
    throw new Error("TikTok pixel creation returned an invalid pixel.");
  }

  return {
    pixel_code: value.pixel_code,
    pixel_id: value.pixel_id,
    pixel_name: value.pixel_name,
    ...(value.settings ? { settings: value.settings } : {}),
  };
}

function parsePixelList(value: unknown): TikTokPixelListResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.pixels) ||
    !isTikTokPageInfo(value.page_info)
  ) {
    throw new Error("TikTok pixel listing returned an invalid pixel list.");
  }

  return {
    pageInfo: value.page_info,
    pixels: value.pixels.map(parsePixel),
  };
}

function parseTargetingLanguages(value: unknown): TikTokTargetingLanguage[] {
  if (!isRecord(value) || !Array.isArray(value.languages)) {
    throw new Error("TikTok targeting language listing returned no languages.");
  }

  return value.languages.map((language) => {
    if (
      !isRecord(language) ||
      typeof language.code !== "string" ||
      typeof language.name !== "string"
    ) {
      throw new Error(
        "TikTok targeting language listing returned an invalid language."
      );
    }
    return { code: language.code, name: language.name };
  });
}

function isTikTokPageInfo(value: unknown): value is TikTokPageInfo {
  return (
    isRecord(value) &&
    typeof value.page === "number" &&
    typeof value.page_size === "number" &&
    typeof value.total_number === "number" &&
    typeof value.total_page === "number"
  );
}
