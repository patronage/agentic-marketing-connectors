import type {
  GoogleAdsClient,
  GoogleAdsExperimentClient,
  GoogleAdsRecommendationClient,
} from "../rest/index.js";
import { linkAssetSets } from "../workflows/asset-set-linkage.js";
import { updateAudienceSegments } from "../workflows/audience-segments.js";
import { validateBiddingAdjustments } from "../workflows/bidding-adjustments.js";
import { validateBiddingStrategies } from "../workflows/bidding-strategies.js";
import type { UpdateCampaignAssetsInput } from "../workflows/campaign-assets.js";
import { updateCampaignAssets } from "../workflows/campaign-assets.js";
import { updateCampaignCriteria } from "../workflows/campaign-criteria.js";
import type {
  UpdateConversionActionsInput,
  UpdateConversionGoalsInput,
} from "../workflows/conversion-goals.js";
import {
  createCustomConversionGoals,
  createUploadClickConversionActions,
  updateConversionActions,
  updateConversionGoals,
} from "../workflows/conversion-goals.js";
import {
  graduateCampaignExperiment,
  promoteCampaignExperiment,
} from "../workflows/create-campaign-experiment.js";
import type { DeployPerformanceMaxAssetGroupsInput } from "../workflows/performance-max-asset-groups.js";
import { deployPerformanceMaxAssetGroups } from "../workflows/performance-max-asset-groups.js";
import { createPerformanceMaxAllProductsListingGroup } from "../workflows/performance-max-listing-groups.js";
import {
  applyRecommendations,
  dismissRecommendations,
} from "../workflows/recommendations.js";
import type { UpdateCampaignBiddingInput } from "../workflows/update-campaign-bidding.js";
import { updateCampaignBidding } from "../workflows/update-campaign-bidding.js";
import type { UpdateCampaignBudgetInput } from "../workflows/update-campaign-budget.js";
import { updateCampaignBudget } from "../workflows/update-campaign-budget.js";
import type { UpdateResponsiveSearchAdsInput } from "../workflows/update-responsive-search-ads.js";
import { updateResponsiveSearchAds } from "../workflows/update-responsive-search-ads.js";

export type GoogleAdsMutationSmokeOperation =
  | "apply-recommendations"
  | "campaign-assets"
  | "campaign-criteria"
  | "audience-segments"
  | "bidding-adjustments"
  | "portfolio-bidding-strategies"
  | "upload-click-conversion-actions"
  | "custom-conversion-goals"
  | "asset-set-linkage"
  | "performance-max-listing-groups"
  | "promote-campaign-experiment"
  | "graduate-campaign-experiment"
  | "deploy-performance-max-asset-groups"
  | "dismiss-recommendations"
  | "update-campaign-bidding"
  | "update-campaign-budget"
  | "update-conversion-actions"
  | "update-conversion-goals"
  | "update-responsive-search-ads";

export type MutationSmokeValidationMode =
  | "local-preview"
  | "provider-validate-only";

interface GoogleAdsMutationSmokeResultBase {
  error?: { message: string; name: string };
  operation: GoogleAdsMutationSmokeOperation;
  providerRequestId?: string;
  providerRequestSent: boolean;
  validationMode: MutationSmokeValidationMode;
}

export type GoogleAdsMutationSmokeResult =
  | (GoogleAdsMutationSmokeResultBase & {
      reason: string;
      status: "skipped";
    })
  | (GoogleAdsMutationSmokeResultBase & {
      reason?: never;
      status: "failed" | "passed";
    });

interface GoogleAdsMutationSmokeFixtureValues {
  campaignAssets: Omit<UpdateCampaignAssetsInput, "customerId" | "mode">;
  campaignCriteria: Omit<
    Parameters<typeof updateCampaignCriteria>[1],
    "customerId" | "mode"
  >;
  audienceSegments: Omit<
    Parameters<typeof updateAudienceSegments>[1],
    "customerId" | "mode"
  >;
  biddingAdjustments: Omit<
    Parameters<typeof validateBiddingAdjustments>[1],
    "customerId" | "mode"
  >;
  biddingStrategies: Omit<
    Parameters<typeof validateBiddingStrategies>[1],
    "customerId" | "mode"
  >;
  assetSetLinkage: Omit<
    Parameters<typeof linkAssetSets>[1],
    "customerId" | "mode"
  >;
  performanceMaxListingGroups: Omit<
    Parameters<typeof createPerformanceMaxAllProductsListingGroup>[1],
    "customerId" | "mode"
  >;
  uploadClickConversionActions: Omit<
    Parameters<typeof createUploadClickConversionActions>[1],
    "customerId" | "mode"
  >;
  customConversionGoals: Omit<
    Parameters<typeof createCustomConversionGoals>[1],
    "customerId" | "mode"
  >;
  promoteExperiment: Omit<
    Parameters<typeof promoteCampaignExperiment>[1],
    "customerId" | "mode"
  >;
  graduateExperiment: Omit<
    Parameters<typeof graduateCampaignExperiment>[1],
    "customerId" | "mode"
  >;
  campaignBidding: Omit<UpdateCampaignBiddingInput, "customerId" | "mode">;
  campaignBudget: Omit<UpdateCampaignBudgetInput, "customerId" | "mode">;
  conversionActions: Omit<UpdateConversionActionsInput, "customerId" | "mode">;
  conversionGoals: Omit<UpdateConversionGoalsInput, "customerId" | "mode">;
  performanceMaxAssetGroups: Omit<
    DeployPerformanceMaxAssetGroupsInput,
    "customerId" | "mode"
  >;
  recommendationResourceName: string;
  responsiveSearchAds: Omit<
    UpdateResponsiveSearchAdsInput,
    "customerId" | "mode"
  >;
}

