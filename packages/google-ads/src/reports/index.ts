import { microsToCurrency } from "../core/index.js";
import type { GoogleAdsRow } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface CampaignMetrics {
  avgCpc: number;
  channelType: string;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  cost: number;
  ctr: number;
  dailyBudget: number;
  id: string;
  impressions: number;
  name: string;
  status: string;
}

export interface AdGroupMetrics {
  campaignId: string;
  campaignName: string;
  clicks: number;
  conversions: number;
  cost: number;
  ctr: number;
  id: string;
  impressions: number;
  name: string;
  status: string;
}

export interface DeviceMetrics extends Omit<AdGroupMetrics, "id" | "name"> {
  device: string;
}

export interface KeywordMetrics {
  adGroupId: string;
  adGroupName: string;
  avgCpc: number;
  campaignId: string;
  campaignName: string;
  clicks: number;
  conversions: number;
  cost: number;
  creativeQuality: string | null;
  criterionId: string;
  ctr: number;
  impressions: number;
  keyword: string;
  landingPageExperience: string | null;
  matchType: string;
  /**
   * True for negative keywords. `keyword_view` returns positive and negative
   * criteria together, so consumers that mutate keywords must branch on this
   * rather than assume every row is a positive keyword.
   */
  negative: boolean;
  qualityScore: number | null;
  searchImpressionShare: number | null;
  searchPredictedCtr: string | null;
  status: string;
}

export interface SearchTermMetrics {
  adGroupId: string;
  adGroupName: string;
  avgCpc: number;
  campaignId: string;
  campaignName: string;
  clicks: number;
  conversions: number;
  cost: number;
  ctr: number;
  impressions: number;
  searchTerm: string;
  status: string;
}

export interface CampaignSearchTermMetrics {
  avgCpc: number;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  campaignStatus: string;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  cost: number;
  ctr: number;
  impressions: number;
  resourceName: string;
  searchTerm: string;
}

export interface ClickDetailMetrics {
  adGroupAdResourceName: string | null;
  adGroupId: string;
  adGroupName: string;
  adGroupResourceName: string | null;
  adId: string | null;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  clicks: number;
  clickType: string;
  date: string;
  device: string;
  gclid: string | null;
  keywordMatchType: string | null;
  keywordResourceName: string | null;
  keywordText: string | null;
  networkType: string;
  pageNumber: number | null;
  resourceName: string;
  userListResourceName: string | null;
}

export interface VideoMetrics {
  averageCpv: number;
  averageVideoWatchTimeSeconds: number | null;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  clicks: number;
  conversions: number;
  cost: number;
  cpm: number;
  impressions: number;
  p25Rate: number;
  p50Rate: number;
  p75Rate: number;
  p100Rate: number;
  status: string;
  viewRate: number;
  views: number;
}

export type AudienceSegmentType = "age" | "gender" | "income";

export interface AudienceSegmentMetrics {
  adGroupId: string;
  adGroupName: string;
  adGroupResourceName: string | null;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  clicks: number;
  conversions: number;
  cost: number;
  criterionId: string | null;
  currentBidModifier: number | null;
  impressions: number;
  providerResourceName: string | null;
  segmentType: AudienceSegmentType;
  segmentValue: string;
  viewRate: number;
  views: number;
}

export interface GeographicMetrics {
  adGroupId: string;
  adGroupName: string;
  adGroupResourceName: string | null;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  clicks: number;
  conversions: number;
  cost: number;
  geoTargetCity: string | null;
  geoTargetCountry: string | null;
  geoTargetMostSpecificLocation: string | null;
  geoTargetPostalCode: string | null;
  geoTargetRegion: string | null;
  impressions: number;
  locationType: string;
  providerResourceName: string | null;
  viewRate: number;
  views: number;
}

export interface CampaignLocationCriterionMetrics {
  bidModifier: number | null;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  criterionId: string;
  geoTargetConstant: string | null;
  negative: boolean;
  providerResourceName: string | null;
  status: string;
}

export interface LocationCriterionPerformanceMetrics {
  averageCpv: number;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  clicks: number;
  conversions: number;
  cost: number;
  criterionId: string | null;
  geoTargetConstant: string | null;
  impressions: number;
  locationViewResourceName: string | null;
  providerResourceName: string | null;
  viewRate: number;
  views: number;
}

export interface ReachFrequencyMetrics {
  averageImpressionFrequencyPerUser: number | null;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  cost: number;
  impressions: number;
  status: string;
  uniqueUsers: number | null;
  uniqueUsersFivePlus: number | null;
  uniqueUsersFourPlus: number | null;
}

export interface AssetPerformanceMetrics {
  assetGroupId: string | null;
  assetGroupName: string | null;
  assetGroupResourceName: string | null;
  assetId: string | null;
  assetName: string | null;
  assetResourceName: string | null;
  assetSource: string | null;
  assetText: string | null;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  clicks: number;
  conversions: number;
  cost: number;
  fieldType: string;
  impressions: number;
  status: string;
}

export interface AssetGroupProductGroupMetrics {
  assetGroupId: string;
  assetGroupName: string;
  assetGroupResourceName: string | null;
  assetGroupStatus: string;
  avgCpc: number;
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  cost: number;
  ctr: number;
  impressions: number;
  listingGroupFilterResourceName: string | null;
  orders: number;
  resourceName: string;
  revenue: number;
  unitsSold: number;
}

export interface AssetCombinationAsset {
  assetResourceName: string | null;
  servedAssetFieldType: string | null;
}

export interface AssetCombinationMetrics {
  assetGroupId: string | null;
  assetGroupName: string | null;
  assetGroupResourceName: string | null;
  assets: AssetCombinationAsset[];
  campaignId: string;
  campaignName: string;
  campaignResourceName: string | null;
  resourceName: string | null;
}

export interface ChangeEventAuditEntry {
  adGroupResourceName: string | null;
  assetResourceName: string | null;
  campaignResourceName: string | null;
  changeDateTime: string;
  changedFields: string[];
  changedResourceName: string | null;
  clientType: string;
  newResource: Record<string, unknown> | null;
  oldResource: Record<string, unknown> | null;
  operation: string;
  resourceName: string;
  resourceType: string;
  userEmail: string | null;
}

export type ChangeEventResourceType =
  | "AD"
  | "AD_GROUP"
  | "AD_GROUP_AD"
  | "AD_GROUP_ASSET"
  | "AD_GROUP_CRITERION"
  | "ASSET"
  | "ASSET_GROUP"
  | "CAMPAIGN"
  | "CAMPAIGN_ASSET"
  | "CAMPAIGN_BUDGET"
  | "CAMPAIGN_CRITERION"
  | "CUSTOMER_ASSET";

export interface ChangeStatusAuditEntry {
  adGroupAdResourceName: string | null;
  adGroupAssetResourceName: string | null;
  adGroupBidModifierResourceName: string | null;
  adGroupCriterionResourceName: string | null;
  adGroupResourceName: string | null;
  assetGroupResourceName: string | null;
  assetSetResourceName: string | null;
  assetResourceName: string | null;
  campaignAssetSetResourceName: string | null;
  campaignAssetResourceName: string | null;
  campaignBudgetResourceName: string | null;
  campaignCriterionResourceName: string | null;
  campaignResourceName: string | null;
  campaignSharedSetResourceName: string | null;
  changedResourceName: string | null;
  combinedAudienceResourceName: string | null;
  customerAssetResourceName: string | null;
  lastChangeDateTime: string;
  resourceName: string;
  resourceStatus: string;
  resourceType: string;
  sharedSetResourceName: string | null;
}

export type ChangeStatusResourceType =
  | "AD_GROUP"
  | "AD_GROUP_AD"
  | "AD_GROUP_ASSET"
  | "AD_GROUP_BID_MODIFIER"
  | "AD_GROUP_CRITERION"
  | "ASSET"
  | "ASSET_GROUP"
  | "ASSET_SET"
  | "CAMPAIGN"
  | "CAMPAIGN_ASSET"
  | "CAMPAIGN_ASSET_SET"
  | "CAMPAIGN_BUDGET"
  | "CAMPAIGN_CRITERION"
  | "CAMPAIGN_SHARED_SET"
  | "COMBINED_AUDIENCE"
  | "CUSTOMER_ASSET"
  | "SHARED_SET";

export type PolicyApprovalStatus =
  | "APPROVED"
  | "APPROVED_LIMITED"
  | "AREA_OF_INTEREST_ONLY"
  | "DISAPPROVED"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type PolicyReviewStatus =
  | "ELIGIBLE_MAY_SERVE"
  | "REVIEWED"
  | "REVIEW_IN_PROGRESS"
  | "UNDER_APPEAL"
  | "UNKNOWN"
  | "UNSPECIFIED";

export interface PolicyTopicDiagnostic {
  constraints: Record<string, unknown>[];
  evidences: Record<string, unknown>[];
  topic: string;
  type: string;
}

export interface AdPolicyDiagnostic {
  adGroupId: string | null;
  adGroupName: string | null;
  adGroupResourceName: string | null;
  adId: string | null;
  adResourceName: string | null;
  adStatus: string;
  adType: string;
  approvalStatus: string;
  campaignId: string | null;
  campaignName: string | null;
  campaignResourceName: string | null;
  policyTopics: PolicyTopicDiagnostic[];
  primaryStatus: string;
  primaryStatusReasons: string[];
  resourceName: string;
  reviewStatus: string;
}

export interface AssetPolicyDiagnostic {
  approvalStatus: string;
  assetId: string | null;
  assetName: string | null;
  assetResourceName: string;
  assetSource: string | null;
  assetType: string;
  policyTopics: PolicyTopicDiagnostic[];
  reviewStatus: string;
}

