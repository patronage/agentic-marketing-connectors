export type RedditAdsApiErrorPayload = unknown;

/**
 * OAuth scopes declared by the v3 OpenAPI authorization-code security scheme.
 *
 * The quick-start guide also lists adsmeasurement:read and adsmeasurement:write,
 * which are absent from that scheme; they are intentionally not represented until
 * Reddit reconciles the two authoritative documents.
 * @see https://ads-api.reddit.com/api/v3/openapi.json
 * @see https://ads-api.reddit.com/docs/v3/guides/quick-start/authenticate
 */
export type RedditAdsOAuthScope =
  | "adsconversions"
  | "adsdatadeletion"
  | "adsedit"
  | "adsread";

export type RedditAdsOAuthDuration = "permanent" | "temporary";

export type RedditAdsOAuthScopeList = readonly [
  RedditAdsOAuthScope,
  ...RedditAdsOAuthScope[],
];

/** HTTP Basic credentials for token requests, not a client_credentials grant. */
export interface RedditAdsOAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

export interface RedditAdsOAuthAuthorizationCodeParams {
  client_id: string;
  duration: RedditAdsOAuthDuration;
  redirect_uri: string;
  response_type: "code";
  /** Comma-separated RedditAdsOAuthScope values on the wire. */
  scope: string;
  state: string;
}

export interface RedditAdsOAuthAuthorizationCodeTokenRequest {
  code: string;
  grant_type: "authorization_code";
  redirect_uri: string;
}

export interface RedditAdsOAuthRefreshTokenRequest {
  grant_type: "refresh_token";
  refresh_token: string;
}

export interface RedditAdsOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: "bearer";
}

export interface RedditAdsPagination {
  nextUrl?: string | null;
  pageIndex?: number | null;
  previousUrl?: string | null;
  totalCount?: number | null;
}

export type RedditReportBreakdown =
  | "AD_ACCOUNT_ID"
  | "AD_GROUP_ID"
  | "AD_ID"
  | "ASSET_ID"
  | "CAMPAIGN_ID"
  | "CAROUSEL_CARD"
  | "COMMUNITY"
  | "COUNTRY"
  | "DATE"
  | "DMA"
  | "GALLERY_ITEM_ID"
  | "GENDER"
  | "HOUR"
  | "INTEREST"
  | "KEYWORD"
  | "LANGUAGE"
  | "METRO"
  | "OS_TYPE"
  | "PLACEMENT"
  | "REGION";

type RedditReportCoreField =
  | "ACCOUNT_ID"
  | "AD_CREATE_TIME"
  | "AD_EFFECTIVE_STATUS"
  | "AD_GROUP_ID"
  | "AD_ID"
  | "AD_UPDATE_TIME"
  | "ADGROUP_CREATE_TIME"
  | "ADGROUP_UPDATE_TIME"
  | "AGE"
  | "BID_STRATEGY"
  | "CAMPAIGN_CREATE_TIME"
  | "CAMPAIGN_ID"
  | "CAMPAIGN_UPDATE_TIME"
  | "CLICK_ATTRIBUTION_WINDOW"
  | "CLICKS"
  | "COMMUNITY"
  | "COUNTRY"
  | "CPC"
  | "CPV"
  | "CTR"
  | "CURRENCY"
  | "DATE"
  | "DATETIME"
  | "DMA"
  | "ECPM"
  | "ENGAGED_CLICK"
  | "FREQUENCY"
  | "GALLERY_ITEM_CAPTION"
  | "GALLERY_ITEM_ID"
  | "GENDER"
  | "HOUR"
  | "IMPRESSIONS"
  | "INTEREST"
  | "KEY_CONVERSION_CLICKS"
  | "KEY_CONVERSION_ECPA"
  | "KEY_CONVERSION_RATE"
  | "KEY_CONVERSION_TOTAL_COUNT"
  | "KEY_CONVERSION_VIEWS"
  | "KEYWORD"
  | "PLACEMENT"
  | "POST_ID"
  | "PRIORITY"
  | "REACH"
  | "REDDIT_LEADS"
  | "REGION"
  | "SPEND"
  | "VIEW_ATTRIBUTION_WINDOW";

