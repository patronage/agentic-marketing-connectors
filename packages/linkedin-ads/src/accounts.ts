import { createLinkedInAdsClient } from "./internal/linkedin-ads-client.js";
import type {
  CreateLinkedInAdsClientOptions,
  LinkedInAdsClient,
} from "./internal/linkedin-ads-client.js";

export {
  LINKEDIN_AD_ACCOUNT_ROLES,
  LINKEDIN_AD_ACCOUNT_SERVING_STATUSES,
  LINKEDIN_AD_ACCOUNT_STATUSES,
  LINKEDIN_AD_ACCOUNT_TYPES,
} from "./internal/types.js";
export type {
  LinkedInAdAccount,
  LinkedInAdAccountRole,
  LinkedInAdAccountServingStatus,
  LinkedInAdAccountStatus,
  LinkedInAdAccountType,
  LinkedInAdAccountUser,
  SearchLinkedInAdAccountsInput,
} from "./internal/types.js";

export type LinkedInAccountsClient = Pick<
  LinkedInAdsClient,
  | "getAdAccount"
  | "getAdAccountUser"
  | "listAdAccountUsers"
  | "listAuthenticatedUserAdAccountAccess"
  | "searchAdAccounts"
>;

/**
 * Creates a read-only client for LinkedIn ad-account identity and access data.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-account-users?view=li-lms-2026-06
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-accounts?view=li-lms-2026-06
 */
export function createLinkedInAccountsClient(
  options: CreateLinkedInAdsClientOptions
): LinkedInAccountsClient {
  return createLinkedInAdsClient(options);
}
