export interface GraphApiError {
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  fbtrace_id?: string;
  message: string;
  type?: string;
}

export interface GraphApiResponse<T> {
  data?: T;
  error?: GraphApiError;
  paging?: {
    cursors?: {
      after?: string;
      before?: string;
    };
    next?: string;
  };
}

export type MetaAdsInsightLevel = "ad" | "adset" | "campaign";

export type MetaAdsActionAttributionWindow =
  | "1d_click"
  | "1d_ev"
  | "1d_view"
  | "7d_click"
  | "7d_view"
  | "7d_view_all_conversions"
  | "7d_view_first_conversion"
  | "28d_click"
  | "28d_view"
  | "28d_view_all_conversions"
  | "28d_view_first_conversion"
  | "dda"
  | "default"
  | "skan_click"
  | "skan_click_second_postback"
  | "skan_click_third_postback"
  | "skan_view"
  | "skan_view_second_postback"
  | "skan_view_third_postback";

export type MetaAdsInsightBreakdownPreset =
  | "action"
  | "age"
  | "age-gender"
  | "device"
  | "gender"
  | "placement"
  | "platform"
  | "region";

export type MetaCampaignStatus = "ACTIVE" | "ARCHIVED" | "PAUSED";
export type MetaCampaignObjective =
  | "OUTCOME_APP_PROMOTION"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC";

export type MetaBillingEvent = "IMPRESSIONS" | "LINK_CLICKS" | "THRUPLAY";
export type MetaOptimizationGoal =
  | "APP_INSTALLS"
  | "CONVERSIONS"
  | "IMPRESSIONS"
  | "LANDING_PAGE_VIEWS"
  | "LEAD_GENERATION"
  | "LINK_CLICKS"
  | "POST_ENGAGEMENT"
  | "REACH"
  | "THRUPLAY"
  | "VALUE";

export interface MetaTargetingSpec {
  age_max?: number;
  age_min?: number;
  custom_audiences?: { id: string }[];
  device_platforms?: ("desktop" | "mobile")[];
  excluded_custom_audiences?: { id: string }[];
  facebook_positions?: string[];
  genders?: (0 | 1 | 2)[];
  geo_locations: {
    cities?: { distance_unit?: string; key: string; radius?: number }[];
    countries?: string[];
    regions?: { key: string }[];
    zips?: { key: string }[];
  };
  instagram_positions?: string[];
  publisher_platforms?: string[];
}

/**
 * A normalized targeting description returned for an ad.
 *
 * @see https://developers.facebook.com/docs/marketing-api/reference/targeting-sentence-line/?version=v25.0
 */
export interface MetaTargetingSentenceLine {
  id: string;
  params: Record<string, unknown>;
  targetingsentencelines: unknown[];
}

export interface CreateCampaignInput {
  dailyBudget?: number;
  endTime?: string;
  name: string;
  objective: MetaCampaignObjective;
  specialAdCategories?: string[];
  startTime?: string;
  status?: MetaCampaignStatus;
}

export interface CreateAdSetInput {
  billingEvent: MetaBillingEvent;
  campaignId: string;
  dailyBudget?: number;
  destinationType?: string;
  endTime?: string;
  lifetimeBudget?: number;
  name: string;
  optimizationGoal: MetaOptimizationGoal;
  promotedObject?: Record<string, unknown>;
  startTime?: string;
  status?: MetaCampaignStatus;
  targeting: MetaTargetingSpec;
}

export interface MetaAdCreativeAssetLabel {
  name: string;
}

export type MetaAdCreativeAssetFeedFormat =
  | "AUTOMATIC_FORMAT"
  | "CAROUSEL"
  | "SINGLE_IMAGE"
  | "SINGLE_VIDEO";

export type MetaAdCreativeAuthorizationCategory =
  | "NONE"
  | "POLITICAL"
  | "POLITICAL_WITH_DIGITALLY_CREATED_MEDIA";

export interface MetaAdCreativeImageAsset {
  hash: string;
}

export interface MetaAdCreativeLinkUrlAsset {
  display_url?: string;
  website_url: string;
}

export interface MetaAdCreativeTextAsset {
  text: string;
}

export interface MetaAdCreativeVideoAsset {
  adlabels?: MetaAdCreativeAssetLabel[];
  video_id: string;
}

/**
 * Asset-feed fields are documented separately from the `adcreatives` edge.
 *
 * @see https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/asset-feed-spec
 */
