import type { GoogleAdsClient } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertNumericId,
  customerResourceName,
  normalizeAndAssertCustomerId,
  updateMask,
  validateOnlyFromMode,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export interface SetCampaignMaxCpcInput {
  campaignIds: string[];
  customerId: string;
  /** CPC ceiling in whole-cent dollars between 0.01 and 1000, applied as targetSpend.cpcBidCeilingMicros. */
  maxCpc: number;
  mode?: WorkflowMode;
}

export function maxCpcToMicros(maxCpc: number): string {
  if (!(Number.isFinite(maxCpc) && maxCpc > 0)) {
    throw new Error("maxCpc must be a positive number of dollars.");
  }
  const cents = Math.round(maxCpc * 100);
  if (Math.abs(maxCpc * 100 - cents) > 1e-6) {
    throw new Error("maxCpc must be a whole number of cents.");
  }
  if (cents < 1 || cents > 100_000) {
    throw new Error("maxCpc must be between $0.01 and $1000.");
  }
  // Whole cents make the micros conversion exact: cents * 10_000 is always an
  // integer multiple of the USD bid unit and always a valid int64 string.
  return String(cents * 10_000);
}

export function buildSetCampaignMaxCpcOperations(
  input: SetCampaignMaxCpcInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  assertNonEmptyArray(
    input.campaignIds,
    "At least one campaign id is required."
  );

  const cpcBidCeilingMicros = maxCpcToMicros(input.maxCpc);
  const seen = new Set<string>();

  return input.campaignIds.map((campaignId) => {
    assertNumericId(campaignId, "campaignId");

    if (seen.has(campaignId)) {
      throw new Error(`duplicate campaign id: ${campaignId}`);
    }

    seen.add(campaignId);

    return {
      campaignOperation: {
        update: {
          resourceName: customerResourceName(
            customerId,
            "campaigns",
            campaignId,
            "campaignId"
          ),
          targetSpend: { cpcBidCeilingMicros },
        },
        // Sub-field mask granularity updates the ceiling without switching the
        // bidding strategy (compare update-campaign-bidding.ts's switchStrategy
        // masks). assertCampaignsOnMaximizeClicks guards strategy membership.
        updateMask: updateMask(["target_spend.cpc_bid_ceiling_micros"]),
      },
    };
  });
}

async function assertCampaignsOnMaximizeClicks(
  client: GoogleAdsClient,
  customerId: string,
  campaignIds: string[]
): Promise<void> {
  const statusById = new Map<string, string>();
  let pageToken: string | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- Each request needs the preceding page token and the guard read must complete before mutation.
    const response = await client.search({
      customerId,
      ...(pageToken ? { pageToken } : {}),
      query: `SELECT campaign.id, campaign.bidding_strategy_type, campaign.bidding_strategy FROM campaign WHERE campaign.id IN (${campaignIds.join(",")})`,
    });

    for (const row of response.rows) {
      const campaign = (row.campaign ?? {}) as Record<string, unknown>;
      const strategyType = String(
        campaign.biddingStrategyType ?? campaign.bidding_strategy_type
      );
      const portfolioStrategy = String(
        campaign.biddingStrategy ?? campaign.bidding_strategy ?? ""
      );
      // A portfolio Maximize Clicks strategy also reports TARGET_SPEND, but
      // its settings live on the portfolio resource, not campaign.target_spend.
      statusById.set(
        String(campaign.id),
        portfolioStrategy ? "portfolio bidding strategy" : strategyType
      );
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  const offenders = campaignIds.filter(
    (campaignId) => statusById.get(campaignId) !== "TARGET_SPEND"
  );
  if (offenders.length > 0) {
    const detail = offenders
      .map(
        (campaignId) =>
          `${campaignId} (${statusById.get(campaignId) ?? "not found"})`
      )
      .join(", ");
    throw new Error(
      `A CPC ceiling only applies to campaigns on a standard Maximize Clicks (TARGET_SPEND) strategy; refusing to mutate: ${detail}`
    );
  }
}

export async function setCampaignMaxCpc(
  client: GoogleAdsClient,
  input: SetCampaignMaxCpcInput
) {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  // Validate every local invariant before making a provider request. Retain
  // the exact operations so validation and execution cannot drift.
  const operations = buildSetCampaignMaxCpcOperations(input);

  await assertCampaignsOnMaximizeClicks(client, customerId, input.campaignIds);

  return client.mutate({
    customerId,
    operations,
    validateOnly: validateOnlyFromMode(input.mode),
  });
}
