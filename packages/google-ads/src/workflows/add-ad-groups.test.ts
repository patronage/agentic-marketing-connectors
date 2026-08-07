import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import { addAdGroups, buildAddAdGroupOperations } from "./add-ad-groups.js";

const input = {
  adGroups: [
    {
      ads: [
        {
          descriptions: ["Description one", "Description two"],
          finalUrl: "https://example.com",
          headlines: ["One", "Two", "Three"],
        },
      ],
      keywords: [{ matchType: "EXACT" as const, text: "housing plan" }],
      name: "Housing",
    },
  ],
  customerId: "123",
  parentCampaignResourceName: "customers/123/campaigns/456",
};

describe(addAdGroups, () => {
  it("plans an ad group, keyword, and RSA with a PAUSED gate", () => {
    const operations = buildAddAdGroupOperations(input) as Record<
      string,
      { create: Record<string, unknown> }
    >[];
    expect(operations).toHaveLength(3);
    expect(operations[0]?.adGroupOperation?.create).toMatchObject({
      cpcBidMicros: 1_500_000,
      status: "PAUSED",
    });
    expect(operations[2]).toHaveProperty(
      "adGroupAdOperation.create.ad.responsiveSearchAd"
    );
    expect(operations[2]).not.toHaveProperty("adOperation");
  });

  it("uses an explicit ad-group bid", () => {
    const operations = buildAddAdGroupOperations({
      ...input,
      adGroups: [
        {
          ads: [
            {
              descriptions: ["Description one", "Description two"],
              finalUrl: "https://example.com",
              headlines: ["One", "Two", "Three"],
            },
          ],
          cpcBidMicros: 2_000_000,
          keywords: [{ matchType: "EXACT", text: "housing plan" }],
          name: "Housing",
        },
      ],
    }) as Record<string, { create: Record<string, unknown> }>[];
    expect(operations[0]?.adGroupOperation?.create.cpcBidMicros).toBe(
      2_000_000
    );
  });

  it("validates by default", async () => {
    const mutate = vi
      .fn<GoogleAdsClient["mutate"]>()
      .mockResolvedValue({ mutateOperationResponses: [], requestId: "req" });
    const client = { mutate } as unknown as GoogleAdsClient;
    await addAdGroups(client, input);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ validateOnly: true })
    );
  });
});
