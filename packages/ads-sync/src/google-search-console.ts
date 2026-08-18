/**
 * Google Search Console provider module for Ads Sync.
 *
 * The provider syncs one Airbyte custom report stream that joins query and
 * page dimensions. Google finalizes Search Analytics rows after 2-3 days, so
 * the module requests `data_state: "final"` and syncs daily.
 */
import {
  fieldRequirement,
  isRecord,
  numberValue,
  stringValue,
} from "./provider-contract.js";
import type {
  AdsSyncProviderModule,
  CampaignDailyRecord,
  SourceIdentity,
  SourceReportingWindow,
} from "./provider-contract.js";

const DAILY_SCHEDULE_MINUTES = 24 * 60;
const BACKFILL_WINDOW_STEP_DAYS = 30;
const BACKFILL_MAX_WINDOWS_PER_RUN = 4;

/** Custom report stream name; the report joins query and page dimensions. */
export const GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_STREAM =
  "search_analytics_query_page";

/** Dimensions for the query+page custom report. The source adds `date`. */
export const GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_DIMENSIONS = [
  "query",
  "page",
] as const;

export const googleSearchConsoleProvider = {
  backfillPolicy: {
    maxWindowsPerRun: BACKFILL_MAX_WINDOWS_PER_RUN,
    windowStepDays: BACKFILL_WINDOW_STEP_DAYS,
  },
  defaultAirbyteSchema: "airbyte_google_search_console",
  defaultScheduleEveryMinutes: DAILY_SCHEDULE_MINUTES,
  displayName: "Google Search Console",
  id: "google_search_console",
  normalizeCampaignDailyRecord(
    record: Record<string, unknown>
  ): CampaignDailyRecord {
    // Organic search rows have no campaign, spend, or currency.
    return {
      account_id: stringValue(record.site_url),
      account_name: stringValue(record.site_url),
      campaign_id: null,
      campaign_name: null,
      campaign_status: null,
      clicks: numberValue(record.clicks),
      conversions: null,
      conversions_value: null,
      currency_code: null,
      date_day: stringValue(record.date),
      impressions: numberValue(record.impressions),
      platform: "google_search_console",
      raw_record_id: stringValue(record._airbyte_raw_id),
      source_generation_id: stringValue(record._airbyte_generation_id),
      source_table: `airbyte_google_search_console.${GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_STREAM}`,
      spend: null,
    };
  },
  rateLimitPolicy: {},
  reportingStreamRequirements: [
    {
      fields: [
        fieldRequirement("site_url", ["string"]),
        fieldRequirement("search_type", ["string"]),
        fieldRequirement("date", ["string"]),
        fieldRequirement("query", ["string"]),
        fieldRequirement("page", ["string"]),
        fieldRequirement("clicks", ["string", "number"]),
        fieldRequirement("impressions", ["string", "number"]),
        fieldRequirement("ctr", ["string", "number"]),
        fieldRequirement("position", ["string", "number"]),
      ],
      streamName: GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_STREAM,
    },
  ],
  reportingViews: ["ads_sync_reporting.gsc_query_page_daily"],
  sourceAccountId(sourceConfig: unknown): string | null {
    const siteUrls = sourceIdentity(sourceConfig).site_urls;
    return Array.isArray(siteUrls) ? stringValue(siteUrls[0]) : null;
  },
  sourceConfigForReporting(
    sourceConfig: Record<string, unknown>,
    _catalog: unknown,
    window: SourceReportingWindow
  ): Record<string, unknown> {
    const startDate =
      dateOnly(window.startDate) ??
      dateOnly(stringValue(sourceConfig.start_date)) ??
      undefined;
    const endDate =
      inclusiveEndDate(window.endDate) ??
      dateOnly(stringValue(sourceConfig.end_date)) ??
      undefined;
    return {
      ...sourceConfig,
      ...(endDate ? { end_date: endDate } : {}),
      ...(startDate ? { start_date: startDate } : {}),
    };
  },
  sourceConfigSecret: "GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON",
  sourceIdentity,
  sourceImage:
    "airbyte/source-google-search-console:2.1.9@sha256:3ee78d227a25ec01a31b9f131b1b8d80afd6e3aaf0c0c2f1b09c7973190465b3",
  stateSecret: "GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON",
  streamName: GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_STREAM,
} satisfies AdsSyncProviderModule;

function sourceIdentity(sourceConfig: unknown): SourceIdentity {
  if (!isRecord(sourceConfig)) {
    return {};
  }

  return {
    site_urls: Array.isArray(sourceConfig.site_urls)
      ? sourceConfig.site_urls.map(String)
      : [],
  };
}

function dateOnly(value: null | string | undefined) {
  if (!value) {
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return;
  }
  return date.toISOString().slice(0, 10);
}

function inclusiveEndDate(exclusiveEndDate: string | undefined) {
  if (!exclusiveEndDate) {
    return;
  }
  const date = new Date(exclusiveEndDate);
  if (Number.isNaN(date.getTime())) {
    return;
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
