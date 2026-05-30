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

export type ReportDateRangeInput =
  | { days: number; since?: never; until?: never }
  | { days?: never; since: string; until: string };

export interface GoogleAdsReportRequestOptions {
  signal?: AbortSignal;
}

export async function getCampaignPerformance(
  client: GoogleAdsClient,
  input: { customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<CampaignMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: campaignPerformanceQuery(input),
    signal: input.signal,
  });

  return rows.map((row) => normalizeCampaignPerformanceRow(row));
}

export async function getKeywordPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<KeywordMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: keywordPerformanceQuery(input, input.campaignId),
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
    signal: input.signal,
  });

  return rows.map((row) => normalizeSearchTermRow(row));
}

export async function getVideoPerformance(
  client: GoogleAdsClient,
  input: { campaignId?: string; customerId: string } & ReportDateRangeInput &
    GoogleAdsReportRequestOptions
): Promise<VideoMetrics[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: videoPerformanceQuery(input, input.campaignId),
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
    signal: input.signal,
  });

  return rows.map((row) => normalizeReachFrequencyRow(row));
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

function campaignPerformanceQuery(input: ReportDateRangeInput): string {
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
    ORDER BY metrics.impressions DESC
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
      campaign_criterion.resource_name,
      campaign_criterion.criterion_id,
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

function dateRangeClause(input: ReportDateRangeInput): string {
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

    return `segments.date BETWEEN '${since}' AND '${until}'`;
  }

  return `segments.date DURING ${daysToRange(input.days)}`;
}

function assertDate(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }
}

function normalizeCampaignId(campaignId: string): string {
  if (!/^\d+$/.test(campaignId)) {
    throw new Error("campaignId must contain only digits.");
  }

  return campaignId;
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
  return resourceName?.match(/~(\d+)$/)?.[1] ?? null;
}

async function searchAllRows(
  client: GoogleAdsClient,
  input: { customerId: string; query: string; signal?: AbortSignal }
) {
  const rows: GoogleAdsRow[] = [];
  let pageToken: string | undefined;

  do {
    const response = await client.search({
      customerId: input.customerId,
      ...(pageToken ? { pageToken } : {}),
      query: input.query,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    rows.push(...response.rows);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return rows;
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
