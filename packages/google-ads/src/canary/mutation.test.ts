/* oxlint-disable vitest/require-mock-type-parameters -- structural provider fixture methods are narrowed at the public canary boundary. */

import { describe, expect, it, vi } from "vitest";

import {
  assertGoogleAdsMutationSmokeFixtures,
  runGoogleAdsMutationCanary,
} from "../mutation-canary.js";
import type { GoogleAdsMutationSmokeFixtures } from "../mutation-canary.js";

describe(runGoogleAdsMutationCanary, () => {
  it("provider-validates the #442 mutation baseline and locally previews recommendation actions", async () => {
    const client = {
      applyRecommendations: vi.fn(),
      dismissRecommendations: vi.fn(),
      graduateExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
      mutate: vi.fn().mockResolvedValue({ requestId: "provider-request" }),
      promoteExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
    };

    const results = await runGoogleAdsMutationCanary(client as never, {
      customerId: "123-456-7890",
      fixtures: fixtures(),
    });

    expect(results).toHaveLength(19);
    expect(
      results.filter(
        ({ validationMode }) => validationMode === "provider-validate-only"
      )
    ).toHaveLength(17);
    expect(
      results.filter(({ validationMode }) => validationMode === "local-preview")
    ).toHaveLength(2);
    expect(results.every(({ status }) => status === "passed")).toBeTruthy();
    expect(client.mutate).toHaveBeenCalledTimes(15);
    expect(
      client.mutate.mock.calls.every(
        ([input]) => (input as { validateOnly?: boolean }).validateOnly === true
      )
    ).toBeTruthy();
    expect(client.applyRecommendations).not.toHaveBeenCalled();
    expect(client.dismissRecommendations).not.toHaveBeenCalled();
  });

  it("attributes a failed provider validation without weakening later smoke steps", async () => {
    const client = {
      applyRecommendations: vi.fn(),
      dismissRecommendations: vi.fn(),
      graduateExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
      mutate: vi.fn().mockImplementation(async (input: unknown) => {
        if (JSON.stringify(input).includes("campaignBudgetOperation")) {
          throw new Error("provider rejected budget");
        }
        return { requestId: "provider-request" };
      }),
      promoteExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
    };

    const results = await runGoogleAdsMutationCanary(client as never, {
      customerId: "1234567890",
      fixtures: fixtures(),
    });

    expect(
      results.find(({ operation }) => operation === "update-campaign-budget")
    ).toMatchObject({
      error: { message: "provider rejected budget", name: "Error" },
      operation: "update-campaign-budget",
      status: "failed",
      validationMode: "provider-validate-only",
    });
    expect(
      results
        .filter(({ operation }) => operation !== "update-campaign-budget")
        .every(({ status }) => status === "passed")
    ).toBeTruthy();
  });

  it("does not claim a provider request when fixture validation fails locally", async () => {
    const client = {
      applyRecommendations: vi.fn(),
      dismissRecommendations: vi.fn(),
      graduateExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
      mutate: vi.fn().mockResolvedValue({ requestId: "provider-request" }),
      promoteExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
    };
    const inputFixtures = fixtures();
    const { campaignBudget } = inputFixtures;
    if (!campaignBudget) {
      throw new Error("Expected the baseline campaign budget fixture.");
    }
    campaignBudget.budgets[0] = {
      amountMicros: 0,
      budgetId: "200",
    };

    const results = await runGoogleAdsMutationCanary(client as never, {
      customerId: "1234567890",
      fixtures: inputFixtures,
    });

    expect(
      results.find(({ operation }) => operation === "update-campaign-budget")
    ).toMatchObject({
      operation: "update-campaign-budget",
      providerRequestSent: false,
      status: "failed",
      validationMode: "provider-validate-only",
    });
  });

  it("treats a validate-only partial failure envelope as failed", async () => {
    const client = {
      applyRecommendations: vi.fn(),
      dismissRecommendations: vi.fn(),
      graduateExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
      mutate: vi.fn().mockImplementation(async (input: unknown) =>
        JSON.stringify(input).includes("campaignBudgetOperation")
          ? {
              partialFailureError: { message: "invalid budget" },
              requestId: "partial-request",
            }
          : { requestId: "provider-request" }
      ),
      promoteExperiment: vi
        .fn()
        .mockResolvedValue({ requestId: "provider-request" }),
    };

    const results = await runGoogleAdsMutationCanary(client as never, {
      customerId: "1234567890",
      fixtures: fixtures(),
    });

    expect(
      results.find(({ operation }) => operation === "update-campaign-budget")
    ).toMatchObject({
      error: {
        message: "Provider validateOnly returned a partial failure.",
        name: "Error",
      },
      operation: "update-campaign-budget",
      providerRequestId: "partial-request",
      providerRequestSent: true,
      status: "failed",
    });
  });

  it("skips every unavailable fixture with a reason and no provider request", async () => {
    const client = {
      applyRecommendations: vi.fn(),
      dismissRecommendations: vi.fn(),
      graduateExperiment: vi.fn(),
      mutate: vi.fn(),
      promoteExperiment: vi.fn(),
    };
    const partialFixtures: GoogleAdsMutationSmokeFixtures = {
      campaignBudget: fixtures().campaignBudget,
    };

    const results = await runGoogleAdsMutationCanary(client as never, {
      customerId: "1234567890",
      fixtures: partialFixtures,
    });

    expect(results).toHaveLength(19);
    expect(results.filter(({ status }) => status === "skipped")).toHaveLength(
      18
    );
    expect(
      results.find(({ operation }) => operation === "update-campaign-budget")
    ).toMatchObject({
      operation: "update-campaign-budget",
      providerRequestSent: true,
      status: "passed",
    });
    expect(
      results.find(({ operation }) => operation === "campaign-criteria")
    ).toStrictEqual({
      operation: "campaign-criteria",
      providerRequestSent: false,
      reason:
        'Skipped because mutation fixture "campaignCriteria" is not configured for this account.',
      status: "skipped",
      validationMode: "provider-validate-only",
    });
    expect(client.mutate).toHaveBeenCalledOnce();
    expect(client.applyRecommendations).not.toHaveBeenCalled();
    expect(client.dismissRecommendations).not.toHaveBeenCalled();
    expect(client.promoteExperiment).not.toHaveBeenCalled();
    expect(client.graduateExperiment).not.toHaveBeenCalled();
  });

  it("rejects unknown mutation fixture keys", () => {
    expect(() =>
      assertGoogleAdsMutationSmokeFixtures({ unknownFixture: {} })
    ).toThrow("Unknown Google Ads mutation fixture key: unknownFixture.");
  });
});