export type ReportDateRangeInput =
  | { days: number; since?: never; until?: never }
  | { days?: never; since: string; until: string };

export interface GoogleAdsReportRequestOptions {
  rowLimit?: number;
  signal?: AbortSignal;
}

export async function getCampaignPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<CampaignMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: campaignPerformanceQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeCampaignPerformanceRow(row));
}

export async function getAdGroupPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<AdGroupMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: adGroupPerformanceQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });
  return rows.map(normalizeAdGroupPerformanceRow);
}

export async function getDevicePerformance(
  client: GoogleAdsClient,
  input: {
    campaignId?: string;
    customerId: string;
    videoOnly?: boolean;
  } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<DeviceMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: devicePerformanceQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });
  return rows.map(normalizeDevicePerformanceRow);
}

export async function getKeywordPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<KeywordMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: keywordPerformanceQuery(input, input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeKeywordPerformanceRow(row));
}

export async function getSearchTerms(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<SearchTermMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: searchTermsQuery(input, input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeSearchTermRow(row));
}

export async function getCampaignSearchTerms(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<CampaignSearchTermMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: campaignSearchTermsQuery(input, input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeCampaignSearchTermRow(row));
}

export async function getClickDetails(
  client: GoogleAdsClient,
  input: {
    adGroupId?: string;
    campaignId?: string;
    customerId: string;
    date: string;
    gclid?: string;
  } & GoogleAdsReportRequestOptions
): Promise<ClickDetailMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: clickDetailsQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeClickDetailRow(row));
}

export async function getVideoPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<VideoMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: videoPerformanceQuery(input, input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeVideoPerformanceRow(row));
}

export async function getAgeRangePerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<AudienceSegmentMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: audienceSegmentPerformanceQuery(input, "age_range_view"),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAudienceSegmentRow(row, "age"));
}

export async function getGenderPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<AudienceSegmentMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: audienceSegmentPerformanceQuery(input, "gender_view"),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAudienceSegmentRow(row, "gender"));
}

export async function getIncomeRangePerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<AudienceSegmentMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: audienceSegmentPerformanceQuery(input, "income_range_view"),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAudienceSegmentRow(row, "income"));
}

export async function getGeographicPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<GeographicMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: geographicPerformanceQuery(input, input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeGeographicRow(row));
}

export async function getCampaignLocationCriteria(
  client: GoogleAdsClient,
  input: {
    campaignId?: string;
    customerId: string;
  } & GoogleAdsReportRequestOptions
): Promise<CampaignLocationCriterionMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: campaignLocationCriteriaQuery(input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeCampaignLocationCriterionRow(row));
}

export async function getLocationCriterionPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<LocationCriterionPerformanceMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: locationCriterionPerformanceQuery(input, input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeLocationCriterionPerformanceRow(row));
}

export async function getReachFrequencyPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<ReachFrequencyMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: reachFrequencyPerformanceQuery(input, input.campaignId),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeReachFrequencyRow(row));
}

export async function getAssetPerformance(
  client: GoogleAdsClient,
  input: {
    assetGroupId?: string;
    campaignId?: string;
    customerId: string;
  } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<AssetPerformanceMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: assetPerformanceQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAssetPerformanceRow(row));
}

export async function getAssetGroupProductGroupPerformance(
  client: GoogleAdsClient,
  input: {
    assetGroupId?: string;
    campaignId?: string;
    customerId: string;
  } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<AssetGroupProductGroupMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: assetGroupProductGroupPerformanceQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAssetGroupProductGroupRow(row));
}

export async function getAssetTopCombinations(
  client: GoogleAdsClient,
  input: {
    assetGroupId?: string;
    campaignId?: string;
    customerId: string;
  } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<AssetCombinationMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: assetTopCombinationQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAssetCombinationRow(row));
}

export async function getChangeEvents(
  client: GoogleAdsClient,
  input: {
    customerId: string;
    limit?: number;
    resourceTypes?: ChangeEventResourceType[];
  } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<ChangeEventAuditEntry[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: changeEventsQuery(input),
    signal: input.signal,
  });

  return rows.map((row) => normalizeChangeEventRow(row));
}

export async function getChangeStatusChanges(
  client: GoogleAdsClient,
  input: {
    customerId: string;
    limit?: number;
    resourceTypes?: ChangeStatusResourceType[];
  } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<ChangeStatusAuditEntry[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: changeStatusQuery(input),
    signal: input.signal,
  });

  return rows.map((row) => normalizeChangeStatusRow(row));
}

export async function getAdPolicyDiagnostics(
  client: GoogleAdsClient,
  input: {
    adGroupId?: string;
    approvalStatuses?: PolicyApprovalStatus[];
    campaignId?: string;
    customerId: string;
    reviewStatuses?: PolicyReviewStatus[];
  } & GoogleAdsReportRequestOptions
): Promise<AdPolicyDiagnostic[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: adPolicyDiagnosticsQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAdPolicyDiagnosticRow(row));
}

export async function getAssetPolicyDiagnostics(
  client: GoogleAdsClient,
  input: {
    approvalStatuses?: PolicyApprovalStatus[];
    customerId: string;
    reviewStatuses?: PolicyReviewStatus[];
  } & GoogleAdsReportRequestOptions
): Promise<AssetPolicyDiagnostic[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: assetPolicyDiagnosticsQuery(input),
    rowLimit: input.rowLimit,
    signal: input.signal,
  });

  return rows.map((row) => normalizeAssetPolicyDiagnosticRow(row));
}

export function normalizeCampaignPerformanceRow(row: unknown): CampaignMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const budget = asRecord(
    readFirst(record, ["campaignBudget", "campaign_budget"])
  );
  const metrics = asRecord(record.metrics);

  return {
    avgCpc: microsToCurrency(readFirst(metrics, ["averageCpc", "average_cpc"])),
    channelType: toStringValue(
      readFirst(campaign, [
        "advertisingChannelType",
        "advertising_channel_type",
      ]),
      "UNKNOWN"
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    conversionsValue: toNumber(
      readFirst(metrics, ["conversionsValue", "conversions_value"])
    ),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    ctr: toNumber(readFirst(metrics, ["ctr"])),
    dailyBudget: microsToCurrency(
      readFirst(budget, ["amountMicros", "amount_micros"])
    ),
    id: toStringValue(readFirst(campaign, ["id"]), ""),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    name: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    status: toStringValue(readFirst(campaign, ["status"]), "UNKNOWN"),
  };
}

export function normalizeAdGroupPerformanceRow(row: unknown): AdGroupMetrics {
  const value = asRecord(row);
  const campaign = asRecord(value.campaign);
  const adGroup = asRecord(readFirst(value, ["adGroup", "ad_group"]));
  const metrics = asRecord(value.metrics);
  return {
    campaignId: toStringValue(campaign.id, ""),
    campaignName: toStringValue(campaign.name, "Unknown"),
    clicks: toNumber(metrics.clicks),
    conversions: toNumber(metrics.conversions),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    ctr: toNumber(metrics.ctr),
    id: toStringValue(adGroup.id, ""),
    impressions: toNumber(metrics.impressions),
    name: toStringValue(adGroup.name, "Unknown"),
    status: toStringValue(adGroup.status, "UNKNOWN"),
  };
}

export function normalizeDevicePerformanceRow(row: unknown): DeviceMetrics {
  const value = asRecord(row);
  const campaign = asRecord(value.campaign);
  const segments = asRecord(value.segments);
  const metrics = asRecord(value.metrics);
  return {
    campaignId: toStringValue(campaign.id, ""),
    campaignName: toStringValue(campaign.name, "Unknown"),
    clicks: toNumber(metrics.clicks),
    conversions: toNumber(metrics.conversions),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    ctr: toNumber(metrics.ctr),
    device: toStringValue(segments.device, "UNKNOWN"),
    impressions: toNumber(metrics.impressions),
    status: toStringValue(campaign.status, "UNKNOWN"),
  };
}

export function normalizeKeywordPerformanceRow(row: unknown): KeywordMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const adGroup = asRecord(readFirst(record, ["adGroup", "ad_group"]));
  const criterion = asRecord(
    readFirst(record, ["adGroupCriterion", "ad_group_criterion"])
  );
  const keyword = asRecord(criterion.keyword);
  const qualityInfo = asRecord(
    readFirst(criterion, ["qualityInfo", "quality_info"])
  );
  const metrics = asRecord(record.metrics);

  return {
    adGroupId: toStringValue(readFirst(adGroup, ["id"]), ""),
    adGroupName: toStringValue(readFirst(adGroup, ["name"]), "Unknown"),
    avgCpc: microsToCurrency(readFirst(metrics, ["averageCpc", "average_cpc"])),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    creativeQuality: toNullableString(
      readFirst(qualityInfo, ["creativeQualityScore", "creative_quality_score"])
    ),
    criterionId: toStringValue(
      readFirst(criterion, ["criterionId", "criterion_id"]),
      ""
    ),
    ctr: toNumber(readFirst(metrics, ["ctr"])),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    keyword: toStringValue(readFirst(keyword, ["text"]), ""),
    landingPageExperience: toNullableString(
      readFirst(qualityInfo, [
        "postClickQualityScore",
        "post_click_quality_score",
      ])
    ),
    matchType: toStringValue(
      readFirst(keyword, ["matchType", "match_type"]),
      "UNKNOWN"
    ),
    negative: readFirst(criterion, ["negative"]) === true,
    qualityScore: toNullableNumber(
      readFirst(qualityInfo, ["qualityScore", "quality_score"])
    ),
    searchImpressionShare: toNullableNumber(
      readFirst(metrics, ["searchImpressionShare", "search_impression_share"])
    ),
    searchPredictedCtr: toNullableString(
      readFirst(qualityInfo, ["searchPredictedCtr", "search_predicted_ctr"])
    ),
    status: toStringValue(readFirst(criterion, ["status"]), "UNKNOWN"),
  };
}

