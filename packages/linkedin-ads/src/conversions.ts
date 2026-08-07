import { createLinkedInAdsClient } from "./internal/linkedin-ads-client.js";
import type {
  CreateLinkedInAdsClientOptions,
  LinkedInAdsClient,
} from "./internal/linkedin-ads-client.js";

export type {
  GetLinkedInCampaignConversionInput,
  LinkedInCampaignConversionAssociation,
  LinkedInConversion,
  LinkedInConversionAttributionType,
  LinkedInConversionType,
} from "./internal/types.js";

export {
  LINKEDIN_CONVERSION_ATTRIBUTION_TYPES,
  LINKEDIN_CONVERSION_TYPES,
} from "./internal/types.js";

export type LinkedInConversionsClient = Pick<
  LinkedInAdsClient,
  "getCampaignConversion" | "getConversion"
>;

/**
 * Creates a read-only client for LinkedIn campaign-conversion associations.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversion-tracking?view=li-lms-2026-06
 */
export function createLinkedInConversionsClient(
  options: CreateLinkedInAdsClientOptions
): LinkedInConversionsClient {
  return createLinkedInAdsClient(options);
}
