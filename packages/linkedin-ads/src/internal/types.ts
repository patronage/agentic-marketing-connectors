export interface LinkedInDate {
  day: number;
  month: number;
  year: number;
}

export const LINKEDIN_AD_ACCOUNT_ROLES = [
  "VIEWER",
  "CREATIVE_MANAGER",
  "CAMPAIGN_MANAGER",
  "ACCOUNT_MANAGER",
  "ACCOUNT_BILLING_ADMIN",
] as const;

export type LinkedInAdAccountRole = (typeof LINKEDIN_AD_ACCOUNT_ROLES)[number];

export interface LinkedInAdAccountUser {
  account: string;
  changeAuditStamps?: Record<string, unknown>;
  createdAt?: number;
  lastModifiedAt?: number;
  role: LinkedInAdAccountRole;
  user: string;
  version?: { versionTag?: string };
}

export const LINKEDIN_AD_ACCOUNT_STATUSES = [
  "ACTIVE",
  "CANCELED",
  "DRAFT",
  "PENDING_DELETION",
  "REMOVED",
] as const;

export type LinkedInAdAccountStatus =
  (typeof LINKEDIN_AD_ACCOUNT_STATUSES)[number];

export const LINKEDIN_AD_ACCOUNT_TYPES = ["BUSINESS", "ENTERPRISE"] as const;

export type LinkedInAdAccountType = (typeof LINKEDIN_AD_ACCOUNT_TYPES)[number];

export const LINKEDIN_AD_ACCOUNT_SERVING_STATUSES = [
  "RUNNABLE",
  "STOPPED",
  "BILLING_HOLD",
  "ACCOUNT_TOTAL_BUDGET_HOLD",
  "ACCOUNT_END_DATE_HOLD",
  "RESTRICTED_HOLD",
  "INTERNAL_HOLD",
] as const;

export type LinkedInAdAccountServingStatus =
  (typeof LINKEDIN_AD_ACCOUNT_SERVING_STATUSES)[number];

export interface LinkedInAdAccount {
  currency: string;
  id: string;
  name: string;
  reference?: string;
  servingStatuses?: LinkedInAdAccountServingStatus[];
  status: LinkedInAdAccountStatus;
  test: boolean;
  type: LinkedInAdAccountType;
}

export interface SearchLinkedInAdAccountsInput {
  pageSize?: number;
  pageToken?: string;
  sortOrder?: "ASCENDING" | "DESCENDING";
  statuses?: LinkedInAdAccountStatus[];
  test?: boolean;
  types?: LinkedInAdAccountType[];
}

export const LINKEDIN_ANALYTICS_PIVOTS = [
  "COMPANY",
  "ACCOUNT",
  "SHARE",
  "CAMPAIGN",
  "CREATIVE",
  "CAMPAIGN_GROUP",
  "CONVERSION",
  "CONVERSATION_NODE",
  "CONVERSATION_NODE_OPTION_INDEX",
  "SERVING_LOCATION",
  "CARD_INDEX",
  "MEMBER_COMPANY_SIZE",
  "MEMBER_INDUSTRY",
  "MEMBER_SENIORITY",
  "MEMBER_JOB_TITLE",
  "MEMBER_JOB_FUNCTION",
  "MEMBER_COUNTRY_V2",
  "MEMBER_REGION_V2",
  "MEMBER_COMPANY",
  "PLACEMENT_NAME",
  "IMPRESSION_DEVICE_TYPE",
  "EVENT_STAGE",
] as const;

export type LinkedInAnalyticsPivot = (typeof LINKEDIN_ANALYTICS_PIVOTS)[number];

export const LINKEDIN_ANALYTICS_STATISTICS_PIVOTS = [
  "COMPANY",
  "ACCOUNT",
  "SHARE",
  "CAMPAIGN",
  "CREATIVE",
  "CAMPAIGN_GROUP",
  "CONVERSION",
  "CONVERSATION_NODE",
  "CONVERSATION_NODE_OPTION_INDEX",
  "SERVING_LOCATION",
  "OBJECTIVE_TYPE",
  "CARD_INDEX",
  "PLACEMENT_NAME",
  "IMPRESSION_DEVICE_TYPE",
  "EVENT_STAGE",
] as const;

export type LinkedInAnalyticsStatisticsPivot =
  (typeof LINKEDIN_ANALYTICS_STATISTICS_PIVOTS)[number];

export const LINKEDIN_TIME_GRANULARITIES = [
  "ALL",
  "DAILY",
  "MONTHLY",
  "YEARLY",
] as const;

export type LinkedInTimeGranularity =
  (typeof LINKEDIN_TIME_GRANULARITIES)[number];

