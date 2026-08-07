import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export type DemographicCriterionType = "AGE_RANGE" | "GENDER" | "INCOME_RANGE";

export interface AdGroupDemographicBidModifierInput {
  adGroupId: string;
  bidModifierPct: number;
  criterionId: string;
  criterionType: DemographicCriterionType;
  segmentValue: string;
}

export interface UpdateAdGroupDemographicsInput {
  criteria: AdGroupDemographicBidModifierInput[];
  customerId: string;
  mode?: "execute" | "validate";
  partialFailure?: boolean;
}

export function buildUpdateAdGroupDemographicOperations(
  input: UpdateAdGroupDemographicsInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");

  if (input.criteria.length === 0) {
    throw new Error("At least one demographic criterion is required.");
  }

  const seen = new Set<string>();

  return input.criteria.map((entry) => {
    assertNumericId(entry.adGroupId, "adGroupId");
    assertNumericId(entry.criterionId, "criterionId");
    assertCriterionType(entry.criterionType);
    assertSegmentValue(entry.segmentValue);

    const dedupeKey = `${entry.adGroupId}:${entry.criterionId}`;
    if (seen.has(dedupeKey)) {
      throw new Error(
        `duplicate ad group criterion: ${entry.adGroupId}/${entry.criterionId}`
      );
    }
    seen.add(dedupeKey);

    return {
      adGroupCriterionOperation: {
        update: {
          bidModifier: bidModifierPctToMultiplier(entry.bidModifierPct),
          resourceName: `customers/${customerId}/adGroupCriteria/${entry.adGroupId}~${entry.criterionId}`,
        },
        updateMask: "bid_modifier",
      },
    };
  });
}

export async function updateAdGroupDemographics(
  client: GoogleAdsClient,
  input: UpdateAdGroupDemographicsInput
) {
  assertValidateOnlyMode(input.mode);

  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildUpdateAdGroupDemographicOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: input.mode !== "execute",
  });
}

function assertValidateOnlyMode(
  mode: UpdateAdGroupDemographicsInput["mode"]
): void {
  if (mode === "execute") {
    throw new Error(
      "updateAdGroupDemographics execute mode requires live preflight ownership and criterion-type checks; use validate mode until apply-mode guards are implemented."
    );
  }
}

function bidModifierPctToMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("bidModifierPct must be a finite number.");
  }

  const multiplier = 1 + value / 100;

  if (multiplier < 0.1 || multiplier > 10) {
    throw new Error(
      "bidModifierPct must resolve to a bid modifier from 0.1 to 10."
    );
  }

  return Number(multiplier.toFixed(4));
}

function assertCriterionType(value: DemographicCriterionType): void {
  if (
    !(value === "AGE_RANGE" || value === "GENDER" || value === "INCOME_RANGE")
  ) {
    throw new Error(`Unsupported demographic criterion type: ${value}`);
  }
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}

function assertSegmentValue(value: string): void {
  if (value.trim().length === 0) {
    throw new Error("segmentValue is required.");
  }
}
