export interface TikTokApiResponse<T> {
  code: number;
  data?: T;
  message: string;
  request_id?: string;
}

export type TikTokApiErrorBody = TikTokApiResponse<unknown>;

/**
 * Wire payload for exchanging an authorization code for a long-term access
 * token. The connector intentionally does not read credentials from env.
 * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/AuthenticationApi.md
 * @see https://raw.githubusercontent.com/tiktok/tiktok-business-api-sdk/f809c396520df2d7b201a9ccc5378d822b728ed3/js_sdk/docs/Oauth2AccessTokenBody.md
 */
export interface TikTokAccessTokenRequest {
  app_id: string;
  auth_code: string;
  return_advertiser_ids?: boolean;
  secret: string;
}

export interface TikTokAccessTokenResult {
  access_token: string;
  advertiser_ids: string[];
  scope: number[];
}

export type TikTokAccessTokenResponse =
  TikTokApiResponse<TikTokAccessTokenResult>;

export interface TikTokAuthorizedAdvertiser {
  advertiser_id: string;
  advertiser_name: string;
}

export interface TikTokAdvertiserInfo {
  advertiser_id: string;
  name: string;
}

export interface TikTokTargetingLanguage {
  code: string;
  name: string;
}

export const TIKTOK_INTEREST_CATEGORY_VERSIONS = [1, 2] as const;
export type TikTokInterestCategoryVersion =
  (typeof TIKTOK_INTEREST_CATEGORY_VERSIONS)[number];

export const TIKTOK_INTEREST_CATEGORY_LANGUAGES = [
  "en",
  "zh",
  "ja",
  "de",
  "es",
  "fr",
  "id",
  "it",
  "ko",
  "ru",
  "th",
  "tr",
  "vi",
  "ar",
  "pt",
  "ms",
] as const;
export type TikTokInterestCategoryLanguage =
  (typeof TIKTOK_INTEREST_CATEGORY_LANGUAGES)[number];

export const TIKTOK_SPECIAL_INDUSTRIES = [
  "HOUSING",
  "EMPLOYMENT",
  "CREDIT",
] as const;
export type TikTokSpecialIndustry = (typeof TIKTOK_SPECIAL_INDUSTRIES)[number];

export const TIKTOK_PLACEMENTS = [
  "PLACEMENT_TIKTOK",
  "PLACEMENT_PANGLE",
  "PLACEMENT_GLOBAL_APP_BUNDLE",
  "PLACEMENT_TOPBUZZ",
  "PLACEMENT_HELO",
] as const;
export type TikTokPlacement = (typeof TIKTOK_PLACEMENTS)[number];

export interface TikTokInterestCategory {
  interest_category_id: string;
  interest_category_name: string;
  level: number;
  placements: TikTokPlacement[];
  special_industries: TikTokSpecialIndustry[];
  sub_category_ids: string[];
}

export interface TikTokIdentityCreationResult {
  identity_id: string;
}

export const TIKTOK_IDENTITY_TYPES = [
  "CUSTOMIZED_USER",
  "AUTH_CODE",
  "TT_USER",
  "BC_AUTH_TT",
] as const;
export type TikTokIdentityType = (typeof TIKTOK_IDENTITY_TYPES)[number];

export interface TikTokIdentity {
  display_name: string;
  identity_id: string;
  identity_type: TikTokIdentityType;
  profile_image: string;
}

export interface TikTokIdentityListResult {
  identities: TikTokIdentity[];
  pageInfo: TikTokPageInfo;
}

export const TIKTOK_AD_FORMATS = [
  "SINGLE_IMAGE",
  "SINGLE_VIDEO",
  "LIVE_CONTENT",
  "CAROUSEL_ADS",
  "CATALOG_CAROUSEL",
] as const;
export type TikTokAdFormat = (typeof TIKTOK_AD_FORMATS)[number];

export const TIKTOK_SPARK_PULL_CALL_TO_ACTIONS = ["LEARN_MORE"] as const;
export type TikTokSparkPullCallToAction =
  (typeof TIKTOK_SPARK_PULL_CALL_TO_ACTIONS)[number];

export interface TikTokAdCreationResult {
  ad_ids: string[];
}

export const TIKTOK_CREATIVE_PORTFOLIO_TYPES = [
  "CARD",
  "WEB_INFO_CARD",
  "DOWNLOAD_CARD",
  "INVENTORY_CARD",
  "PRODUCT_CARD",
  "PRODUCT_TILE",
  "COUNTDOWN_STICKER",
  "REMINDER_COUNTDOWN_STICKER",
  "LIVE_REMINDER_COUNTDOWN_STICKER",
  "GIFTCODE_STICKER",
  "PREMIUM_BADGE",
  "GESTURE",
  "SUPER_LIKE",
] as const;
export type TikTokCreativePortfolioType =
  (typeof TIKTOK_CREATIVE_PORTFOLIO_TYPES)[number];
export type TikTokCreativePortfolioFilterType = Exclude<
  TikTokCreativePortfolioType,
  "PRODUCT_CARD" | "PRODUCT_TILE"
>;