export function normalizeSearchTermRow(row: unknown): SearchTermMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const adGroup = asRecord(readFirst(record, ["adGroup", "ad_group"]));
  const searchTermView = asRecord(
    readFirst(record, ["searchTermView", "search_term_view"])
  );
  const metrics = asRecord(record.metrics);

  return {
    adGroupId: toStringValue(readFirst(adGroup, ["id"]), ""),
    adGroupName: toStringValue(readFirst(adGroup, ["name"]), "Unknown"),
    avgCpc: microsToCurrency(readFirst(metrics, ["averageCpc", "average_cpc"])),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    ctr: toNumber(readFirst(metrics, ["ctr"])),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    searchTerm: toStringValue(
      readFirst(searchTermView, ["searchTerm", "search_term"]),
      ""
    ),
    status: toStringValue(readFirst(searchTermView, ["status"]), "UNKNOWN"),
  };
}

export function normalizeCampaignSearchTermRow(
  row: unknown
): CampaignSearchTermMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const campaignSearchTermView = asRecord(
    readFirst(record, ["campaignSearchTermView", "campaign_search_term_view"])
  );
  const metrics = asRecord(record.metrics);

  return {
    avgCpc: microsToCurrency(readFirst(metrics, ["averageCpc", "average_cpc"])),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName:
      toNullableString(
        readFirst(campaign, ["resourceName", "resource_name"])
      ) ?? toNullableString(readFirst(campaignSearchTermView, ["campaign"])),
    campaignStatus: toStringValue(readFirst(campaign, ["status"]), "UNKNOWN"),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    conversionsValue: toNumber(
      readFirst(metrics, ["conversionsValue", "conversions_value"])
    ),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    ctr: toNumber(readFirst(metrics, ["ctr"])),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    resourceName: toStringValue(
      readFirst(campaignSearchTermView, ["resourceName", "resource_name"]),
      ""
    ),
    searchTerm: toStringValue(
      readFirst(campaignSearchTermView, ["searchTerm", "search_term"]),
      ""
    ),
  };
}

export function normalizeClickDetailRow(row: unknown): ClickDetailMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const adGroup = asRecord(readFirst(record, ["adGroup", "ad_group"]));
  const clickView = asRecord(readFirst(record, ["clickView", "click_view"]));
  const keywordInfo = asRecord(
    readFirst(clickView, ["keywordInfo", "keyword_info"])
  );
  const segments = asRecord(record.segments);
  const metrics = asRecord(record.metrics);
  const adGroupAdResourceName = toNullableString(
    readFirst(clickView, ["adGroupAd", "ad_group_ad"])
  );

  return {
    adGroupAdResourceName,
    adGroupId: toStringValue(readFirst(adGroup, ["id"]), ""),
    adGroupName: toStringValue(readFirst(adGroup, ["name"]), "Unknown"),
    adGroupResourceName: toNullableString(
      readFirst(adGroup, ["resourceName", "resource_name"])
    ),
    adId: adIdFromAdGroupAdResourceName(adGroupAdResourceName),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    clickType: toStringValue(
      readFirst(segments, ["clickType", "click_type"]),
      "UNKNOWN"
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    date: toStringValue(readFirst(segments, ["date"]), ""),
    device: toStringValue(readFirst(segments, ["device"]), "UNKNOWN"),
    gclid: toNullableString(readFirst(clickView, ["gclid"])),
    keywordMatchType: toNullableString(
      readFirst(keywordInfo, ["matchType", "match_type"])
    ),
    keywordResourceName: toNullableString(readFirst(clickView, ["keyword"])),
    keywordText: toNullableString(readFirst(keywordInfo, ["text"])),
    networkType: toStringValue(
      readFirst(segments, ["adNetworkType", "ad_network_type"]),
      "UNKNOWN"
    ),
    pageNumber: toNullableNumber(
      readFirst(clickView, ["pageNumber", "page_number"])
    ),
    resourceName: toStringValue(
      readFirst(clickView, ["resourceName", "resource_name"]),
      ""
    ),
    userListResourceName: toNullableString(
      readFirst(clickView, ["userList", "user_list"])
    ),
  };
}

export function normalizeVideoPerformanceRow(row: unknown): VideoMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const metrics = asRecord(record.metrics);
  const cost = microsToCurrency(
    readFirst(metrics, ["costMicros", "cost_micros"])
  );
  const impressions = toNumber(readFirst(metrics, ["impressions"]));

  return {
    averageCpv: microsToCurrency(
      readFirst(metrics, [
        "trueviewAverageCpv",
        "trueview_average_cpv",
        "averageCpv",
        "average_cpv",
      ])
    ),
    averageVideoWatchTimeSeconds: millisToSecondsOrNull(
      readFirst(metrics, [
        "averageVideoWatchTimeDurationMillis",
        "average_video_watch_time_duration_millis",
      ])
    ),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost,
    cpm: impressions > 0 ? (cost / impressions) * 1000 : 0,
    impressions,
    p100Rate: toNumber(
      readFirst(metrics, ["videoQuartileP100Rate", "video_quartile_p100_rate"])
    ),
    p25Rate: toNumber(
      readFirst(metrics, ["videoQuartileP25Rate", "video_quartile_p25_rate"])
    ),
    p50Rate: toNumber(
      readFirst(metrics, ["videoQuartileP50Rate", "video_quartile_p50_rate"])
    ),
    p75Rate: toNumber(
      readFirst(metrics, ["videoQuartileP75Rate", "video_quartile_p75_rate"])
    ),
    status: toStringValue(readFirst(campaign, ["status"]), "UNKNOWN"),
    viewRate: toNumber(
      readFirst(metrics, [
        "videoTrueviewViewRate",
        "video_trueview_view_rate",
        "videoViewRate",
        "video_view_rate",
      ])
    ),
    views: toNumber(
      readFirst(metrics, [
        "videoTrueviewViews",
        "video_trueview_views",
        "videoViews",
        "video_views",
      ])
    ),
  };
}

export function normalizeAudienceSegmentRow(
  row: unknown,
  segmentType: AudienceSegmentType
): AudienceSegmentMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const adGroup = asRecord(readFirst(record, ["adGroup", "ad_group"]));
  const criterion = asRecord(
    readFirst(record, ["adGroupCriterion", "ad_group_criterion"])
  );
  const segment = asRecord(
    readFirst(criterion, audienceSegmentCriterionKeys(segmentType)) ??
      readFirst(record, audienceSegmentViewKeys(segmentType))
  );
  const metrics = asRecord(record.metrics);
  const providerResourceName = toNullableString(
    readFirst(record, audienceSegmentViewKeys(segmentType))
      ? readFirst(
          asRecord(readFirst(record, audienceSegmentViewKeys(segmentType))),
          ["resourceName", "resource_name"]
        )
      : readFirst(segment, ["resourceName", "resource_name"])
  );

  return {
    adGroupId: toStringValue(readFirst(adGroup, ["id"]), ""),
    adGroupName: toStringValue(readFirst(adGroup, ["name"]), "Unknown"),
    adGroupResourceName: toNullableString(
      readFirst(adGroup, ["resourceName", "resource_name"])
    ),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    criterionId:
      toNullableString(readFirst(criterion, ["criterionId", "criterion_id"])) ??
      criterionIdFromResourceName(providerResourceName),
    currentBidModifier: toNullableNumber(
      readFirst(criterion, ["bidModifier", "bid_modifier"])
    ),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    providerResourceName,
    segmentType,
    segmentValue: toStringValue(
      readFirst(segment, audienceSegmentValueKeys(segmentType)),
      "UNKNOWN"
    ),
    viewRate: toNumber(
      readFirst(metrics, [
        "videoTrueviewViewRate",
        "video_trueview_view_rate",
        "videoViewRate",
        "video_view_rate",
      ])
    ),
    views: toNumber(
      readFirst(metrics, [
        "videoTrueviewViews",
        "video_trueview_views",
        "videoViews",
        "video_views",
      ])
    ),
  };
}

export function normalizeGeographicRow(row: unknown): GeographicMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const adGroup = asRecord(readFirst(record, ["adGroup", "ad_group"]));
  const geographicView = asRecord(
    readFirst(record, ["geographicView", "geographic_view"])
  );
  const segments = asRecord(record.segments);
  const metrics = asRecord(record.metrics);

  return {
    adGroupId: toStringValue(readFirst(adGroup, ["id"]), ""),
    adGroupName: toStringValue(readFirst(adGroup, ["name"]), "Unknown"),
    adGroupResourceName: toNullableString(
      readFirst(adGroup, ["resourceName", "resource_name"])
    ),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    geoTargetCity: toNullableString(
      readFirst(segments, ["geoTargetCity", "geo_target_city"])
    ),
    geoTargetCountry: toNullableString(
      readFirst(segments, ["geoTargetCountry", "geo_target_country"])
    ),
    geoTargetMostSpecificLocation: toNullableString(
      readFirst(segments, [
        "geoTargetMostSpecificLocation",
        "geo_target_most_specific_location",
      ])
    ),
    geoTargetPostalCode: toNullableString(
      readFirst(segments, ["geoTargetPostalCode", "geo_target_postal_code"])
    ),
    geoTargetRegion: toNullableString(
      readFirst(segments, ["geoTargetRegion", "geo_target_region"])
    ),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    locationType: toStringValue(
      readFirst(geographicView, ["locationType", "location_type"]),
      "UNKNOWN"
    ),
    providerResourceName: toNullableString(
      readFirst(geographicView, ["resourceName", "resource_name"])
    ),
    viewRate: toNumber(
      readFirst(metrics, [
        "videoTrueviewViewRate",
        "video_trueview_view_rate",
        "videoViewRate",
        "video_view_rate",
      ])
    ),
    views: toNumber(
      readFirst(metrics, [
        "videoTrueviewViews",
        "video_trueview_views",
        "videoViews",
        "video_views",
      ])
    ),
  };
}