type RedditReportVideoField =
  | "COST_PER_15_SECOND_VIEW"
  | "COST_PER_3_SECOND_VIEW"
  | "COST_PER_6_SECOND_VIEW"
  | "COST_PER_COMPLETED_VIEW"
  | "VIDEO_COMPLETION_RATE"
  | "VIDEO_FULLY_VIEWABLE_IMPRESSIONS"
  | "VIDEO_PLAYS_EXPANDED"
  | "VIDEO_PLAYS_WITH_SOUND"
  | "VIDEO_STARTED"
  | "VIDEO_VIEW_RATE"
  | "VIDEO_VIEW_RATE_15_SECONDS"
  | "VIDEO_VIEW_RATE_6_SECONDS"
  | "VIDEO_VIEWABLE_IMPRESSIONS"
  | "VIDEO_VIEWABLE_WATCHED_15_SECONDS"
  | "VIDEO_VIEWABLE_WATCHED_6_SECONDS"
  | "VIDEO_WATCHED_100_PERCENT"
  | "VIDEO_WATCHED_10_SECONDS"
  | "VIDEO_WATCHED_25_PERCENT"
  | "VIDEO_WATCHED_3_SECONDS"
  | "VIDEO_WATCHED_50_PERCENT"
  | "VIDEO_WATCHED_5_SECONDS"
  | "VIDEO_WATCHED_75_PERCENT"
  | "VIDEO_WATCHED_95_PERCENT";

type RedditReportAppMeasure = "COUNT" | "CVR" | "ECPA";

type RedditReportBaseAppEvent =
  | "ADD_PAYMENT_INFO"
  | "ADD_TO_CART"
  | "APP_LAUNCH"
  | "COMPLETED_TUTORIAL"
  | "INSTALL"
  | "LEVEL_ACHIEVED"
  | "PURCHASE"
  | "SEARCH"
  | "SIGN_UP"
  | "SPEND_CREDITS"
  | "VIEW_CONTENT";

type RedditReportPartnerAppEvent =
  | "AD_CLICK"
  | "AD_VIEW"
  | "ADD_PAYMENT_INFO"
  | "ADD_TO_CART"
  | "ADD_TO_WISHLIST"
  | "APP_LAUNCH"
  | "CHECKOUT"
  | "COMPLETED_TUTORIAL"
  | "FIRST_TIME_PURCHASE"
  | "INSTALL"
  | "LEVEL_ACHIEVED"
  | "LOGIN"
  | "ONBOARD_COMPLETED"
  | "ONBOARD_STARTED"
  | "PURCHASE"
  | "RATE"
  | "REINSTALL"
  | "SEARCH"
  | "SIGN_UP"
  | "SPEND_CREDITS"
  | "START_TRIAL"
  | "SUBSCRIBE"
  | "TOTAL_INSTALL"
  | "UNLOCK_ACHIEVEMENT"
  | "VIEW_CONTENT";

type RedditReportAppField =
  | `APP_INSTALL_${RedditReportBaseAppEvent}_${RedditReportAppMeasure}`
  | "APP_INSTALL_REVENUE"
  | "APP_INSTALL_ROAS_DOUBLE"
  | "APP_INSTALL_TOTAL_CONVERSIONS"
  | `APP_INSTALL_MMP_${RedditReportPartnerAppEvent}_${RedditReportAppMeasure}`
  | "APP_INSTALL_MMP_REVENUE"
  | "APP_INSTALL_MMP_ROAS"
  | "APP_INSTALL_MMP_TOTAL_CONVERSIONS"
  | `APP_INSTALL_SKAN_${RedditReportPartnerAppEvent}_${RedditReportAppMeasure}`
  | "APP_INSTALL_SKAN_REVENUE"
  | "APP_INSTALL_SKAN_ROAS"
  | "APP_INSTALL_SKAN_TOTAL_CONVERSIONS"
  | "APP_INSTALL_SKAN_UNKNOWN_COUNT";

type RedditReportSixMeasure =
  | "AVG_VALUE"
  | "CLICKS"
  | "ECPA"
  | "TOTAL_ITEMS"
  | "TOTAL_VALUE"
  | "VIEWS";

type RedditReportCountMeasure = "CLICKS" | "ECPA" | "VIEWS";

