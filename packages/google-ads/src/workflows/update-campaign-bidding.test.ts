import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildUpdateCampaignBiddingOperations,
  updateCampaignBidding,
} from "./update-campaign-bidding.js";

describe("update campaign bidding workflow", () => {
  it("builds campaign bidding update operations with exact masks", () => {
    expect(
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            campaignId: "111",
            strategyType: "MAXIMIZE_CONVERSIONS",
            targetCpaMicros: 5_000_000,
          },
          {
            campaignId: "222",
            strategyType: "MAXIMIZE_CONVERSION_VALUE",
            targetRoas: 3.25,
          },
          {
            campaignId: "333",
            enhancedCpcEnabled: true,
            strategyType: "MANUAL_CPC",
          },
          {
            biddingStrategyResourceName:
              "customers/1234567890/biddingStrategies/444",
            campaignId: "444",
            strategyType: "PORTFOLIO",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        campaignOperation: {
          update: {
            maximizeConversions: { targetCpaMicros: 5_000_000 },
            resourceName: "customers/1234567890/campaigns/111",
          },
          updateMask: "maximize_conversions.target_cpa_micros",
        },
      },
      {
        campaignOperation: {
          update: {
            maximizeConversionValue: { targetRoas: 3.25 },
            resourceName: "customers/1234567890/campaigns/222",
          },
          updateMask: "maximize_conversion_value.target_roas",
        },
      },
      {
        campaignOperation: {
          update: {
            manualCpc: { enhancedCpcEnabled: true },
            resourceName: "customers/1234567890/campaigns/333",
          },
          updateMask: "manual_cpc.enhanced_cpc_enabled",
        },
      },
      {
        campaignOperation: {
          update: {
            biddingStrategy: "customers/1234567890/biddingStrategies/444",
            resourceName: "customers/1234567890/campaigns/444",
          },
          updateMask: "bidding_strategy",
        },
      },
    ]);
  });

  it("supports target CPA and target ROAS standard strategies", () => {
    expect(
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            campaignId: "111",
            strategyType: "TARGET_CPA",
            targetCpaMicros: 6_000_000,
          },
          {
            campaignId: "222",
            strategyType: "TARGET_ROAS",
            targetRoas: 4,
          },
        ],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        campaignOperation: {
          update: {
            resourceName: "customers/1234567890/campaigns/111",
            targetCpa: { targetCpaMicros: 6_000_000 },
          },
          updateMask: "target_cpa.target_cpa_micros",
        },
      },
      {
        campaignOperation: {
          update: {
            resourceName: "customers/1234567890/campaigns/222",
            targetRoas: { targetRoas: 4 },
          },
          updateMask: "target_roas.target_roas",
        },
      },
    ]);
  });

  it("uses leaf masks even for explicit strategy switches", () => {
    expect(
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            campaignId: "111",
            strategyType: "MAXIMIZE_CONVERSIONS",
            switchStrategy: true,
            targetCpaMicros: 5_000_000,
          },
          {
            campaignId: "222",
            strategyType: "MAXIMIZE_CONVERSION_VALUE",
            switchStrategy: true,
            targetRoas: 2.5,
          },
        ],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        campaignOperation: {
          update: {
            maximizeConversions: { targetCpaMicros: 5_000_000 },
            resourceName: "customers/1234567890/campaigns/111",
          },
          updateMask: "maximize_conversions.target_cpa_micros",
        },
      },
      {
        campaignOperation: {
          update: {
            maximizeConversionValue: { targetRoas: 2.5 },
            resourceName: "customers/1234567890/campaigns/222",
          },
          updateMask: "maximize_conversion_value.target_roas",
        },
      },
    ]);
  });

  it("rejects unsafe or ambiguous bidding updates locally", () => {
    expect(() =>
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one campaign bidding update");

    expect(() =>
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            campaignId: "111",
            enhancedCpcEnabled: true,
            strategyType: "MANUAL_CPC",
          },
          { campaignId: "111", strategyType: "TARGET_ROAS", targetRoas: 3 },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate campaignId");

    expect(() =>
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [{ campaignId: "bad-id", strategyType: "MANUAL_CPC" }],
        customerId: "1234567890",
      })
    ).toThrow("campaignId");

    for (const campaignBidding of [
      { campaignId: "111", strategyType: "MANUAL_CPC" },
      { campaignId: "222", strategyType: "MAXIMIZE_CONVERSIONS" },
      { campaignId: "333", strategyType: "MAXIMIZE_CONVERSION_VALUE" },
    ] as const) {
      expect(() =>
        buildUpdateCampaignBiddingOperations({
          campaignBidding: [campaignBidding],
          customerId: "1234567890",
        })
      ).toThrow("Google Ads rejects top-level");
    }

    expect(() =>
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            campaignId: "111",
            strategyType: "TARGET_CPA",
            targetCpaMicros: 0,
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("targetCpaMicros");

    for (const targetRoas of [Number.NaN, 0, 0.009, 1000.001]) {
      expect(() =>
        buildUpdateCampaignBiddingOperations({
          campaignBidding: [
            {
              campaignId: "111",
              strategyType: "TARGET_ROAS",
              targetRoas,
            },
          ],
          customerId: "1234567890",
        })
      ).toThrow("targetRoas must be between 0.01 and 1000");
    }
  });

  it("allows target ROAS boundary values", () => {
    expect(
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            campaignId: "111",
            strategyType: "TARGET_ROAS",
            targetRoas: 0.01,
          },
          {
            campaignId: "222",
            strategyType: "MAXIMIZE_CONVERSION_VALUE",
            targetRoas: 1000,
          },
        ],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        campaignOperation: {
          update: {
            resourceName: "customers/1234567890/campaigns/111",
            targetRoas: { targetRoas: 0.01 },
          },
          updateMask: "target_roas.target_roas",
        },
      },
      {
        campaignOperation: {
          update: {
            maximizeConversionValue: { targetRoas: 1000 },
            resourceName: "customers/1234567890/campaigns/222",
          },
          updateMask: "maximize_conversion_value.target_roas",
        },
      },
    ]);
  });

  it("rejects portfolio bidding strategies outside the customer", () => {
    expect(() =>
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            biddingStrategyResourceName:
              "customers/9999999999/biddingStrategies/444",
            campaignId: "111",
            strategyType: "PORTFOLIO",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("must belong to customer");

    expect(() =>
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            biddingStrategyResourceName: "biddingStrategies/444",
            campaignId: "111",
            strategyType: "PORTFOLIO",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("biddingStrategyResourceName");
  });

  it("only allows validate-only writes until apply guardrails are implemented", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await updateCampaignBidding(client, {
      campaignBidding: [
        {
          campaignId: "111",
          strategyType: "TARGET_ROAS",
          targetRoas: 3,
        },
      ],
      customerId: "1234567890",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: [
        {
          campaignOperation: {
            update: {
              resourceName: "customers/1234567890/campaigns/111",
              targetRoas: { targetRoas: 3 },
            },
            updateMask: "target_roas.target_roas",
          },
        },
      ],
      partialFailure: undefined,
      validateOnly: true,
    });

    await expect(
      updateCampaignBidding(client, {
        campaignBidding: [
          {
            campaignId: "111",
            strategyType: "TARGET_ROAS",
            targetRoas: 3,
          },
        ],
        customerId: "1234567890",
        mode: "execute",
      })
    ).rejects.toThrow("current bidding baseline");

    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("rejects unsupported bidding strategies", () => {
    expect(() =>
      buildUpdateCampaignBiddingOperations({
        campaignBidding: [
          {
            campaignId: "111",
            strategyType: "UNKNOWN",
          } as never,
        ],
        customerId: "1234567890",
      })
    ).toThrow("Unsupported campaign bidding strategy");
  });
});