export interface MetaAdCreativeAssetFeedSpec {
  ad_formats: [MetaAdCreativeAssetFeedFormat];
  asset_customization_rules?: Record<string, unknown>[];
  bodies: MetaAdCreativeTextAsset[];
  call_to_action_types?: string[];
  descriptions?: MetaAdCreativeTextAsset[];
  images?: MetaAdCreativeImageAsset[];
  link_urls: MetaAdCreativeLinkUrlAsset[];
  titles: MetaAdCreativeTextAsset[];
  videos?: MetaAdCreativeVideoAsset[];
}

export interface MetaAdCreativeObjectStorySpec {
  instagram_user_id?: string;
  link_data?: Record<string, unknown>;
  page_id: string;
  photo_data?: Record<string, unknown>;
  product_data?: Record<string, unknown>;
  template_data?: Record<string, unknown>;
  text_data?: Record<string, unknown>;
  video_data?: Record<string, unknown>;
}

export interface CreateAdCreativeInput {
  assetFeedSpec?: MetaAdCreativeAssetFeedSpec;
  authorizationCategory?: MetaAdCreativeAuthorizationCategory;
  instagramUserId?: string;
  name: string;
  objectId?: string;
  objectStoryId?: string;
  objectStorySpec?: MetaAdCreativeObjectStorySpec;
  sourceInstagramMediaId?: string;
}

export interface CreateAdInput {
  adsetId: string;
  creativeId: string;
  name: string;
  status?: MetaCampaignStatus;
}

export type MetaMediaUploadBytes = ArrayBuffer | Blob;

export interface UploadAdImageInput {
  accessToken?: string;
  appSecretProof?: string;
  bytes?: MetaMediaUploadBytes;
  filename?: string;
  sourceUrl?: string;
}

export interface UploadedAdImage {
  hash: string;
  height?: number;
  url?: string;
  url_128?: string;
  width?: number;
}

export interface UploadAdImageResult {
  images: Record<string, UploadedAdImage>;
}

export interface UploadAdVideoInput {
  accessToken?: string;
  appSecretProof?: string;
  bytes?: MetaMediaUploadBytes;
  description?: string;
  filename?: string;
  fileUrl?: string;
  title?: string;
}

export interface UploadAdVideoResult {
  id: string;
}

export type KnownMetaAdPreviewFormat =
  | "AUDIENCE_NETWORK_INSTREAM_VIDEO"
  | "AUDIENCE_NETWORK_INSTREAM_VIDEO_MOBILE"
  | "AUDIENCE_NETWORK_OUTSTREAM_VIDEO"
  | "AUDIENCE_NETWORK_REWARDED_VIDEO"
  | "DESKTOP_FEED_STANDARD"
  | "FACEBOOK_REELS_BANNER"
  | "FACEBOOK_REELS_MOBILE"
  | "FACEBOOK_STORY_DESKTOP"
  | "FACEBOOK_STORY_MOBILE"
  | "INSTREAM_VIDEO_DESKTOP"
  | "INSTREAM_VIDEO_IMAGE"
  | "INSTREAM_VIDEO_MOBILE"
  | "INSTAGRAM_REELS"
  | "INSTAGRAM_STANDARD"
  | "INSTAGRAM_STORY"
  | "INSTAGRAM_EXPLORE_CONTEXTUAL"
  | "MARKETPLACE_DESKTOP"
  | "MARKETPLACE_MOBILE"
  | "MESSENGER_MOBILE_INBOX_MEDIA"
  | "MESSENGER_MOBILE_STORY_MEDIA"
  | "MOBILE_FEED_STANDARD"
  | "MOBILE_FULLWIDTH"
  | "RIGHT_COLUMN_STANDARD"
  | "SUGGESTED_VIDEO_DESKTOP"
  | "SUGGESTED_VIDEO_MOBILE"
  | "WATCH_FEED_MOBILE";

export type MetaAdPreviewFormat =
  | KnownMetaAdPreviewFormat
  | (string & Record<never, never>);

export interface MetaAdPreview {
  body?: string;
  transformation_spec?: Record<string, unknown>;
}

export interface UpdateCampaignInput {
  campaignId: string;
  dailyBudget?: number;
  endTime?: string;
  lifetimeBudget?: number;
  startTime?: string;
  status?: MetaCampaignStatus;
}

export interface UpdateAdSetInput {
  adSetId: string;
  dailyBudget?: number;
  endTime?: string;
  lifetimeBudget?: number;
  startTime?: string;
  status?: MetaCampaignStatus;
}