type RedditReportConversionField =
  | `CONVERSION_${
      | "ADD_TO_CART"
      | "ADD_TO_WISHLIST"
      | "CUSTOM"
      | "PURCHASE"}_${RedditReportSixMeasure}`
  | `CONVERSION_LEAD_${
      | "AVG_VALUE"
      | "CLICKS"
      | "ECPA"
      | "TOTAL_VALUE"
      | "VIEWS"}`
  | `CONVERSION_${
      | "PAGE_VISIT"
      | "SEARCH"
      | "SIGN_UP"
      | "VIEW_CONTENT"}_${RedditReportCountMeasure}`
  | `CONVERSION_SIGNUP_${"AVG_VALUE" | "TOTAL_VALUE"}`
  | "CONVERSION_ROAS";

type RedditReportCustomEventSlot =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

type RedditReportCustomEventMeasure =
  | "AVG_VALUE"
  | "CLICKS"
  | "ECPA"
  | "ROAS"
  | "TOTAL_ITEMS"
  | "TOTAL_VALUE"
  | "VIEWS";

type RedditReportCustomEventField =
  `CONVERSION_CUSTOM_EVENT_${RedditReportCustomEventSlot}_${RedditReportCustomEventMeasure}`;

export type RedditReportField =
  | RedditReportAppField
  | RedditReportConversionField
  | RedditReportCoreField
  | RedditReportCustomEventField
  | RedditReportVideoField;

export type RedditReportMetricScalar = null | number | string;

/** Dynamic values returned for report custom columns and custom conversion events. */
export type RedditReportMetricObject = Readonly<Record<string, unknown>>;

export type RedditReportMetric = Readonly<
  Record<string, RedditReportMetricObject | RedditReportMetricScalar>
>;

/**
 * Preserves editor suggestions for documented values while allowing Reddit to add
 * response enum values without breaking list and read operations.
 */
export type RedditExtensibleEnum<T extends string> =
  | T
  | (string & Record<never, never>);

export interface RedditMe {
  email?: string | null;
  firstname?: string | null;
  id?: string;
  lastname?: string | null;
  phone?: string | null;
  reddit_user_id?: string;
  reddit_username?: string;
  type?: "MEMBER";
}

export type RedditBusinessIndustry =
  | "ADULT"
  | "ADVERTISING"
  | "ALCOHOL"
  | "AUTO"
  | "CLOTHING_AND_FASHION"
  | "CONSULTING"
  | "CONSUMER_PACKAGED_GOODS"
  | "DATING"
  | "EDUCATION"
  | "EMPLOYMENT"
  | "ENTERTAINMENT"
  | "FINANCIAL_SERVICES"
  | "GAMBLING_AND_FANTASY_SPORTS"
  | "GAMING"
  | "HEALTH_AND_BEAUTY"
  | "OTHER"
  | "POLITICS_AND_GOVERNMENT"
  | "PUBLISHING"
  | "REAL_ESTATE"
  | "RESTAURANTS_AND_FOOD"
  | "RETAIL_AND_ECOMMERCE"
  | "SPORTS"
  | "TECH_B2B"
  | "TECH_B2C"
  | "TECH_OTHER"
  | "TRAVEL";

export interface RedditBusiness {
  agency_affiliated?: boolean;
  country?: string | null;
  created_at?: string;
  creator_id?: string | null;
  id?: string;
  industry?: RedditExtensibleEnum<RedditBusinessIndustry>;
  modified_at?: string;
  name?: string;
  phone?: string | null;
  primary_contact_id?: string | null;
  website_url?: string | null;
}

export type RedditAdAccountApproval =
  | "ADMIN"
  | "BANNED"
  | "NEEDS_ID_VERIFICATION"
  | "PENDING"
  | "SUSPENDED"
  | "SUSPICIOUS"
  | "TRUSTED"
  | "VALID";

export type RedditAttributionType =
  | "ALL_CONVERSION"
  | "CLICK_THROUGH_CONVERSION"
  | "VIEW_THROUGH_CONVERSION";

export type RedditAttributionWindow = "DAY" | "MONTH" | "WEEK";

export type RedditAdAccountSuspensionReason =
  | "ADVERTISING_POLICY"
  | "BEHAVIOR"
  | "FRAUD"
  | "FRAUD_DECEPTION"
  | "FRAUD_DISPUTE"
  | "FRAUD_FINANCIAL_SCAMS"
  | "FRAUD_IMPERSONATION"
  | "FRAUD_MALWARE"
  | "FRAUD_PHISHING"
  | "FRAUD_SUSPENSION_EVASION"
  | "KYC_CHECK_FAILED"
  | "OTHER";

