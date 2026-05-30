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

export interface CreateAdCreativeInput {
  authorizationCategory?: string;
  instagramUserId?: string;
  name: string;
  objectId?: string;
  objectStoryId?: string;
  sourceInstagramMediaId?: string;
}

export interface CreateAdInput {
  adsetId: string;
  creativeId: string;
  name: string;
  status?: MetaCampaignStatus;
}

export interface MetaMutationIdResult {
  id: string;
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

export type CustomAudienceSubtype =
  | "APP"
  | "CUSTOM"
  | "ENGAGEMENT"
  | "LOOKALIKE"
  | "OFFLINE"
  | "WEBSITE";

export interface CreateCustomAudienceInput {
  description?: string;
  name: string;
  pixelId?: string;
  retentionDays?: number;
  rule?: Record<string, unknown>;
  subtype: CustomAudienceSubtype;
}

export interface CreateLookalikeAudienceInput {
  country: string;
  name: string;
  originAudienceId: string;
  ratio: number;
}

export type AudienceSchemaField =
  | "COUNTRY"
  | "CT"
  | "DOBD"
  | "DOBM"
  | "DOBY"
  | "EMAIL"
  | "FN"
  | "GEN"
  | "LN"
  | "PHONE"
  | "ST"
  | "ZIP";

export interface SyncAudienceUsersInput {
  data: string[][];
  schema: AudienceSchemaField[];
}

export interface SyncAudienceUsersResult {
  audience_id: string;
  num_invalid_entries: number;
  num_received: number;
}

export interface LeadForm {
  id: string;
  leads_count?: number;
  name: string;
  status?: string;
}

export interface LeadRecord {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  created_time: string;
  field_data: { name: string; values: string[] }[];
  id: string;
}

export type ConversionActionSource =
  | "app"
  | "chat"
  | "email"
  | "other"
  | "phone_call"
  | "physical_store"
  | "system_generated"
  | "website";

export interface ConversionUserData {
  client_ip_address?: string;
  client_user_agent?: string;
  country?: string;
  ct?: string;
  db?: string;
  em?: string;
  external_id?: string;
  fbc?: string;
  fbp?: string;
  fn?: string;
  ge?: string;
  ln?: string;
  ph?: string;
  st?: string;
  zp?: string;
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
  engagement_rate_ranking?: string;
  frequency?: string;
  impressions?: string;
  inline_link_click_ctr?: string;
  inline_link_clicks?: string;
  inline_post_engagement?: string;
  objective?: string;
  optimization_goal?: string;
  outbound_clicks?: ActionValue[];
  outbound_clicks_ctr?: ActionValue[];
  quality_ranking?: string;
  reach?: string;
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
