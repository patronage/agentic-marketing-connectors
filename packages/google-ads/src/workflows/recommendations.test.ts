import { describe, expect, it, vi } from "vitest";

import type {
  GoogleAdsClient,
  GoogleAdsRecommendationClient,
} from "../rest/index.js";
import {
  applyRecommendations,
  buildApplyRecommendationOperations,
  buildDismissRecommendationOperations,
  dismissRecommendations,
  getRecommendations,
  normalizeRecommendationRow,
} from "./recommendations.js";

describe("recommendations workflow", () => {
  it("queries and normalizes recommendations", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            recommendation: {
              campaign: "customers/1234567890/campaigns/333",
              dismissed: false,
              impact: {
                baseMetrics: {
                  clicks: "10",
                  conversions: "1.5",
                  costMicros: "10000000",
                  impressions: "1000",
                },
                potentialMetrics: {
                  clicks: "20",
                  conversions: "2.5",
                  costMicros: "25000000",
                  impressions: "1500",
                },
              },
              resourceName: "customers/1234567890/recommendations/abc",
              type: "CAMPAIGN_BUDGET",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getRecommendations(client, {
        campaignId: "333",
        customerId: "1234567890",
        types: ["CAMPAIGN_BUDGET", "KEYWORD"],
      })
    ).resolves.toStrictEqual([
      {
        baseMetrics: {
          clicks: 10,
          conversions: 1.5,
          cost: 10,
          impressions: 1000,
        },
        campaignId: "333",
        campaignResourceName: "customers/1234567890/campaigns/333",
        dismissed: false,
        potentialMetrics: {
          clicks: 20,
          conversions: 2.5,
          cost: 25,
          impressions: 1500,
        },
        resourceName: "customers/1234567890/recommendations/abc",
        type: "CAMPAIGN_BUDGET",
      },
    ]);

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM recommendation"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("recommendation.impact"),
    });
    expect(client.search).not.toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("recommendation.impact.base_metrics"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("campaign.id = 333"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "recommendation.type IN ('CAMPAIGN_BUDGET', 'KEYWORD')"
      ),
    });
  });

  it("paginates recommendation reads", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi
        .fn<GoogleAdsClient["search"]>()
        .mockResolvedValueOnce({
          nextPageToken: "page-2",
          requestId: "req-1",
          rows: [{ recommendation: { resourceName: "r1" } }],
        })
        .mockResolvedValueOnce({
          requestId: "req-2",
          rows: [{ recommendation: { resourceName: "r2" } }],
        }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getRecommendations(client, { customerId: "1234567890" })
    ).resolves.toStrictEqual([
      expect.objectContaining({ resourceName: "r1" }),
      expect.objectContaining({ resourceName: "r2" }),
    ]);

    expect(client.search).toHaveBeenNthCalledWith(2, {
      customerId: "1234567890",
      pageToken: "page-2",
      query: expect.stringContaining("FROM recommendation"),
    });
  });

  it("builds recommendation apply and dismiss operations", () => {
    expect(
      buildApplyRecommendationOperations({
        customerId: "123-456-7890",
        operations: [
          {
            applyParameters: {
              campaignBudget: {
                newBudgetAmountMicros: 50_000_000,
              },
            },
            resourceName: "customers/1234567890/recommendations/abc",
          },
        ],
      })
    ).toStrictEqual([
      {
        campaignBudget: {
          newBudgetAmountMicros: 50_000_000,
        },
        resourceName: "customers/1234567890/recommendations/abc",
      },
    ]);

    expect(
      buildDismissRecommendationOperations({
        customerId: "1234567890",
        resourceNames: ["customers/1234567890/recommendations/def"],
      })
    ).toStrictEqual([
      {
        resourceName: "customers/1234567890/recommendations/def",
      },
    ]);
  });

  it("rejects invalid recommendation reads and operations locally", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getRecommendations(client, {
        campaignId: "bad-id",
        customerId: "1234567890",
      })
    ).rejects.toThrow("campaignId");

    await expect(
      getRecommendations(client, {
        customerId: "1234567890",
        types: ["bad-type"],
      })
    ).rejects.toThrow("recommendation type");

    expect(() =>
      buildApplyRecommendationOperations({
        customerId: "1234567890",
        operations: [],
      })
    ).toThrow("At least one recommendation apply operation");

    expect(() =>
      buildDismissRecommendationOperations({
        customerId: "1234567890",
        resourceNames: [],
      })
    ).toThrow("At least one recommendation dismiss operation");

    expect(() =>
      buildApplyRecommendationOperations({
        customerId: "1234567890",
        operations: [
          {
            resourceName: "customers/9999999999/recommendations/abc",
          },
        ],
      })
    ).toThrow("must belong to customer");

    expect(() =>
      buildDismissRecommendationOperations({
        customerId: "1234567890",
        resourceNames: [
          "customers/1234567890/recommendations/abc",
          "customers/1234567890/recommendations/abc",
        ],
      })
    ).toThrow("duplicate recommendation");
  });

  it("defaults recommendation apply to a validate-only local preview", async () => {
    const client = {
      applyRecommendations: vi
        .fn<GoogleAdsRecommendationClient["applyRecommendations"]>()
        .mockResolvedValue({
          requestId: "req",
          results: [],
        }),
      dismissRecommendations:
        vi.fn<GoogleAdsRecommendationClient["dismissRecommendations"]>(),
    };
    const operation = {
      resourceName: "customers/1234567890/recommendations/abc",
    };

    await expect(
      applyRecommendations(client, {
        customerId: "123-456-7890",
        operations: [operation],
        partialFailure: true,
      })
    ).resolves.toStrictEqual({
      customerId: "1234567890",
      mode: "validate",
      operations: [operation],
      partialFailure: true,
      providerRequestSent: false,
      requestId: null,
      results: [],
      validateOnly: true,
    });

    await expect(
      applyRecommendations(client, {
        customerId: "1234567890",
        mode: "preview",
        operations: [operation],
      })
    ).resolves.toStrictEqual(
      expect.objectContaining({
        mode: "preview",
        providerRequestSent: false,
        validateOnly: true,
      })
    );

    expect(client.applyRecommendations).not.toHaveBeenCalled();
  });

  it("requires approval guard before executing recommendation apply", async () => {
    const client = {
      applyRecommendations: vi
        .fn<GoogleAdsRecommendationClient["applyRecommendations"]>()
        .mockResolvedValue({
          requestId: "req",
          results: [],
        }),
      dismissRecommendations:
        vi.fn<GoogleAdsRecommendationClient["dismissRecommendations"]>(),
    };
    const operation = {
      resourceName: "customers/1234567890/recommendations/abc",
    };

    await expect(
      applyRecommendations(client, {
        customerId: "1234567890",
        mode: "execute",
        operations: [operation],
      })
    ).rejects.toThrow("approval guard");
    await expect(
      applyRecommendations(client, {
        approval: {
          approvedBy: "Cameron",
          reason: "reviewed",
          recommendationResourceNames: [
            "customers/1234567890/recommendations/other",
          ],
        },
        customerId: "1234567890",
        mode: "execute",
        operations: [operation],
      })
    ).rejects.toThrow("exactly match");

    await applyRecommendations(client, {
      approval: {
        approvedBy: "Cameron",
        reason: "reviewed",
        recommendationResourceNames: [
          "customers/1234567890/recommendations/abc",
        ],
      },
      customerId: "1234567890",
      mode: "execute",
      operations: [operation],
      partialFailure: true,
    });

    expect(client.applyRecommendations).toHaveBeenCalledOnce();
    expect(client.applyRecommendations).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [operation],
      partialFailure: true,
    });
  });

  it("defaults recommendation dismiss to a validate-only local preview", async () => {
    const client = {
      applyRecommendations:
        vi.fn<GoogleAdsRecommendationClient["applyRecommendations"]>(),
      dismissRecommendations:
        vi.fn<GoogleAdsRecommendationClient["dismissRecommendations"]>(),
    };

    await expect(
      dismissRecommendations(client, {
        customerId: "123-456-7890",
        resourceNames: ["customers/1234567890/recommendations/abc"],
      })
    ).resolves.toStrictEqual({
      customerId: "1234567890",
      mode: "validate",
      operations: [
        {
          resourceName: "customers/1234567890/recommendations/abc",
        },
      ],
      providerRequestSent: false,
      requestId: null,
      results: [],
      validateOnly: true,
    });

    expect(client.dismissRecommendations).not.toHaveBeenCalled();
  });

  it("requires approval guard before executing recommendation dismiss", async () => {
    const client = {
      applyRecommendations:
        vi.fn<GoogleAdsRecommendationClient["applyRecommendations"]>(),
      dismissRecommendations: vi
        .fn<GoogleAdsRecommendationClient["dismissRecommendations"]>()
        .mockResolvedValue({
          requestId: "req",
          results: [],
        }),
    };

    await expect(
      dismissRecommendations(client, {
        approval: {
          approvedBy: "",
          reason: "reviewed",
          recommendationResourceNames: [
            "customers/1234567890/recommendations/abc",
          ],
        },
        customerId: "1234567890",
        mode: "execute",
        resourceNames: ["customers/1234567890/recommendations/abc"],
      })
    ).rejects.toThrow("approvedBy");

    await dismissRecommendations(client, {
      approval: {
        approvedBy: "Cameron",
        reason: "reviewed",
        recommendationResourceNames: [
          "customers/1234567890/recommendations/abc",
        ],
      },
      customerId: "1234567890",
      mode: "execute",
      resourceNames: ["customers/1234567890/recommendations/abc"],
    });

    expect(client.dismissRecommendations).toHaveBeenCalledWith({
      customerId: "1234567890",
      operations: [
        {
          resourceName: "customers/1234567890/recommendations/abc",
        },
      ],
      partialFailure: undefined,
    });
  });

  it("normalizes snake-case recommendation rows", () => {
    expect(
      normalizeRecommendationRow({
        recommendation: {
          campaign: "customers/1234567890/campaigns/333",
          dismissed: "true",
          impact: {
            base_metrics: {
              cost_micros: 1_000_000,
            },
            potential_metrics: {
              clicks: 5,
            },
          },
          resource_name: "customers/1234567890/recommendations/abc",
          type: "KEYWORD",
        },
      })
    ).toStrictEqual({
      baseMetrics: {
        clicks: 0,
        conversions: 0,
        cost: 1,
        impressions: 0,
      },
      campaignId: "333",
      campaignResourceName: "customers/1234567890/campaigns/333",
      dismissed: true,
      potentialMetrics: {
        clicks: 5,
        conversions: 0,
        cost: 0,
        impressions: 0,
      },
      resourceName: "customers/1234567890/recommendations/abc",
      type: "KEYWORD",
    });
  });
});
