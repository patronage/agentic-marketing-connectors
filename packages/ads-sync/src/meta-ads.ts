/** Meta Ads provider module for Ads Sync. */
import {
  actionSum,
  catalogTopLevelFieldNames,
  fieldRequirement,
  findConfiguredCatalogStream,
  isRecord,
  numberValue,
  stringValue,
  topLevelFieldRequirement,
} from "./provider-contract.js";
import type {
  AdsSyncProviderModule,
  CampaignDailyRecord,
  ReportingFieldRequirement,
  SourceIdentity,
  SourceReportingWindow,
} from "./provider-contract.js";

const DEFAULT_SCHEDULE_EVERY_MINUTES = 6 * 60;
const RATE_LIMIT_COOLDOWN_SECONDS = 60 * 60;
const META_RATE_LIMIT_ERROR_CODE = 17;

const conversionActionTypes = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

const metaPerformanceFields: ReportingFieldRequirement[] = [
  fieldRequirement("account_id", ["string"]),
  fieldRequirement("account_name", ["string"]),
  fieldRequirement("account_currency", ["string"]),
  fieldRequirement("date_start", ["string"]),
  fieldRequirement("campaign_id", ["string"]),
  fieldRequirement("campaign_name", ["string"]),
  fieldRequirement("impressions", ["string", "number"]),
  fieldRequirement("reach", ["string", "number"]),
  fieldRequirement("frequency", ["string", "number"]),
  fieldRequirement("clicks", ["string", "number"]),
  fieldRequirement("ctr", ["string", "number"]),
  fieldRequirement("cpc", ["string", "number"]),
  fieldRequirement("cpm", ["string", "number"]),
  fieldRequirement("spend", ["string", "number"]),
  fieldRequirement("actions", ["array"]),
  fieldRequirement("action_values", ["array"]),
  fieldRequirement("cost_per_action_type", ["array"]),
  fieldRequirement("unique_actions", ["array"]),
  fieldRequirement("cost_per_unique_action_type", ["array"]),
  fieldRequirement("inline_link_clicks", ["string", "number"]),
  fieldRequirement("inline_link_click_ctr", ["string", "number"]),
  fieldRequirement("outbound_clicks", ["array"]),
  fieldRequirement("outbound_clicks_ctr", ["array"]),
  fieldRequirement("cost_per_inline_link_click", ["string", "number"]),
  fieldRequirement("cost_per_outbound_click", ["array"]),
  fieldRequirement("inline_post_engagement", ["string", "number"]),
  fieldRequirement("video_thruplay_watched_actions", ["array"]),
  fieldRequirement("cost_per_thruplay", ["array"]),
  fieldRequirement("video_play_actions", ["array"]),
  fieldRequirement("video_continuous_2_sec_watched_actions", ["array"]),
  fieldRequirement("video_avg_time_watched_actions", ["array"]),
  fieldRequirement("video_p25_watched_actions", ["array"]),
  fieldRequirement("video_p50_watched_actions", ["array"]),
  fieldRequirement("video_p75_watched_actions", ["array"]),
  fieldRequirement("video_p95_watched_actions", ["array"]),
  fieldRequirement("video_p100_watched_actions", ["array"]),
  fieldRequirement("website_purchase_roas", ["array"]),
];

const metaReportingInsightStreams = [
  {
    level: "campaign",
    name: "campaign_daily_performance",
    streamName: "customcampaign_daily_performance",
  },
  {
    level: "adset",
    name: "adset_daily_performance",
    streamName: "customadset_daily_performance",
  },
  {
    level: "ad",
    name: "ad_daily_performance",
    streamName: "customad_daily_performance",
  },
] as const;

