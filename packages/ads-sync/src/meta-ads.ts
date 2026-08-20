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
  AccessTokenSourceConfigInput,
  AdsSyncProviderModule,
  CampaignDailyRecord,
  ConfiguredCatalog,
  ReportingFieldRequirement,
  SourceIdentity,
  SourceReportingWindow,
} from "./provider-contract.js";

export type {
  AccessTokenSourceConfigInput,
  ConfiguredCatalog,
  ConfiguredCatalogStream,
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

/**
 * Fully configured Airbyte catalog for Meta Ads. Three custom insight streams
 * carry daily performance; four metadata streams carry ad, creative, image,
 * and video context for reporting views.
 */
export const metaAdsConfiguredCatalog = {
  streams: [
    {
      cursor_field: ["date_start"],
      destination_sync_mode: "append_dedup",
      generation_id: 0,
      minimum_generation_id: 0,
      primary_key: [["date_start"], ["account_id"], ["campaign_id"]],
      stream: {
        json_schema: {
          properties: {
            account_currency: { type: ["string", "null"] },
            account_id: { type: ["string", "null"] },
            account_name: { type: ["string", "null"] },
            action_values: { type: ["array", "null"] },
            actions: { type: ["array", "null"] },
            campaign_id: { type: ["string", "null"] },
            campaign_name: { type: ["string", "null"] },
            clicks: { type: ["string", "number", "null"] },
            cost_per_action_type: { type: ["array", "null"] },
            cost_per_inline_link_click: { type: ["string", "number", "null"] },
            cost_per_outbound_click: { type: ["array", "null"] },
            cost_per_thruplay: { type: ["array", "null"] },
            cost_per_unique_action_type: { type: ["array", "null"] },
            cpc: { type: ["string", "number", "null"] },
            cpm: { type: ["string", "number", "null"] },
            ctr: { type: ["string", "number", "null"] },
            date_start: { type: ["string", "null"] },
            date_stop: { type: ["string", "null"] },
            frequency: { type: ["string", "number", "null"] },
            impressions: { type: ["string", "number", "null"] },
            inline_link_click_ctr: { type: ["string", "number", "null"] },
            inline_link_clicks: { type: ["string", "number", "null"] },
            inline_post_engagement: { type: ["string", "number", "null"] },
            objective: { type: ["string", "null"] },
            outbound_clicks: { type: ["array", "null"] },
            outbound_clicks_ctr: { type: ["array", "null"] },
            reach: { type: ["string", "number", "null"] },
            spend: { type: ["string", "number", "null"] },
            unique_actions: { type: ["array", "null"] },
            video_avg_time_watched_actions: { type: ["array", "null"] },
            video_continuous_2_sec_watched_actions: { type: ["array", "null"] },
            video_p25_watched_actions: { type: ["array", "null"] },
            video_p50_watched_actions: { type: ["array", "null"] },
            video_p75_watched_actions: { type: ["array", "null"] },
            video_p95_watched_actions: { type: ["array", "null"] },
            video_p100_watched_actions: { type: ["array", "null"] },
            video_play_actions: { type: ["array", "null"] },
            video_thruplay_watched_actions: { type: ["array", "null"] },
            website_purchase_roas: { type: ["array", "null"] },
          },
          type: "object",
        },
        name: "customcampaign_daily_performance",
        supported_sync_modes: ["full_refresh", "incremental"],
      },
      sync_id: 0,
      sync_mode: "incremental",
    },
    {
      cursor_field: ["date_start"],
      destination_sync_mode: "append_dedup",
      generation_id: 0,
      minimum_generation_id: 0,
      primary_key: [["date_start"], ["account_id"], ["adset_id"]],
      stream: {
        json_schema: {
          properties: {
            account_currency: { type: ["string", "null"] },
            account_id: { type: ["string", "null"] },
            account_name: { type: ["string", "null"] },
            action_values: { type: ["array", "null"] },
            actions: { type: ["array", "null"] },
            adset_id: { type: ["string", "null"] },
            adset_name: { type: ["string", "null"] },
            campaign_id: { type: ["string", "null"] },
            campaign_name: { type: ["string", "null"] },
            clicks: { type: ["string", "number", "null"] },
            cost_per_action_type: { type: ["array", "null"] },
            cost_per_inline_link_click: { type: ["string", "number", "null"] },
            cost_per_outbound_click: { type: ["array", "null"] },
            cost_per_thruplay: { type: ["array", "null"] },
            cost_per_unique_action_type: { type: ["array", "null"] },
            cpc: { type: ["string", "number", "null"] },
            cpm: { type: ["string", "number", "null"] },
            ctr: { type: ["string", "number", "null"] },
            date_start: { type: ["string", "null"] },
            date_stop: { type: ["string", "null"] },
            frequency: { type: ["string", "number", "null"] },
            impressions: { type: ["string", "number", "null"] },
            inline_link_click_ctr: { type: ["string", "number", "null"] },
            inline_link_clicks: { type: ["string", "number", "null"] },
            inline_post_engagement: { type: ["string", "number", "null"] },
            optimization_goal: { type: ["string", "null"] },
            outbound_clicks: { type: ["array", "null"] },
            outbound_clicks_ctr: { type: ["array", "null"] },
            reach: { type: ["string", "number", "null"] },
            spend: { type: ["string", "number", "null"] },
            unique_actions: { type: ["array", "null"] },
            video_avg_time_watched_actions: { type: ["array", "null"] },
            video_continuous_2_sec_watched_actions: { type: ["array", "null"] },
            video_p25_watched_actions: { type: ["array", "null"] },
            video_p50_watched_actions: { type: ["array", "null"] },
            video_p75_watched_actions: { type: ["array", "null"] },
            video_p95_watched_actions: { type: ["array", "null"] },
            video_p100_watched_actions: { type: ["array", "null"] },
            video_play_actions: { type: ["array", "null"] },
            video_thruplay_watched_actions: { type: ["array", "null"] },
            website_purchase_roas: { type: ["array", "null"] },
          },
          type: "object",
        },
        name: "customadset_daily_performance",
        supported_sync_modes: ["full_refresh", "incremental"],
      },
      sync_id: 0,
      sync_mode: "incremental",
    },
    {
      cursor_field: ["date_start"],
      destination_sync_mode: "append_dedup",
      generation_id: 0,
      minimum_generation_id: 0,
      primary_key: [["date_start"], ["account_id"], ["ad_id"]],
      stream: {
        json_schema: {
          properties: {
            account_currency: { type: ["string", "null"] },
            account_id: { type: ["string", "null"] },
            account_name: { type: ["string", "null"] },
            action_values: { type: ["array", "null"] },
            actions: { type: ["array", "null"] },
            ad_id: { type: ["string", "null"] },
            ad_name: { type: ["string", "null"] },
            adset_id: { type: ["string", "null"] },
            adset_name: { type: ["string", "null"] },
            campaign_id: { type: ["string", "null"] },
            campaign_name: { type: ["string", "null"] },
            clicks: { type: ["string", "number", "null"] },
            conversion_rate_ranking: { type: ["string", "null"] },
            cost_per_action_type: { type: ["array", "null"] },
            cost_per_inline_link_click: { type: ["string", "number", "null"] },
            cost_per_outbound_click: { type: ["array", "null"] },
            cost_per_thruplay: { type: ["array", "null"] },
            cost_per_unique_action_type: { type: ["array", "null"] },
            cpc: { type: ["string", "number", "null"] },
            cpm: { type: ["string", "number", "null"] },
            ctr: { type: ["string", "number", "null"] },
            date_start: { type: ["string", "null"] },
            date_stop: { type: ["string", "null"] },
            engagement_rate_ranking: { type: ["string", "null"] },
            frequency: { type: ["string", "number", "null"] },
            impressions: { type: ["string", "number", "null"] },
            inline_link_click_ctr: { type: ["string", "number", "null"] },
            inline_link_clicks: { type: ["string", "number", "null"] },
            inline_post_engagement: { type: ["string", "number", "null"] },
            outbound_clicks: { type: ["array", "null"] },
            outbound_clicks_ctr: { type: ["array", "null"] },
            quality_ranking: { type: ["string", "null"] },
            reach: { type: ["string", "number", "null"] },
            spend: { type: ["string", "number", "null"] },
            unique_actions: { type: ["array", "null"] },
            video_avg_time_watched_actions: { type: ["array", "null"] },
            video_continuous_2_sec_watched_actions: { type: ["array", "null"] },
            video_p25_watched_actions: { type: ["array", "null"] },
            video_p50_watched_actions: { type: ["array", "null"] },
            video_p75_watched_actions: { type: ["array", "null"] },
            video_p95_watched_actions: { type: ["array", "null"] },
            video_p100_watched_actions: { type: ["array", "null"] },
            video_play_actions: { type: ["array", "null"] },
            video_thruplay_watched_actions: { type: ["array", "null"] },
            website_purchase_roas: { type: ["array", "null"] },
          },
          type: "object",
        },
        name: "customad_daily_performance",
        supported_sync_modes: ["full_refresh", "incremental"],
      },
      sync_id: 0,
      sync_mode: "incremental",
    },
    {
      cursor_field: [],
      destination_sync_mode: "overwrite",
      generation_id: 0,
      minimum_generation_id: 0,
      primary_key: [["id"]],
      stream: {
        json_schema: {
          additionalProperties: true,
          properties: {
            account_id: { type: ["string", "null"] },
            adset_id: { type: ["string", "null"] },
            campaign_id: { type: ["string", "null"] },
            configured_status: { type: ["string", "null"] },
            created_time: { type: ["string", "null"] },
            creative: {
              additionalProperties: true,
              properties: {
                creative_id: { type: ["string", "null"] },
                id: { type: ["string", "null"] },
              },
              type: ["object", "null"],
            },
            effective_status: { type: ["string", "null"] },
            id: { type: ["string", "null"] },
            name: { type: ["string", "null"] },
            preview_shareable_link: { type: ["string", "null"] },
            source_ad_id: { type: ["string", "null"] },
            status: { type: ["string", "null"] },
            tracking_specs: { type: ["array", "null"] },
            updated_time: { type: ["string", "null"] },
          },
          type: "object",
        },
        name: "ads",
        supported_sync_modes: ["full_refresh", "incremental"],
      },
      sync_id: 0,
      sync_mode: "full_refresh",
    },
    {
      cursor_field: [],
      destination_sync_mode: "overwrite",
      generation_id: 0,
      minimum_generation_id: 0,
      primary_key: [["id"]],
      stream: {
        json_schema: {
          additionalProperties: true,
          properties: {
            account_id: { type: ["string", "null"] },
            actor_id: { type: ["string", "null"] },
            asset_feed_spec: { type: ["object", "null"] },
            body: { type: ["string", "null"] },
            call_to_action_type: { type: ["string", "null"] },
            effective_instagram_media_id: { type: ["string", "null"] },
            effective_object_story_id: { type: ["string", "null"] },
            id: { type: ["string", "null"] },
            image_hash: { type: ["string", "null"] },
            image_url: { type: ["string", "null"] },
            instagram_permalink_url: { type: ["string", "null"] },
            instagram_user_id: { type: ["string", "null"] },
            link_url: { type: ["string", "null"] },
            name: { type: ["string", "null"] },
            object_id: { type: ["string", "null"] },
            object_story_id: { type: ["string", "null"] },
            object_story_spec: { type: ["object", "null"] },
            object_type: { type: ["string", "null"] },
            object_url: { type: ["string", "null"] },
            source_instagram_media_id: { type: ["string", "null"] },
            status: { type: ["string", "null"] },
            thumbnail_data_url: { type: ["string", "null"] },
            thumbnail_url: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
            url_tags: { type: ["string", "null"] },
            video_id: { type: ["string", "null"] },
          },
          type: "object",
        },
        name: "ad_creatives",
        supported_sync_modes: ["full_refresh", "incremental"],
      },
      sync_id: 0,
      sync_mode: "full_refresh",
    },
    {
      cursor_field: [],
      destination_sync_mode: "overwrite",
      generation_id: 0,
      minimum_generation_id: 0,
      primary_key: [["hash"]],
      stream: {
        json_schema: {
          additionalProperties: true,
          properties: {
            account_id: { type: ["string", "null"] },
            creatives: { type: ["array", "null"] },
            created_time: { type: ["string", "null"] },
            hash: { type: ["string", "null"] },
            height: { type: ["integer", "null"] },
            id: { type: ["string", "null"] },
            name: { type: ["string", "null"] },
            permalink_url: { type: ["string", "null"] },
            updated_time: { type: ["string", "null"] },
            url: { type: ["string", "null"] },
            url_128: { type: ["string", "null"] },
            width: { type: ["integer", "null"] },
          },
          type: "object",
        },
        name: "images",
        supported_sync_modes: ["full_refresh", "incremental"],
      },
      sync_id: 0,
      sync_mode: "full_refresh",
    },
    {
      cursor_field: [],
      destination_sync_mode: "overwrite",
      generation_id: 0,
      minimum_generation_id: 0,
      primary_key: [["id"]],
      stream: {
        json_schema: {
          additionalProperties: true,
          properties: {
            account_id: { type: ["string", "null"] },
            created_time: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            format: { type: ["array", "null"] },
            id: { type: ["string", "null"] },
            length: { type: ["number", "null"] },
            permalink_url: { type: ["string", "null"] },
            picture: { type: ["string", "null"] },
            source: { type: ["string", "null"] },
            thumbnails: { type: ["array", "null"] },
            title: { type: ["string", "null"] },
            updated_time: { type: ["string", "null"] },
            views: { type: ["integer", "null"] },
          },
          type: "object",
        },
        name: "videos",
        supported_sync_modes: ["full_refresh", "incremental"],
      },
      sync_id: 0,
      sync_mode: "full_refresh",
    },
  ],
} as const satisfies ConfiguredCatalog;

const DEFAULT_INSIGHTS_LOOKBACK_WINDOW_DAYS = 28;
const DEFAULT_PAGE_SIZE = 100;
const ALL_ENTITY_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"];

/**
 * Builds the access-token-only source configuration. The Meta Marketing API
 * source authenticates with one long-lived access token, so the pinned image
 * needs no patch. Custom insights derive from the configured catalog.
 */
export function metaAdsAccessTokenSourceConfig(
  input: AccessTokenSourceConfigInput
): Record<string, unknown> {
  const startDate = isoSeconds(input.startDate);
  if (!startDate) {
    throw new Error(
      `startDate must be an ISO date, received ${input.startDate}`
    );
  }
  if (input.endDate !== undefined && !isoSeconds(input.endDate)) {
    throw new Error(`endDate must be an ISO date, received ${input.endDate}`);
  }
  const baseConfig: Record<string, unknown> = {
    access_token: input.accessToken,
    account_ids: [...input.accountIds],
    action_breakdowns: [],
    ad_statuses: [...ALL_ENTITY_STATUSES],
    adset_statuses: [...ALL_ENTITY_STATUSES],
    campaign_statuses: [...ALL_ENTITY_STATUSES],
    fetch_thumbnail_images: false,
    include_deleted: true,
    insights_lookback_window: DEFAULT_INSIGHTS_LOOKBACK_WINDOW_DAYS,
    page_size: DEFAULT_PAGE_SIZE,
    start_date: startDate,
  };
  return metaAdsProvider.sourceConfigForReporting(
    baseConfig,
    metaAdsConfiguredCatalog,
    { endDate: input.endDate, startDate: input.startDate }
  );
}

export const metaAdsProvider = {
  accessTokenSourceConfig: metaAdsAccessTokenSourceConfig,
  backfillPolicy: {
    maxWindowsPerRun: 4,
    windowStepDays: 3,
  },
  configuredCatalog: metaAdsConfiguredCatalog,
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
