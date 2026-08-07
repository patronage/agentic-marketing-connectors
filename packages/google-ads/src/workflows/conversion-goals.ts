import type { GoogleAdsRow } from "../core/index.js";
import type { GoogleAdsClient, MutateResult } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertNumericId,
  customerResourceName,
  normalizeAndAssertCustomerId,
  updateMask,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

// Google Ads API v24 lists ENABLED, HIDDEN, REMOVED, and UNKNOWN; PAUSED is
// not a conversion-action status.
// https://developers.google.com/google-ads/api/reference/rpc/v24/ConversionActionStatusEnum.ConversionActionStatus
export type ConversionActionStatus = "ENABLED" | "HIDDEN" | "REMOVED";
export type ConversionActionCountingType = "MANY_PER_CLICK" | "ONE_PER_CLICK";

export interface ConversionActionSummary {
  category: string;
  countingType: string | null;
  defaultValue: number | null;
  id: string;
  name: string;
  primaryForGoal: boolean | null;
  resourceName: string;
  status: string;
  type: string;
}

export interface ConversionGoalSummary {
  biddable: boolean;
  campaignId: string | null;
  campaignName: string | null;
  category: string;
  origin: string;
  resourceName: string;
  scope: "campaign" | "customer";
}

export interface GetConversionActionsInput {
  customerId: string;
  signal?: AbortSignal;
  status?: ConversionActionStatus;
}

export interface GetConversionGoalsInput {
  campaignId?: string;
  customerId: string;
  signal?: AbortSignal;
}

export interface ConversionActionUpdate {
  conversionActionId: string;
  countingType?: ConversionActionCountingType;
  defaultValue?: number;
  name?: string;
  primaryForGoal?: boolean;
  status?: ConversionActionStatus;
}

export interface UpdateConversionActionsInput {
  conversionActions: ConversionActionUpdate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export interface UploadClickConversionActionCreate {
  name: string;
  valueSettings?: {
    alwaysUseDefaultValue: boolean;
    defaultValue: number;
  };
  viewThroughLookbackWindowDays?: number;
}

export interface CreateUploadClickConversionActionsInput {
  conversionActions: UploadClickConversionActionCreate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export interface CustomConversionGoalCreate {
  conversionActionIds: string[];
  name: string;
}

export interface CreateCustomConversionGoalsInput {
  customConversionGoals: CustomConversionGoalCreate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export type CustomConversionGoalStatus = "ENABLED" | "REMOVED";

export interface CustomConversionGoalUpdate {
  conversionActionIds?: string[];
  customConversionGoalId: string;
  name?: string;
  status?: CustomConversionGoalStatus;
}

export interface UpdateCustomConversionGoalsInput {
  customConversionGoals: CustomConversionGoalUpdate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export type ConversionGoalBiddableUpdate =
  | {
      biddable: boolean;
      category: string;
      origin: string;
      scope: "customer";
    }
  | {
      biddable: boolean;
      campaignId: string;
      category: string;
      origin: string;
      scope: "campaign";
    };

export interface UpdateConversionGoalsInput {
  conversionGoals: ConversionGoalBiddableUpdate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export async function getConversionActions(
  client: GoogleAdsClient,
  input: GetConversionActionsInput
): Promise<ConversionActionSummary[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: conversionActionsQuery(input.status),
    signal: input.signal,
  });

  return rows.map((row) => normalizeConversionActionRow(row));
}

export async function getCustomerConversionGoals(
  client: GoogleAdsClient,
  input: GetConversionGoalsInput
): Promise<ConversionGoalSummary[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: customerConversionGoalsQuery(),
    signal: input.signal,
  });

  return rows.map((row) => normalizeCustomerConversionGoalRow(row));
}

export async function getCampaignConversionGoals(
  client: GoogleAdsClient,
  input: GetConversionGoalsInput
): Promise<ConversionGoalSummary[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: campaignConversionGoalsQuery(input.campaignId),
    signal: input.signal,
  });

  return rows.map((row) => normalizeCampaignConversionGoalRow(row));
}