export function normalizeCampaignLocationCriterionRow(
  row: unknown
): CampaignLocationCriterionMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const criterion = asRecord(
    readFirst(record, ["campaignCriterion", "campaign_criterion"])
  );
  const location = asRecord(criterion.location);
  const providerResourceName = toNullableString(
    readFirst(criterion, ["resourceName", "resource_name"])
  );

  return {
    bidModifier: toNullableNumber(
      readFirst(criterion, ["bidModifier", "bid_modifier"])
    ),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    criterionId:
      toNullableString(readFirst(criterion, ["criterionId", "criterion_id"])) ??
      criterionIdFromResourceName(providerResourceName) ??
      "",
    geoTargetConstant: toNullableString(
      readFirst(location, ["geoTargetConstant", "geo_target_constant"])
    ),
    negative: toBoolean(readFirst(criterion, ["negative"])),
    providerResourceName,
    status: toStringValue(readFirst(criterion, ["status"]), "UNKNOWN"),
  };
}

export function normalizeLocationCriterionPerformanceRow(
  row: unknown
): LocationCriterionPerformanceMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const criterion = asRecord(
    readFirst(record, ["campaignCriterion", "campaign_criterion"])
  );
  const location = asRecord(criterion.location);
  const locationView = asRecord(
    readFirst(record, ["locationView", "location_view"])
  );
  const metrics = asRecord(record.metrics);
  const locationViewResourceName = toNullableString(
    readFirst(locationView, ["resourceName", "resource_name"])
  );
  const providerResourceName = toNullableString(
    readFirst(criterion, ["resourceName", "resource_name"])
  );

  return {
    averageCpv: microsToCurrency(
      readFirst(metrics, ["trueviewAverageCpv", "trueview_average_cpv"])
    ),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    criterionId:
      toNullableString(readFirst(criterion, ["criterionId", "criterion_id"])) ??
      criterionIdFromLocationViewResourceName(locationViewResourceName),
    geoTargetConstant: toNullableString(
      readFirst(location, ["geoTargetConstant", "geo_target_constant"])
    ),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    locationViewResourceName,
    providerResourceName,
    viewRate: toNumber(
      readFirst(metrics, [
        "videoTrueviewViewRate",
        "video_trueview_view_rate",
        "videoViewRate",
        "video_view_rate",
      ])
    ),
    views: toNumber(
      readFirst(metrics, [
        "videoTrueviewViews",
        "video_trueview_views",
        "videoViews",
        "video_views",
      ])
    ),
  };
}

export function normalizeReachFrequencyRow(
  row: unknown
): ReachFrequencyMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const metrics = asRecord(record.metrics);

  return {
    averageImpressionFrequencyPerUser: toNullableNumber(
      readFirst(metrics, [
        "averageImpressionFrequencyPerUser",
        "average_impression_frequency_per_user",
      ])
    ),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    status: toStringValue(readFirst(campaign, ["status"]), "UNKNOWN"),
    uniqueUsers: toNullableNumber(
      readFirst(metrics, ["uniqueUsers", "unique_users"])
    ),
    uniqueUsersFivePlus: toNullableNumber(
      readFirst(metrics, ["uniqueUsersFivePlus", "unique_users_five_plus"])
    ),
    uniqueUsersFourPlus: toNullableNumber(
      readFirst(metrics, ["uniqueUsersFourPlus", "unique_users_four_plus"])
    ),
  };
}

export function normalizeAssetPerformanceRow(
  row: unknown
): AssetPerformanceMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const assetGroup = asRecord(readFirst(record, ["assetGroup", "asset_group"]));
  const assetGroupAsset = asRecord(
    readFirst(record, ["assetGroupAsset", "asset_group_asset"])
  );
  const asset = asRecord(record.asset);
  const textAsset = asRecord(readFirst(asset, ["textAsset", "text_asset"]));
  const metrics = asRecord(record.metrics);

  return {
    assetGroupId: toNullableString(readFirst(assetGroup, ["id"])),
    assetGroupName: toNullableString(readFirst(assetGroup, ["name"])),
    assetGroupResourceName: toNullableString(
      readFirst(assetGroup, ["resourceName", "resource_name"])
    ),
    assetId: toNullableString(readFirst(asset, ["id"])),
    assetName: toNullableString(readFirst(asset, ["name"])),
    assetResourceName: toNullableString(
      readFirst(asset, ["resourceName", "resource_name"])
    ),
    assetSource: toNullableString(readFirst(asset, ["source"])),
    assetText: toNullableString(readFirst(textAsset, ["text"])),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    fieldType: toStringValue(
      readFirst(assetGroupAsset, ["fieldType", "field_type"]),
      "UNKNOWN"
    ),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    status: toStringValue(readFirst(assetGroupAsset, ["status"]), "UNKNOWN"),
  };
}

export function normalizeAssetGroupProductGroupRow(
  row: unknown
): AssetGroupProductGroupMetrics {
  const record = asRecord(row);
  const view = asRecord(
    readFirst(record, [
      "assetGroupProductGroupView",
      "asset_group_product_group_view",
    ])
  );
  const assetGroup = asRecord(readFirst(record, ["assetGroup", "asset_group"]));
  const campaign = asRecord(record.campaign);
  const metrics = asRecord(record.metrics);

  return {
    assetGroupId: toStringValue(readFirst(assetGroup, ["id"]), ""),
    assetGroupName: toStringValue(readFirst(assetGroup, ["name"]), "Unknown"),
    assetGroupResourceName: toNullableString(
      readFirst(assetGroup, ["resourceName", "resource_name"]) ??
        readFirst(view, ["assetGroup", "asset_group"])
    ),
    assetGroupStatus: toStringValue(
      readFirst(assetGroup, ["status"]),
      "UNKNOWN"
    ),
    avgCpc: microsToCurrency(readFirst(metrics, ["averageCpc", "average_cpc"])),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    conversionsValue: toNumber(
      readFirst(metrics, ["conversionsValue", "conversions_value"])
    ),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    ctr: toNumber(readFirst(metrics, ["ctr"])),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
    listingGroupFilterResourceName: toNullableString(
      readFirst(view, [
        "assetGroupListingGroupFilter",
        "asset_group_listing_group_filter",
      ])
    ),
    orders: toNumber(readFirst(metrics, ["orders"])),
    resourceName: toStringValue(
      readFirst(view, ["resourceName", "resource_name"]),
      ""
    ),
    revenue: microsToCurrency(
      readFirst(metrics, ["revenueMicros", "revenue_micros"])
    ),
    unitsSold: toNumber(readFirst(metrics, ["unitsSold", "units_sold"])),
  };
}

export function normalizeAssetCombinationRow(
  row: unknown
): AssetCombinationMetrics {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const assetGroup = asRecord(readFirst(record, ["assetGroup", "asset_group"]));
  const view = asRecord(
    readFirst(record, [
      "assetGroupTopCombinationView",
      "asset_group_top_combination_view",
    ])
  );

  return {
    assetGroupId: toNullableString(readFirst(assetGroup, ["id"])),
    assetGroupName: toNullableString(readFirst(assetGroup, ["name"])),
    assetGroupResourceName: toNullableString(
      readFirst(assetGroup, ["resourceName", "resource_name"])
    ),
    assets: normalizeCombinationAssets(
      readFirst(view, [
        "assetGroupTopCombinations",
        "asset_group_top_combinations",
      ])
    ),
    campaignId: toStringValue(readFirst(campaign, ["id"]), ""),
    campaignName: toStringValue(readFirst(campaign, ["name"]), "Unknown"),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    resourceName: toNullableString(
      readFirst(view, ["resourceName", "resource_name"])
    ),
  };
}

export function normalizeChangeEventRow(row: unknown): ChangeEventAuditEntry {
  const record = asRecord(row);
  const changeEvent = asRecord(
    readFirst(record, ["changeEvent", "change_event"])
  );

  return {
    adGroupResourceName: toNullableString(
      readFirst(changeEvent, ["adGroup", "ad_group"])
    ),
    assetResourceName: toNullableString(readFirst(changeEvent, ["asset"])),
    campaignResourceName: toNullableString(
      readFirst(changeEvent, ["campaign"])
    ),
    changeDateTime: toStringValue(
      readFirst(changeEvent, ["changeDateTime", "change_date_time"]),
      ""
    ),
    changedFields: normalizeFieldMask(
      readFirst(changeEvent, ["changedFields", "changed_fields"])
    ),
    changedResourceName: toNullableString(
      readFirst(changeEvent, ["changeResourceName", "change_resource_name"])
    ),
    clientType: toStringValue(
      readFirst(changeEvent, ["clientType", "client_type"]),
      "UNKNOWN"
    ),
    newResource: toNullableRecord(
      readFirst(changeEvent, ["newResource", "new_resource"])
    ),
    oldResource: toNullableRecord(
      readFirst(changeEvent, ["oldResource", "old_resource"])
    ),
    operation: toStringValue(
      readFirst(changeEvent, [
        "resourceChangeOperation",
        "resource_change_operation",
      ]),
      "UNKNOWN"
    ),
    resourceName: toStringValue(
      readFirst(changeEvent, ["resourceName", "resource_name"]),
      ""
    ),
    resourceType: toStringValue(
      readFirst(changeEvent, ["changeResourceType", "change_resource_type"]),
      "UNKNOWN"
    ),
    userEmail: toNullableString(
      readFirst(changeEvent, ["userEmail", "user_email"])
    ),
  };
}

