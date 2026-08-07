import { createLinkedInAdsClient } from "./internal/linkedin-ads-client.js";
import type {
  CreateLinkedInAdsClientOptions,
  LinkedInAdsClient,
} from "./internal/linkedin-ads-client.js";

export {
  LINKEDIN_CREATIVE_INTENDED_STATUSES,
  LINKEDIN_CREATIVE_REVIEW_STATUSES,
  LINKEDIN_CREATIVE_SERVING_HOLD_REASONS,
} from "./internal/types.js";
export type {
  LinkedInCreative,
  LinkedInCreativeIntendedStatus,
  LinkedInCreativeReviewStatus,
  LinkedInCreativeServingHoldReason,
} from "./internal/types.js";

export type LinkedInCreativesClient = Pick<LinkedInAdsClient, "getCreative">;

/**
 * Creates a read-only client for LinkedIn's current Creatives API model.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives?view=li-lms-2026-06
 */
export function createLinkedInCreativesClient(
  options: CreateLinkedInAdsClientOptions
): LinkedInCreativesClient {
  return createLinkedInAdsClient(options);
}