export interface UpdateAdInput {
  adId: string;
  status: MetaCampaignStatus;
}

export interface MetaMutationSuccessResult {
  success: boolean;
}

export interface MetaMutationIdResult {
  id: string;
  providerRequestId?: string;
}

export interface MetaAsyncInsightsJobCreateResult {
  report_run_id: string;
}

export type MetaAsyncInsightsJobStatus =
  | "Job Completed"
  | "Job Failed"
  | "Job Not Started"
  | "Job Running"
  | "Job Skipped"
  | "Job Started";

export interface MetaAsyncInsightsJob {
  account_id?: string;
  async_percent_completion?: number;
  async_status?: MetaAsyncInsightsJobStatus;
  date_start?: string;
  date_stop?: string;
  error_code?: number;
  error_message?: string;
  error_subcode?: number;
  error_user_msg?: string;
  error_user_title?: string;
  id: string;
  time_completed?: number;
  time_ref?: number;
}

export type MetaAdAccountStatus = 1 | 2 | 3 | 7 | 8 | 9 | 100 | 101 | 201 | 202;

export interface MetaAdAccount {
  account_id: string;
  account_status: MetaAdAccountStatus;
  amount_spent?: string;
  balance?: string;
  currency: string;
  funding_source?: string;
  id: string;
  name: string;
  spend_cap?: string;
  timezone_id: number;
  timezone_name: string;
  timezone_offset_hours_utc: number;
}

export interface MetaAdAccountActivity {
  actor_id?: string;
  actor_name?: string;
  application_id?: string;
  application_name?: string;
  date_time_in_timezone?: string;
  event_time?: string;
  event_type?: string;
  extra_data?: Record<string, unknown> | string;
  object_id?: string;
  object_name?: string;
  object_type?: string;
  translated_event_type?: string;
}

export type MetaAutomatedRuleStatus =
  | "DELETED"
  | "DISABLED"
  | "ENABLED"
  | "HAS_ISSUES"
  | (string & Record<never, never>);

export interface MetaAutomatedRule {
  account_id?: string;
  created_by?: string;
  created_time?: string;
  disable_error_code?: number;
  evaluation_spec?: Record<string, unknown>;
  execution_spec?: Record<string, unknown>;
  id: string;
  name?: string;
  schedule_spec?: Record<string, unknown>;
  status?: MetaAutomatedRuleStatus;
  updated_time?: string;
}

export interface MetaAdLabel {
  id: string;
  name?: string;
}

export interface MetaAdLabelSyncResult {
  created: MetaAdLabel[];
  existing: MetaAdLabel[];
  labels: MetaAdLabel[];
}

export interface MetaAdLabelApplyResult {
  objectId: string;
  success: boolean;
}

export interface BoostPostInput {
  budget: number;
  days: number;
  instagramMediaId?: string;
  instagramUserId?: string;
  name?: string;
  pageId: string;
  platform?: "all" | "auto" | "facebook" | "instagram";
  postId?: string;
  specialAdCategories?: string[];
  status?: MetaCampaignStatus;
  targeting?: MetaTargetingSpec;
}

export interface BoostPostPlan {
  ad: CreateAdInput;
  adCreative: CreateAdCreativeInput;
  adSet: CreateAdSetInput;
  campaign: CreateCampaignInput;
}

export interface BoostPostResult {
  adId: string;
  adSetId: string;
  campaignId: string;
  creativeId: string;
  plan: BoostPostPlan;
}

export interface CustomAudienceInfo {
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  delivery_status?: { status?: string };
  description?: string;
  id: string;
  name: string;
  operation_status?: { description?: string; status?: number };
  subtype?: string;
  time_created?: string;
  time_updated?: string;
}

export type CustomAudienceSharingPermission =
  | "targeting"
  | "targeting_and_insights";

export interface CustomAudienceAdAccount {
  id: string;
}

export interface CustomAudienceSharingData {
  ad_acct_id: string;
  audience_share_status: string;
  business_id: string;
  errors: string[];
}

export interface ShareCustomAudienceResult {
  sharing_data: CustomAudienceSharingData[];
  success: boolean;
}

export type CustomAudienceSubtype =
  | "APP"
  | "CUSTOM"
  | "ENGAGEMENT"
  | "LOOKALIKE"
  | "OFFLINE"
  | "WEBSITE";

