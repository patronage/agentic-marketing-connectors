/** Google Ads provider module for Ads Sync. */
import {
  fieldRequirement,
  isRecord,
  microsToUnits,
  numberValue,
  stringValue,
} from "./provider-contract.js";
import type {
  AdsSyncProviderModule,
  CampaignDailyRecord,
  SourceIdentity,
  SourceReportingWindow,
} from "./provider-contract.js";

const DEFAULT_SCHEDULE_EVERY_MINUTES = 6 * 60;

export const googleAdsProvider = {
  backfillPolicy: {
    maxWindowsPerRun: 8,
    windowStepDays: 7,
  },
  defaultAirbyteSchema: "airbyte_google_ads",
  defaultScheduleEveryMinutes: DEFAULT_SCHEDULE_EVERY_MINUTES,
  displayName: "Google Ads",
  id: "google_ads",
  normalizeCampaignDailyRecord(
    record: Record<string, unknown>
  ): CampaignDailyRecord {
    return {
      account_id: stringValue(record.customer_id),
      account_name: stringValue(record.customer_descriptive_name),
      campaign_id: stringValue(record.campaign_id),
      campaign_name: stringValue(record.campaign_name),
      campaign_status: stringValue(record.campaign_status),
      clicks: numberValue(record.metrics_clicks),
      conversions: numberValue(record.metrics_conversions),
      conversions_value: numberValue(record.metrics_conversions_value),
      currency_code: stringValue(record.customer_currency_code),
      date_day: stringValue(record.segments_date),
      impressions: numberValue(record.metrics_impressions),
      platform: "google_ads",
      raw_record_id: stringValue(record._airbyte_raw_id),
      source_generation_id: stringValue(record._airbyte_generation_id),
      source_table: "airbyte_google_ads.campaign_daily_performance",
      spend: microsToUnits(record.metrics_cost_micros),
    };
  },
  rateLimitPolicy: {},
  reportingStreamRequirements: [
    {
      fields: [
        fieldRequirement("customer_id", ["string", "number"]),
        fieldRequirement("segments_date", ["string"]),
        fieldRequirement("campaign_id", ["string", "number"]),
        fieldRequirement("campaign_name", ["string"]),
        fieldRequirement("campaign_status", ["string"]),
        fieldRequirement("metrics_impressions", ["string", "number"]),
        fieldRequirement("metrics_clicks", ["string", "number"]),
        fieldRequirement("metrics_cost_micros", ["string", "number"]),
        fieldRequirement("metrics_conversions", ["string", "number"]),
        fieldRequirement("metrics_conversions_value", ["string", "number"]),
      ],
      streamName: "campaign_daily_performance",
    },
  ],
  reportingViews: ["ads_sync_reporting.ads_campaign_daily"],
  sourceAccountId(sourceConfig: unknown): string | null {
    const customerId = sourceIdentity(sourceConfig).customer_id;
    return typeof customerId === "string" ? customerId : null;
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
    const windowedCustomQueries =
      startDate && endDate && Array.isArray(sourceConfig.custom_queries_array)
        ? rewriteCustomQueriesForWindow(sourceConfig.custom_queries_array, {
            endDate,
            startDate,
          })
        : undefined;
    return {
      ...sourceConfig,
      ...(endDate ? { end_date: endDate } : {}),
      ...(startDate ? { start_date: startDate } : {}),
      ...(windowedCustomQueries
        ? { custom_queries_array: windowedCustomQueries }
        : {}),
    };
  },
  sourceConfigSecret: "GOOGLE_ADS_SOURCE_CONFIG_JSON",
  sourceIdentity,
  sourceImage:
    "airbyte/source-google-ads:6.1.0@sha256:dea39deedba0a095f60159d808dfb47fa778e304846396d2ab2f04c951b480ed",
  stateSecret: "GOOGLE_ADS_SOURCE_STATE_JSON",
  streamName: "campaign_daily_performance",
} satisfies AdsSyncProviderModule;

function sourceIdentity(sourceConfig: unknown): SourceIdentity {
  if (!isRecord(sourceConfig)) {
    return {};
  }

  return {
    customer_id: stringValue(sourceConfig.customer_id),
    login_customer_id: stringValue(sourceConfig.login_customer_id),
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

function rewriteCustomQueriesForWindow(
  customQueries: unknown[],
  window: { endDate: string; startDate: string }
) {
  return customQueries.map((customQuery) => {
    if (!isRecord(customQuery) || typeof customQuery.query !== "string") {
      return customQuery;
    }
    return {
      ...customQuery,
      query: rewriteDatePredicate(customQuery.query, window),
    };
  });
}

const BETWEEN_PATTERN =
  /segments\.date\s+BETWEEN\s+['"]?\d{4}-\d{2}-\d{2}['"]?\s+AND\s+['"]?\d{4}-\d{2}-\d{2}['"]?/iu;
const DURING_PATTERN = /segments\.date\s+DURING\s+[A-Z0-9_]+/iu;

function rewriteDatePredicate(
  query: string,
  window: { endDate: string; startDate: string }
) {
  const replacement = `segments.date BETWEEN '${window.startDate}' AND '${window.endDate}'`;
  if (BETWEEN_PATTERN.test(query)) {
    return query.replace(BETWEEN_PATTERN, replacement);
  }

  if (DURING_PATTERN.test(query)) {
    return query.replace(DURING_PATTERN, replacement);
  }

  return query;
}
