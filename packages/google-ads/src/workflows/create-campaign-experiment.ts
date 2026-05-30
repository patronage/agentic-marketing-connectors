import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsExperimentClient } from "../rest/index.js";

export type CampaignExperimentType = "YOUTUBE_CUSTOM";

export interface CampaignExperimentPlanInput {
  controlTrafficSplit: number;
  customerId: string;
  description?: string;
  endDate?: string;
  experimentName: string;
  experimentType?: CampaignExperimentType;
  startDate?: string;
  suffix: string;
  syncEnabled?: boolean;
  treatmentTrafficSplit: number;
}

export interface CampaignExperimentArmPlanInput {
  baseCampaignId: string;
  controlArmName?: string;
  controlTrafficSplit: number;
  customerId: string;
  experimentResourceName: string;
  treatmentArmName?: string;
  treatmentTrafficSplit: number;
}

export interface CreateCampaignExperimentInput extends CampaignExperimentPlanInput {
  mode?: "execute" | "validate";
  partialFailure?: boolean;
}

export interface CreateCampaignExperimentArmsInput extends CampaignExperimentArmPlanInput {
  mode?: "execute" | "validate";
}

export interface ScheduleCampaignExperimentInput {
  customerId: string;
  experimentResourceName: string;
  mode?: "execute" | "validate";
}

export interface EndCampaignExperimentInput {
  customerId: string;
  experimentResourceName: string;
  mode?: "execute" | "validate";
}

export function buildCreateCampaignExperimentOperations(
  input: CampaignExperimentPlanInput
): unknown[] {
  assertExperimentTrafficSplit(input);
  assertDateRange(input);
  assertName(input.experimentName, "experimentName");
  assertName(input.suffix, "suffix");

  const experiment: Record<string, unknown> = {
    name: input.experimentName,
    status: "SETUP",
    suffix: input.suffix,
    type: input.experimentType ?? "YOUTUBE_CUSTOM",
  };

  if (input.description) {
    experiment.description = input.description;
  }

  if (input.startDate) {
    experiment.startDate = input.startDate;
  }

  if (input.endDate) {
    experiment.endDate = input.endDate;
  }

  if (typeof input.syncEnabled === "boolean") {
    experiment.syncEnabled = input.syncEnabled;
  }

  return [{ create: experiment }];
}

export function buildCreateCampaignExperimentArmOperations(
  input: CampaignExperimentArmPlanInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");
  assertNumericId(input.baseCampaignId, "baseCampaignId");
  assertExperimentTrafficSplit(input);
  assertResourceName(
    input.experimentResourceName,
    /^customers\/\d+\/experiments\/\d+$/,
    "experimentResourceName"
  );
  assertResourceCustomerMatches(
    input.experimentResourceName,
    customerId,
    "experimentResourceName"
  );

  return [
    {
      create: {
        campaigns: [
          `customers/${customerId}/campaigns/${input.baseCampaignId}`,
        ],
        control: true,
        experiment: input.experimentResourceName,
        name: input.controlArmName ?? "control",
        trafficSplit: input.controlTrafficSplit,
      },
    },
    {
      create: {
        control: false,
        experiment: input.experimentResourceName,
        name: input.treatmentArmName ?? "treatment",
        trafficSplit: input.treatmentTrafficSplit,
      },
    },
  ];
}

export async function createCampaignExperiment(
  client: GoogleAdsExperimentClient,
  input: CreateCampaignExperimentInput
) {
  assertValidateOnlyMode(input.mode, "createCampaignExperiment");

  return client.mutateExperiments({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildCreateCampaignExperimentOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: input.mode !== "execute",
  });
}

export async function createCampaignExperimentArms(
  client: GoogleAdsExperimentClient,
  input: CreateCampaignExperimentArmsInput
) {
  assertValidateOnlyMode(input.mode, "createCampaignExperimentArms");

  return client.mutateExperimentArms({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildCreateCampaignExperimentArmOperations(input),
    responseContentType: "MUTABLE_RESOURCE",
    validateOnly: input.mode !== "execute",
  });
}

