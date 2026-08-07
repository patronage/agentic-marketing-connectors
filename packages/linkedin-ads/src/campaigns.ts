import { createLinkedInAdsClient } from "./internal/linkedin-ads-client.js";
import type {
  CreateLinkedInAdsClientOptions,
  LinkedInAdsClient,
} from "./internal/linkedin-ads-client.js";

export {
  LINKEDIN_CAMPAIGN_GROUP_READ_STATUSES,
  LINKEDIN_CAMPAIGN_GROUP_SERVING_STATUSES,
  LINKEDIN_CAMPAIGN_PACING_STRATEGIES,
  LINKEDIN_CAMPAIGN_READ_STATUSES,
  LINKEDIN_CAMPAIGN_SERVING_STATUSES,
} from "./internal/types.js";
export type {
  LinkedInCampaign,
  LinkedInCampaignGroup,
  LinkedInCampaignGroupReadStatus,
  LinkedInCampaignGroupServingStatus,
  LinkedInCampaignPacingStrategy,
  LinkedInCampaignReadStatus,
  LinkedInCampaignServingStatus,
} from "./internal/types.js";

export type LinkedInCampaignsClient = Pick<
  LinkedInAdsClient,
  "getCampaign" | "getCampaignGroup" | "listCampaigns" | "listCampaignGroups"
>;

/**
 * Creates a read-only client for LinkedIn campaign budget and delivery state.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns?view=li-lms-2026-06
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaign-groups?view=li-lms-2026-06
 */
export function createLinkedInCampaignsClient(
  options: CreateLinkedInAdsClientOptions
): LinkedInCampaignsClient {
  return createLinkedInAdsClient(options);
}