export interface LinkedInAnalyticsElement {
  actionClicks?: number;
  approximateUniqueImpressions?: number;
  clicks?: number;
  comments?: number;
  companyPageClicks?: number;
  costInLocalCurrency?: string;
  dateRange?: {
    end?: LinkedInDate;
    start?: LinkedInDate;
  };
  externalWebsiteConversions?: number;
  follows?: number;
  impressions?: number;
  landingPageClicks?: number;
  leadGenerationMailContactInfoShares?: number;
  likes?: number;
  oneClickLeadFormOpens?: number;
  oneClickLeads?: number;
  opens?: number;
  pivotValues?: string[];
  reactions?: number;
  shares?: number;
  totalEngagements?: number;
  videoCompletions?: number;
  videoFirstQuartileCompletions?: number;
  videoMidpointCompletions?: number;
  videoStarts?: number;
  videoThirdQuartileCompletions?: number;
  viralClicks?: number;
  viralImpressions?: number;
}

export const LINKEDIN_CAMPAIGN_READ_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
  "COMPLETED",
  "CANCELED",
  "DRAFT",
  "PENDING_DELETION",
  "REMOVED",
] as const;

export type LinkedInCampaignReadStatus =
  (typeof LINKEDIN_CAMPAIGN_READ_STATUSES)[number];

export const LINKEDIN_CAMPAIGN_PACING_STRATEGIES = [
  "LIFETIME",
  "ACCELERATED",
] as const;

export type LinkedInCampaignPacingStrategy =
  (typeof LINKEDIN_CAMPAIGN_PACING_STRATEGIES)[number];

export const LINKEDIN_CAMPAIGN_SERVING_STATUSES = [
  "RUNNABLE",
  "STOPPED",
  "ACCOUNT_TOTAL_BUDGET_HOLD",
  "ACCOUNT_END_DATE_HOLD",
  "CAMPAIGN_START_DATE_HOLD",
  "CAMPAIGN_END_DATE_HOLD",
  "CAMPAIGN_TOTAL_BUDGET_HOLD",
  "CAMPAIGN_AUDIENCE_COUNT_HOLD",
  "CAMPAIGN_GROUP_START_DATE_HOLD",
  "CAMPAIGN_GROUP_END_DATE_HOLD",
  "CAMPAIGN_GROUP_TOTAL_BUDGET_HOLD",
  "CAMPAIGN_GROUP_STATUS_HOLD",
  "ACCOUNT_SERVING_HOLD",
] as const;

export type LinkedInCampaignServingStatus =
  (typeof LINKEDIN_CAMPAIGN_SERVING_STATUSES)[number];

export const LINKEDIN_CAMPAIGN_GROUP_READ_STATUSES = [
  "ACTIVE",
  "ARCHIVED",
  "CANCELED",
  "CANCELLED",
  "DRAFT",
  "PAUSED",
  "PENDING_DELETION",
  "REMOVED",
] as const;

export type LinkedInCampaignGroupReadStatus =
  (typeof LINKEDIN_CAMPAIGN_GROUP_READ_STATUSES)[number];

export const LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUSES = [
  "RUNNABLE",
  "STOPPED",
  "BILLING_HOLD",
  "ACCOUNT_TOTAL_BUDGET_HOLD",
  "ACCOUNT_END_DATE_HOLD",
  "CAMPAIGN_GROUP_TOTAL_BUDGET_HOLD",
  "CAMPAIGN_GROUP_START_DATE_HOLD",
  "CAMPAIGN_GROUP_END_DATE_HOLD",
] as const;

export type LinkedInCampaignGroupServingStatus =
  (typeof LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUSES)[number];

export interface LinkedInCampaign {
  account?: string;
  campaignGroup?: string;
  costType?: string;
  creativeSelection?: string;
  dailyBudget?: LinkedInMoney;
  id: string;
  locale?: {
    country: string;
    language: string;
  };
  name: string;
  objectiveType?: string;
  pacingStrategy?: LinkedInCampaignPacingStrategy;
  runSchedule?: { end?: number; start: number };
  servingStatuses?: LinkedInCampaignServingStatus[];
  status?: LinkedInCampaignReadStatus;
  totalBudget?: LinkedInMoney;
  type?: string;
  unitCost?: { amount: string; currencyCode?: string };
}

export interface LinkedInCampaignGroup {
  account?: string;
  backfilled?: boolean;
  id: string;
  name: string;
  runSchedule?: { end?: number; start: number };
  servingStatuses?: LinkedInCampaignGroupServingStatus[];
  status?: LinkedInCampaignGroupReadStatus;
  test?: boolean;
  totalBudget?: LinkedInMoney;
}

