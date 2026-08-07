import type { GoogleAdsClient, MutateResult } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertNonEmptyString,
  assertNumericId,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export type CampaignCriterionDayOfWeek =
  | "FRIDAY"
  | "MONDAY"
  | "SATURDAY"
  | "SUNDAY"
  | "THURSDAY"
  | "TUESDAY"
  | "WEDNESDAY";

export type CampaignCriterionMinute =
  | "FIFTEEN"
  | "FORTY_FIVE"
  | "THIRTY"
  | "ZERO";

export type CampaignCriterionInput =
  | {
      campaignId: string;
      dayOfWeek: CampaignCriterionDayOfWeek;
      endHour: number;
      endMinute: CampaignCriterionMinute;
      startHour: number;
      startMinute: CampaignCriterionMinute;
      type: "adSchedule";
    }
  | {
      bidModifier: number;
      criterionResourceName: string;
      type: "deviceBidModifier";
    }
  | {
      campaignId: string;
      type: "placementExclusion";
      url: string;
    }
  | {
      campaignId: string;
      topicConstant: string;
      type: "topicExclusion";
    }
  | {
      campaignId: string;
      negative: boolean;
      sharedSet: string;
      type: "brandList";
    };

export interface UpdateCampaignCriteriaInput {
  criteria: CampaignCriterionInput[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildCampaignCriterionOperations(
  input: Pick<UpdateCampaignCriteriaInput, "criteria" | "customerId">
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  assertNonEmptyArray(
    input.criteria,
    "At least one campaign criterion is required."
  );

  const seen = new Set<string>();

  return input.criteria.map((criterion) => {
    const operation = buildCampaignCriterionOperation(customerId, criterion);
    const dedupeKey = JSON.stringify(operation);

    if (seen.has(dedupeKey)) {
      throw new Error("duplicate campaign criterion.");
    }
    seen.add(dedupeKey);

    return { campaignCriterionOperation: operation };
  });
}

export async function updateCampaignCriteria(
  client: GoogleAdsClient,
  input: UpdateCampaignCriteriaInput
): Promise<MutateResult> {
  assertValidateOnlyMode(input.mode);

  return await client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildCampaignCriterionOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

function buildCampaignCriterionOperation(
  customerId: string,
  criterion: CampaignCriterionInput
): Record<string, unknown> {
  if (criterion.type === "deviceBidModifier") {
    assertResourceName(
      criterion.criterionResourceName,
      /^customers\/\d+\/campaignCriteria\/\d+~\d+$/u,
      "criterionResourceName"
    );
    if (
      !criterion.criterionResourceName.startsWith(`customers/${customerId}/`)
    ) {
      throw new Error(
        `criterionResourceName must belong to customer ${customerId}.`
      );
    }
    assertDeviceBidModifier(criterion.bidModifier);

    return {
      update: {
        bidModifier: criterion.bidModifier,
        resourceName: criterion.criterionResourceName,
      },
      updateMask: "bid_modifier",
    };
  }

  assertNumericId(criterion.campaignId, "campaignId");
  const campaign = `customers/${customerId}/campaigns/${criterion.campaignId}`;

  switch (criterion.type) {
    case "adSchedule": {
      assertAdSchedule(criterion);
      return {
        create: {
          adSchedule: {
            dayOfWeek: criterion.dayOfWeek,
            endHour: criterion.endHour,
            endMinute: criterion.endMinute,
            startHour: criterion.startHour,
            startMinute: criterion.startMinute,
          },
          campaign,
        },
      };
    }
    case "placementExclusion": {
      const url = criterion.url.trim();
      assertNonEmptyString(url, "url");
      if (url.length > 250) {
        throw new Error("url must be 250 characters or fewer.");
      }
      if (/adsenseformobileapps\.com/iu.test(url)) {
        throw new Error(
          "adsenseformobileapps.com is not a supported placement."
        );
      }
      return { create: { campaign, negative: true, placement: { url } } };
    }
    case "topicExclusion": {
      assertResourceName(
        criterion.topicConstant,
        /^topicConstants\/\d+$/u,
        "topicConstant"
      );
      return {
        create: {
          campaign,
          negative: true,
          topic: { topicConstant: criterion.topicConstant },
        },
      };
    }
    case "brandList": {
      assertResourceName(
        criterion.sharedSet,
        /^customers\/\d+\/sharedSets\/\d+$/u,
        "sharedSet"
      );
      if (!criterion.sharedSet.startsWith(`customers/${customerId}/`)) {
        throw new Error(`sharedSet must belong to customer ${customerId}.`);
      }
      return {
        create: {
          brandList: { sharedSet: criterion.sharedSet },
          campaign,
          negative: criterion.negative,
        },
      };
    }
    default: {
      throw new Error(
        `Unsupported campaign criterion type: ${
          (criterion as { type?: string }).type ?? "unknown"
        }`
      );
    }
  }
}

function assertAdSchedule(
  criterion: Extract<CampaignCriterionInput, { type: "adSchedule" }>
): void {
  const minutes: ReadonlySet<CampaignCriterionMinute> = new Set([
    "FIFTEEN",
    "FORTY_FIVE",
    "THIRTY",
    "ZERO",
  ]);
  const days: ReadonlySet<CampaignCriterionDayOfWeek> = new Set([
    "FRIDAY",
    "MONDAY",
    "SATURDAY",
    "SUNDAY",
    "THURSDAY",
    "TUESDAY",
    "WEDNESDAY",
  ]);

  if (!days.has(criterion.dayOfWeek)) {
    throw new Error(`Unsupported dayOfWeek: ${criterion.dayOfWeek}`);
  }
  if (
    !(minutes.has(criterion.startMinute) && minutes.has(criterion.endMinute))
  ) {
    throw new Error("Schedule minutes must use quarter-hour enum values.");
  }
  if (
    !Number.isInteger(criterion.startHour) ||
    criterion.startHour < 0 ||
    criterion.startHour > 23
  ) {
    throw new Error("startHour must be an integer from 0 to 23.");
  }
  if (
    !Number.isInteger(criterion.endHour) ||
    criterion.endHour < 0 ||
    criterion.endHour > 24
  ) {
    throw new Error("endHour must be an integer from 0 to 24.");
  }

  const start = criterion.startHour * 60 + minuteValue(criterion.startMinute);
  const end = criterion.endHour * 60 + minuteValue(criterion.endMinute);
  if (end <= start || end > 24 * 60) {
    throw new Error(
      "Ad schedule end time must be after start time on the same day."
    );
  }
}

function assertDeviceBidModifier(value: number): void {
  const inRange = value === 0 || (value >= 0.1 && value <= 10);
  if (!(Number.isFinite(value) && inRange)) {
    throw new Error("bidModifier must be 0 or between 0.1 and 10.");
  }
}

function minuteValue(value: CampaignCriterionMinute): number {
  if (value === "FIFTEEN") {
    return 15;
  }
  if (value === "THIRTY") {
    return 30;
  }
  if (value === "FORTY_FIVE") {
    return 45;
  }
  return 0;
}

function assertValidateOnlyMode(mode: WorkflowMode | undefined): void {
  if (mode === "execute") {
    throw new Error(
      "updateCampaignCriteria execute mode requires targeting review and existing-criterion baseline guardrails; use validate mode until apply-mode guards are implemented."
    );
  }
}