export function buildCreateUploadClickConversionActionOperations(
  input: CreateUploadClickConversionActionsInput
): unknown[] {
  normalizeAndAssertCustomerId(input.customerId);
  assertNonEmptyArray(
    input.conversionActions,
    "At least one upload-click conversion action is required."
  );

  const seenNames = new Set<string>();

  return input.conversionActions.map((conversionAction, index) => {
    const name = conversionAction.name.trim();
    if (name.length === 0) {
      throw new Error(`conversionActions[${index}].name must not be empty.`);
    }
    if (seenNames.has(name)) {
      throw new Error(`duplicate conversion action name: ${name}`);
    }
    seenNames.add(name);

    const create: Record<string, unknown> = {
      category: "DEFAULT",
      name,
      status: "ENABLED",
      type: "UPLOAD_CLICKS",
    };

    if (conversionAction.viewThroughLookbackWindowDays !== undefined) {
      const days = conversionAction.viewThroughLookbackWindowDays;
      if (!Number.isInteger(days) || days < 1 || days > 30) {
        throw new Error(
          `conversionActions[${index}].viewThroughLookbackWindowDays must be an integer between 1 and 30.`
        );
      }
      create.viewThroughLookbackWindowDays = String(days);
    }

    if (conversionAction.valueSettings !== undefined) {
      if (!Number.isFinite(conversionAction.valueSettings.defaultValue)) {
        throw new TypeError(
          `conversionActions[${index}].valueSettings.defaultValue must be finite.`
        );
      }
      create.valueSettings = {
        alwaysUseDefaultValue:
          conversionAction.valueSettings.alwaysUseDefaultValue,
        defaultValue: conversionAction.valueSettings.defaultValue,
      };
    }

    // Google Ads API v24 conversion action create contract and sample:
    // https://developers.google.com/google-ads/api/reference/rpc/v24/ConversionActionOperation
    // https://developers.google.com/google-ads/api/samples/add-conversion-action
    return { conversionActionOperation: { create } };
  });
}

export function buildCreateCustomConversionGoalOperations(
  input: CreateCustomConversionGoalsInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  assertNonEmptyArray(
    input.customConversionGoals,
    "At least one custom conversion goal is required."
  );

  const seenNames = new Set<string>();

  return input.customConversionGoals.map((goal, goalIndex) => {
    const name = goal.name.trim();
    if (name.length === 0) {
      throw new Error(
        `customConversionGoals[${goalIndex}].name must not be empty.`
      );
    }
    if (seenNames.has(name)) {
      throw new Error(`duplicate custom conversion goal name: ${name}`);
    }
    seenNames.add(name);

    assertNonEmptyArray(
      goal.conversionActionIds,
      `customConversionGoals[${goalIndex}].conversionActionIds must not be empty.`
    );

    const seenConversionActionIds = new Set<string>();
    const conversionActions = goal.conversionActionIds.map(
      (conversionActionId, conversionActionIndex) => {
        const fieldName =
          `customConversionGoals[${goalIndex}].conversionActionIds` +
          `[${conversionActionIndex}]`;
        assertNumericId(conversionActionId, fieldName);

        if (seenConversionActionIds.has(conversionActionId)) {
          throw new Error(
            `duplicate conversionActionId in custom conversion goal ${name}: ${conversionActionId}`
          );
        }
        seenConversionActionIds.add(conversionActionId);

        return customerResourceName(
          customerId,
          "conversionActions",
          conversionActionId,
          fieldName
        );
      }
    );

    // Google Ads API v24 custom conversion goal create contract and guidance:
    // https://developers.google.com/google-ads/api/reference/rpc/v24/CustomConversionGoalOperation
    // https://developers.google.com/google-ads/api/docs/conversions/goals/campaign-goals
    return {
      customConversionGoalOperation: {
        create: { conversionActions, name },
      },
    };
  });
}