export function normalizeChangeStatusRow(row: unknown): ChangeStatusAuditEntry {
  const record = asRecord(row);
  const changeStatus = asRecord(
    readFirst(record, ["changeStatus", "change_status"])
  );
  const resources = {
    adGroupAdResourceName: toNullableString(
      readFirst(changeStatus, ["adGroupAd", "ad_group_ad"])
    ),
    adGroupAssetResourceName: toNullableString(
      readFirst(changeStatus, ["adGroupAsset", "ad_group_asset"])
    ),
    adGroupBidModifierResourceName: toNullableString(
      readFirst(changeStatus, ["adGroupBidModifier", "ad_group_bid_modifier"])
    ),
    adGroupCriterionResourceName: toNullableString(
      readFirst(changeStatus, ["adGroupCriterion", "ad_group_criterion"])
    ),
    adGroupResourceName: toNullableString(
      readFirst(changeStatus, ["adGroup", "ad_group"])
    ),
    assetGroupResourceName: toNullableString(
      readFirst(changeStatus, ["assetGroup", "asset_group"])
    ),
    assetSetResourceName: toNullableString(
      readFirst(changeStatus, ["assetSet", "asset_set"])
    ),
    assetResourceName: toNullableString(readFirst(changeStatus, ["asset"])),
    campaignAssetSetResourceName: toNullableString(
      readFirst(changeStatus, ["campaignAssetSet", "campaign_asset_set"])
    ),
    campaignAssetResourceName: toNullableString(
      readFirst(changeStatus, ["campaignAsset", "campaign_asset"])
    ),
    campaignBudgetResourceName: toNullableString(
      readFirst(changeStatus, ["campaignBudget", "campaign_budget"])
    ),
    campaignCriterionResourceName: toNullableString(
      readFirst(changeStatus, ["campaignCriterion", "campaign_criterion"])
    ),
    campaignResourceName: toNullableString(
      readFirst(changeStatus, ["campaign"])
    ),
    campaignSharedSetResourceName: toNullableString(
      readFirst(changeStatus, ["campaignSharedSet", "campaign_shared_set"])
    ),
    combinedAudienceResourceName: toNullableString(
      readFirst(changeStatus, ["combinedAudience", "combined_audience"])
    ),
    customerAssetResourceName: toNullableString(
      readFirst(changeStatus, ["customerAsset", "customer_asset"])
    ),
    sharedSetResourceName: toNullableString(
      readFirst(changeStatus, ["sharedSet", "shared_set"])
    ),
  };

  const resourceType = toStringValue(
    readFirst(changeStatus, ["resourceType", "resource_type"]),
    "UNKNOWN"
  );

  return {
    ...resources,
    changedResourceName: changeStatusChangedResourceName(
      resourceType,
      resources
    ),
    lastChangeDateTime: toStringValue(
      readFirst(changeStatus, ["lastChangeDateTime", "last_change_date_time"]),
      ""
    ),
    resourceName: toStringValue(
      readFirst(changeStatus, ["resourceName", "resource_name"]),
      ""
    ),
    resourceStatus: toStringValue(
      readFirst(changeStatus, ["resourceStatus", "resource_status"]),
      "UNKNOWN"
    ),
    resourceType,
  };
}

export function normalizeAdPolicyDiagnosticRow(
  row: unknown
): AdPolicyDiagnostic {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const adGroup = asRecord(readFirst(record, ["adGroup", "ad_group"]));
  const adGroupAd = asRecord(readFirst(record, ["adGroupAd", "ad_group_ad"]));
  const ad = asRecord(readFirst(adGroupAd, ["ad"]));
  const policySummary = asRecord(
    readFirst(adGroupAd, ["policySummary", "policy_summary"])
  );

  return {
    adGroupId: toNullableString(readFirst(adGroup, ["id"])),
    adGroupName: toNullableString(readFirst(adGroup, ["name"])),
    adGroupResourceName: toNullableString(
      readFirst(adGroup, ["resourceName", "resource_name"])
    ),
    adId: toNullableString(readFirst(ad, ["id"])),
    adResourceName: toNullableString(
      readFirst(ad, ["resourceName", "resource_name"])
    ),
    adStatus: toStringValue(readFirst(adGroupAd, ["status"]), "UNKNOWN"),
    adType: toStringValue(readFirst(ad, ["type"]), "UNKNOWN"),
    approvalStatus: toStringValue(
      readFirst(policySummary, ["approvalStatus", "approval_status"]),
      "UNKNOWN"
    ),
    campaignId: toNullableString(readFirst(campaign, ["id"])),
    campaignName: toNullableString(readFirst(campaign, ["name"])),
    campaignResourceName: toNullableString(
      readFirst(campaign, ["resourceName", "resource_name"])
    ),
    policyTopics: normalizePolicyTopicEntries(
      readFirst(policySummary, ["policyTopicEntries", "policy_topic_entries"])
    ),
    primaryStatus: toStringValue(
      readFirst(adGroupAd, ["primaryStatus", "primary_status"]),
      "UNKNOWN"
    ),
    primaryStatusReasons: normalizeStringArray(
      readFirst(adGroupAd, ["primaryStatusReasons", "primary_status_reasons"])
    ),
    resourceName: toStringValue(
      readFirst(adGroupAd, ["resourceName", "resource_name"]),
      ""
    ),
    reviewStatus: toStringValue(
      readFirst(policySummary, ["reviewStatus", "review_status"]),
      "UNKNOWN"
    ),
  };
}

export function normalizeAssetPolicyDiagnosticRow(
  row: unknown
): AssetPolicyDiagnostic {
  const record = asRecord(row);
  const asset = asRecord(record.asset);
  const policySummary = asRecord(
    readFirst(asset, ["policySummary", "policy_summary"])
  );

  return {
    approvalStatus: toStringValue(
      readFirst(policySummary, ["approvalStatus", "approval_status"]),
      "UNKNOWN"
    ),
    assetId: toNullableString(readFirst(asset, ["id"])),
    assetName: toNullableString(readFirst(asset, ["name"])),
    assetResourceName: toStringValue(
      readFirst(asset, ["resourceName", "resource_name"]),
      ""
    ),
    assetSource: toNullableString(readFirst(asset, ["source"])),
    assetType: toStringValue(readFirst(asset, ["type"]), "UNKNOWN"),
    policyTopics: normalizePolicyTopicEntries(
      readFirst(policySummary, ["policyTopicEntries", "policy_topic_entries"])
    ),
    reviewStatus: toStringValue(
      readFirst(policySummary, ["reviewStatus", "review_status"]),
      "UNKNOWN"
    ),
  };
}

function campaignPerformanceQuery(
  input: ReportDateRangeInput & { campaignId?: string }
): string {
  const campaignFilter = input.campaignId
    ? `AND campaign.id = ${normalizeCampaignId(input.campaignId)}`
    : "";
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      ${campaignFilter}
    ORDER BY metrics.impressions DESC
  `;
}

function adGroupPerformanceQuery(
  input: ReportDateRangeInput & { campaignId?: string }
): string {
  const filter = input.campaignId
    ? `AND campaign.id = ${normalizeCampaignId(input.campaignId)}`
    : "";
  return `SELECT campaign.id, campaign.name, campaign.status, ad_group.id, ad_group.name, ad_group.status, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions FROM ad_group WHERE ${dateRangeClause(input)} AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' ${filter} ORDER BY metrics.impressions DESC`;
}

function devicePerformanceQuery(
  input: ReportDateRangeInput & { campaignId?: string; videoOnly?: boolean }
): string {
  const filter = input.campaignId
    ? `AND campaign.id = ${normalizeCampaignId(input.campaignId)}`
    : "";
  const video = input.videoOnly
    ? "AND campaign.advertising_channel_type = 'VIDEO'"
    : "";
  return `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.device, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${dateRangeClause(input)} AND campaign.status != 'REMOVED' ${filter} ${video} ORDER BY metrics.impressions DESC`;
}

function assetPerformanceQuery(
  input: ReportDateRangeInput & {
    assetGroupId?: string;
    campaignId?: string;
  }
): string {
  const campaignFilter = input.campaignId
    ? `AND campaign.id = ${normalizeCampaignId(input.campaignId)}`
    : "";
  const assetGroupFilter = input.assetGroupId
    ? `AND asset_group.id = ${normalizeAssetGroupId(input.assetGroupId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      asset_group.id,
      asset_group.name,
      asset_group.resource_name,
      asset_group.status,
      asset_group_asset.field_type,
      asset_group_asset.status,
      asset.id,
      asset.name,
      asset.resource_name,
      asset.source,
      asset.text_asset.text,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM asset_group_asset
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      AND asset_group.status != 'REMOVED'
      AND asset_group_asset.status != 'REMOVED'
      ${campaignFilter}
      ${assetGroupFilter}
    ORDER BY metrics.impressions DESC
  `;
}

// v24 selectable fields: https://developers.google.com/google-ads/api/fields/v24/asset_group_product_group_view
// v24 resource shape: https://developers.google.com/google-ads/api/reference/rpc/v24/AssetGroupProductGroupView
function assetGroupProductGroupPerformanceQuery(
  input: ReportDateRangeInput & {
    assetGroupId?: string;
    campaignId?: string;
  }
): string {
  const campaignFilter = input.campaignId
    ? `AND campaign.id = ${normalizeCampaignId(input.campaignId)}`
    : "";
  const assetGroupFilter = input.assetGroupId
    ? `AND asset_group.id = ${normalizeAssetGroupId(input.assetGroupId)}`
    : "";

  return `
    SELECT
      asset_group_product_group_view.resource_name,
      asset_group_product_group_view.asset_group,
      asset_group_product_group_view.asset_group_listing_group_filter,
      asset_group.resource_name,
      asset_group.id,
      asset_group.name,
      asset_group.status,
      campaign.resource_name,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.orders,
      metrics.revenue_micros,
      metrics.units_sold
    FROM asset_group_product_group_view
    WHERE ${dateRangeClause(input)}
      AND metrics.impressions > 0
      ${campaignFilter}
      ${assetGroupFilter}
    ORDER BY metrics.cost_micros DESC
  `;
}