export async function scheduleCampaignExperiment(
  client: GoogleAdsExperimentClient,
  input: ScheduleCampaignExperimentInput
) {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");
  assertValidateOnlyMode(input.mode, "scheduleCampaignExperiment");
  assertResourceName(
    input.experimentResourceName,
    /^customers\/\d+\/experiments\/\d+$/,
    "experimentResourceName"
  );
  assertResourceCustomerMatches(
    input.experimentResourceName,
    customerId,
    "experimentResourceName"
  );

  return client.scheduleExperiment({
    resourceName: input.experimentResourceName,
    validateOnly: input.mode !== "execute",
  });
}

export async function endCampaignExperiment(
  client: GoogleAdsExperimentClient,
  input: EndCampaignExperimentInput
) {
  const customerId = normalizeCustomerId(input.customerId);

  assertValidateOnlyMode(input.mode, "endCampaignExperiment");
  assertNumericId(customerId, "customerId");
  assertResourceName(
    input.experimentResourceName,
    /^customers\/\d+\/experiments\/\d+$/,
    "experimentResourceName"
  );
  assertResourceCustomerMatches(
    input.experimentResourceName,
    customerId,
    "experimentResourceName"
  );

  return client.endExperiment({
    experimentResourceName: input.experimentResourceName,
    validateOnly: input.mode !== "execute",
  });
}

export function extractTreatmentInDesignCampaignResourceName(
  result: unknown
): string | null {
  const { results } = asRecord(result);
  if (!Array.isArray(results)) {
    return null;
  }

  for (const candidate of results) {
    const { experimentArm } = asRecord(candidate);
    if (experimentArm && asRecord(experimentArm).control === true) {
      continue;
    }

    const { inDesignCampaigns } = asRecord(experimentArm);
    if (
      Array.isArray(inDesignCampaigns) &&
      typeof inDesignCampaigns[0] === "string"
    ) {
      return inDesignCampaigns[0];
    }
  }

  return null;
}

function assertValidateOnlyMode(
  mode: "execute" | "validate" | undefined,
  operationName: string
): void {
  if (mode === "execute") {
    throw new Error(
      `${operationName} execute mode requires Loop approval, treatment mutation preflight, and explicit schedule guards; use validate mode until apply-mode guards are implemented.`
    );
  }
}

function assertExperimentTrafficSplit(input: {
  controlTrafficSplit: number;
  treatmentTrafficSplit: number;
}): void {
  assertPercentInteger(input.controlTrafficSplit, "controlTrafficSplit");
  assertPercentInteger(input.treatmentTrafficSplit, "treatmentTrafficSplit");

  if (input.controlTrafficSplit + input.treatmentTrafficSplit !== 100) {
    throw new Error(
      "controlTrafficSplit and treatmentTrafficSplit must add up to 100."
    );
  }
}

function assertPercentInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0 || value >= 100) {
    throw new Error(`${fieldName} must be an integer from 1 to 99.`);
  }
}

function assertDateRange(input: {
  endDate?: string;
  startDate?: string;
}): void {
  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("startDate must use YYYY-MM-DD format.");
  }

  if (input.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new Error("endDate must use YYYY-MM-DD format.");
  }

  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error("endDate must be on or after startDate.");
  }
}

function assertName(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}

function assertResourceName(
  value: string,
  pattern: RegExp,
  fieldName: string
): void {
  if (!pattern.test(value)) {
    throw new Error(`${fieldName} is not a valid Google Ads resource name.`);
  }
}

function assertResourceCustomerMatches(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  const resourceCustomerId = resourceName.match(/^customers\/(\d+)\//)?.[1];

  if (resourceCustomerId !== customerId) {
    throw new Error(`${fieldName} customer ID does not match customerId.`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!(value && typeof value === "object") || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