export function buildUpdateCustomConversionGoalOperations(
  input: UpdateCustomConversionGoalsInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  assertNonEmptyArray(
    input.customConversionGoals,
    "At least one custom conversion goal update is required."
  );

  const seenGoalIds = new Set<string>();
  const seenNames = new Set<string>();

  return input.customConversionGoals.map((goal, goalIndex) => {
    const goalIdField = `customConversionGoals[${goalIndex}].customConversionGoalId`;
    assertNumericId(goal.customConversionGoalId, goalIdField);
    if (seenGoalIds.has(goal.customConversionGoalId)) {
      throw new Error(
        `duplicate customConversionGoalId: ${goal.customConversionGoalId}`
      );
    }
    seenGoalIds.add(goal.customConversionGoalId);

    const update: Record<string, unknown> = {
      resourceName: customerResourceName(
        customerId,
        "customConversionGoals",
        goal.customConversionGoalId,
        goalIdField
      ),
    };
    const fields: string[] = [];

    if (goal.name !== undefined) {
      const name = goal.name.trim();
      if (name.length === 0) {
        throw new Error(
          `customConversionGoals[${goalIndex}].name must not be empty.`
        );
      }
      if (seenNames.has(name)) {
        throw new Error(`duplicate custom conversion goal name: ${name}`);
      }
      seenNames.add(name);
      update.name = name;
      fields.push("name");
    }

    if (goal.conversionActionIds !== undefined) {
      assertNonEmptyArray(
        goal.conversionActionIds,
        `customConversionGoals[${goalIndex}].conversionActionIds must not be empty.`
      );

      const seenConversionActionIds = new Set<string>();
      update.conversionActions = goal.conversionActionIds.map(
        (conversionActionId, conversionActionIndex) => {
          const fieldName =
            `customConversionGoals[${goalIndex}].conversionActionIds` +
            `[${conversionActionIndex}]`;
          assertNumericId(conversionActionId, fieldName);
          if (seenConversionActionIds.has(conversionActionId)) {
            throw new Error(
              `duplicate conversionActionId in custom conversion goal ${goal.customConversionGoalId}: ${conversionActionId}`
            );
          }
          seenConversionActionIds.add(conversionActionId);

          return customerResourceName(
            customerId,
            "conversionActions",
            conversionActionId,
            fieldName
          );
        }
      );
      fields.push("conversion_actions");
    }

    if (goal.status !== undefined) {
      assertCustomConversionGoalStatus(goal.status);
      update.status = goal.status;
      fields.push("status");
    }

    // Google Ads API v24 marks resource_name/id immutable and exposes
    // name, conversion_actions, and status for update through update_mask:
    // https://developers.google.com/google-ads/api/reference/rpc/v24/CustomConversionGoal
    // https://developers.google.com/google-ads/api/reference/rpc/v24/CustomConversionGoalOperation
    return {
      customConversionGoalOperation: {
        update,
        updateMask: updateMask(fields),
      },
    };
  });
}

export function buildUpdateConversionActionOperations(
  input: UpdateConversionActionsInput
): unknown[] {
  assertNonEmptyArray(
    input.conversionActions,
    "At least one conversion action update is required."
  );

  const seen = new Set<string>();

  return input.conversionActions.map((conversionAction) => {
    if (seen.has(conversionAction.conversionActionId)) {
      throw new Error(
        `duplicate conversionActionId: ${conversionAction.conversionActionId}`
      );
    }
    seen.add(conversionAction.conversionActionId);

    const update: Record<string, unknown> = {
      resourceName: customerResourceName(
        input.customerId,
        "conversionActions",
        conversionAction.conversionActionId,
        "conversionActionId"
      ),
    };
    const fields: string[] = [];

    if (conversionAction.name !== undefined) {
      const name = conversionAction.name.trim();
      if (name.length === 0) {
        throw new Error("name must not be empty.");
      }
      update.name = name;
      fields.push("name");
    }

    if (conversionAction.status !== undefined) {
      assertConversionActionStatus(conversionAction.status);
      update.status = conversionAction.status;
      fields.push("status");
    }

    if (conversionAction.primaryForGoal !== undefined) {
      update.primaryForGoal = conversionAction.primaryForGoal;
      fields.push("primary_for_goal");
    }

    if (conversionAction.countingType !== undefined) {
      assertCountingType(conversionAction.countingType);
      update.countingType = conversionAction.countingType;
      fields.push("counting_type");
    }

    if (conversionAction.defaultValue !== undefined) {
      update.valueSettings = {
        defaultValue: nonNegativeNumber(
          conversionAction.defaultValue,
          "defaultValue"
        ),
      };
      fields.push("value_settings.default_value");
    }

    return {
      conversionActionOperation: {
        update,
        updateMask: updateMask(fields),
      },
    };
  });
}