function assetTopCombinationQuery(
  input: ReportDateRangeInput & {
    assetGroupId?: string;
    campaignId?: string;
  }
): string {
  const campaignFilter = input.campaignId
    ? `AND campaign.id = ${normalizeCampaignId(input.campaignId)}`
    : "";
  const assetGroupFilter = input.assetGroupId
    ? `AND asset_group.id = ${normalizeAssetGroupId(input.assetGroupId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      asset_group.id,
      asset_group.name,
      asset_group.resource_name,
      asset_group.status,
      asset_group_top_combination_view.resource_name,
      asset_group_top_combination_view.asset_group_top_combinations
    FROM asset_group_top_combination_view
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      AND asset_group.status != 'REMOVED'
      ${campaignFilter}
      ${assetGroupFilter}
    ORDER BY campaign.id, asset_group.id
  `;
}

function changeEventsQuery(
  input: ReportDateRangeInput & {
    limit?: number;
    resourceTypes?: ChangeEventResourceType[];
  }
): string {
  const resourceTypeFilter = changeResourceTypesFilter(
    "change_event.change_resource_type",
    input.resourceTypes,
    CHANGE_EVENT_RESOURCE_TYPES
  );
  const limit = normalizeChangeEventLimit(input.limit);

  return `
    SELECT
      change_event.resource_name,
      change_event.change_date_time,
      change_event.change_resource_name,
      change_event.change_resource_type,
      change_event.resource_change_operation,
      change_event.changed_fields,
      change_event.client_type,
      change_event.user_email,
      change_event.campaign,
      change_event.ad_group,
      change_event.asset,
      change_event.old_resource,
      change_event.new_resource
    FROM change_event
    WHERE ${dateRangeClauseForChangeHistory(
      input,
      "change_event.change_date_time",
      30
    )}
      ${resourceTypeFilter}
    ORDER BY change_event.change_date_time DESC
    LIMIT ${limit}
  `;
}

function changeStatusQuery(
  input: ReportDateRangeInput & {
    limit?: number;
    resourceTypes?: ChangeStatusResourceType[];
  }
): string {
  const resourceTypeFilter = changeResourceTypesFilter(
    "change_status.resource_type",
    input.resourceTypes,
    CHANGE_STATUS_RESOURCE_TYPES
  );
  const limit = normalizeChangeHistoryLimit(input.limit);

  return `
    SELECT
      change_status.resource_name,
      change_status.last_change_date_time,
      change_status.resource_type,
      change_status.resource_status,
      change_status.campaign,
      change_status.campaign_budget,
      change_status.campaign_criterion,
      change_status.campaign_asset,
      change_status.campaign_asset_set,
      change_status.campaign_shared_set,
      change_status.ad_group,
      change_status.ad_group_ad,
      change_status.ad_group_asset,
      change_status.ad_group_bid_modifier,
      change_status.ad_group_criterion,
      change_status.asset,
      change_status.asset_group,
      change_status.asset_set,
      change_status.customer_asset,
      change_status.combined_audience,
      change_status.shared_set
    FROM change_status
    WHERE ${dateRangeClauseForChangeHistory(
      input,
      "change_status.last_change_date_time",
      90
    )}
      ${resourceTypeFilter}
    ORDER BY change_status.last_change_date_time DESC
    LIMIT ${limit}
  `;
}

function adPolicyDiagnosticsQuery(input: {
  adGroupId?: string;
  approvalStatuses?: PolicyApprovalStatus[];
  campaignId?: string;
  reviewStatuses?: PolicyReviewStatus[];
}): string {
  const filters = [
    "ad_group_ad.status != 'REMOVED'",
    "campaign.status != 'REMOVED'",
    "ad_group.status != 'REMOVED'",
  ];

  if (input.campaignId) {
    filters.push(`campaign.id = ${normalizeCampaignId(input.campaignId)}`);
  }

  if (input.adGroupId) {
    filters.push(`ad_group.id = ${normalizeAdGroupId(input.adGroupId)}`);
  }

  const approvalStatusFilter = policyStatusFilter(
    "ad_group_ad.policy_summary.approval_status",
    input.approvalStatuses,
    POLICY_APPROVAL_STATUSES,
    "approvalStatuses"
  );
  if (approvalStatusFilter) {
    filters.push(approvalStatusFilter);
  }

  const reviewStatusFilter = policyStatusFilter(
    "ad_group_ad.policy_summary.review_status",
    input.reviewStatuses,
    POLICY_REVIEW_STATUSES,
    "reviewStatuses"
  );
  if (reviewStatusFilter) {
    filters.push(reviewStatusFilter);
  }

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group.resource_name,
      ad_group.status,
      ad_group_ad.resource_name,
      ad_group_ad.status,
      ad_group_ad.primary_status,
      ad_group_ad.primary_status_reasons,
      ad_group_ad.ad.id,
      ad_group_ad.ad.resource_name,
      ad_group_ad.ad.type,
      ad_group_ad.policy_summary.approval_status,
      ad_group_ad.policy_summary.review_status,
      ad_group_ad.policy_summary.policy_topic_entries
    FROM ad_group_ad
    WHERE ${filters.join("\n      AND ")}
    ORDER BY ad_group_ad.policy_summary.approval_status, campaign.id, ad_group.id
  `;
}

function assetPolicyDiagnosticsQuery(input: {
  approvalStatuses?: PolicyApprovalStatus[];
  reviewStatuses?: PolicyReviewStatus[];
}): string {
  const filters: string[] = [];

  const approvalStatusFilter = policyStatusFilter(
    "asset.policy_summary.approval_status",
    input.approvalStatuses,
    POLICY_APPROVAL_STATUSES,
    "approvalStatuses"
  );
  if (approvalStatusFilter) {
    filters.push(approvalStatusFilter);
  }

  const reviewStatusFilter = policyStatusFilter(
    "asset.policy_summary.review_status",
    input.reviewStatuses,
    POLICY_REVIEW_STATUSES,
    "reviewStatuses"
  );
  if (reviewStatusFilter) {
    filters.push(reviewStatusFilter);
  }

  return `
    SELECT
      asset.id,
      asset.name,
      asset.resource_name,
      asset.source,
      asset.type,
      asset.policy_summary.approval_status,
      asset.policy_summary.review_status,
      asset.policy_summary.policy_topic_entries
    FROM asset
    ${filters.length > 0 ? `WHERE ${filters.join("\n      AND ")}` : ""}
    ORDER BY asset.policy_summary.approval_status, asset.id
  `;
}

function videoPerformanceQuery(
  input: ReportDateRangeInput,
  campaignId?: string
): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.average_video_watch_time_duration_millis,
      metrics.conversions,
      metrics.video_trueview_views,
      metrics.video_trueview_view_rate,
      metrics.trueview_average_cpv,
      metrics.video_quartile_p25_rate,
      metrics.video_quartile_p50_rate,
      metrics.video_quartile_p75_rate,
      metrics.video_quartile_p100_rate
    FROM campaign
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'VIDEO'
      ${campaignFilter}
    ORDER BY metrics.impressions DESC
  `;
}

function audienceSegmentPerformanceQuery(
  input: ReportDateRangeInput & { campaignId?: string },
  viewName: "age_range_view" | "gender_view" | "income_range_view"
): string {
  const campaignFilter = input.campaignId
    ? `AND campaign.id = ${normalizeCampaignId(input.campaignId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      campaign.advertising_channel_type,
      ad_group.id,
      ad_group.name,
      ad_group.resource_name,
      ${viewName}.resource_name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.bid_modifier,
      ${audienceCriterionTypeFieldForView(viewName)},
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.video_trueview_views,
      metrics.video_trueview_view_rate
    FROM ${viewName}
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'VIDEO'
      ${campaignFilter}
    ORDER BY metrics.cost_micros DESC
  `;
}

function geographicPerformanceQuery(
  input: ReportDateRangeInput,
  campaignId?: string
): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      campaign.advertising_channel_type,
      ad_group.id,
      ad_group.name,
      ad_group.resource_name,
      geographic_view.resource_name,
      geographic_view.location_type,
      segments.geo_target_city,
      segments.geo_target_country,
      segments.geo_target_most_specific_location,
      segments.geo_target_postal_code,
      segments.geo_target_region,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.video_trueview_views,
      metrics.video_trueview_view_rate
    FROM geographic_view
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'VIDEO'
      ${campaignFilter}
    ORDER BY metrics.cost_micros DESC
  `;
}

function campaignLocationCriteriaQuery(campaignId?: string): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_criterion.resource_name,
      campaign_criterion.criterion_id,
      campaign_criterion.type,
      campaign_criterion.status,
      campaign_criterion.negative,
      campaign_criterion.bid_modifier,
      campaign_criterion.location.geo_target_constant
    FROM campaign_criterion
    WHERE campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'VIDEO'
      AND campaign_criterion.type = 'LOCATION'
      AND campaign_criterion.status != 'REMOVED'
      ${campaignFilter}
    ORDER BY campaign.id, campaign_criterion.criterion_id
  `;
}

