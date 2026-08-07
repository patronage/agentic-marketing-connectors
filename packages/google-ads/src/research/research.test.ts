import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsServiceClient } from "../rest/index.js";
import {
  buildKeywordForecastRequest,
  getAdGroupThemes,
  getKeywordHistoricalMetrics,
  getKeywordIdeas,
} from "./index.js";

describe("keyword research", () => {
  it("uses the Worker-safe service request and normalizes ideas", async () => {
    const client = {
      request: vi.fn<GoogleAdsServiceClient["request"]>().mockResolvedValue({
        data: {
          results: [
            {
              keywordIdeaMetrics: {
                avgMonthlySearches: "10",
                averageCpcMicros: "250000",
              },
              text: "housing plan",
            },
          ],
        },
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsServiceClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            geoTargetConstant: {
              id: "2840",
              name: "United States",
              resourceName: "geoTargetConstants/2840",
            },
          },
        ],
      }),
    } as unknown as GoogleAdsServiceClient;
    const result = await getKeywordIdeas(client, {
      customerId: "123",
      keywords: ["housing"],
    });
    expect(result[0]).toMatchObject({
      avgCpcCents: 25,
      avgMonthlySearches: 10,
      keyword: "housing plan",
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "customers/123:generateKeywordIdeas" })
    );
  });
});

describe("forecast request semantics", () => {
  it("builds friendly CPC, targeting, negative, date, and currency inputs", async () => {
    const client = {
      search: vi.fn<GoogleAdsServiceClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            geoTargetConstant: {
              id: "2840",
              name: "United States",
              resourceName: "geoTargetConstants/2840",
            },
          },
        ],
      }),
    } as unknown as GoogleAdsServiceClient;
    const request = await buildKeywordForecastRequest(client, {
      adGroups: [
        {
          keywords: [
            { matchType: "EXACT", maxCpcDollars: 1.25, text: "tax help" },
          ],
          maxCpcDollars: 1.5,
          negativeKeywords: [{ text: "jobs" }],
        },
      ],
      campaignMaxCpcDollars: 1.75,
      conversionRate: 0.03,
      currencyCode: "usd",
      customerId: "123",
      endDate: "2026-08-31",
      language: "en",
      location: "us",
      negativeKeywords: [{ matchType: "PHRASE", text: "free jobs" }],
      startDate: "2026-08-01",
    });
    expect(request).toMatchObject({
      currencyCode: "USD",
      campaign: {
        biddingStrategy: {
          manualCpcBiddingStrategy: { maxCpcBidMicros: 1_750_000 },
        },
        conversionRate: 0.03,
        geoModifiers: [{ geoTargetConstant: "geoTargetConstants/2840" }],
        languageConstants: ["languageConstants/1000"],
      },
    });
    expect(request).toHaveProperty(
      "campaign.adGroups.0.biddableKeywords.0.maxCpcBidMicros",
      1_250_000
    );
  });
  it("rejects invalid date pairs and conversion rates", async () => {
    const client = {} as GoogleAdsServiceClient;
    await expect(
      buildKeywordForecastRequest(client, {
        adGroups: [{ keywords: [{ text: "tax help" }] }],
        conversionRate: 2,
        customerId: "123",
      })
    ).rejects.toThrow("between 0 and 1");
  });
});

describe("volume and themes normalization", () => {
  it("normalizes historical volume rows", async () => {
    const client = {
      request: vi.fn<GoogleAdsServiceClient["request"]>().mockResolvedValue({
        data: {
          results: [
            { keywordMetrics: { avgMonthlySearches: 20 }, text: "tax help" },
          ],
        },
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsServiceClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            geoTargetConstant: {
              id: "2840",
              name: "US",
              resourceName: "geoTargetConstants/2840",
            },
          },
        ],
      }),
    } as unknown as GoogleAdsServiceClient;
    await expect(
      getKeywordHistoricalMetrics(client, {
        customerId: "123",
        keywords: ["tax help"],
      })
    ).resolves.toMatchObject([{ avgMonthlySearches: 20 }]);
  });
  it("normalizes numeric ad groups and structured suggestions", async () => {
    const client = {
      request: vi.fn<GoogleAdsServiceClient["request"]>().mockResolvedValue({
        data: {
          adGroupKeywordSuggestions: [
            { keywordText: "tax help", suggestedAdGroup: "groups/1" },
          ],
          unusableAdGroups: [],
        },
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsServiceClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            adGroup: {
              id: "99",
              name: "Tax",
              resourceName: "customers/123/adGroups/99",
            },
          },
        ],
      }),
    } as unknown as GoogleAdsServiceClient;
    await expect(
      getAdGroupThemes(client, {
        adGroups: ["99"],
        customerId: "123",
        keywords: ["tax help"],
      })
    ).resolves.toMatchObject({
      suggestions: [{ keywordText: "tax help" }],
      unusableAdGroups: [],
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          adGroups: ["customers/123/adGroups/99"],
        }),
      })
    );
  });
});