export const metaAdsProvider = {
  backfillPolicy: {
    maxWindowsPerRun: 4,
    windowStepDays: 3,
  },
  defaultAirbyteSchema: "airbyte_meta_ads",
  defaultScheduleEveryMinutes: DEFAULT_SCHEDULE_EVERY_MINUTES,
  displayName: "Meta Ads",
  id: "meta_ads",
  normalizeCampaignDailyRecord(
    record: Record<string, unknown>
  ): CampaignDailyRecord {
    return {
      account_id: stringValue(record.account_id),
      account_name: stringValue(record.account_name),
      campaign_id: stringValue(record.campaign_id),
      campaign_name: stringValue(record.campaign_name),
      campaign_status: stringValue(record.campaign_status),
      clicks: numberValue(record.clicks),
      conversions: actionSum(record.actions, conversionActionTypes),
      conversions_value: actionSum(record.action_values, conversionActionTypes),
      currency_code: stringValue(record.account_currency),
      date_day: stringValue(record.date_start),
      impressions: numberValue(record.impressions),
      platform: "meta_ads",
      raw_record_id: stringValue(record._airbyte_raw_id),
      source_generation_id: stringValue(record._airbyte_generation_id),
      source_table: "airbyte_meta_ads.customcampaign_daily_performance",
      spend: numberValue(record.spend),
    };
  },
  rateLimitPolicy: {
    cooldownSeconds: RATE_LIMIT_COOLDOWN_SECONDS,
    stopOnCode: META_RATE_LIMIT_ERROR_CODE,
  },
  reportingStreamRequirements: [
    {
      fields: [
        ...metaPerformanceFields,
        fieldRequirement("objective", ["string"]),
      ],
      streamName: "customcampaign_daily_performance",
    },
    {
      fields: [
        ...metaPerformanceFields,
        fieldRequirement("adset_id", ["string"]),
        fieldRequirement("adset_name", ["string"]),
        fieldRequirement("optimization_goal", ["string"]),
      ],
      streamName: "customadset_daily_performance",
    },
    {
      fields: [
        ...metaPerformanceFields,
        fieldRequirement("adset_id", ["string"]),
        fieldRequirement("adset_name", ["string"]),
        fieldRequirement("ad_id", ["string"]),
        fieldRequirement("ad_name", ["string"]),
        fieldRequirement("quality_ranking", ["string"]),
        fieldRequirement("engagement_rate_ranking", ["string"]),
        fieldRequirement("conversion_rate_ranking", ["string"]),
      ],
      streamName: "customad_daily_performance",
    },
    {
      fields: [
        topLevelFieldRequirement("id", ["string"]),
        fieldRequirement("account_id", ["string"]),
        fieldRequirement("name", ["string"]),
        fieldRequirement("creative", ["object"], {
          alternatives: [
            topLevelFieldRequirement("creative_id", ["string"]),
            topLevelFieldRequirement("ad_creative_id", ["string"]),
          ],
        }),
      ],
      streamName: "ads",
    },
    {
      fields: [
        topLevelFieldRequirement("id", ["string"]),
        fieldRequirement("name", ["string"]),
        fieldRequirement("object_story_id", ["string"]),
        fieldRequirement("effective_object_story_id", ["string"]),
        fieldRequirement("object_story_spec", ["object"]),
        fieldRequirement("asset_feed_spec", ["object"]),
        fieldRequirement("thumbnail_url", ["string"]),
      ],
      streamName: "ad_creatives",
    },
    {
      fields: [topLevelFieldRequirement("hash", ["string"])],
      streamName: "images",
    },
    {
      fields: [topLevelFieldRequirement("id", ["string"])],
      streamName: "videos",
    },
  ],
  reportingViews: [
    "ads_sync_reporting.ads_campaign_daily",
    "ads_sync_reporting.ads_group_daily",
    "ads_sync_reporting.ads_ad_daily",
    "ads_sync_reporting.meta_ad_creative_context",
  ],
  sourceAccountId(sourceConfig: unknown): string | null {
    const accountIds = sourceIdentity(sourceConfig).account_ids;
    return Array.isArray(accountIds) ? stringValue(accountIds[0]) : null;
  },
  sourceConfigForReporting(
    sourceConfig: Record<string, unknown>,
    catalog: unknown,
    window: SourceReportingWindow
  ): Record<string, unknown> {
    const startDate =
      isoSeconds(window.metaStartDate) ??
      isoSeconds(window.startDate) ??
      isoSeconds(stringValue(sourceConfig.start_date)) ??
      undefined;
    const endDate =
      isoSeconds(window.metaEndDate) ?? inclusiveEndDateTime(window.endDate);
    const existingInsights = Array.isArray(sourceConfig.custom_insights)
      ? sourceConfig.custom_insights.filter(isRecord)
      : [];
    const reportingInsightKeys = new Set<string>(
      metaReportingInsightStreams.map(({ name }) => name)
    );
    const reportingInsights = metaReportingInsightStreams.flatMap((insight) => {
      const existing =
        existingInsights.find((candidate) => candidate.name === insight.name) ??
        existingInsights.find(
          (candidate) => candidate.level === insight.level
        ) ??
        {};
      const stream = findConfiguredCatalogStream(catalog, insight.streamName);
      if (!stream) {
        return [];
      }
      const fields = catalogTopLevelFieldNames(stream);

      const derivedInsight: Record<string, unknown> = {
        ...existing,
        action_breakdowns: [],
        action_report_time: "mixed",
        breakdowns: [],
        fields,
        level: insight.level,
        name: insight.name,
        time_increment: 1,
        ...(endDate ? { end_date: endDate } : {}),
        ...(startDate ? { start_date: startDate } : {}),
      };
      if (
        typeof derivedInsight.end_date === "string" &&
        derivedInsight.end_date.trim() === ""
      ) {
        delete derivedInsight.end_date;
      }
      return [derivedInsight];
    });
    const unrelatedInsights = existingInsights.filter(
      (insight) =>
        typeof insight.name !== "string" ||
        !reportingInsightKeys.has(insight.name)
    );

    return {
      ...sourceConfig,
      ...(startDate ? { start_date: startDate } : {}),
      custom_insights: [...unrelatedInsights, ...reportingInsights],
    };
  },
  sourceConfigSecret: "META_ADS_SOURCE_CONFIG_JSON",
  sourceIdentity,
  sourceImage:
    "airbyte/source-facebook-marketing:5.2.11@sha256:4d6c916b29862ded4b5b94feea0b8ef75899f34c364e4884312e50414b6d447c",
  stateSecret: "META_ADS_SOURCE_STATE_JSON",
  streamName: "customcampaign_daily_performance",
} satisfies AdsSyncProviderModule;

function sourceIdentity(sourceConfig: unknown): SourceIdentity {
  if (!isRecord(sourceConfig)) {
    return {};
  }

  return {
    account_ids: Array.isArray(sourceConfig.account_ids)
      ? sourceConfig.account_ids.map(String)
      : [],
  };
}

function isoSeconds(value: null | string | undefined) {
  if (!value) {
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return;
  }
  return `${date.toISOString().slice(0, 19)}Z`;
}

function inclusiveEndDateTime(exclusiveEndDate: string | undefined) {
  if (!exclusiveEndDate) {
    return;
  }
  const date = new Date(exclusiveEndDate);
  if (Number.isNaN(date.getTime())) {
    return;
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.toISOString().slice(0, 19)}Z`;
}
