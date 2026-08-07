import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  addCampaignNegativeKeywords,
  buildCampaignNegativeKeywordOperations,
} from "./negative-keywords.js";

describe("campaign negative keyword workflow", () => {
  it("builds create operations for campaign-level negative keywords", () => {
    expect(
      buildCampaignNegativeKeywordOperations({
        campaignId: "111",
        customerId: "123-456-7890",
        keywords: [
          { matchType: "PHRASE", text: "bad query" },
          { matchType: "EXACT", text: "irrelevant term" },
        ],
      })
    ).toStrictEqual([
      {
        campaignCriterionOperation: {
          create: {
            campaign: "customers/1234567890/campaigns/111",
            keyword: {
              matchType: "PHRASE",
              text: "bad query",
            },
            negative: true,
          },
        },
      },
      {
        campaignCriterionOperation: {
          create: {
            campaign: "customers/1234567890/campaigns/111",
            keyword: {
              matchType: "EXACT",
              text: "irrelevant term",
            },
            negative: true,
          },
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous keyword inputs", () => {
    expect(() =>
      buildCampaignNegativeKeywordOperations({
        campaignId: "111",
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: "" }],
      })
    ).toThrow("keyword text");

    expect(() =>
      buildCampaignNegativeKeywordOperations({
        campaignId: "111",
        customerId: "1234567890",
        keywords: [
          { matchType: "PHRASE", text: "duplicate" },
          { matchType: "PHRASE", text: " duplicate " },
        ],
      })
    ).toThrow("duplicate");

    expect(() =>
      buildCampaignNegativeKeywordOperations({
        campaignId: "not-a-number",
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: "valid" }],
      })
    ).toThrow("campaignId");
  });

  it("defaults typed writes to validation mode and requires explicit execution", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await addCampaignNegativeKeywords(client, {
      campaignId: "111",
      customerId: "1234567890",
      keywords: [{ matchType: "PHRASE", text: "bad query" }],
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });

    await addCampaignNegativeKeywords(client, {
      campaignId: "111",
      customerId: "1234567890",
      keywords: [{ matchType: "PHRASE", text: "bad query" }],
      mode: "execute",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: false,
    });
  });
});
