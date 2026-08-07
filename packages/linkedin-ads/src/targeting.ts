import { createLinkedInAdsClient } from "./internal/linkedin-ads-client.js";
import type {
  CreateLinkedInAdsClientOptions,
  LinkedInAdsClient,
} from "./internal/linkedin-ads-client.js";

export type {
  GetLinkedInAudienceCountsInput,
  LinkedInAudienceCount,
  LinkedInAudienceCountTargetingCriteria,
  LinkedInTargetingEntity,
  LinkedInTargetingFacet,
  LinkedInTargetingLocale,
  ListLinkedInTargetingEntitiesInput,
  SearchLinkedInTargetingEntitiesInput,
} from "./internal/types.js";

export type LinkedInTargetingClient = Pick<
  LinkedInAdsClient,
  | "getAudienceCounts"
  | "listTargetingEntities"
  | "listTargetingFacets"
  | "searchTargetingEntities"
>;

/**
 * Creates a read-only targeting client for LinkedIn's versioned REST APIs.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/ads-targeting?view=li-lms-2026-06
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/audience-counts?view=li-lms-2026-06
 */
export function createLinkedInTargetingClient(
  options: CreateLinkedInAdsClientOptions
): LinkedInTargetingClient {
  return createLinkedInAdsClient(options);
}
