import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export type FrequencyCapEventType = "IMPRESSION" | "VIDEO_VIEW";
export type FrequencyCapLevel = "AD_GROUP" | "AD_GROUP_AD" | "CAMPAIGN";
export type FrequencyCapTimeUnit = "DAY" | "MONTH" | "WEEK";

export interface CampaignFrequencyCapInput {
  campaignId: string;
  cap: number;
  eventType?: FrequencyCapEventType;
  level?: FrequencyCapLevel;
  timeLength?: number;
  timeUnit: FrequencyCapTimeUnit;
}

export interface SetCampaignFrequencyCapInput {
  campaignFrequencyCaps: CampaignFrequencyCapInput[];
  customerId: string;
  mode?: "execute" | "validate";
  partialFailure?: boolean;
  replaceAll: true;
}

export function buildSetCampaignFrequencyCapOperations(
  input: SetCampaignFrequencyCapInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");

  if (input.replaceAll !== true) {
    throw new Error(
      "setCampaignFrequencyCap replaces all frequency caps for each campaign; pass replaceAll: true after loading the complete desired cap set."
    );
  }

  if (input.campaignFrequencyCaps.length === 0) {
    throw new Error("At least one campaign frequency cap is required.");
  }

  const seen = new Set<string>();
  const capsByCampaignId = new Map<string, CampaignFrequencyCapInput[]>();

  for (const entry of input.campaignFrequencyCaps) {
    assertNumericId(entry.campaignId, "campaignId");
    assertPositiveInteger(entry.cap, "cap");
    assertPositiveInteger(entry.timeLength ?? 1, "timeLength");
    assertTimeUnit(entry.timeUnit);
    assertEventType(entry.eventType ?? "IMPRESSION");
    assertLevel(entry.level ?? "CAMPAIGN");

    const dedupeKey = [
      entry.campaignId,
      entry.level ?? "CAMPAIGN",
      entry.eventType ?? "IMPRESSION",
      entry.timeUnit,
      entry.timeLength ?? 1,
    ].join(":");

    if (seen.has(dedupeKey)) {
      throw new Error(`duplicate frequency cap: ${dedupeKey}`);
    }
    seen.add(dedupeKey);

    const campaignCaps = capsByCampaignId.get(entry.campaignId) ?? [];
    campaignCaps.push(entry);
    capsByCampaignId.set(entry.campaignId, campaignCaps);
  }

  return [...capsByCampaignId].map(([campaignId, campaignFrequencyCaps]) => ({
    campaignOperation: {
      update: {
        frequencyCaps: campaignFrequencyCaps.map((frequencyCap) => ({
          cap: frequencyCap.cap,
          key: {
            eventType: frequencyCap.eventType ?? "IMPRESSION",
            level: frequencyCap.level ?? "CAMPAIGN",
            timeLength: frequencyCap.timeLength ?? 1,
            timeUnit: frequencyCap.timeUnit,
          },
        })),
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
      },
      updateMask: "frequency_caps",
    },
  }));
}

export async function setCampaignFrequencyCap(
  client: GoogleAdsClient,
  input: SetCampaignFrequencyCapInput
) {
  assertValidateOnlyMode(input.mode);

  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildSetCampaignFrequencyCapOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: input.mode !== "execute",
  });
}

function assertValidateOnlyMode(
  mode: SetCampaignFrequencyCapInput["mode"]
): void {
  if (mode === "execute") {
    throw new Error(
      "setCampaignFrequencyCap execute mode requires live preflight baseline checks; use validate mode until apply-mode guards are implemented."
    );
  }
}

function assertEventType(value: FrequencyCapEventType): void {
  if (!(value === "IMPRESSION" || value === "VIDEO_VIEW")) {
    throw new Error(`Unsupported frequency cap eventType: ${value}`);
  }
}

function assertLevel(value: FrequencyCapLevel): void {
  if (
    !(value === "AD_GROUP" || value === "AD_GROUP_AD" || value === "CAMPAIGN")
  ) {
    throw new Error(`Unsupported frequency cap level: ${value}`);
  }
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

function assertTimeUnit(value: FrequencyCapTimeUnit): void {
  if (!(value === "DAY" || value === "WEEK" || value === "MONTH")) {
    throw new Error(`Unsupported frequency cap timeUnit: ${value}`);
  }
}
