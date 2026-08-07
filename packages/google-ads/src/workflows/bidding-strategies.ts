import type { GoogleAdsClient, MutateResult } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertNonEmptyString,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

// Google Ads API v24 TARGET_SPEND portfolio bidding strategy contracts:
// https://developers.google.com/google-ads/api/docs/campaigns/bidding/assign-strategies
// https://developers.google.com/google-ads/api/reference/rpc/v24/BiddingStrategy
// https://developers.google.com/google-ads/api/reference/rpc/v24/TargetSpend
// https://developers.google.com/google-ads/api/reference/rpc/v24/MutateOperation

export interface TargetSpendPortfolioBiddingStrategy {
  cpcBidCeilingMicros?: number;
  name: string;
}

export interface ValidateBiddingStrategiesInput {
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
  strategies: TargetSpendPortfolioBiddingStrategy[];
}

export function buildBiddingStrategyOperations(
  input: Pick<ValidateBiddingStrategiesInput, "customerId" | "strategies">
): unknown[] {
  normalizeAndAssertCustomerId(input.customerId);
  assertNonEmptyArray(
    input.strategies,
    "At least one portfolio bidding strategy is required."
  );

  const names = new Set<string>();

  return input.strategies.map((strategy) => {
    const name = strategy.name.trim();
    assertNonEmptyString(name, "name");

    const nameByteLength = new TextEncoder().encode(name).byteLength;
    if (nameByteLength > 255) {
      throw new Error("name must be 255 UTF-8 bytes or fewer.");
    }

    if (names.has(name)) {
      throw new Error(`duplicate portfolio bidding strategy name: ${name}`);
    }
    names.add(name);

    const targetSpend: Record<string, unknown> = {};
    if (strategy.cpcBidCeilingMicros !== undefined) {
      if (
        !Number.isSafeInteger(strategy.cpcBidCeilingMicros) ||
        strategy.cpcBidCeilingMicros < 0
      ) {
        throw new Error(
          "cpcBidCeilingMicros must be a finite nonnegative safe integer."
        );
      }

      // Protobuf int64 values are decimal strings in the Google Ads REST JSON
      // representation. Discovery: https://googleads.googleapis.com/$discovery/rest?version=v24
      targetSpend.cpcBidCeilingMicros = String(strategy.cpcBidCeilingMicros);
    }

    return {
      biddingStrategyOperation: {
        create: {
          name,
          targetSpend,
        },
      },
    };
  });
}

export async function validateBiddingStrategies(
  client: GoogleAdsClient,
  input: ValidateBiddingStrategiesInput
): Promise<MutateResult> {
  if (input.mode === "execute") {
    throw new Error(
      "validateBiddingStrategies does not support execute mode; use validate mode until apply-mode review guardrails are implemented."
    );
  }

  return await client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildBiddingStrategyOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}