export type GoogleAdsMutationSmokeFixtures =
  Partial<GoogleAdsMutationSmokeFixtureValues>;

export const googleAdsMutationSmokeFixtureKeys = [
  "assetSetLinkage",
  "audienceSegments",
  "biddingAdjustments",
  "biddingStrategies",
  "campaignAssets",
  "campaignBidding",
  "campaignBudget",
  "campaignCriteria",
  "conversionActions",
  "conversionGoals",
  "customConversionGoals",
  "graduateExperiment",
  "performanceMaxAssetGroups",
  "performanceMaxListingGroups",
  "promoteExperiment",
  "recommendationResourceName",
  "responsiveSearchAds",
  "uploadClickConversionActions",
] as const satisfies readonly (keyof GoogleAdsMutationSmokeFixtureValues)[];

const googleAdsMutationSmokeFixtureKeySet = new Set<string>(
  googleAdsMutationSmokeFixtureKeys
);

export function assertGoogleAdsMutationSmokeFixtures(
  value: unknown
): GoogleAdsMutationSmokeFixtures {
  if (!(value && typeof value === "object") || Array.isArray(value)) {
    throw new TypeError("Google Ads mutation fixtures must be an object.");
  }

  for (const key of Object.keys(value)) {
    if (!googleAdsMutationSmokeFixtureKeySet.has(key)) {
      throw new TypeError(`Unknown Google Ads mutation fixture key: ${key}.`);
    }
  }

  return value as GoogleAdsMutationSmokeFixtures;
}

