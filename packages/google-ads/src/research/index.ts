import { normalizeCustomerId } from "../core/index.js";
import {
  languageResource,
  resolveAdGroup,
  resolveGeoTarget,
} from "../resolvers/index.js";
import type { GoogleAdsServiceClient } from "../rest/index.js";

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: string;
  competitionIndex: number | null;
  lowBidCents: number | null;
  highBidCents: number | null;
  avgCpcCents: number | null;
  closeVariants: string[];
}
export interface KeywordHistoricalMetrics extends Omit<
  KeywordIdea,
  "closeVariants"
> {
  monthlyVolumes: { month: number; searches: number; year: number }[];
}
export interface KeywordForecastMetrics {
  averageCpaCents: number | null;
  averageCpcCents: number | null;
  clickThroughRate: number | null;
  clicks: number | null;
  conversionRate: number | null;
  conversions: number | null;
  costCents: number | null;
  impressions: number | null;
}
export type KeywordMatchType = "BROAD" | "EXACT" | "PHRASE";
export interface ForecastKeywordInput {
  matchType?: KeywordMatchType;
  maxCpcDollars?: number;
  text: string;
}
export interface ForecastAdGroupInput {
  keywords: ForecastKeywordInput[];
  maxCpcDollars?: number;
  negativeKeywords?: ForecastKeywordInput[];
}
export interface KeywordForecastInput {
  adGroups: ForecastAdGroupInput[];
  campaignMaxCpcDollars?: number;
  conversionRate?: number;
  currencyCode?: string;
  customerId: string;
  endDate?: string;
  language?: string;
  location?: string;
  negativeKeywords?: ForecastKeywordInput[];
  startDate?: string;
}
export interface AdGroupThemesResult {
  suggestions: {
    keywordText: string;
    suggestedAdGroup: string;
    suggestedCampaign: string;
    suggestedKeywordText: string;
    suggestedMatchType: string;
  }[];
  unusableAdGroups: { adGroup: string; campaign: string }[];
}

export async function getKeywordIdeas(
  client: GoogleAdsServiceClient,
  input: {
    customerId: string;
    keywords?: string[];
    url?: string;
    location?: string;
    language?: string;
    limit?: number;
  }
): Promise<KeywordIdea[]> {
  const keywords = normalizeKeywords(input.keywords);
  const url = input.url?.trim();
  if (!(keywords.length || url)) {
    throw new Error("Keyword ideas require keywords, a URL, or both.");
  }
  if (keywords.length > 20) {
    throw new Error("Keyword ideas accept at most 20 seed keywords.");
  }
  const body: Record<string, unknown> = await targeting(client, input);
  body.pageSize = input.limit ?? 100;
  body.includeAdultKeywords = false;
  body.keywordPlanNetwork = "GOOGLE_SEARCH";
  if (keywords.length && url) {
    body.keywordAndUrlSeed = { keywords, url };
  } else if (keywords.length) {
    body.keywordSeed = { keywords };
  } else {
    body.urlSeed = { url };
  }
  const response = await client.request({
    body,
    path: `customers/${normalizeCustomerId(input.customerId)}:generateKeywordIdeas`,
  });
  return array(record(response.data).results).map(normalizeIdea);
}

export async function getKeywordHistoricalMetrics(
  client: GoogleAdsServiceClient,
  input: {
    customerId: string;
    keywords: string[];
    location?: string;
    language?: string;
  }
): Promise<KeywordHistoricalMetrics[]> {
  const keywords = normalizeKeywords(input.keywords);
  if (!keywords.length) {
    throw new Error("Historical metrics require at least one keyword.");
  }
  const body = {
    ...(await targeting(client, input)),
    includeAdultKeywords: false,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    keywords,
  };
  const response = await client.request({
    body,
    path: `customers/${normalizeCustomerId(input.customerId)}:generateKeywordHistoricalMetrics`,
  });
  return array(record(response.data).results).map((value) => {
    const row = record(value);
    const metrics = record(row.keywordMetrics ?? row.keyword_metrics);
    return {
      ...normalizeMetrics(String(row.text ?? ""), metrics),
      monthlyVolumes: array(
        metrics.monthlySearchVolumes ?? metrics.monthly_search_volumes
      ).map((month) => {
        const item = record(month);
        return {
          month: number(item.month) ?? 0,
          searches: number(item.monthlySearches ?? item.monthly_searches) ?? 0,
          year: number(item.year) ?? 0,
        };
      }),
    };
  });
}

