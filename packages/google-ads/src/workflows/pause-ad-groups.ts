import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface PauseAdGroupInput {
  adGroupIds: string[];
  customerId: string;
  mode?: "execute" | "validate";
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

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}
