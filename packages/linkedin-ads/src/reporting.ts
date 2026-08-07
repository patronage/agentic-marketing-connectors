import { createLinkedInAdsClient } from "./internal/linkedin-ads-client.js";
import type {
  CreateLinkedInAdsClientOptions,
  LinkedInAdsClient,
} from "./internal/linkedin-ads-client.js";

export type {
  GetAnalyticsInput,
  GetAnalyticsStatisticsInput,
} from "./internal/linkedin-ads-client.js";

export {
  LINKEDIN_ANALYTICS_PIVOTS,
  LINKEDIN_ANALYTICS_STATISTICS_PIVOTS,
  LINKEDIN_TIME_GRANULARITIES,
} from "./internal/types.js";
export type {
  LinkedInAnalyticsElement,
  LinkedInAnalyticsPivot,
  LinkedInAnalyticsStatisticsPivot,
  LinkedInTimeGranularity,
} from "./internal/types.js";
export type LinkedInReportingClient = Pick<
  LinkedInAdsClient,
  "getAnalytics" | "getAnalyticsStatistics"
>;

/**
 * Creates a read-only reporting client for LinkedIn's versioned adAnalytics finders.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting?view=li-lms-2026-06
 */
export function createLinkedInReportingClient(
  options: CreateLinkedInAdsClientOptions
): LinkedInReportingClient {
  return createLinkedInAdsClient(options);
}