/** Runs the mutation surfaces introduced by #442 without an execute path. */
export async function runGoogleAdsMutationCanary(
  client: GoogleAdsClient &
    GoogleAdsRecommendationClient &
    GoogleAdsExperimentClient,
  input: {
    customerId: string;
    fixtures: GoogleAdsMutationSmokeFixtures;
  }
): Promise<GoogleAdsMutationSmokeResult[]> {
  const { customerId, fixtures } = input;
  const steps: {
    fixtureKey: keyof GoogleAdsMutationSmokeFixtureValues;
    operation: GoogleAdsMutationSmokeOperation;
    run: (
      stepClient: GoogleAdsClient &
        GoogleAdsRecommendationClient &
        GoogleAdsExperimentClient
    ) => Promise<unknown>;
    validationMode: MutationSmokeValidationMode;
  }[] = [
    {
      fixtureKey: "campaignCriteria",
      operation: "campaign-criteria",
      run: (stepClient) =>
        updateCampaignCriteria(stepClient, {
          ...requiredFixture(fixtures.campaignCriteria),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "audienceSegments",
      operation: "audience-segments",
      run: (stepClient) =>
        updateAudienceSegments(stepClient, {
          ...requiredFixture(fixtures.audienceSegments),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "biddingAdjustments",
      operation: "bidding-adjustments",
      run: (stepClient) =>
        validateBiddingAdjustments(stepClient, {
          ...requiredFixture(fixtures.biddingAdjustments),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "biddingStrategies",
      operation: "portfolio-bidding-strategies",
      run: (stepClient) =>
        validateBiddingStrategies(stepClient, {
          ...requiredFixture(fixtures.biddingStrategies),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "uploadClickConversionActions",
      operation: "upload-click-conversion-actions",
      run: (stepClient) =>
        createUploadClickConversionActions(stepClient, {
          ...requiredFixture(fixtures.uploadClickConversionActions),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "customConversionGoals",
      operation: "custom-conversion-goals",
      run: (stepClient) =>
        createCustomConversionGoals(stepClient, {
          ...requiredFixture(fixtures.customConversionGoals),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "assetSetLinkage",
      operation: "asset-set-linkage",
      run: (stepClient) =>
        linkAssetSets(stepClient, {
          ...requiredFixture(fixtures.assetSetLinkage),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "performanceMaxListingGroups",
      operation: "performance-max-listing-groups",
      run: (stepClient) =>
        createPerformanceMaxAllProductsListingGroup(stepClient, {
          ...requiredFixture(fixtures.performanceMaxListingGroups),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "promoteExperiment",
      operation: "promote-campaign-experiment",
      run: (stepClient) =>
        promoteCampaignExperiment(stepClient, {
          ...requiredFixture(fixtures.promoteExperiment),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "graduateExperiment",
      operation: "graduate-campaign-experiment",
      run: (stepClient) =>
        graduateCampaignExperiment(stepClient, {
          ...requiredFixture(fixtures.graduateExperiment),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "campaignBudget",
      operation: "update-campaign-budget",
      run: (stepClient) =>
        updateCampaignBudget(stepClient, {
          ...requiredFixture(fixtures.campaignBudget),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "campaignBidding",
      operation: "update-campaign-bidding",
      run: (stepClient) =>
        updateCampaignBidding(stepClient, {
          ...requiredFixture(fixtures.campaignBidding),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "conversionActions",
      operation: "update-conversion-actions",
      run: (stepClient) =>
        updateConversionActions(stepClient, {
          ...requiredFixture(fixtures.conversionActions),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "conversionGoals",
      operation: "update-conversion-goals",
      run: (stepClient) =>
        updateConversionGoals(stepClient, {
          ...requiredFixture(fixtures.conversionGoals),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "recommendationResourceName",
      operation: "apply-recommendations",
      run: (stepClient) =>
        applyRecommendations(stepClient, {
          customerId,
          mode: "validate",
          operations: [
            {
              resourceName: requiredFixture(
                fixtures.recommendationResourceName
              ),
            },
          ],
        }),
      validationMode: "local-preview",
    },
    {
      fixtureKey: "recommendationResourceName",
      operation: "dismiss-recommendations",
      run: (stepClient) =>
        dismissRecommendations(stepClient, {
          customerId,
          mode: "validate",
          resourceNames: [requiredFixture(fixtures.recommendationResourceName)],
        }),
      validationMode: "local-preview",
    },
    {
      fixtureKey: "responsiveSearchAds",
      operation: "update-responsive-search-ads",
      run: (stepClient) =>
        updateResponsiveSearchAds(stepClient, {
          ...requiredFixture(fixtures.responsiveSearchAds),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "campaignAssets",
      operation: "campaign-assets",
      run: (stepClient) =>
        updateCampaignAssets(stepClient, {
          ...requiredFixture(fixtures.campaignAssets),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
    {
      fixtureKey: "performanceMaxAssetGroups",
      operation: "deploy-performance-max-asset-groups",
      run: (stepClient) =>
        deployPerformanceMaxAssetGroups(stepClient, {
          ...requiredFixture(fixtures.performanceMaxAssetGroups),
          customerId,
          mode: "validate",
        }),
      validationMode: "provider-validate-only",
    },
  ];

  const results: GoogleAdsMutationSmokeResult[] = [];
  for (const step of steps) {
    if (!(step.fixtureKey in fixtures)) {
      results.push({
        operation: step.operation,
        providerRequestSent: false,
        reason: `Skipped because mutation fixture "${step.fixtureKey}" is not configured for this account.`,
        status: "skipped",
        validationMode: step.validationMode,
      });
      continue;
    }

    let providerRequestSent = false;
    const stepClient = auditProviderRequests(client, () => {
      providerRequestSent = true;
    });
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- provider smoke calls are serialized for quota safety and failure attribution.
      const response = await step.run(stepClient);
      const providerRequestId = requestId(response);
      if (partialFailure(response)) {
        results.push({
          error: {
            message: "Provider validateOnly returned a partial failure.",
            name: "Error",
          },
          operation: step.operation,
          ...(providerRequestId ? { providerRequestId } : {}),
          providerRequestSent,
          status: "failed",
          validationMode: step.validationMode,
        });
        continue;
      }
      results.push({
        operation: step.operation,
        ...(providerRequestId ? { providerRequestId } : {}),
        providerRequestSent,
        status: "passed",
        validationMode: step.validationMode,
      });
    } catch (error) {
      results.push({
        error: safeError(error),
        operation: step.operation,
        providerRequestSent,
        status: "failed",
        validationMode: step.validationMode,
      });
    }
  }
  return results;
}

function auditProviderRequests(
  client: GoogleAdsClient &
    GoogleAdsRecommendationClient &
    GoogleAdsExperimentClient,
  onProviderRequest: () => void
): GoogleAdsClient & GoogleAdsRecommendationClient & GoogleAdsExperimentClient {
  return {
    ...client,
    applyRecommendations: (input) => {
      onProviderRequest();
      return client.applyRecommendations(input);
    },
    dismissRecommendations: (input) => {
      onProviderRequest();
      return client.dismissRecommendations(input);
    },
    mutate: (input) => {
      onProviderRequest();
      return client.mutate(input);
    },
    graduateExperiment: (input) => {
      onProviderRequest();
      return client.graduateExperiment(input);
    },
    promoteExperiment: (input) => {
      onProviderRequest();
      return client.promoteExperiment(input);
    },
  };
}

function partialFailure(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "partialFailureError" in value &&
    value.partialFailureError
  );
}

function requestId(value: unknown): string | undefined {
  if (!(value && typeof value === "object" && "requestId" in value)) {
    return undefined;
  }
  const requestIdValue = value.requestId;
  return typeof requestIdValue === "string" && requestIdValue.length > 0
    ? requestIdValue
    : undefined;
}

function safeError(error: unknown): { message: string; name: string } {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: String(error), name: "UnknownError" };
}

function requiredFixture<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error(
      "A configured Google Ads mutation fixture was unavailable."
    );
  }
  return value;
}
