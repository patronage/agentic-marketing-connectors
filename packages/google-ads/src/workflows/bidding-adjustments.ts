import type { GoogleAdsClient, MutateResult } from "../rest/index.js";
import {
  assertCustomerResourceMatches,
  assertNonEmptyArray,
  assertNonEmptyString,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

// Google Ads API v24 contracts:
// https://developers.google.com/google-ads/api/reference/rpc/v24/MutateOperation
// https://developers.google.com/google-ads/api/reference/rpc/v24/BiddingSeasonalityAdjustment
// https://developers.google.com/google-ads/api/reference/rpc/v24/BiddingDataExclusion

export type BiddingAdjustmentChannelType = "DISPLAY" | "SEARCH" | "SHOPPING";

export type BiddingAdjustmentDevice =
  | "CONNECTED_TV"
  | "DESKTOP"
  | "MOBILE"
  | "OTHER"
  | "TABLET";

interface BiddingAdjustmentCommon {
  description?: string;
  devices?: BiddingAdjustmentDevice[];
  endDateTime: string;
  name: string;
  startDateTime: string;
}

type BiddingAdjustmentScope =
  | {
      advertisingChannelTypes?: never;
      campaigns: string[];
      scope: "CAMPAIGN";
    }
  | {
      advertisingChannelTypes: BiddingAdjustmentChannelType[];
      campaigns?: never;
      scope: "CHANNEL";
    };

export type BiddingAdjustment = BiddingAdjustmentCommon &
  BiddingAdjustmentScope &
  (
    | {
        conversionRateModifier: number;
        type: "seasonalityAdjustment";
      }
    | {
        conversionRateModifier?: never;
        type: "dataExclusion";
      }
  );

export interface ValidateBiddingAdjustmentsInput {
  adjustments: BiddingAdjustment[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

const MAX_EVENT_INTERVAL_MILLISECONDS = 14 * 24 * 60 * 60 * 1000;

export function buildBiddingAdjustmentOperations(
  input: Pick<ValidateBiddingAdjustmentsInput, "adjustments" | "customerId">
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  assertNonEmptyArray(
    input.adjustments,
    "At least one bidding adjustment is required."
  );

  return input.adjustments.map((adjustment) => {
    const create = buildBiddingAdjustment(customerId, adjustment);

    switch (adjustment.type) {
      case "seasonalityAdjustment": {
        return {
          biddingSeasonalityAdjustmentOperation: { create },
        };
      }
      case "dataExclusion": {
        return {
          biddingDataExclusionOperation: { create },
        };
      }
      default: {
        throw new Error("Unsupported bidding adjustment type.");
      }
    }
  });
}

export async function validateBiddingAdjustments(
  client: GoogleAdsClient,
  input: ValidateBiddingAdjustmentsInput
): Promise<MutateResult> {
  if (input.mode === "execute") {
    throw new Error(
      "validateBiddingAdjustments does not support execute mode; use validate mode until apply-mode review guardrails are implemented."
    );
  }

  return await client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildBiddingAdjustmentOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

function buildBiddingAdjustment(
  customerId: string,
  adjustment: BiddingAdjustment
): Record<string, unknown> {
  const name = adjustment.name.trim();
  assertNonEmptyString(name, "name");
  if (name.length > 255) {
    throw new Error("name must be 255 characters or fewer.");
  }

  assertDateInterval(adjustment.startDateTime, adjustment.endDateTime);

  const create: Record<string, unknown> = {
    ...scopeFields(customerId, adjustment),
    endDateTime: adjustment.endDateTime,
    name,
    scope: adjustment.scope,
    startDateTime: adjustment.startDateTime,
  };

  if (adjustment.description !== undefined) {
    const description = adjustment.description.trim();
    assertNonEmptyString(description, "description");
    if (description.length > 2048) {
      throw new Error("description must be 2048 characters or fewer.");
    }
    create.description = description;
  }

  if (adjustment.devices !== undefined) {
    assertNonEmptyArray(
      adjustment.devices,
      "devices must contain at least one device when provided."
    );
    assertUnique(adjustment.devices, "devices");
    for (const device of adjustment.devices) {
      assertDevice(device);
    }
    create.devices = [...adjustment.devices];
  }

  if (adjustment.type === "seasonalityAdjustment") {
    if (
      !Number.isFinite(adjustment.conversionRateModifier) ||
      adjustment.conversionRateModifier < 0.1 ||
      adjustment.conversionRateModifier > 10
    ) {
      throw new Error("conversionRateModifier must be between 0.1 and 10.");
    }
    create.conversionRateModifier = adjustment.conversionRateModifier;
  }

  return create;
}

function scopeFields(
  customerId: string,
  adjustment: BiddingAdjustment
): Record<string, unknown> {
  if (adjustment.scope === "CAMPAIGN") {
    if ("advertisingChannelTypes" in adjustment) {
      throw new Error(
        "CAMPAIGN scope requires campaigns and cannot include advertisingChannelTypes."
      );
    }
    assertNonEmptyArray(
      adjustment.campaigns,
      "CAMPAIGN scope requires at least one campaign."
    );
    if (adjustment.campaigns.length > 2000) {
      throw new Error("campaigns cannot contain more than 2000 campaigns.");
    }
    assertUnique(adjustment.campaigns, "campaigns");

    for (const campaign of adjustment.campaigns) {
      assertResourceName(
        campaign,
        /^customers\/\d+\/campaigns\/\d+$/u,
        "campaign"
      );
      assertCustomerResourceMatches(campaign, customerId, "campaign");
    }

    return { campaigns: [...adjustment.campaigns] };
  }

  if ("campaigns" in adjustment) {
    throw new Error(
      "CHANNEL scope requires advertisingChannelTypes and cannot include campaigns."
    );
  }
  assertNonEmptyArray(
    adjustment.advertisingChannelTypes,
    "CHANNEL scope requires at least one advertising channel type."
  );
  assertUnique(adjustment.advertisingChannelTypes, "advertisingChannelTypes");
  for (const channelType of adjustment.advertisingChannelTypes) {
    assertChannelType(channelType);
  }

  return {
    advertisingChannelTypes: [...adjustment.advertisingChannelTypes],
  };
}

function assertChannelType(value: BiddingAdjustmentChannelType): void {
  if (value !== "DISPLAY" && value !== "SEARCH" && value !== "SHOPPING") {
    throw new Error(
      "advertisingChannelTypes supports only DISPLAY, SEARCH, and SHOPPING."
    );
  }
}

function assertDevice(value: BiddingAdjustmentDevice): void {
  if (
    value !== "CONNECTED_TV" &&
    value !== "DESKTOP" &&
    value !== "MOBILE" &&
    value !== "OTHER" &&
    value !== "TABLET"
  ) {
    throw new Error(`Unsupported bidding adjustment device: ${String(value)}`);
  }
}

function assertDateInterval(startDateTime: string, endDateTime: string): void {
  const start = parseDateTime(startDateTime, "startDateTime");
  const end = parseDateTime(endDateTime, "endDateTime");

  if (end <= start) {
    throw new Error("endDateTime must be after startDateTime.");
  }
  if (end - start > MAX_EVENT_INTERVAL_MILLISECONDS) {
    throw new Error("bidding adjustment intervals cannot exceed 14 days.");
  }
}

function parseDateTime(value: string, fieldName: string): number {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})$/u.exec(
      value
    );

  if (!match?.groups) {
    throw new Error(`${fieldName} must use yyyy-MM-dd HH:mm:ss format.`);
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const daysInMonth = daysInCalendarMonth(year, month);

  if (
    daysInMonth === 0 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(`${fieldName} must be a valid date and time.`);
  }

  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(hour, minute, second, 0);
  return parsed.getTime();
}

function daysInCalendarMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    return 0;
  }
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function assertUnique(values: string[], fieldName: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${fieldName} cannot contain duplicate values.`);
  }
}