export type RedditPixelPartnerPreference = "DV" | "IAS" | "MODE";

export interface RedditAdAccount {
  admin_approval?: RedditExtensibleEnum<RedditAdAccountApproval>;
  app_attribution_type?: RedditExtensibleEnum<RedditAttributionType>;
  app_click_attribution_window?: RedditExtensibleEnum<RedditAttributionWindow>;
  app_view_attribution_window?: RedditExtensibleEnum<RedditAttributionWindow>;
  attribution_type?: RedditExtensibleEnum<RedditAttributionType>;
  business_id?: string;
  click_attribution_window?: RedditExtensibleEnum<RedditAttributionWindow>;
  created_at?: string;
  currency?: string;
  excluded_communities?: string[] | null;
  excluded_keywords?: string[] | null;
  id?: string;
  modified_at?: string;
  name?: string;
  pixel_partner_preferences?:
    | RedditExtensibleEnum<RedditPixelPartnerPreference>[]
    | null;
  primary_contact_member_id?: string;
  spend_cap_type?: RedditExtensibleEnum<"LIFETIME"> | null;
  suspension_reason?: RedditExtensibleEnum<RedditAdAccountSuspensionReason> | null;
  time_zone_id?: string | null;
  type?: RedditExtensibleEnum<"MANAGED" | "SELF_SERVE">;
  view_attribution_window?: RedditExtensibleEnum<RedditAttributionWindow>;
}

export type RedditConfiguredStatus =
  | "ACTIVE"
  | "ARCHIVED"
  | "DELETED"
  | "PAUSED";

export type RedditCampaignObjective =
  | "APP_INSTALLS"
  | "CATALOG_SALES"
  | "CLICKS"
  | "CONVERSIONS"
  | "IMPRESSIONS"
  | "LEAD_GENERATION"
  | "VIDEO_VIEWABLE_IMPRESSIONS";

export interface RedditCampaign {
  ad_account_id?: string;
  bid_strategy?: RedditExtensibleEnum<
    "BIDLESS" | "MAXIMIZE_VOLUME" | "TARGET_CPX"
  > | null;
  bid_type?: RedditExtensibleEnum<"CPC" | "CPM" | "CPV6"> | null;
  bid_value?: number | null;
  configured_status?: RedditExtensibleEnum<RedditConfiguredStatus>;
  created_at?: string;
  delivery_status?: string[] | null;
  effective_status?: string;
  end_time?: string | null;
  funding_instrument_id?: string | null;
  goal_type?: RedditExtensibleEnum<"DAILY_SPEND" | "LIFETIME_SPEND"> | null;
  goal_value?: number | null;
  id?: string;
  is_campaign_budget_optimization?: boolean | null;
  modified_at?: string;
  name?: string | null;
  objective?: RedditExtensibleEnum<RedditCampaignObjective>;
  optimization_goal?: string | null;
  spend_cap?: number | null;
  start_time?: string | null;
}

export interface RedditAdGroupTargeting {
  communities?: string[];
  custom_audience_ids?: string[];
  excluded_communities?: string[];
  excluded_custom_audience_ids?: string[];
  excluded_geolocations?: string[];
  excluded_keywords?: string[] | null;
  geolocations?: string[];
  interests?: string[];
  keywords?: string[] | null;
}

export interface RedditAdGroup {
  ad_account_id?: string;
  bid_strategy?: RedditExtensibleEnum<
    "BIDLESS" | "MANUAL_BIDDING" | "MAXIMIZE_VOLUME" | "TARGET_CPX"
  > | null;
  bid_type?: RedditExtensibleEnum<"CPC" | "CPM" | "CPV" | "CPV6"> | null;
  bid_value?: number | null;
  campaign_id?: string;
  configured_status?: RedditExtensibleEnum<RedditConfiguredStatus> | null;
  created_at?: string;
  delivery_status?: string[] | null;
  effective_status?: string | null;
  end_time?: string | null;
  goal_type?: RedditExtensibleEnum<"DAILY_SPEND" | "LIFETIME_SPEND"> | null;
  goal_value?: number | null;
  id?: string;
  is_campaign_budget_optimization?: boolean | null;
  modified_at?: string;
  name?: string | null;
  optimization_goal?: string | null;
  schedule?: RedditAdGroupSchedule | null;
  start_time?: string | null;
  targeting?: RedditAdGroupTargeting | null;
}