function locationCriterionPerformanceQuery(
  input: ReportDateRangeInput,
  campaignId?: string
): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_criterion.resource_name,
      campaign_criterion.criterion_id,
      campaign_criterion.location.geo_target_constant,
      location_view.resource_name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.video_trueview_views,
      metrics.video_trueview_view_rate,
      metrics.trueview_average_cpv
    FROM location_view
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'VIDEO'
      ${campaignFilter}
    ORDER BY metrics.cost_micros DESC
  `;
}

function reachFrequencyPerformanceQuery(
  input: ReportDateRangeInput,
  campaignId?: string
): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";
  const metricFields = [
    "metrics.impressions",
    "metrics.cost_micros",
    "metrics.unique_users",
    "metrics.average_impression_frequency_per_user",
    ...(typeof input.days === "number" && input.days <= 31
      ? ["metrics.unique_users_four_plus", "metrics.unique_users_five_plus"]
      : []),
  ];

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.status,
      campaign.advertising_channel_type,
      ${metricFields.join(",\n      ")}
    FROM campaign
    WHERE ${dateRangeClause(input)}
      AND campaign.status != 'REMOVED'
      AND campaign.advertising_channel_type = 'VIDEO'
      ${campaignFilter}
    ORDER BY metrics.cost_micros DESC
  `;
}

function keywordPerformanceQuery(
  input: ReportDateRangeInput,
  campaignId?: string
): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.negative,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      ad_group_criterion.quality_info.post_click_quality_score,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.search_impression_share
    FROM keyword_view
    WHERE ${dateRangeClause(input)}
      AND ad_group_criterion.status != 'REMOVED'
      ${campaignFilter}
    ORDER BY metrics.impressions DESC
  `;
}

function searchTermsQuery(
  input: ReportDateRangeInput,
  campaignId?: string
): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  return `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE ${dateRangeClause(input)}
      AND metrics.impressions > 0
      ${campaignFilter}
    ORDER BY metrics.cost_micros DESC
  `;
}

function campaignSearchTermsQuery(
  input: ReportDateRangeInput,
  campaignId?: string
): string {
  const campaignFilter = campaignId
    ? `AND campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  // v24 field compatibility:
  // https://developers.google.com/google-ads/api/fields/v24/campaign_search_term_view
  // Performance Max search terms require this campaign-level view without
  // ad-group or keyword segments:
  // https://developers.google.com/google-ads/api/performance-max/campaign-criterion-reporting
  return `
    SELECT
      campaign_search_term_view.resource_name,
      campaign_search_term_view.campaign,
      campaign_search_term_view.search_term,
      campaign.resource_name,
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign_search_term_view
    WHERE ${dateRangeClause(input)}
      AND metrics.impressions > 0
      ${campaignFilter}
    ORDER BY metrics.cost_micros DESC
  `;
}

function clickDetailsQuery(input: {
  adGroupId?: string;
  campaignId?: string;
  date: string;
  gclid?: string;
}): string {
  const filters = [`segments.date = '${normalizeClickDetailDate(input.date)}'`];

  if (input.campaignId !== undefined) {
    filters.push(`campaign.id = ${normalizeCampaignId(input.campaignId)}`);
  }

  if (input.adGroupId !== undefined) {
    filters.push(`ad_group.id = ${normalizeAdGroupId(input.adGroupId)}`);
  }

  if (input.gclid !== undefined) {
    filters.push(`click_view.gclid = '${normalizeGclid(input.gclid)}'`);
  }

  // Google Ads API v24 limits ClickView queries to one day in the past 90
  // days and supports only the documented fields below.
  // https://developers.google.com/google-ads/api/fields/v24/click_view
  return `
    SELECT
      click_view.resource_name,
      click_view.gclid,
      click_view.ad_group_ad,
      click_view.keyword,
      click_view.keyword_info.text,
      click_view.keyword_info.match_type,
      click_view.user_list,
      click_view.page_number,
      segments.date,
      segments.device,
      segments.ad_network_type,
      segments.click_type,
      campaign.resource_name,
      campaign.id,
      campaign.name,
      ad_group.resource_name,
      ad_group.id,
      ad_group.name,
      metrics.clicks
    FROM click_view
    WHERE ${filters.join("\n      AND ")}
    ORDER BY click_view.gclid
  `;
}

function daysToRange(days: number): string {
  if (days === 7) {
    return "LAST_7_DAYS";
  }

  if (days === 14) {
    return "LAST_14_DAYS";
  }

  if (days === 30) {
    return "LAST_30_DAYS";
  }

  if (days === 90) {
    return "LAST_90_DAYS";
  }

  throw new Error("days must be one of 7, 14, 30, or 90.");
}

const CHANGE_EVENT_RESOURCE_TYPES = [
  "AD",
  "AD_GROUP",
  "AD_GROUP_AD",
  "AD_GROUP_ASSET",
  "AD_GROUP_CRITERION",
  "ASSET",
  "ASSET_GROUP",
  "CAMPAIGN",
  "CAMPAIGN_ASSET",
  "CAMPAIGN_BUDGET",
  "CAMPAIGN_CRITERION",
  "CUSTOMER_ASSET",
] as const satisfies readonly ChangeEventResourceType[];

const CHANGE_STATUS_RESOURCE_TYPES = [
  "AD_GROUP",
  "AD_GROUP_AD",
  "AD_GROUP_ASSET",
  "AD_GROUP_BID_MODIFIER",
  "AD_GROUP_CRITERION",
  "ASSET",
  "ASSET_GROUP",
  "ASSET_SET",
  "CAMPAIGN",
  "CAMPAIGN_ASSET",
  "CAMPAIGN_ASSET_SET",
  "CAMPAIGN_BUDGET",
  "CAMPAIGN_CRITERION",
  "CAMPAIGN_SHARED_SET",
  "COMBINED_AUDIENCE",
  "CUSTOMER_ASSET",
  "SHARED_SET",
] as const satisfies readonly ChangeStatusResourceType[];

const POLICY_APPROVAL_STATUSES = [
  "APPROVED",
  "APPROVED_LIMITED",
  "AREA_OF_INTEREST_ONLY",
  "DISAPPROVED",
  "UNKNOWN",
  "UNSPECIFIED",
] as const satisfies readonly PolicyApprovalStatus[];

const POLICY_REVIEW_STATUSES = [
  "ELIGIBLE_MAY_SERVE",
  "REVIEWED",
  "REVIEW_IN_PROGRESS",
  "UNDER_APPEAL",
  "UNKNOWN",
  "UNSPECIFIED",
] as const satisfies readonly PolicyReviewStatus[];

function dateRangeClause(input: ReportDateRangeInput): string {
  return dateRangeClauseForField(input, "segments.date");
}

function dateRangeClauseForField(
  input: ReportDateRangeInput,
  fieldName: string,
  allowedDays: number[] = [7, 14, 30, 90]
): string {
  if ("since" in input || "until" in input) {
    const { since } = input;
    const { until } = input;

    if (!since || !until) {
      throw new Error("Explicit date ranges require both since and until.");
    }

    assertDate(since, "since");
    assertDate(until, "until");

    if (since > until) {
      throw new Error("since must be on or before until.");
    }

    return `${fieldName} BETWEEN '${since}' AND '${until}'`;
  }

  if (!allowedDays.includes(input.days)) {
    throw new Error(`days must be one of ${formatAllowedDays(allowedDays)}.`);
  }

  return `${fieldName} DURING ${daysToRange(input.days)}`;
}

function dateRangeClauseForChangeHistory(
  input: ReportDateRangeInput,
  fieldName: string,
  maxPastDays: 30 | 90
): string {
  const allowedDays = maxPastDays === 30 ? [7, 14, 30] : [7, 14, 30, 90];

  if ("since" in input || "until" in input) {
    const { since } = input;
    const { until } = input;

    if (!since || !until) {
      throw new Error("Explicit date ranges require both since and until.");
    }

    assertDate(since, "since");
    assertDate(until, "until");

    if (since > until) {
      throw new Error("since must be on or before until.");
    }

    const spanDays = daysBetweenDates(since, until);

    if (spanDays > maxPastDays) {
      throw new Error(
        `Explicit change history date ranges must span at most ${maxPastDays} days.`
      );
    }

    const earliestDate = dateDaysAgo(maxPastDays);
    const today = dateDaysAgo(0);

    if (since < earliestDate || until < earliestDate) {
      throw new Error(
        `Explicit change history date ranges must be within the past ${maxPastDays} days.`
      );
    }

    if (until > today) {
      throw new Error("until must not be in the future.");
    }

    return `${fieldName} BETWEEN '${since}' AND '${until}'`;
  }

  if (!allowedDays.includes(input.days)) {
    throw new Error(`days must be one of ${formatAllowedDays(allowedDays)}.`);
  }

  return `${fieldName} DURING ${daysToRange(input.days)}`;
}

function formatAllowedDays(days: number[]): string {
  if (days.length <= 1) {
    return days.join("");
  }

  return `${days.slice(0, -1).join(", ")}, or ${days.at(-1)}`;
}

function assertDate(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }
}

function normalizeClickDetailDate(date: string): string {
  assertDate(date, "date");

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("date must be a valid calendar date.");
  }

  if (date < dateDaysAgo(90)) {
    throw new Error("date must be within the past 90 days.");
  }

  if (date > dateDaysAgo(0)) {
    throw new Error("date must not be in the future.");
  }

  return date;
}

function changeResourceTypesFilter(
  fieldName: string,
  resourceTypes: readonly string[] | undefined,
  allowedTypes: readonly string[]
): string {
  if (!resourceTypes || resourceTypes.length === 0) {
    return "";
  }

  const types = resourceTypes.map((type) => {
    assertEnumLiteral(type, "resourceTypes");
    if (!allowedTypes.includes(type)) {
      throw new Error(`${type} is not a supported change resource type.`);
    }
    return `'${type}'`;
  });

  return `AND ${fieldName} IN (${types.join(", ")})`;
}