export async function getAdGroupThemes(
  client: GoogleAdsServiceClient,
  input: { customerId: string; keywords: string[]; adGroups: string[] }
): Promise<AdGroupThemesResult> {
  if (!normalizeKeywords(input.keywords).length || !input.adGroups.length) {
    throw new Error("Themes require keywords and ad groups.");
  }
  const adGroups = await Promise.all(
    input.adGroups.map(async (value) => {
      if (!/^\d+$/u.test(value.trim())) {
        return value.trim();
      }
      const resource = await resolveAdGroup(client, {
        customerId: input.customerId,
        value,
      });
      return resource.resourceName;
    })
  );
  const response = await client.request({
    body: {
      adGroups,
      customerId: normalizeCustomerId(input.customerId),
      keywords: normalizeKeywords(input.keywords),
    },
    path: `customers/${normalizeCustomerId(input.customerId)}:generateAdGroupThemes`,
  });
  const data = record(response.data);
  return {
    suggestions: array(
      data.adGroupKeywordSuggestions ?? data.ad_group_keyword_suggestions
    ).map((value) => {
      const row = record(value);
      return {
        keywordText: String(row.keywordText ?? row.keyword_text ?? ""),
        suggestedAdGroup: String(
          row.suggestedAdGroup ?? row.suggested_ad_group ?? ""
        ),
        suggestedCampaign: String(
          row.suggestedCampaign ?? row.suggested_campaign ?? ""
        ),
        suggestedKeywordText: String(
          row.suggestedKeywordText ??
            row.suggested_keyword_text ??
            row.keywordText ??
            row.keyword_text ??
            ""
        ),
        suggestedMatchType: String(
          row.suggestedMatchType ?? row.suggested_match_type ?? "UNSPECIFIED"
        ),
      };
    }),
    unusableAdGroups: array(
      data.unusableAdGroups ?? data.unusable_ad_groups
    ).map((value) => {
      const row = record(value);
      return {
        adGroup: String(row.adGroup ?? row.ad_group ?? ""),
        campaign: String(row.campaign ?? ""),
      };
    }),
  };
}

export async function buildKeywordForecastRequest(
  client: GoogleAdsServiceClient,
  input: KeywordForecastInput
): Promise<Record<string, unknown>> {
  if (!input.adGroups.length) {
    throw new Error("Forecasting requires at least one ad group.");
  }
  if (
    input.conversionRate !== undefined &&
    (!Number.isFinite(input.conversionRate) ||
      input.conversionRate < 0 ||
      input.conversionRate > 1)
  ) {
    throw new Error("Conversion rate must be between 0 and 1.");
  }
  const forecastPeriod = buildForecastPeriod(input.startDate, input.endDate);
  const geo = await resolveGeoTarget(client, {
    customerId: input.customerId,
    value: input.location ?? "United States",
  });
  return {
    customerId: normalizeCustomerId(input.customerId),
    ...(input.currencyCode?.trim()
      ? { currencyCode: input.currencyCode.trim().toUpperCase() }
      : {}),
    ...(forecastPeriod ? { forecastPeriod } : {}),
    campaign: {
      adGroups: input.adGroups.map(buildForecastAdGroup),
      biddingStrategy: {
        manualCpcBiddingStrategy: {
          maxCpcBidMicros: dollarsToMicros(input.campaignMaxCpcDollars ?? 1),
        },
      },
      ...(input.conversionRate === undefined
        ? {}
        : { conversionRate: input.conversionRate }),
      geoModifiers: [{ geoTargetConstant: geo.resourceName }],
      keywordPlanNetwork: "GOOGLE_SEARCH",
      languageConstants: [languageResource(input.language ?? "en")],
      ...(input.negativeKeywords?.length
        ? { negativeKeywords: input.negativeKeywords.map(toKeywordInfo) }
        : {}),
    },
  };
}

export async function getKeywordForecastMetrics(
  client: GoogleAdsServiceClient,
  input: KeywordForecastInput
): Promise<KeywordForecastMetrics> {
  const body = await buildKeywordForecastRequest(client, input);
  const response = await client.request({
    body,
    path: `customers/${normalizeCustomerId(input.customerId)}:generateKeywordForecastMetrics`,
  });
  const metrics = record(
    record(response.data).campaignForecastMetrics ??
      record(response.data).campaign_forecast_metrics
  );
  return {
    averageCpaCents: cents(
      metrics.averageCpaMicros ?? metrics.average_cpa_micros
    ),
    averageCpcCents: cents(
      metrics.averageCpcMicros ?? metrics.average_cpc_micros
    ),
    clickThroughRate: number(
      metrics.clickThroughRate ?? metrics.click_through_rate
    ),
    clicks: number(metrics.clicks),
    conversionRate: number(metrics.conversionRate ?? metrics.conversion_rate),
    conversions: number(metrics.conversions),
    costCents: cents(metrics.costMicros ?? metrics.cost_micros),
    impressions: number(metrics.impressions),
  };
}

