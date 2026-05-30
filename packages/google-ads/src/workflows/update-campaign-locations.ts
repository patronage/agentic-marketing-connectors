import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface CampaignLocationBidModifierInput {
  bidModifierPct: number;
  campaignId: string;
  existingCriterionId?: string;
  locationId: string;
  zip: string;
}

export interface CampaignLocationRemovalInput {
  campaignId: string;
  criterionId: string;
}

export interface UpdateCampaignLocationsInput {
  customerId: string;
  locations: CampaignLocationBidModifierInput[];
  mode?: "execute" | "validate";
  partialFailure?: boolean;
  removeLocations?: CampaignLocationRemovalInput[];
}

export function buildUpdateCampaignLocationOperations(
  input: UpdateCampaignLocationsInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");

  assertNoDuplicateLocationInputs(input.locations);
  assertNoDuplicateRemovalInputs(input.removeLocations ?? []);
  assertNoRemovalUpdateConflicts(input);

  const removeOperations = (input.removeLocations ?? []).map((entry) =>
    buildRemoveCampaignLocationOperation(customerId, entry)
  );
  const locationOperations = input.locations.map((entry) =>
    buildUpsertCampaignLocationOperation(customerId, entry)
  );
  const operations = [...removeOperations, ...locationOperations];

  if (operations.length === 0) {
    throw new Error(
      "At least one location create, update, or removal is required."
    );
  }

  return operations;
}

export async function updateCampaignLocations(
  client: GoogleAdsClient,
  input: UpdateCampaignLocationsInput
) {
  assertValidateOnlyMode(input.mode);

  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildUpdateCampaignLocationOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: input.mode !== "execute",
  });
}

function assertValidateOnlyMode(
  mode: UpdateCampaignLocationsInput["mode"]
): void {
  if (mode === "execute") {
    throw new Error(
      "updateCampaignLocations execute mode requires live preflight ownership and baseline checks; use validate mode until apply-mode guards are implemented."
    );
  }
}

function buildRemoveCampaignLocationOperation(
  customerId: string,
  entry: CampaignLocationRemovalInput
): unknown {
  assertNumericId(entry.campaignId, "campaignId");
  assertNumericId(entry.criterionId, "criterionId");

  return {
    campaignCriterionOperation: {
      remove: campaignCriterionResourceName(
        customerId,
        entry.campaignId,
        entry.criterionId
      ),
    },
  };
}

function buildUpsertCampaignLocationOperation(
  customerId: string,
  entry: CampaignLocationBidModifierInput
): unknown {
  assertNumericId(entry.campaignId, "campaignId");
  assertNumericId(entry.locationId, "locationId");
  assertZip(entry.zip);

  const bidModifier = bidModifierPctToMultiplier(entry.bidModifierPct);

  if (entry.existingCriterionId) {
    assertNumericId(entry.existingCriterionId, "existingCriterionId");

    return {
      campaignCriterionOperation: {
        update: {
          bidModifier,
          resourceName: campaignCriterionResourceName(
            customerId,
            entry.campaignId,
            entry.existingCriterionId
          ),
        },
        updateMask: "bid_modifier",
      },
    };
  }

  return {
    campaignCriterionOperation: {
      create: {
        bidModifier,
        campaign: `customers/${customerId}/campaigns/${entry.campaignId}`,
        location: {
          geoTargetConstant: `geoTargetConstants/${entry.locationId}`,
        },
        negative: false,
      },
    },
  };
}

function assertNoDuplicateLocationInputs(
  locations: CampaignLocationBidModifierInput[]
): void {
  const seen = new Set<string>();

  for (const entry of locations) {
    const dedupeKey = `${entry.campaignId}:${entry.locationId}`;
    if (seen.has(dedupeKey)) {
      throw new Error(
        `duplicate campaign/location pair: ${entry.campaignId}/${entry.locationId}`
      );
    }
    seen.add(dedupeKey);
  }
}

function assertNoDuplicateRemovalInputs(
  removals: CampaignLocationRemovalInput[]
): void {
  const seen = new Set<string>();

  for (const entry of removals) {
    const dedupeKey = `${entry.campaignId}:${entry.criterionId}`;
    if (seen.has(dedupeKey)) {
      throw new Error(
        `duplicate campaign criterion removal: ${entry.campaignId}/${entry.criterionId}`
      );
    }
    seen.add(dedupeKey);
  }
}

function assertNoRemovalUpdateConflicts(
  input: UpdateCampaignLocationsInput
): void {
  const removals = new Set(
    (input.removeLocations ?? []).map(
      (entry) => `${entry.campaignId}:${entry.criterionId}`
    )
  );

  for (const entry of input.locations) {
    if (!entry.existingCriterionId) {
      continue;
    }

    const updateKey = `${entry.campaignId}:${entry.existingCriterionId}`;
    if (removals.has(updateKey)) {
      throw new Error(
        `campaign criterion cannot be removed and updated in the same request: ${entry.campaignId}/${entry.existingCriterionId}`
      );
    }
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

function campaignCriterionResourceName(
  customerId: string,
  campaignId: string,
  criterionId: string
): string {
  return `customers/${customerId}/campaignCriteria/${campaignId}~${criterionId}`;
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}

function assertZip(value: string): void {
  if (!/^\d{5}$/.test(value)) {
    throw new Error(`zip must be a 5-digit US ZIP code: ${value}`);
  }
}
