import type { MetaCampaignDeploymentPlan } from "./campaign-deployment.js";
import { previewMetaCampaignPlan } from "./campaign-deployment.js";
import {
  assertConversionEventsInput,
  buildAudienceSharingBody,
  buildAudienceUnsharingBody,
  buildBoostPostPlan,
} from "./meta-ads-client.js";

export type MetaAdsMutationSmokeOperation =
  | "boost-create"
  | "audience-share"
  | "audience-unshare"
  | "campaign-deploy"
  | "conversion-send";

export interface MetaAdsMutationSmokeResult {
  error?: { message: string; name: string };
  operation: MetaAdsMutationSmokeOperation;
  plannedOperationCount?: number;
  providerRequestSent: false;
  status: "failed" | "passed";
  validationMode: "local-preview";
}

/** Builds representative Meta mutation plans without invoking a client method. */
export function runMetaAdsMutationCanary(): Promise<
  MetaAdsMutationSmokeResult[]
> {
  return Promise.all([
    preview("campaign-deploy", async () => {
      const result = await previewMetaCampaignPlan(campaignPlan(), {
        operationId: "smoke-preview",
      });
      return result.receipt.steps.length;
    }),
    preview("boost-create", () => {
      const plan = buildBoostPostPlan({
        budget: 1,
        days: 1,
        name: "Paitronage Smoke Test - local preview",
        pageId: "smoke-page",
        postId: "smoke-page_smoke-post",
        status: "PAUSED",
      });
      return [plan.campaign, plan.adSet, plan.adCreative, plan.ad].length;
    }),
    preview("conversion-send", () => {
      const input = {
        events: [
          {
            action_source: "email" as const,
            event_name: "Lead",
            event_time: 1_779_553_200,
            user_data: { em: "a".repeat(64) },
          },
        ],
      };
      assertConversionEventsInput(input);
      return input.events.length;
    }),
    preview("audience-share", () => {
      buildAudienceSharingBody({
        adAccountIds: ["123456789"],
        audienceId: "smoke-audience",
        permissions: "targeting",
      });
      return 1;
    }),
    preview("audience-unshare", () => {
      buildAudienceUnsharingBody({
        adAccountIds: ["123456789"],
        audienceId: "smoke-audience",
      });
      return 1;
    }),
  ]);
}

async function preview(
  operation: MetaAdsMutationSmokeOperation,
  plan: () => number | Promise<number>
): Promise<MetaAdsMutationSmokeResult> {
  try {
    const plannedOperationCount = await plan();
    return {
      operation,
      plannedOperationCount,
      providerRequestSent: false,
      status: "passed",
      validationMode: "local-preview",
    };
  } catch (error) {
    return {
      error: safeError(error),
      operation,
      providerRequestSent: false,
      status: "failed",
      validationMode: "local-preview",
    };
  }
}

function campaignPlan(): MetaCampaignDeploymentPlan {
  return {
    ads: [
      {
        adsetId: "$adSetId",
        creativeId: "smoke-creative",
        name: "Paitronage Smoke Test - local preview ad",
        status: "PAUSED",
      },
    ],
    adSets: [
      {
        billingEvent: "IMPRESSIONS",
        campaignId: "$campaignId",
        name: "Paitronage Smoke Test - local preview ad set",
        optimizationGoal: "REACH",
        status: "PAUSED",
        targeting: { geo_locations: { countries: ["US"] } },
      },
    ],
    campaign: {
      name: "Paitronage Smoke Test - local preview campaign",
      objective: "OUTCOME_AWARENESS",
      status: "PAUSED",
    },
  };
}

function safeError(error: unknown): { message: string; name: string } {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: String(error), name: "UnknownError" };
}
