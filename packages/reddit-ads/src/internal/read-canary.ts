import type { RedditAdsClient } from "./reddit-ads-client.js";

/**
 * Representative read-only routes from the v3 Ads API.
 * @see https://ads-api.reddit.com/api/v3/openapi.json
 */
export const REDDIT_ADS_READ_VERIFICATION_MATRIX = [
  "getMe",
  "getAdAccount",
  "listCampaigns",
  "listAdGroups",
  "listAds",
  "listCommunities",
  "listInterests",
  "listFundingInstruments",
] as const;

export type RedditAdsReadCanaryOperation =
  (typeof REDDIT_ADS_READ_VERIFICATION_MATRIX)[number];

export interface RedditAdsReadCanaryResult {
  error?: { message: string; name: string };
  operation: RedditAdsReadCanaryOperation;
  status: "failed" | "passed";
}

type RedditAdsReadClient = Pick<
  RedditAdsClient,
  | "getAdAccount"
  | "getMe"
  | "listAdGroups"
  | "listAds"
  | "listCampaigns"
  | "listCommunities"
  | "listFundingInstruments"
  | "listInterests"
>;

/** Exercises representative account reads without invoking a mutation method. */
export async function runRedditAdsReadCanary(
  client: RedditAdsReadClient
): Promise<RedditAdsReadCanaryResult[]> {
  const handlers: Record<RedditAdsReadCanaryOperation, () => Promise<unknown>> =
    {
      getAdAccount: () => client.getAdAccount(),
      getMe: () => client.getMe(),
      listAdGroups: () => client.listAdGroups({ pageSize: 1 }),
      listAds: () => client.listAds({ pageSize: 1 }),
      listCampaigns: () => client.listCampaigns({ pageSize: 1 }),
      listCommunities: () => client.listCommunities({ pageSize: 1 }),
      listFundingInstruments: () =>
        client.listFundingInstruments({ pageSize: 1 }),
      listInterests: () => client.listInterests(),
    };

  const results: RedditAdsReadCanaryResult[] = [];
  for (const operation of REDDIT_ADS_READ_VERIFICATION_MATRIX) {
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- live canaries are serialized to remain low impact.
      await handlers[operation]();
      results.push({ operation, status: "passed" });
    } catch (error) {
      results.push({ error: safeError(error), operation, status: "failed" });
    }
  }
  return results;
}

function safeError(error: unknown): { message: string; name: string } {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: String(error), name: "UnknownError" };
}
