import {
  createPlannedMutationReceipt,
  fingerprintMutationPlan,
  recordProviderValidationOutcome,
} from "@patronage/connector-lifecycle";

import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface PauseAdGroupInput {
  adGroupIds: string[];
  customerId: string;
  mode?: "execute" | "validate";
}

export interface PauseAdGroupsPlan {
  adGroupIds: string[];
  customerId: string;
  operation: "google_ads.pause_ad_groups";
}

export interface PlanPauseAdGroupsInput extends PauseAdGroupInput {
  operationId: string;
}

export function buildPauseAdGroupOperations(
  input: PauseAdGroupInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");

  if (input.adGroupIds.length === 0) {
    throw new Error("At least one ad group id is required.");
  }

  const seen = new Set<string>();

  return input.adGroupIds.map((adGroupId) => {
    assertNumericId(adGroupId, "adGroupId");

    if (seen.has(adGroupId)) {
      throw new Error(`duplicate ad group id: ${adGroupId}`);
    }

    seen.add(adGroupId);

    return {
      adGroupOperation: {
        update: {
          resourceName: `customers/${customerId}/adGroups/${adGroupId}`,
          status: "PAUSED",
        },
        updateMask: "status",
      },
    };
  });
}

export async function pauseAdGroups(
  client: GoogleAdsClient,
  input: PauseAdGroupInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildPauseAdGroupOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

/**
 * Build and provider-validate the exact pause intent without changing account
 * state. The caller persists the returned fingerprint and receipt before
 * requesting approval.
 */
export async function planPauseAdGroups(
  client: GoogleAdsClient,
  input: PlanPauseAdGroupsInput
) {
  const customerId = normalizeCustomerId(input.customerId);
  const operations = buildPauseAdGroupOperations({
    adGroupIds: input.adGroupIds,
    customerId,
  });
  const plan: PauseAdGroupsPlan = {
    adGroupIds: [...input.adGroupIds],
    customerId,
    operation: "google_ads.pause_ad_groups",
  };
  const planFingerprint = await fingerprintMutationPlan({
    ...plan,
    operations,
  });
  const planned = createPlannedMutationReceipt({
    operationId: input.operationId,
    operationKind: plan.operation,
    planFingerprint,
    provider: "google-ads",
  });
  const validation = await client.mutate({
    customerId,
    operations,
    validateOnly: true,
  });
  const failed = validation.partialFailureError !== undefined;
  const hasRequestEvidence = Boolean(validation.requestId);
  let validationStatus: "ambiguous" | "failed" | "succeeded" = "ambiguous";
  if (failed) {
    validationStatus = "failed";
  } else if (hasRequestEvidence) {
    validationStatus = "succeeded";
  }
  const receipt = recordProviderValidationOutcome(planned, {
    ...(failed
      ? { failureDetail: "Google Ads rejected part of the mutation plan." }
      : {}),
    providerRequestId: validation.requestId ?? undefined,
    status: validationStatus,
  });

  return { plan, receipt };
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}