function buildForecastAdGroup(
  input: ForecastAdGroupInput
): Record<string, unknown> {
  const keywords = normalizeForecastKeywords(input.keywords);
  if (!keywords.length) {
    throw new Error(
      "Forecast ad groups require at least one biddable keyword."
    );
  }
  return {
    biddableKeywords: keywords.map((keyword) => ({
      keyword: toKeywordInfo(keyword),
      ...(keyword.maxCpcDollars === undefined
        ? {}
        : { maxCpcBidMicros: dollarsToMicros(keyword.maxCpcDollars) }),
    })),
    ...(input.maxCpcDollars === undefined
      ? {}
      : { maxCpcBidMicros: dollarsToMicros(input.maxCpcDollars) }),
    ...(input.negativeKeywords?.length
      ? {
          negativeKeywords: normalizeForecastKeywords(
            input.negativeKeywords
          ).map(toKeywordInfo),
        }
      : {}),
  };
}
function normalizeForecastKeywords(
  values: ForecastKeywordInput[]
): ForecastKeywordInput[] {
  return values.flatMap((value) => {
    const normalized = {
      ...value,
      matchType: normalizeMatchType(value.matchType),
      text: value.text.trim(),
    };
    return normalized.text ? [normalized] : [];
  });
}
function normalizeMatchType(value?: string): KeywordMatchType {
  const normalized = (value ?? "BROAD").toUpperCase();
  if (
    !(
      normalized === "BROAD" ||
      normalized === "EXACT" ||
      normalized === "PHRASE"
    )
  ) {
    throw new Error(`Unsupported keyword match type: ${value}`);
  }
  return normalized;
}
function toKeywordInfo(value: ForecastKeywordInput): Record<string, unknown> {
  return {
    matchType: normalizeMatchType(value.matchType),
    text: value.text.trim(),
  };
}
function dollarsToMicros(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("CPC values must be non-negative numbers.");
  }
  return Math.round(value * 1_000_000);
}
function buildForecastPeriod(
  startDate?: string,
  endDate?: string
): Record<string, string> | undefined {
  if (!(startDate || endDate)) {
    return undefined;
  }
  if (!(startDate && endDate)) {
    throw new Error("Forecast date ranges require both startDate and endDate.");
  }
  const pattern = /^\d{4}-\d{2}-\d{2}$/u;
  if (!(pattern.test(startDate) && pattern.test(endDate))) {
    throw new Error("Forecast dates must use YYYY-MM-DD format.");
  }
  if (startDate > endDate) {
    throw new Error("Forecast startDate must be on or before endDate.");
  }
  return { endDate, startDate };
}

async function targeting(
  client: GoogleAdsServiceClient,
  input: { customerId: string; location?: string; language?: string }
): Promise<Record<string, unknown>> {
  const geo = await resolveGeoTarget(client, {
    customerId: input.customerId,
    value: input.location ?? "United States",
  });
  return {
    geoTargetConstants: [geo.resourceName],
    historicalMetricsOptions: { includeAverageCpc: true },
    language: languageResource(input.language ?? "en"),
  };
}
function normalizeIdea(value: unknown): KeywordIdea {
  const row = record(value);
  return {
    ...normalizeMetrics(
      String(row.text ?? ""),
      record(row.keywordIdeaMetrics ?? row.keyword_idea_metrics)
    ),
    closeVariants: array(row.closeVariants ?? row.close_variants).map(String),
  };
}
function normalizeMetrics(keyword: string, metrics: Record<string, unknown>) {
  return {
    keyword,
    avgMonthlySearches: number(
      metrics.avgMonthlySearches ?? metrics.avg_monthly_searches
    ),
    competition: String(metrics.competition ?? "UNSPECIFIED"),
    competitionIndex: number(
      metrics.competitionIndex ?? metrics.competition_index
    ),
    lowBidCents: cents(
      metrics.lowTopOfPageBidMicros ?? metrics.low_top_of_page_bid_micros
    ),
    highBidCents: cents(
      metrics.highTopOfPageBidMicros ?? metrics.high_top_of_page_bid_micros
    ),
    avgCpcCents: cents(metrics.averageCpcMicros ?? metrics.average_cpc_micros),
  };
}
function normalizeKeywords(values?: string[]): string[] {
  return [
    ...new Set(
      (values ?? []).flatMap((value) => {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
      })
    ),
  ];
}
function cents(value: unknown): number | null {
  const parsed = number(value);
  return parsed === null ? null : parsed / 10_000;
}
function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
