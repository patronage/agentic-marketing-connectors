export interface LinkedInDate {
  day: number;
  month: number;
  year: number;
}

export type LinkedInAnalyticsPivot = "CAMPAIGN" | "CREATIVE";

export type LinkedInTimeGranularity = "ALL" | "DAILY" | "MONTHLY";

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

export interface LinkedInCampaign {
  account?: string;
  campaignGroup?: string;
  costType?: string;
  creativeSelection?: string;
  dailyBudget?: {
    amount: string;
    currencyCode: string;
  };
  id: string;
  locale?: {
    country: string;
    language: string;
  };
  name: string;
  objectiveType?: string;
  runSchedule?: {
    end?: number;
    start?: number;
  };
  status?: string;
  type?: string;
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

export interface LinkedInCreative {
  account?: string;
  campaign?: string;
  id: string;
  intendedStatus?: string;
  review?: { status?: string };
  status?: string;
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

export interface BoostLinkedInPostResult {
  campaign: LinkedInCampaign;
  creative: LinkedInCreative;
  plan: BoostLinkedInPostPlan;
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

export interface LinkedInApiErrorBody {
  code?: string;
  details?: unknown;
  message?: string;
  serviceErrorCode?: number;
  status?: number;
}