export type CustomAudienceCustomerFileSource =
  | "BOTH_USER_AND_PARTNER_PROVIDED"
  | "PARTNER_PROVIDED_ONLY"
  | "USER_PROVIDED_ONLY";

export interface CreateCustomAudienceInput {
  customerFileSource?: CustomAudienceCustomerFileSource;
  description?: string;
  name: string;
  pixelId?: string;
  retentionDays?: number;
  rule?: Record<string, unknown>;
  subtype: CustomAudienceSubtype;
}

/**
 * Meta documents `country` or `location_spec`; this package deliberately
 * supports only the country form of that choice.
 *
 * @see https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/guides/lookalike-audiences
 */
interface CreateLookalikeAudienceBaseInput {
  country: string;
  name: string;
  originAudienceId: string;
}

export type CreateLookalikeAudienceInput =
  | (CreateLookalikeAudienceBaseInput & {
      ratio: number;
      type?: never;
    })
  | (CreateLookalikeAudienceBaseInput & {
      ratio?: never;
      type: "reach" | "similarity";
    });

export type AudienceSchemaField =
  | "COUNTRY"
  | "CT"
  | "DOBD"
  | "DOBM"
  | "DOBY"
  | "EMAIL"
  | "EXTERN_ID"
  | "FI"
  | "FN"
  | "GEN"
  | "LN"
  | "LOOKALIKE_VALUE"
  | "MADID"
  | "PAGEUID"
  | "PHONE"
  | "ST"
  | "ZIP";

export type AudienceUserValue = number | string;

export type AudienceDataSourceType =
  | "UNKNOWN"
  | "FILE_IMPORTED"
  | "EVENT_BASED"
  | "SEED_BASED"
  | "THIRD_PARTY_IMPORTED"
  | "COPY_PASTE"
  | "CONTACT_IMPORTER"
  | "HOUSEHOLD_AUDIENCE";

/**
 * Meta documents `data_source` as an object and defines its type/sub_type
 * enums. The reference does not state whether `sub_type` is required; this
 * package permits its omission.
 *
 * @see https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/custom-audience/users
 */
export interface AudienceDataSource {
  sub_type?: string;
  type: AudienceDataSourceType;
}

export interface AudienceUploadSession {
  batch_seq: number;
  estimated_num_total: number;
  last_batch_flag: boolean;
  session_id: number | string;
}

export interface SyncAudienceUsersInput {
  appIds?: string[];
  data: AudienceUserValue[][];
  dataSource?: AudienceDataSource;
  igAccountIds?: string[];
  pageIds?: string[];
  schema: AudienceSchemaField[];
  session?: AudienceUploadSession;
}

export interface SyncAudienceUsersResult {
  audience_id: string;
  invalid_entry_samples?: unknown;
  num_invalid_entries: number;
  num_received: number;
  session_id?: number | string;
}

export interface LeadForm {
  id: string;
  name: string;
}

export interface LeadFieldData {
  name: string;
  values: string[];
}

export interface LeadRecord {
  ad_id?: string;
  created_time: string;
  field_data: LeadFieldData[];
  form_id: string;
  id: string;
}

/**
 * Raw `leadgen` Page webhook value.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/reference/page/?version=v25.0#leadgen
 */
export interface MetaLeadgenWebhookValue {
  ad_id?: number | string;
  adgroup_id?: number | string;
  created_time: number | string;
  form_id: number | string;
  leadgen_id: number | string;
  page_id: number | string;
}

export interface MetaLeadgenWebhookChange {
  field: "leadgen";
  value: MetaLeadgenWebhookValue;
}

export interface MetaLeadgenWebhookEntry {
  changes: MetaLeadgenWebhookChange[];
  id: string;
  time: number;
}

export interface MetaLeadgenWebhookPayload {
  entry: MetaLeadgenWebhookEntry[];
  object: "page";
}

export type ConversionActionSource =
  | "app"
  | "business_messaging"
  | "chat"
  | "email"
  | "other"
  | "phone_call"
  | "physical_store"
  | "system_generated"
  | "website";

export type ConversionHashedUserDataValue = string | string[];

