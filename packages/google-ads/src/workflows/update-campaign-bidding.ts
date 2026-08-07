import type { GoogleAdsClient } from "../rest/index.js";
import {
  assertCustomerResourceMatches,
  assertNonEmptyArray,
  assertNumericId,
  assertPositiveInteger,
  assertResourceName,
  customerResourceName,
  normalizeAndAssertCustomerId,
  updateMask,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export type CampaignBiddingStrategyUpdate =
  | {
      campaignId: string;
      strategyType: "MANUAL_CPC";
      enhancedCpcEnabled?: boolean;
      switchStrategy?: boolean;
    }
  | {
      campaignId: string;
      strategyType: "MAXIMIZE_CONVERSIONS";
      switchStrategy?: boolean;
      targetCpaMicros?: number;
    }
  | {
      campaignId: string;
      strategyType: "MAXIMIZE_CONVERSION_VALUE";
      switchStrategy?: boolean;
      targetRoas?: number;
    }
  | {
      biddingStrategyResourceName: string;
      campaignId: string;
      strategyType: "PORTFOLIO";
    }
  | {
      campaignId: string;
      strategyType: "TARGET_CPA";
      switchStrategy?: boolean;
      targetCpaMicros: number;
    }
  | {
      campaignId: string;
      strategyType: "TARGET_ROAS";
      switchStrategy?: boolean;
      targetRoas: number;
    };

export interface UpdateCampaignBiddingInput {
  campaignBidding: CampaignBiddingStrategyUpdate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildUpdateCampaignBiddingOperations(
  input: UpdateCampaignBiddingInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  assertNonEmptyArray(
    input.campaignBidding,
    "At least one campaign bidding update is required."
  );

  const seen = new Set<string>();

  return input.campaignBidding.map((entry) => {
    assertNumericId(entry.campaignId, "campaignId");

    if (seen.has(entry.campaignId)) {
      throw new Error(`duplicate campaignId: ${entry.campaignId}`);
    }
    seen.add(entry.campaignId);

    const { field, mask, value } = biddingStrategyField(customerId, entry);

    return {
      campaignOperation: {
        update: {
          [field.camel]: value,
          resourceName: customerResourceName(
            customerId,
            "campaigns",
            entry.campaignId,
            "campaignId"
          ),
        },
        updateMask: updateMask([mask]),
      },
    };
  });
}

export async function updateCampaignBidding(
  client: GoogleAdsClient,
  input: UpdateCampaignBiddingInput
) {
  assertValidateOnlyMode(input.mode);

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildUpdateCampaignBiddingOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

function biddingStrategyField(
  customerId: string,
  entry: CampaignBiddingStrategyUpdate
): {
  field: { camel: string; snake: string };
  mask: string;
  value: unknown;
} {
  switch (entry.strategyType) {
    case "MANUAL_CPC": {
      if (entry.enhancedCpcEnabled === undefined) {
        throw new Error(
          "MANUAL_CPC updates require enhancedCpcEnabled because Google Ads rejects top-level manual_cpc field masks."
        );
      }

      return {
        field: { camel: "manualCpc", snake: "manual_cpc" },
        mask: "manual_cpc.enhanced_cpc_enabled",
        value: { enhancedCpcEnabled: entry.enhancedCpcEnabled },
      };
    }
    case "MAXIMIZE_CONVERSIONS": {
      if (entry.targetCpaMicros === undefined) {
        throw new Error(
          "MAXIMIZE_CONVERSIONS updates require targetCpaMicros because Google Ads rejects top-level maximize_conversions field masks."
        );
      }

      return {
        field: { camel: "maximizeConversions", snake: "maximize_conversions" },
        mask: "maximize_conversions.target_cpa_micros",
        value: { targetCpaMicros: positiveMicros(entry.targetCpaMicros) },
      };
    }
    case "MAXIMIZE_CONVERSION_VALUE": {
      if (entry.targetRoas === undefined) {
        throw new Error(
          "MAXIMIZE_CONVERSION_VALUE updates require targetRoas because Google Ads rejects top-level maximize_conversion_value field masks."
        );
      }

      return {
        field: {
          camel: "maximizeConversionValue",
          snake: "maximize_conversion_value",
        },
        mask: "maximize_conversion_value.target_roas",
        value: { targetRoas: validTargetRoas(entry.targetRoas) },
      };
    }
    case "PORTFOLIO": {
      assertResourceName(
        entry.biddingStrategyResourceName,
        /^customers\/\d+\/biddingStrategies\/\d+$/u,
        "biddingStrategyResourceName"
      );
      assertCustomerResourceMatches(
        entry.biddingStrategyResourceName,
        customerId,
        "biddingStrategyResourceName"
      );
      return {
        field: { camel: "biddingStrategy", snake: "bidding_strategy" },
        mask: "bidding_strategy",
        value: entry.biddingStrategyResourceName,
      };
    }
    case "TARGET_CPA": {
      return {
        field: { camel: "targetCpa", snake: "target_cpa" },
        mask: entry.switchStrategy
          ? "target_cpa"
          : "target_cpa.target_cpa_micros",
        value: { targetCpaMicros: positiveMicros(entry.targetCpaMicros) },
      };
    }
    case "TARGET_ROAS": {
      return {
        field: { camel: "targetRoas", snake: "target_roas" },
        mask: entry.switchStrategy ? "target_roas" : "target_roas.target_roas",
        value: { targetRoas: validTargetRoas(entry.targetRoas) },
      };
    }
    default: {
      throw new Error(
        `Unsupported campaign bidding strategy: ${
          (entry as { strategyType?: string }).strategyType ?? "unknown"
        }`
      );
    }
  }
}

function assertValidateOnlyMode(
  mode: UpdateCampaignBiddingInput["mode"]
): void {
  if (mode === "execute") {
    throw new Error(
      "updateCampaignBidding execute mode requires approval, current bidding baseline checks, and strategy-specific guardrails; use validate mode until apply-mode guards are implemented."
    );
  }
}

function positiveMicros(value: number): number {
  assertPositiveInteger(value, "targetCpaMicros");
  return value;
}

function validTargetRoas(value: number): number {
  if (!(Number.isFinite(value) && value >= 0.01 && value <= 1000)) {
    throw new Error("targetRoas must be between 0.01 and 1000.");
  }

  return value;
}