function fixtures(): GoogleAdsMutationSmokeFixtures {
  return {
    assetSetLinkage: {
      assetLinks: [
        {
          assetResourceName: "customers/1234567890/assets/1",
          assetSetResourceName: "customers/1234567890/assetSets/2",
        },
      ],
    },
    audienceSegments: {
      userLists: [
        {
          conversionActionIds: ["300"],
          membershipLifeSpan: 30,
          name: "Smoke audience",
        },
      ],
    },
    biddingAdjustments: {
      adjustments: [
        {
          advertisingChannelTypes: ["SEARCH" as const],
          conversionRateModifier: 1,
          endDateTime: "2026-01-02 00:00:00",
          name: "Smoke seasonality",
          scope: "CHANNEL" as const,
          startDateTime: "2026-01-01 00:00:00",
          type: "seasonalityAdjustment" as const,
        },
      ],
    },
    biddingStrategies: { strategies: [{ name: "Smoke portfolio" }] },
    campaignCriteria: {
      criteria: [
        {
          campaignId: "100",
          dayOfWeek: "MONDAY" as const,
          endHour: 10,
          endMinute: "ZERO" as const,
          startHour: 9,
          startMinute: "ZERO" as const,
          type: "adSchedule" as const,
        },
      ],
    },
    customConversionGoals: {
      customConversionGoals: [
        { conversionActionIds: ["300"], name: "Smoke goal" },
      ],
    },
    graduateExperiment: {
      campaignBudgetResourceName: "customers/1234567890/campaignBudgets/444",
      experimentCampaignResourceName: "customers/1234567890/campaigns/333",
      experimentResourceName: "customers/1234567890/experiments/222",
    },
    performanceMaxListingGroups: { assetGroupId: "100" },
    promoteExperiment: {
      experimentResourceName: "customers/1234567890/experiments/222",
    },
    uploadClickConversionActions: {
      conversionActions: [{ name: "Smoke imported conversion" }],
    },
    campaignAssets: {
      assets: [
        {
          calloutText: "Smoke validation",
          resourceName: "customers/1234567890/assets/-1",
          type: "callout" as const,
        },
      ],
    },
    campaignBidding: {
      campaignBidding: [
        {
          campaignId: "100",
          strategyType: "MAXIMIZE_CONVERSIONS" as const,
          targetCpaMicros: 1_000_000,
        },
      ],
    },
    campaignBudget: {
      budgets: [{ amountMicros: 1_000_000, budgetId: "200" }],
    },
    conversionActions: {
      conversionActions: [{ conversionActionId: "300", primaryForGoal: false }],
    },
    conversionGoals: {
      conversionGoals: [
        {
          biddable: false,
          category: "PURCHASE",
          origin: "WEBSITE",
          scope: "customer" as const,
        },
      ],
    },
    performanceMaxAssetGroups: {
      assetGroups: [
        {
          campaignId: "100",
          finalUrls: ["https://example.com"],
          name: "Paitronage Smoke Test - validate only",
          resourceName: "customers/1234567890/assetGroups/-1",
          status: "PAUSED" as const,
        },
      ],
      links: [
        {
          assetGroupResourceName: "customers/1234567890/assetGroups/-1",
          assetResourceName: "customers/1234567890/assets/-2",
          fieldType: "HEADLINE" as const,
        },
      ],
      textAssets: [
        {
          fieldType: "HEADLINE" as const,
          resourceName: "customers/1234567890/assets/-2",
          text: "Smoke validation",
        },
      ],
    },
    recommendationResourceName: "customers/1234567890/recommendations/example",
    responsiveSearchAds: {
      ads: [
        {
          adId: "400",
          descriptions: [
            { text: "Description one" },
            { text: "Description two" },
          ],
          headlines: [
            { text: "Headline one" },
            { text: "Headline two" },
            { text: "Headline three" },
          ],
        },
      ],
    },
  };
}