export type RedditAdGroupSchedule = Readonly<Record<string, unknown>>;

export type RedditAdEffectiveStatus =
  | "ACTIVE"
  | "AD_GROUP_PAUSED"
  | "ARCHIVED"
  | "CAMPAIGN_PAUSED"
  | "COMPLETED"
  | "DELETED"
  | "MISSING_PERMISSIONS"
  | "PAUSED"
  | "PENDING_APPROVAL"
  | "PENDING_BILLING_INFO"
  | "PENDING_ID_VERIFICATION"
  | "PROCESSING"
  | "REJECTED";

export interface RedditAd {
  ad_account_id?: string;
  ad_group_id?: string;
  campaign_id?: string;
  click_url?: string | null;
  configured_status?: RedditExtensibleEnum<RedditConfiguredStatus>;
  created_at?: string;
  effective_status?: RedditExtensibleEnum<RedditAdEffectiveStatus> | null;
  id?: string;
  modified_at?: string;
  name?: string;
  post_id?: string | null;
  post_url?: string | null;
  profile_id?: string | null;
  preview_url?: string | null;
  rejection_reason?: string | null;
  type?: RedditExtensibleEnum<"UNSPECIFIED">;
}

export type RedditPostType = "CAROUSEL" | "IMAGE" | "TEXT" | "VIDEO";
export type RedditPostSource = "ORGANIC" | "PROMOTED";

export interface RedditPostContent {
  call_to_action?: string | null;
  caption?: string | null;
  destination_url?: string | null;
  display_url?: string | null;
  media_url?: string | null;
}

export interface RedditPost {
  allow_comments?: boolean;
  body?: string;
  content?: RedditPostContent[];
  created_at?: string;
  headline?: string;
  id?: string;
  is_richtext?: boolean | null;
  post_url?: string;
  profile_id?: string | null;
  thumbnail_url?: string | null;
  type?: RedditPostType;
}

export interface RedditCommunity {
  categories?: string[];
  description?: string | null;
  icon_url?: string | null;
  id?: string;
  name?: string;
  subscriber_count?: number;
}

export interface RedditInterest {
  category?: string;
  id?: string;
  name?: string;
}

export type RedditFundingInstrumentMode =
  | "ACTIVE"
  | "ALL"
  | "INACTIVE"
  | "SELECTABLE"
  | "UPCOMING";

export type RedditFundingInstrumentCurrency =
  | "AUD"
  | "BRL"
  | "CAD"
  | "EUR"
  | "GBP"
  | "NZD"
  | "SGD"
  | "USD";

export type RedditFundingInstrumentUnservableReason =
  | "CREDIT_CARD_NOT_APPROVED"
  | "CREDIT_LINE_EXHAUSTED"
  | "DATES_OUT_OF_RANGE"
  | "NOT_ACTIVE"
  | "TEST";

export type RedditFundingInstrumentInvoiceGroupStatus =
  | "ELIGIBLE"
  | "MULTI_BILL_ENTITY_FOUND"
  | "MULTI_OPPORTUNITY_FOUND"
  | "MULTI_PAY_TERMS_FOUND"
  | "MULTI_PO_FOUND"
  | "NO_ACTIVE_CL_FOUND";

export type RedditFundingInstrumentAuthorizeStatus =
  | "APPROVED"
  | "DECLINE_RETRYABLE"
  | "DECLINE_TERMINAL"
  | "PENDING";

export interface RedditFundingInstrument {
  authorize_status?: RedditExtensibleEnum<RedditFundingInstrumentAuthorizeStatus> | null;
  billable_amount?: number;
  credit_limit?: number | null;
  currency?: RedditExtensibleEnum<RedditFundingInstrumentCurrency>;
  end_time?: string | null;
  id?: string;
  invoice_group_status?: RedditExtensibleEnum<RedditFundingInstrumentInvoiceGroupStatus> | null;
  is_servable?: boolean;
  name?: string | null;
  reasons_not_servable?: RedditExtensibleEnum<RedditFundingInstrumentUnservableReason>[];
  start_time?: string | null;
}