export interface LinkedInCampaignConversionAssociation {
  associatedAt: number;
  campaign: string;
  conversion: string;
}

export const LINKEDIN_CONVERSION_ATTRIBUTION_TYPES = [
  "LAST_TOUCH_BY_CAMPAIGN",
  "LAST_TOUCH_BY_CONVERSION",
] as const;

export type LinkedInConversionAttributionType =
  (typeof LINKEDIN_CONVERSION_ATTRIBUTION_TYPES)[number];

export const LINKEDIN_CONVERSION_TYPES = [
  "ADD_TO_CART",
  "DOWNLOAD",
  "INSTALL",
  "KEY_PAGE_VIEW",
  "LEAD",
  "PURCHASE",
  "SIGN_UP",
  "OTHER",
  "SAVE",
  "START_CHECKOUT",
  "SCHEDULE",
  "VIEW_CONTENT",
  "VIEW_VIDEO",
  "ADD_BILLING_INFO",
  "BOOK_APPOINTMENT",
  "REQUEST_QUOTE",
  "SEARCH",
  "SUBSCRIBE",
  "AD_CLICK",
  "AD_VIEW",
  "COMPLETE_SIGNUP",
  "SUBMIT_APPLICATION",
  "PHONE_CALL",
  "INVITE",
  "LOGIN",
  "SHARE",
  "DONATE",
  "ADD_TO_LIST",
  "START_TRIAL",
  "OUTBOUND_CLICK",
  "CONTACT",
  "QUALIFIED_LEAD",
] as const;

export type LinkedInConversionType = (typeof LINKEDIN_CONVERSION_TYPES)[number];

export interface LinkedInConversion {
  account: string;
  attributionType: LinkedInConversionAttributionType;
  enabled: boolean;
  id: string;
  name: string;
  type: LinkedInConversionType;
}

export interface GetLinkedInCampaignConversionInput {
  campaign: string;
  conversion: string;
}

export interface CreateLinkedInCampaignGroupInput {
  name: string;
  runSchedule?: { end?: number; start: number };
  status?: LinkedInCampaignStatus;
}

export type LinkedInCampaignStatus =
  | "ACTIVE"
  | "ARCHIVED"
  | "CANCELED"
  | "COMPLETED"
  | "DRAFT"
  | "PAUSED";

export interface LinkedInMoney {
  amount: string;
  currencyCode: string;
}

export interface LinkedInTargetingCriteria {
  excludedTargetingFacets?: Record<string, string[]>;
  includedTargetingFacets?: Record<string, string[]>;
}

export interface CreateLinkedInCampaignInput {
  account?: string;
  associatedEntity?: string;
  audienceExpansionEnabled?: boolean;
  campaignGroup: string;
  costType?: string;
  creativeSelection?: string;
  dailyBudget?: LinkedInMoney;
  locale?: { country: string; language: string };
  name: string;
  objectiveType?: string;
  offsiteDeliveryEnabled?: boolean;
  optimizationTargetType?: string;
  runSchedule?: { end?: number; start: number };
  status?: LinkedInCampaignStatus;
  targetingCriteria?: LinkedInTargetingCriteria;
  totalBudget?: LinkedInMoney;
  type?: string;
  unitCost?: LinkedInMoney;
}

export interface UpdateLinkedInCampaignInput {
  dailyBudget?: LinkedInMoney;
  name?: string;
  runSchedule?: { end?: number; start?: number };
  status?: LinkedInCampaignStatus;
  totalBudget?: LinkedInMoney;
}

export const LINKEDIN_CREATIVE_INTENDED_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "DRAFT",
  "ARCHIVED",
  "CANCELED",
  "PENDING_DELETION",
  "REMOVED",
] as const;

export type LinkedInCreativeIntendedStatus =
  (typeof LINKEDIN_CREATIVE_INTENDED_STATUSES)[number];

export const LINKEDIN_CREATIVE_REVIEW_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_REVIEW",
] as const;

export type LinkedInCreativeReviewStatus =
  (typeof LINKEDIN_CREATIVE_REVIEW_STATUSES)[number];

export const LINKEDIN_CREATIVE_SERVING_HOLD_REASONS = [
  "STOPPED",
  "UNDER_REVIEW",
  "REJECTED",
  "FORM_HOLD",
  "PROCESSING",
  "PROCESSING_FAILED",
  "REFERRED_CONTENT_QUALITY_HOLD",
  "JOB_POSTING_ON_HOLD",
  "JOB_POSTING_INVALID",
  "CAMPAIGN_STOPPED",
  "ACCOUNT_TOTAL_BUDGET_HOLD",
  "ACCOUNT_END_DATE_HOLD",
  "CAMPAIGN_START_DATE_HOLD",
  "CAMPAIGN_END_DATE_HOLD",
  "CAMPAIGN_TOTAL_BUDGET_HOLD",
  "CAMPAIGN_AUDIENCE_COUNT_HOLD",
  "CAMPAIGN_GROUP_START_DATE_HOLD",
  "CAMPAIGN_GROUP_END_DATE_HOLD",
  "CAMPAIGN_GROUP_TOTAL_BUDGET_HOLD",
  "CAMPAIGN_GROUP_STATUS_HOLD",
  "ACCOUNT_SERVING_HOLD",
] as const;