function policyStatusFilter(
  fieldName: string,
  statuses: readonly string[] | undefined,
  allowedStatuses: readonly string[],
  fieldLabel: string
): string {
  if (!statuses || statuses.length === 0) {
    return "";
  }

  const normalizedStatuses = statuses.map((status) => {
    assertEnumLiteral(status, fieldLabel);
    if (!allowedStatuses.includes(status)) {
      throw new Error(`${status} is not a supported policy status.`);
    }
    return `'${status}'`;
  });

  return `${fieldName} IN (${normalizedStatuses.join(", ")})`;
}

function assertEnumLiteral(value: string, fieldName: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/u.test(value)) {
    throw new Error(`${fieldName} must contain Google Ads enum names.`);
  }
}

function normalizeChangeEventLimit(limit: number | undefined): number {
  return normalizeChangeHistoryLimit(limit);
}

function normalizeChangeHistoryLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 1000;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error("limit must be an integer from 1 through 10000.");
  }

  return limit;
}

function daysBetweenDates(since: string, until: string): number {
  return (
    (Date.parse(`${until}T00:00:00.000Z`) -
      Date.parse(`${since}T00:00:00.000Z`)) /
    86_400_000
  );
}

function dateDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function normalizeCampaignId(campaignId: string): string {
  if (!/^\d+$/u.test(campaignId)) {
    throw new Error("campaignId must contain only digits.");
  }

  return campaignId;
}

function normalizeAssetGroupId(assetGroupId: string): string {
  if (!/^\d+$/u.test(assetGroupId)) {
    throw new Error("assetGroupId must contain only digits.");
  }

  return assetGroupId;
}

function normalizeAdGroupId(adGroupId: string): string {
  if (!/^\d+$/u.test(adGroupId)) {
    throw new Error("adGroupId must contain only digits.");
  }

  return adGroupId;
}

function normalizeGclid(gclid: string): string {
  const normalized = gclid.trim();

  if (!normalized) {
    throw new Error("gclid must not be empty.");
  }

  for (const character of normalized) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
      throw new Error("gclid must not contain control characters.");
    }
  }

  return normalized.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function audienceCriterionTypeFieldForView(
  viewName: "age_range_view" | "gender_view" | "income_range_view"
):
  | "ad_group_criterion.age_range.type"
  | "ad_group_criterion.gender.type"
  | "ad_group_criterion.income_range.type" {
  if (viewName === "age_range_view") {
    return "ad_group_criterion.age_range.type";
  }
  if (viewName === "gender_view") {
    return "ad_group_criterion.gender.type";
  }
  return "ad_group_criterion.income_range.type";
}

function audienceSegmentViewKeys(segmentType: AudienceSegmentType): string[] {
  if (segmentType === "age") {
    return ["ageRangeView", "age_range_view"];
  }
  if (segmentType === "gender") {
    return ["genderView", "gender_view"];
  }
  return ["incomeRangeView", "income_range_view"];
}

function audienceSegmentCriterionKeys(
  segmentType: AudienceSegmentType
): string[] {
  if (segmentType === "age") {
    return ["ageRange", "age_range"];
  }
  if (segmentType === "gender") {
    return ["gender"];
  }
  return ["incomeRange", "income_range"];
}

function audienceSegmentValueKeys(segmentType: AudienceSegmentType): string[] {
  if (segmentType === "age") {
    return ["type", "ageRange", "age_range"];
  }
  if (segmentType === "gender") {
    return ["type", "gender"];
  }
  return ["type", "incomeRange", "income_range"];
}

function criterionIdFromResourceName(
  resourceName: string | null
): string | null {
  return resourceName?.split("~").at(-1) ?? null;
}

function criterionIdFromLocationViewResourceName(
  resourceName: string | null
): string | null {
  return resourceName?.match(/~(?<capture1>\d+)$/u)?.[1] ?? null;
}

function adIdFromAdGroupAdResourceName(
  resourceName: string | null
): string | null {
  return resourceName?.match(/~(?<capture1>\d+)$/u)?.[1] ?? null;
}

function normalizeCombinationAssets(value: unknown): AssetCombinationAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((combination) => {
    const record = asRecord(combination);
    const servedAssets = readFirst(record, [
      "assetCombinationServedAssets",
      "asset_combination_served_assets",
    ]);

    if (!Array.isArray(servedAssets)) {
      return [];
    }

    return servedAssets.map((entry) => {
      const servedAsset = asRecord(entry);

      return {
        assetResourceName: toNullableString(readFirst(servedAsset, ["asset"])),
        servedAssetFieldType: toNullableString(
          readFirst(servedAsset, [
            "servedAssetFieldType",
            "served_asset_field_type",
          ])
        ),
      };
    });
  });
}

function normalizePolicyTopicEntries(value: unknown): PolicyTopicDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const record = asRecord(entry);
    return {
      constraints: normalizeRecordArray(readFirst(record, ["constraints"])),
      evidences: normalizeRecordArray(readFirst(record, ["evidences"])),
      topic: toStringValue(readFirst(record, ["topic"]), ""),
      type: toStringValue(readFirst(record, ["type"]), "UNKNOWN"),
    };
  });
}

function normalizeRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => asRecord(entry));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const normalized = toNullableString(entry);
    return normalized === null ? [] : [normalized];
  });
}

function normalizeFieldMask(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").flatMap((path) => {
      const trimmed = path.trim();
      return trimmed ? [trimmed] : [];
    });
  }

  const record = asRecord(value);
  const paths = readFirst(record, ["paths"]);

  if (!Array.isArray(paths)) {
    return [];
  }

  return paths.flatMap((path) => {
    const normalized = toNullableString(path);
    return normalized === null ? [] : [normalized];
  });
}

function toNullableRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);

  return Object.keys(record).length > 0 ? record : null;
}

function changeStatusChangedResourceName(
  resourceType: string,
  resources: Pick<
    ChangeStatusAuditEntry,
    | "adGroupAdResourceName"
    | "adGroupAssetResourceName"
    | "adGroupBidModifierResourceName"
    | "adGroupCriterionResourceName"
    | "adGroupResourceName"
    | "assetGroupResourceName"
    | "assetResourceName"
    | "assetSetResourceName"
    | "campaignAssetResourceName"
    | "campaignAssetSetResourceName"
    | "campaignBudgetResourceName"
    | "campaignCriterionResourceName"
    | "campaignResourceName"
    | "campaignSharedSetResourceName"
    | "combinedAudienceResourceName"
    | "customerAssetResourceName"
    | "sharedSetResourceName"
  >
): string | null {
  if (resourceType === "AD_GROUP") {
    return resources.adGroupResourceName;
  }
  if (resourceType === "AD_GROUP_AD") {
    return resources.adGroupAdResourceName;
  }
  if (resourceType === "AD_GROUP_ASSET") {
    return resources.adGroupAssetResourceName;
  }
  if (resourceType === "AD_GROUP_BID_MODIFIER") {
    return resources.adGroupBidModifierResourceName;
  }
  if (resourceType === "AD_GROUP_CRITERION") {
    return resources.adGroupCriterionResourceName;
  }
  if (resourceType === "ASSET") {
    return resources.assetResourceName;
  }
  if (resourceType === "ASSET_GROUP") {
    return resources.assetGroupResourceName;
  }
  if (resourceType === "ASSET_SET") {
    return resources.assetSetResourceName;
  }
  if (resourceType === "CAMPAIGN") {
    return resources.campaignResourceName;
  }
  if (resourceType === "CAMPAIGN_ASSET") {
    return resources.campaignAssetResourceName;
  }
  if (resourceType === "CAMPAIGN_ASSET_SET") {
    return resources.campaignAssetSetResourceName;
  }
  if (resourceType === "CAMPAIGN_BUDGET") {
    return resources.campaignBudgetResourceName;
  }
  if (resourceType === "CAMPAIGN_CRITERION") {
    return resources.campaignCriterionResourceName;
  }
  if (resourceType === "CAMPAIGN_SHARED_SET") {
    return resources.campaignSharedSetResourceName;
  }
  if (resourceType === "COMBINED_AUDIENCE") {
    return resources.combinedAudienceResourceName;
  }
  if (resourceType === "CUSTOMER_ASSET") {
    return resources.customerAssetResourceName;
  }
  if (resourceType === "SHARED_SET") {
    return resources.sharedSetResourceName;
  }

  return null;
}

async function searchAllRows(
  client: GoogleAdsClient,
  input: {
    customerId: string;
    query: string;
    rowLimit?: number;
    signal?: AbortSignal;
  }
) {
  const rowLimit = normalizeReportRowLimit(input.rowLimit);
  const query = rowLimit
    ? `${input.query.trimEnd()}\nLIMIT ${rowLimit}`
    : input.query;
  const rows: GoogleAdsRow[] = [];
  let pageToken: string | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- Each request needs the preceding page token (#507).
    const response = await client.search({
      customerId: input.customerId,
      ...(pageToken ? { pageToken } : {}),
      query,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    rows.push(...response.rows);
    if (rowLimit && rows.length >= rowLimit) {
      return rows.slice(0, rowLimit);
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  return rows;
}

function normalizeReportRowLimit(
  limit: number | undefined
): number | undefined {
  if (limit === undefined) {
    return undefined;
  }
  if (!(Number.isSafeInteger(limit) && limit > 0)) {
    throw new Error("rowLimit must be a positive integer");
  }
  return limit;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!(value && typeof value === "object") || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function toNumber(value: unknown): number {
  const numericValue = Number(value ?? 0);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function millisToSecondsOrNull(value: unknown): number | null {
  const millis = toNullableNumber(value);
  return millis === null ? null : millis / 1000;
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function toStringValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return fallback;
}