export interface TikTokCreativePortfolio {
  creative_portfolio_id: string;
  creative_portfolio_preview_url: string;
  creative_portfolio_type: TikTokCreativePortfolioType;
}

export interface TikTokCreativePortfolioListResult {
  pageInfo: TikTokPageInfo;
  portfolios: TikTokCreativePortfolio[];
}

export const TIKTOK_CUSTOM_AUDIENCE_CALCULATE_TYPES = [
  "FIRST_SHA256",
  "FIRST_MD5",
  "EMAIL_SHA256",
  "PHONE_SHA256",
  "IDFA_SHA256",
  "IDFA_MD5",
  "GAID_SHA256",
  "GAID_MD5",
  "MULTIPLE_TYPES",
] as const;
export type TikTokCustomAudienceCalculateType =
  (typeof TIKTOK_CUSTOM_AUDIENCE_CALCULATE_TYPES)[number];

export interface TikTokCustomAudienceCreationResult {
  custom_audience_id: string;
}

export interface TikTokCustomAudienceFileUploadResult {
  file_path: string;
}

export const TIKTOK_LOOKALIKE_MOBILE_OS_VALUES = [
  "ALL",
  "IOS",
  "ANDROID",
] as const;
export type TikTokLookalikeMobileOs =
  (typeof TIKTOK_LOOKALIKE_MOBILE_OS_VALUES)[number];

export const TIKTOK_LOOKALIKE_AUDIENCE_SIZES = [
  "NARROW",
  "BALANCED",
  "BROAD",
] as const;
export type TikTokLookalikeAudienceSize =
  (typeof TIKTOK_LOOKALIKE_AUDIENCE_SIZES)[number];

export const TIKTOK_LOOKALIKE_PLACEMENTS = [
  "TikTok",
  "TopBuzz & BuzzVideo",
  "Pangle",
] as const;
export type TikTokLookalikePlacement =
  (typeof TIKTOK_LOOKALIKE_PLACEMENTS)[number];

export const TIKTOK_LOOKALIKE_LOCATION_IDS = [
  "AE",
  "AU",
  "AZ",
  "BG",
  "BO",
  "CA",
  "CY",
  "DE",
  "DZ",
  "EE",
  "EG",
  "ES",
  "FR",
  "GB",
  "HR",
  "ID",
  "IL",
  "IN",
  "IT",
  "JP",
  "KE",
  "KR",
  "LK",
  "LT",
  "LV",
  "MY",
  "PL",
  "PR",
  "PY",
  "RS",
  "RU",
  "SA",
  "SI",
  "SK",
  "TH",
  "TR",
  "TW",
  "US",
  "VN",
] as const;
export type TikTokLookalikeLocationId =
  (typeof TIKTOK_LOOKALIKE_LOCATION_IDS)[number];

export const TIKTOK_CAMPAIGN_OPERATION_STATUSES = [
  "DELETE",
  "DISABLE",
  "ENABLE",
] as const;
export type TikTokCampaignOperationStatus =
  (typeof TIKTOK_CAMPAIGN_OPERATION_STATUSES)[number];

export const TIKTOK_CREATE_OPERATION_STATUSES = ["ENABLE", "DISABLE"] as const;
export type TikTokCreateOperationStatus =
  (typeof TIKTOK_CREATE_OPERATION_STATUSES)[number];

export const TIKTOK_CAMPAIGN_OBJECTIVE_TYPES = [
  "REACH",
  "TRAFFIC",
  "VIDEO_VIEWS",
  "LEAD_GENERATION",
  "ENGAGEMENT",
  "APP_PROMOTION",
  "WEB_CONVERSIONS",
  "PRODUCT_SALES",
  "RF_REACH",
] as const;
export type TikTokCampaignObjectiveType =
  (typeof TIKTOK_CAMPAIGN_OBJECTIVE_TYPES)[number];

export const TIKTOK_CAMPAIGN_BUDGET_MODES = [
  "BUDGET_MODE_INFINITE",
  "BUDGET_MODE_TOTAL",
  "BUDGET_MODE_DAY",
  "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
] as const;
export type TikTokCampaignBudgetMode =
  (typeof TIKTOK_CAMPAIGN_BUDGET_MODES)[number];

export interface TikTokCampaignCreationResult {
  campaign_id: string;
}

export interface TikTokCampaign {
  advertiser_id: string;
  campaign_id: string;
  campaign_name: string;
}

export interface TikTokCampaignListResult {
  campaigns: TikTokCampaign[];
  pageInfo: TikTokPageInfo;
}

export const TIKTOK_POSTBACK_WINDOW_MODES = [
  "POSTBACK_WINDOW_MODE1",
  "POSTBACK_WINDOW_MODE2",
  "POSTBACK_WINDOW_MODE3",
] as const;
export type TikTokPostbackWindowMode =
  (typeof TIKTOK_POSTBACK_WINDOW_MODES)[number];

export interface TikTokCampaignStatus {
  campaign_id: string;
  postback_window_mode?: TikTokPostbackWindowMode;
  status?: TikTokCampaignOperationStatus;
}

export interface TikTokCampaignStatusUpdateResult {
  campaign_ids: string[];
  campaign_list?: TikTokCampaignStatus[];
  status?: TikTokCampaignOperationStatus;
}