export function buildUpdateConversionGoalOperations(
  input: UpdateConversionGoalsInput
): unknown[] {
  assertNonEmptyArray(
    input.conversionGoals,
    "At least one conversion goal update is required."
  );

  const customerId = normalizeAndAssertCustomerId(input.customerId);
  const seen = new Set<string>();

  return input.conversionGoals.map((goal) => {
    assertGoalDimension(goal.category, "category");
    assertGoalDimension(goal.origin, "origin");

    const resourceName =
      goal.scope === "customer"
        ? `customers/${customerId}/customerConversionGoals/${goal.category}~${goal.origin}`
        : campaignConversionGoalResourceName(customerId, goal);

    if (seen.has(resourceName)) {
      throw new Error(`duplicate conversion goal: ${resourceName}`);
    }
    seen.add(resourceName);

    const operationName =
      goal.scope === "customer"
        ? "customerConversionGoalOperation"
        : "campaignConversionGoalOperation";

    return {
      [operationName]: {
        update: {
          biddable: goal.biddable,
          resourceName,
        },
        updateMask: "biddable",
      },
    };
  });
}

export async function updateConversionActions(
  client: GoogleAdsClient,
  input: UpdateConversionActionsInput
) {
  assertValidateOnlyMode(input.mode, "updateConversionActions");

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildUpdateConversionActionOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

export async function createUploadClickConversionActions(
  client: GoogleAdsClient,
  input: CreateUploadClickConversionActionsInput
): Promise<MutateResult> {
  assertValidateOnlyMode(input.mode, "createUploadClickConversionActions");

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildCreateUploadClickConversionActionOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

export async function createCustomConversionGoals(
  client: GoogleAdsClient,
  input: CreateCustomConversionGoalsInput
): Promise<MutateResult> {
  assertValidateOnlyMode(input.mode, "createCustomConversionGoals");

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildCreateCustomConversionGoalOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

export async function updateCustomConversionGoals(
  client: GoogleAdsClient,
  input: UpdateCustomConversionGoalsInput
): Promise<MutateResult> {
  assertValidateOnlyMode(input.mode, "updateCustomConversionGoals");

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildUpdateCustomConversionGoalOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

export async function updateConversionGoals(
  client: GoogleAdsClient,
  input: UpdateConversionGoalsInput
) {
  assertValidateOnlyMode(input.mode, "updateConversionGoals");

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildUpdateConversionGoalOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

export function normalizeConversionActionRow(
  row: unknown
): ConversionActionSummary {
  const conversionAction = asRecord(
    readFirst(asRecord(row), ["conversionAction", "conversion_action"])
  );
  const valueSettings = asRecord(
    readFirst(conversionAction, ["valueSettings", "value_settings"])
  );

  return {
    category: toStringValue(
      readFirst(conversionAction, ["category"]),
      "UNKNOWN"
    ),
    countingType: toNullableString(
      readFirst(conversionAction, ["countingType", "counting_type"])
    ),
    defaultValue: toNullableNumber(
      readFirst(valueSettings, ["defaultValue", "default_value"])
    ),
    id: toStringValue(readFirst(conversionAction, ["id"]), ""),
    name: toStringValue(readFirst(conversionAction, ["name"]), "Unknown"),
    primaryForGoal: toNullableBoolean(
      readFirst(conversionAction, ["primaryForGoal", "primary_for_goal"])
    ),
    resourceName: toStringValue(
      readFirst(conversionAction, ["resourceName", "resource_name"]),
      ""
    ),
    status: toStringValue(readFirst(conversionAction, ["status"]), "UNKNOWN"),
    type: toStringValue(readFirst(conversionAction, ["type"]), "UNKNOWN"),
  };
}

export function normalizeCustomerConversionGoalRow(
  row: unknown
): ConversionGoalSummary {
  const goal = asRecord(
    readFirst(asRecord(row), [
      "customerConversionGoal",
      "customer_conversion_goal",
    ])
  );

  return normalizeConversionGoal(goal, "customer", null, null);
}

export function normalizeCampaignConversionGoalRow(
  row: unknown
): ConversionGoalSummary {
  const record = asRecord(row);
  const campaign = asRecord(record.campaign);
  const goal = asRecord(
    readFirst(record, ["campaignConversionGoal", "campaign_conversion_goal"])
  );

  return normalizeConversionGoal(
    goal,
    "campaign",
    toNullableString(readFirst(campaign, ["id"])),
    toNullableString(readFirst(campaign, ["name"]))
  );
}

function campaignConversionGoalResourceName(
  customerId: string,
  goal: Extract<ConversionGoalBiddableUpdate, { scope: "campaign" }>
): string {
  assertNumericId(goal.campaignId, "campaignId");

  return `customers/${customerId}/campaignConversionGoals/${goal.campaignId}~${goal.category}~${goal.origin}`;
}

function conversionActionsQuery(status?: ConversionActionStatus): string {
  if (status !== undefined) {
    assertConversionActionStatus(status);
  }

  const statusFilter = status
    ? `WHERE conversion_action.status = '${status}'`
    : "WHERE conversion_action.status != 'REMOVED'";

  return `
    SELECT
      conversion_action.resource_name,
      conversion_action.id,
      conversion_action.name,
      conversion_action.category,
      conversion_action.type,
      conversion_action.status,
      conversion_action.primary_for_goal,
      conversion_action.counting_type,
      conversion_action.value_settings.default_value
    FROM conversion_action
    ${statusFilter}
    ORDER BY conversion_action.name
  `;
}

function customerConversionGoalsQuery(): string {
  return `
    SELECT
      customer_conversion_goal.resource_name,
      customer_conversion_goal.category,
      customer_conversion_goal.origin,
      customer_conversion_goal.biddable
    FROM customer_conversion_goal
    ORDER BY customer_conversion_goal.category, customer_conversion_goal.origin
  `;
}

function campaignConversionGoalsQuery(campaignId?: string): string {
  const campaignFilter = campaignId
    ? `WHERE campaign.id = ${normalizeCampaignId(campaignId)}`
    : "";

  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign_conversion_goal.resource_name,
      campaign_conversion_goal.category,
      campaign_conversion_goal.origin,
      campaign_conversion_goal.biddable
    FROM campaign_conversion_goal
    ${campaignFilter}
    ORDER BY campaign.id, campaign_conversion_goal.category, campaign_conversion_goal.origin
  `;
}

function normalizeConversionGoal(
  goal: Record<string, unknown>,
  scope: ConversionGoalSummary["scope"],
  campaignId: string | null,
  campaignName: string | null
): ConversionGoalSummary {
  return {
    biddable: toBoolean(readFirst(goal, ["biddable"])),
    campaignId,
    campaignName,
    category: toStringValue(readFirst(goal, ["category"]), "UNKNOWN"),
    origin: toStringValue(readFirst(goal, ["origin"]), "UNKNOWN"),
    resourceName: toStringValue(
      readFirst(goal, ["resourceName", "resource_name"]),
      ""
    ),
    scope,
  };
}

function assertValidateOnlyMode(
  mode: WorkflowMode | undefined,
  operationName: string
): void {
  if (mode === "execute") {
    throw new Error(
      `${operationName} execute mode requires approval, conversion-goal baseline checks, and account policy guardrails; use validate mode until apply-mode guards are implemented.`
    );
  }
}

function assertConversionActionStatus(value: ConversionActionStatus): void {
  if (!(value === "ENABLED" || value === "HIDDEN" || value === "REMOVED")) {
    throw new Error(`Unsupported conversion action status: ${value}`);
  }
}

function assertCountingType(value: ConversionActionCountingType): void {
  if (!(value === "MANY_PER_CLICK" || value === "ONE_PER_CLICK")) {
    throw new Error(`Unsupported conversion action countingType: ${value}`);
  }
}

function assertCustomConversionGoalStatus(
  value: CustomConversionGoalStatus
): void {
  if (!(value === "ENABLED" || value === "REMOVED")) {
    throw new Error(`Unsupported custom conversion goal status: ${value}`);
  }
}

function assertGoalDimension(value: string, fieldName: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/u.test(value)) {
    throw new Error(
      `${fieldName} must be an upper-case Google Ads enum value.`
    );
  }
}

function normalizeCampaignId(campaignId: string): string {
  assertNumericId(campaignId, "campaignId");
  return campaignId;
}

function nonNegativeNumber(value: number, fieldName: string): number {
  if (!(Number.isFinite(value) && value >= 0)) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }

  return value;
}

async function searchAllRows(
  client: GoogleAdsClient,
  input: { customerId: string; query: string; signal?: AbortSignal }
) {
  const rows: GoogleAdsRow[] = [];
  let pageToken: string | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- Each request needs the preceding page token (#507).
    const response = await client.search({
      customerId: input.customerId,
      ...(pageToken ? { pageToken } : {}),
      query: input.query,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    rows.push(...response.rows);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return rows;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!(value && typeof value === "object") || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value === true || value === false) {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function toStringValue(value: unknown, fallback: string): string {
  return toNullableString(value) ?? fallback;
}
