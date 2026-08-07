import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildSetCampaignMaxCpcOperations,
  maxCpcToMicros,
  setCampaignMaxCpc,
} from "./set-campaign-max-cpc.js";

function clientStub(options?: {
  pages?: { rows: unknown[]; nextPageToken?: string }[];
}): {
  client: GoogleAdsClient;
  mutate: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
} {
  const pages = options?.pages ?? [
    {
      rows: [
        { campaign: { biddingStrategyType: "TARGET_SPEND", id: "111" } },
        { campaign: { biddingStrategyType: "TARGET_SPEND", id: "222" } },
      ],
    },
  ];
  const search =
    vi.fn<() => Promise<{ rows: unknown[]; nextPageToken?: string }>>();
  for (const page of pages) {
    search.mockResolvedValueOnce(page);
  }
  search.mockResolvedValue(pages.at(-1) ?? { rows: [] });
  const mutate = vi
    .fn<() => Promise<{ mutateOperationResponses: unknown[] }>>()
    .mockResolvedValue({ mutateOperationResponses: [] });
  return {
    client: { mutate, search } as unknown as GoogleAdsClient,
    mutate,
    search,
  };
}

describe("set campaign max cpc workflow", () => {
  it("builds update operations carrying the ceiling as exact int64 micros", () => {
    expect(
      buildSetCampaignMaxCpcOperations({
        campaignIds: ["111", "222"],
        customerId: "123-456-7890",
        maxCpc: 2,
      })
    ).toStrictEqual([
      {
        campaignOperation: {
          update: {
            resourceName: "customers/1234567890/campaigns/111",
            targetSpend: { cpcBidCeilingMicros: "2000000" },
          },
          updateMask: "target_spend.cpc_bid_ceiling_micros",
        },
      },
      {
        campaignOperation: {
          update: {
            resourceName: "customers/1234567890/campaigns/222",
            targetSpend: { cpcBidCeilingMicros: "2000000" },
          },
          updateMask: "target_spend.cpc_bid_ceiling_micros",
        },
      },
    ]);
  });

  it("converts whole-cent dollars exactly and rejects everything else", () => {
    expect(maxCpcToMicros(0.01)).toBe("10000");
    expect(maxCpcToMicros(1.5)).toBe("1500000");
    expect(maxCpcToMicros(0.1 + 0.2)).toBe("300000");
    expect(maxCpcToMicros(1000)).toBe("1000000000");

    expect(() => maxCpcToMicros(0)).toThrow(
      "maxCpc must be a positive number of dollars."
    );
    expect(() => maxCpcToMicros(-2)).toThrow(
      "maxCpc must be a positive number of dollars."
    );
    expect(() => maxCpcToMicros(Number.POSITIVE_INFINITY)).toThrow(
      "maxCpc must be a positive number of dollars."
    );
    expect(() => maxCpcToMicros(2.005)).toThrow(
      "maxCpc must be a whole number of cents."
    );
    expect(() => maxCpcToMicros(1e-7)).toThrow(
      "maxCpc must be a whole number of cents."
    );
    expect(() => maxCpcToMicros(1000.01)).toThrow(
      "maxCpc must be between $0.01 and $1000."
    );
    expect(() => maxCpcToMicros(1e15)).toThrow(
      "maxCpc must be between $0.01 and $1000."
    );
  });

  it("rejects empty campaign lists and duplicates", () => {
    expect(() =>
      buildSetCampaignMaxCpcOperations({
        campaignIds: [],
        customerId: "1234567890",
        maxCpc: 2,
      })
    ).toThrow("At least one campaign id is required.");

    expect(() =>
      buildSetCampaignMaxCpcOperations({
        campaignIds: ["111", "111"],
        customerId: "1234567890",
        maxCpc: 2,
      })
    ).toThrow("duplicate campaign id: 111");
  });

  it("defaults to validate-only and executes only in execute mode", async () => {
    const { client, mutate } = clientStub();

    await setCampaignMaxCpc(client, {
      campaignIds: ["111"],
      customerId: "1234567890",
      maxCpc: 2,
    });
    expect(mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ validateOnly: true })
    );

    await setCampaignMaxCpc(client, {
      campaignIds: ["111"],
      customerId: "1234567890",
      maxCpc: 2,
      mode: "execute",
    });
    expect(mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ validateOnly: false })
    );
  });

  it("refuses campaigns that are not on Maximize Clicks, naming offenders", async () => {
    const { client, mutate } = clientStub({
      pages: [
        {
          rows: [
            { campaign: { biddingStrategyType: "TARGET_SPEND", id: "111" } },
            { campaign: { biddingStrategyType: "MANUAL_CPC", id: "333" } },
          ],
        },
      ],
    });

    await expect(
      setCampaignMaxCpc(client, {
        campaignIds: ["111", "333", "444"],
        customerId: "1234567890",
        maxCpc: 2,
      })
    ).rejects.toThrow(
      "A CPC ceiling only applies to campaigns on a standard Maximize Clicks (TARGET_SPEND) strategy; refusing to mutate: 333 (MANUAL_CPC), 444 (not found)"
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it("refuses portfolio-managed campaigns even when they report TARGET_SPEND", async () => {
    const { client, mutate } = clientStub({
      pages: [
        {
          rows: [
            {
              campaign: {
                biddingStrategy: "customers/1234567890/biddingStrategies/9",
                biddingStrategyType: "TARGET_SPEND",
                id: "111",
              },
            },
          ],
        },
      ],
    });

    await expect(
      setCampaignMaxCpc(client, {
        campaignIds: ["111"],
        customerId: "1234567890",
        maxCpc: 2,
      })
    ).rejects.toThrow("111 (portfolio bidding strategy)");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("reads snake_case rows and follows pagination in the guard", async () => {
    const { client, mutate, search } = clientStub({
      pages: [
        {
          nextPageToken: "page-2",
          rows: [
            { campaign: { bidding_strategy_type: "TARGET_SPEND", id: "111" } },
          ],
        },
        {
          rows: [
            { campaign: { bidding_strategy_type: "TARGET_SPEND", id: "222" } },
          ],
        },
      ],
    });

    await setCampaignMaxCpc(client, {
      campaignIds: ["111", "222"],
      customerId: "1234567890",
      maxCpc: 2,
    });

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageToken: "page-2" })
    );
    expect(mutate).toHaveBeenCalledOnce();
  });
});