export const TIKTOK_WEB_EVENT_CONTENT_TYPES = [
  "product",
  "product_group",
] as const;
export type TikTokWebEventContentType =
  (typeof TIKTOK_WEB_EVENT_CONTENT_TYPES)[number];

export const TIKTOK_WEB_EVENT_CUSTOMER_TYPES = ["new", "returning"] as const;
export type TikTokWebEventCustomerType =
  (typeof TIKTOK_WEB_EVENT_CUSTOMER_TYPES)[number];

export interface TikTokWebEventUser {
  /** Pre-normalized and SHA-256 hashed. */
  email?: string;
  /** Pre-normalized and SHA-256 hashed. */
  external_id?: string | string[];
  ip?: string;
  /** E.164-normalized, then SHA-256 hashed. */
  phone?: string | string[];
  ttclid?: string;
  ttp?: string;
  user_agent?: string;
}

export interface TikTokWebEventPage {
  referrer?: string;
  url: string;
}

export interface TikTokWebEventContent {
  brand?: string;
  content_category?: string;
  content_id?: string;
  content_name?: string;
  price?: number;
}

export interface TikTokWebEventProperties {
  content_ids?: string[];
  content_type?: TikTokWebEventContentType;
  contents?: TikTokWebEventContent[];
  currency?: string;
  customer_type?: TikTokWebEventCustomerType;
  description?: string;
  num_items?: number;
  order_id?: string;
  search_string?: string;
  shop_id?: string;
  value?: number;
}

export interface TikTokWebEvent {
  event: string;
  event_id?: string;
  event_time: number;
  limited_data_use?: boolean;
  page: TikTokWebEventPage;
  properties?: TikTokWebEventProperties;
  user?: TikTokWebEventUser;
}

export const TIKTOK_BASIC_REPORT_DATA_LEVELS = [
  "AUCTION_AD",
  "AUCTION_ADGROUP",
  "AUCTION_CAMPAIGN",
  "AUCTION_ADVERTISER",
] as const;
export type TikTokBasicReportDataLevel =
  (typeof TIKTOK_BASIC_REPORT_DATA_LEVELS)[number];

export const TIKTOK_BASIC_REPORT_DIMENSIONS = [
  "advertiser_id",
  "campaign_id",
  "adgroup_id",
  "ad_id",
  "ad_id_v2",
  "stat_time_day",
  "stat_time_hour",
  "country_code",
  "ad_type",
  "custom_event_type",
  "event_source_id",
  "page_id",
  "component_name",
  "room_id",
  "post_id",
  "image_id",
  "video_material_id",
  "minis_id",
  "search_terms",
  "search_keyword",
  "match_type",
] as const;
export type TikTokBasicReportDimension =
  (typeof TIKTOK_BASIC_REPORT_DIMENSIONS)[number];

export const TIKTOK_BASIC_REPORT_METRICS = [
  "spend",
  "billed_cost",
  "cash_spend",
  "voucher_spend",
  "cpc",
  "cpm",
  "impressions",
  "gross_impressions",
  "clicks",
  "ctr",
  "reach",
  "cost_per_1000_reached",
  "frequency",
  "conversion",
  "cost_per_conversion",
  "conversion_rate",
  "conversion_rate_v2",
  "real_time_conversion",
  "real_time_cost_per_conversion",
  "real_time_conversion_rate",
  "real_time_conversion_rate_v2",
  "result",
  "cost_per_result",
  "result_rate",
  "real_time_result",
  "real_time_cost_per_result",
  "real_time_result_rate",
  "secondary_goal_result",
  "cost_per_secondary_goal_result",
  "secondary_goal_result_rate",
] as const;
export type TikTokBasicReportMetric =
  (typeof TIKTOK_BASIC_REPORT_METRICS)[number];

export const TIKTOK_REPORT_FILTER_TYPES = [
  "IN",
  "CONTAIN_ANY_OF",
  "MATCH",
  "NOT_IN",
  "GREATER_EQUAL",
  "GREATER_THAN",
  "LOWER_EQUAL",
  "LOWER_THAN",
  "BETWEEN",
] as const;
export type TikTokReportFilterType =
  (typeof TIKTOK_REPORT_FILTER_TYPES)[number];

export const TIKTOK_REPORT_ORDER_TYPES = ["ASC", "DESC"] as const;
export type TikTokReportOrderType = (typeof TIKTOK_REPORT_ORDER_TYPES)[number];

export interface TikTokReportFilter {
  fieldName: string;
  filterType: TikTokReportFilterType;
  filterValue: string;
}

export interface TikTokReportRow {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
}

export interface TikTokBasicReportResult {
  list: TikTokReportRow[];
  pageInfo: TikTokPageInfo;
  totalMetrics?: Record<string, string>;
}

export interface TikTokPixel {
  pixel_code: string;
  pixel_id: string;
  pixel_name: string;
  settings?: Record<string, unknown>;
}

export interface TikTokPageInfo {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}

export interface TikTokPixelListResult {
  pageInfo: TikTokPageInfo;
  pixels: TikTokPixel[];
}