export interface ConversionUserData {
  anon_id?: string;
  client_ip_address?: string;
  client_user_agent?: string;
  country?: ConversionHashedUserDataValue;
  ct?: ConversionHashedUserDataValue;
  ctwa_clid?: string;
  db?: ConversionHashedUserDataValue;
  em?: ConversionHashedUserDataValue;
  external_id?: ConversionHashedUserDataValue;
  fb_login_id?: number;
  fbc?: string;
  fbp?: string;
  fn?: ConversionHashedUserDataValue;
  ge?: ConversionHashedUserDataValue;
  ig_account_id?: string;
  ig_sid?: string;
  lead_id?: number;
  ln?: ConversionHashedUserDataValue;
  page_id?: string;
  page_scoped_user_id?: string;
  ph?: ConversionHashedUserDataValue;
  st?: ConversionHashedUserDataValue;
  subscription_id?: string;
  zp?: ConversionHashedUserDataValue;
}

export interface ConversionEvent {
  action_source: ConversionActionSource;
  custom_data?: Record<string, unknown>;
  event_id?: string;
  event_name: string;
  event_source_url?: string;
  event_time: number;
  opt_out?: boolean;
  user_data: ConversionUserData;
}

export interface SendConversionEventsInput {
  events: ConversionEvent[];
  testEventCode?: string;
}

export interface SendConversionEventsResult {
  events_received: number;
  fbtrace_id?: string;
  messages?: string[];
}

export interface LongLivedUserTokenResult {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

export interface DebugTokenData {
  app_id?: string;
  application?: string;
  data_access_expires_at?: number;
  expires_at?: number;
  is_valid?: boolean;
  scopes?: string[];
  type?: string;
  user_id?: string;
}

export interface DebugTokenResult {
  data: DebugTokenData;
}

export interface ManagedPageInfo {
  access_token?: string;
  category?: string;
  fan_count?: number;
  followers_count?: number;
  id: string;
  link?: string;
  name: string;
}

export interface ReachEstimateInput {
  billingEvent?: MetaBillingEvent;
  optimizationGoal?: MetaOptimizationGoal;
  targeting: MetaTargetingSpec;
}

export interface ReachEstimateResult {
  estimate_ready?: boolean;
  users?: number;
}

export interface ActionValue {
  action_type: string;
  value: string;
}

export interface MetaAdsInsight {
  account_id?: string;
  action_values?: ActionValue[];
  actions?: ActionValue[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  age?: string;
  campaign_id?: string;
  campaign_name?: string;
  clicks?: string;
  conversion_rate_ranking?: string;
  cost_per_action_type?: ActionValue[];
  cost_per_inline_link_click?: string;
  cost_per_inline_post_engagement?: string;
  cost_per_outbound_click?: ActionValue[];
  cost_per_thruplay?: ActionValue[];
  cpc?: string;
  cpm?: string;
  cpp?: string;
  ctr?: string;
  date_start?: string;
  date_stop?: string;
  device_platform?: string;
  engagement_rate_ranking?: string;
  frequency?: string;
  gender?: string;
  impressions?: string;
  impression_device?: string;
  inline_link_click_ctr?: string;
  inline_link_clicks?: string;
  inline_post_engagement?: string;
  objective?: string;
  optimization_goal?: string;
  outbound_clicks?: ActionValue[];
  outbound_clicks_ctr?: ActionValue[];
  platform_position?: string;
  publisher_platform?: string;
  quality_ranking?: string;
  reach?: string;
  region?: string;
  spend?: string;
  unique_actions?: ActionValue[];
  unique_clicks?: string;
  unique_ctr?: string;
  video_30_sec_watched_actions?: ActionValue[];
  video_avg_time_watched_actions?: ActionValue[];
  video_continuous_2_sec_watched_actions?: ActionValue[];
  video_p100_watched_actions?: ActionValue[];
  video_p25_watched_actions?: ActionValue[];
  video_p50_watched_actions?: ActionValue[];
  video_p75_watched_actions?: ActionValue[];
  video_p95_watched_actions?: ActionValue[];
  video_play_actions?: ActionValue[];
  video_thruplay_watched_actions?: ActionValue[];
  website_purchase_roas?: ActionValue[];
}

export interface CampaignSummary {
  id: string;
  name: string;
}

export interface AdLibraryResult {
  ad_creation_time: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url: string;
  bylines?: string;
  currency?: string;
  estimated_audience_size?: { lower_bound: number; upper_bound: number };
  id: string;
  impressions?: { lower_bound: number; upper_bound: number };
  languages?: string[];
  page_id: string;
  page_name: string;
  publisher_platforms?: string[];
  spend?: { lower_bound: number; upper_bound: number };
}

export interface AdvertiserSummary {
  activeAds: number;
  latestAd?: string;
  name: string;
  platforms: string[];
  spendRange?: { lower_bound: number; upper_bound: number };
  totalAds: number;
}