export type LinkedInCreativeServingHoldReason =
  (typeof LINKEDIN_CREATIVE_SERVING_HOLD_REASONS)[number];

export interface LinkedInCreative {
  account?: string;
  campaign?: string;
  content?: Record<string, unknown>;
  createdAt?: number;
  createdBy?: string;
  id: string;
  intendedStatus?: LinkedInCreativeIntendedStatus;
  isServing?: boolean;
  isTest?: boolean;
  lastModifiedAt?: number;
  lastModifiedBy?: string;
  name?: string;
  review?: {
    rejectionReasons?: string[];
    status: LinkedInCreativeReviewStatus;
  };
  servingHoldReasons?: LinkedInCreativeServingHoldReason[];
  status?: string;
}

export interface ListLinkedInCreativesInput {
  campaignId: string;
  count?: number;
  start?: number;
}

export interface LinkedInImageUploadInput {
  bytes: ArrayBuffer | ArrayBufferView;
  contentType: "image/gif" | "image/jpeg" | "image/png";
}

export interface CreateLinkedInCreativeInput {
  account?: string;
  campaign: string;
  content?: { reference?: string } & Record<string, unknown>;
  intendedStatus?: string;
  reference?: string;
  status?: string;
}

export interface BoostLinkedInPostInput {
  campaignGroup: string;
  campaignName?: string;
  dailyBudget?: number;
  days?: number;
  objectiveType?: string;
  organizationUrn?: string;
  postUrn: string;
  status?: LinkedInCampaignStatus;
  targetingCriteria?: LinkedInTargetingCriteria;
  totalBudget?: number;
}

export interface BoostLinkedInPostPlan {
  campaign: CreateLinkedInCampaignInput;
  creative: CreateLinkedInCreativeInput;
}

export interface LinkedInLeadForm {
  description?: string;
  headline?: string;
  id: string;
  name: string;
  owner?: string;
  status?: string;
}

export interface CreateLinkedInLeadFormInput {
  description: string;
  headline: string;
  name: string;
  owner?: string;
  privacyPolicyUrl: string;
  questions: unknown[];
  thankYouMessage: {
    landingPageCallToAction?: string;
    landingPageUrl?: string;
    message: string;
  };
}

export interface LinkedInLeadFormResponse {
  answers?: Record<string, unknown>;
  id: string;
  submittedAt?: number | string;
}

export interface LinkedInOrganizationPost {
  commentary?: string;
  id: string;
  publishedAt?: number;
}

export interface ListLeadFormResponsesInput {
  count?: number;
  formId: string;
  start?: number;
  submittedAfter?: number;
  submittedBefore?: number;
}

export interface LinkedInPaging {
  count?: number;
  links?: unknown[];
  start?: number;
  total?: number;
}

export interface LinkedInElementsResponse<T> {
  elements?: T[];
  paging?: LinkedInPaging;
}

export interface LinkedInTargetingFacet {
  adTargetingFacetUrn: string;
  availableEntityFinders: string[];
  entityTypes: string[];
  facetName: string;
}

export interface LinkedInTargetingEntity {
  facetUrn: string;
  name: string;
  urn: string;
}

export interface LinkedInAudienceCount {
  active: number;
  total: number;
}

export interface LinkedInAudienceCountTargetingCriteria {
  exclude?: {
    or: Record<string, string[]>;
  };
  include: {
    and: {
      or: Record<string, string[]>;
    }[];
  };
}

export interface GetLinkedInAudienceCountsInput {
  targetingCriteria: LinkedInAudienceCountTargetingCriteria;
}

export interface LinkedInTargetingLocale {
  country: string;
  language: string;
}

export interface ListLinkedInTargetingEntitiesInput {
  facet: string;
  locale?: LinkedInTargetingLocale;
  totals?: boolean;
}

export interface SearchLinkedInTargetingEntitiesInput extends ListLinkedInTargetingEntitiesInput {
  entityType?: string;
  query: string;
}

export interface LinkedInApiErrorBody {
  code?: string;
  details?: unknown;
  message?: string;
  serviceErrorCode?: number;
  status?: number;
}
