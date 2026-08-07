/* oxlint-disable vitest/require-mock-type-parameters -- Canary collaborators are structurally inferred from their fixture results. */

import { describe, expect, it, vi } from "vitest";

import {
  REDDIT_ADS_READ_VERIFICATION_MATRIX,
  runRedditAdsReadCanary,
} from "./index.js";

describe(runRedditAdsReadCanary, () => {
  it("runs representative reads and no mutation surface", async () => {
    const client = {
      getAdAccount: vi.fn().mockResolvedValue({ id: "account-1" }),
      getMe: vi.fn().mockResolvedValue({ id: "member-1" }),
      listAdGroups: vi.fn().mockResolvedValue({ adGroups: [], pagination: {} }),
      listAds: vi.fn().mockResolvedValue({ ads: [], pagination: {} }),
      listCampaigns: vi
        .fn()
        .mockResolvedValue({ campaigns: [], pagination: {} }),
      listCommunities: vi
        .fn()
        .mockResolvedValue({ communities: [], pagination: {} }),
      listFundingInstruments: vi
        .fn()
        .mockResolvedValue({ fundingInstruments: [], pagination: {} }),
      listInterests: vi.fn().mockResolvedValue([]),
    };

    const result = await runRedditAdsReadCanary(client);

    expect(result.map(({ operation }) => operation)).toStrictEqual(
      REDDIT_ADS_READ_VERIFICATION_MATRIX
    );
    expect(result.every(({ status }) => status === "passed")).toBeTruthy();
    expect(client.listCampaigns).toHaveBeenCalledWith({ pageSize: 1 });
  });

  it("continues after failures and returns safe error evidence", async () => {
    const client = {
      getAdAccount: vi.fn().mockResolvedValue({ id: "account-1" }),
      getMe: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      listAdGroups: vi.fn().mockResolvedValue({ adGroups: [], pagination: {} }),
      listAds: vi.fn().mockResolvedValue({ ads: [], pagination: {} }),
      listCampaigns: vi
        .fn()
        .mockResolvedValue({ campaigns: [], pagination: {} }),
      listCommunities: vi
        .fn()
        .mockResolvedValue({ communities: [], pagination: {} }),
      listFundingInstruments: vi
        .fn()
        .mockResolvedValue({ fundingInstruments: [], pagination: {} }),
      listInterests: vi.fn().mockResolvedValue([]),
    };

    const result = await runRedditAdsReadCanary(client);

    expect(result[0]).toStrictEqual({
      operation: "getMe",
      error: { message: "provider unavailable", name: "Error" },
      status: "failed",
    });
    expect(result).toHaveLength(REDDIT_ADS_READ_VERIFICATION_MATRIX.length);
    expect(client.listFundingInstruments).toHaveBeenCalledOnce();
  });
});
