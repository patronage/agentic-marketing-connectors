import { microsToCurrency } from "../core/index.js";
import type { GoogleAdsRow } from "../core/index.js";
import type {
  GoogleAdsClient,
  GoogleAdsRecommendationClient,
} from "../rest/index.js";
import {
  assertCustomerResourceMatches,
  assertNonEmptyArray,
  assertNonEmptyString,
  assertNumericId,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";

export type RecommendationActionMode = "execute" | "preview" | "validate";

export interface RecommendationSummary {
  baseMetrics: RecommendationImpactMetrics;
  campaignId: string | null;
  campaignResourceName: string | null;
  dismissed: boolean | null;
  potentialMetrics: RecommendationImpactMetrics;
  resourceName: string;
  type: string;
}

export interface RecommendationImpactMetrics {
  clicks: number;
  conversions: number;
  cost: number;
  impressions: number;
}

export interface GetRecommendationsInput {
  campaignId?: string;
  customerId: string;
  signal?: AbortSignal;
  types?: string[];
}

export interface RecommendationApproval {
  approvedBy: string;
  reason: string;
  recommendationResourceNames: string[];
}

export interface ApplyRecommendationInput {
  applyParameters?: Record<string, unknown>;
  resourceName: string;
}

export interface ApplyRecommendationsInput {
  approval?: RecommendationApproval;
  customerId: string;
  mode?: RecommendationActionMode;
  operations: ApplyRecommendationInput[];
  partialFailure?: boolean;
}

export interface DismissRecommendationsInput {
  approval?: RecommendationApproval;
  customerId: string;
  mode?: RecommendationActionMode;
  partialFailure?: boolean;
  resourceNames: string[];
}

export interface RecommendationActionPreviewResult {
  customerId: string;
  mode: Exclude<RecommendationActionMode, "execute">;
  operations: unknown[];
  partialFailure?: boolean;
  providerRequestSent: false;
  requestId: null;
  results: [];
  validateOnly: true;
}

export async function getRecommendations(
  client: GoogleAdsClient,
  input: GetRecommendationsInput
): Promise<RecommendationSummary[]> {
  const rows = await searchAllRows(client, {
    customerId: input.customerId,
    query: recommendationsQuery(input),
    signal: input.signal,
  });

  return rows.map((row) => normalizeRecommendationRow(row));
}

export function buildApplyRecommendationOperations(
  input: Pick<ApplyRecommendationsInput, "customerId" | "operations">
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  assertNonEmptyArray(
    input.operations,
    "At least one recommendation apply operation is required."
  );

  const seen = new Set<string>();

  return input.operations.map((operation) => {
    assertRecommendationResourceName(
      operation.resourceName,
      customerId,
      "resourceName"
    );

    if (seen.has(operation.resourceName)) {
      throw new Error(`duplicate recommendation: ${operation.resourceName}`);
    }
    seen.add(operation.resourceName);

    return {
      ...operation.applyParameters,
      resourceName: operation.resourceName,
    };
  });
}

export function buildDismissRecommendationOperations(
  input: Pick<DismissRecommendationsInput, "customerId" | "resourceNames">
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  assertNonEmptyArray(
    input.resourceNames,
    "At least one recommendation dismiss operation is required."
  );

  const seen = new Set<string>();

  return input.resourceNames.map((resourceName) => {
    assertRecommendationResourceName(resourceName, customerId, "resourceName");

    if (seen.has(resourceName)) {
      throw new Error(`duplicate recommendation: ${resourceName}`);
    }
    seen.add(resourceName);

    return { resourceName };
  });
}

export async function applyRecommendations(
  client: GoogleAdsRecommendationClient,
  input: ApplyRecommendationsInput
) {
  const operations = buildApplyRecommendationOperations(input);
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  if (input.mode !== "execute") {
    return recommendationActionPreview({
      customerId,
      mode: input.mode,
      operations,
      partialFailure: input.partialFailure,
    });
  }

  assertRecommendationActionGuard({
    approval: input.approval,
    operationResourceNames: operations.map((operation) =>
      resourceNameFromOperation(operation)
    ),
    operationName: "applyRecommendations",
  });

  return client.applyRecommendations({
    customerId,
    operations,
    partialFailure: input.partialFailure,
  });
}

export async function dismissRecommendations(
  client: GoogleAdsRecommendationClient,
  input: DismissRecommendationsInput
) {
  const operations = buildDismissRecommendationOperations(input);
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  if (input.mode !== "execute") {
    return recommendationActionPreview({
      customerId,
      mode: input.mode,
      operations,
      partialFailure: input.partialFailure,
    });
  }

  assertRecommendationActionGuard({
    approval: input.approval,
    operationResourceNames: operations.map((operation) =>
      resourceNameFromOperation(operation)
    ),
    operationName: "dismissRecommendations",
  });

  return client.dismissRecommendations({
    customerId,
    operations,
    partialFailure: input.partialFailure,
  });
}

export function normalizeRecommendationRow(
  row: unknown
): RecommendationSummary {
  const recommendation = asRecord(readFirst(asRecord(row), ["recommendation"]));
  const impact = asRecord(recommendation.impact);
  const campaignResourceName = toNullableString(
    readFirst(recommendation, ["campaign"])
  );

  return {
    baseMetrics: normalizeImpactMetrics(
      readFirst(impact, ["baseMetrics", "base_metrics"])
    ),
    campaignId: campaignResourceName?.split("/").at(-1) ?? null,
    campaignResourceName,
    dismissed: toNullableBoolean(readFirst(recommendation, ["dismissed"])),
    potentialMetrics: normalizeImpactMetrics(
      readFirst(impact, ["potentialMetrics", "potential_metrics"])
    ),
    resourceName: toStringValue(
      readFirst(recommendation, ["resourceName", "resource_name"]),
      ""
    ),
    type: toStringValue(readFirst(recommendation, ["type"]), "UNKNOWN"),
  };
}

function recommendationsQuery(input: GetRecommendationsInput): string {
  const filters: string[] = [];
  const selectFields = [
    "recommendation.resource_name",
    "recommendation.type",
    "recommendation.campaign",
    "recommendation.dismissed",
    "recommendation.impact",
  ];

  if (input.campaignId) {
    assertNumericId(input.campaignId, "campaignId");
    // Google Ads API v24 requires WHERE-referenced fields in SELECT; campaign
    // is only attributed on campaign-scoped recommendations, so select it only
    // alongside the filter.
    selectFields.push("campaign.id");
    filters.push(`campaign.id = ${input.campaignId}`);
  }

  if (input.types && input.types.length > 0) {
    const types = input.types.map((type) => {
      assertRecommendationType(type);
      return `'${type}'`;
    });
    filters.push(`recommendation.type IN (${types.join(", ")})`);
  }

  return `
    SELECT
      ${selectFields.join(",\n      ")}
    FROM recommendation
    ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY recommendation.type
  `;
}

function assertRecommendationActionGuard(input: {
  approval: RecommendationApproval | undefined;
  operationName: string;
  operationResourceNames: string[];
}): void {
  if (!input.approval) {
    throw new Error(`${input.operationName} requires an approval guard.`);
  }

  assertNonEmptyString(input.approval.approvedBy, "approvedBy");
  assertNonEmptyString(input.approval.reason, "reason");

  const approved = new Set(input.approval.recommendationResourceNames);
  const operationNames = new Set(input.operationResourceNames);

  if (approved.size !== input.approval.recommendationResourceNames.length) {
    throw new Error(
      "approval contains duplicate recommendation resource names."
    );
  }

  if (approved.size !== operationNames.size) {
    throw new Error(
      "approval recommendationResourceNames must exactly match the operations."
    );
  }

  for (const resourceName of operationNames) {
    if (!approved.has(resourceName)) {
      throw new Error(
        "approval recommendationResourceNames must exactly match the operations."
      );
    }
  }
}

function recommendationActionPreview(input: {
  customerId: string;
  mode: RecommendationActionMode | undefined;
  operations: unknown[];
  partialFailure: boolean | undefined;
}): RecommendationActionPreviewResult {
  return {
    customerId: input.customerId,
    mode: input.mode === "preview" ? "preview" : "validate",
    operations: input.operations,
    ...(input.partialFailure === undefined
      ? {}
      : { partialFailure: input.partialFailure }),
    providerRequestSent: false,
    requestId: null,
    results: [],
    validateOnly: true,
  };
}

function resourceNameFromOperation(operation: unknown): string {
  const { resourceName } = asRecord(operation);

  if (typeof resourceName !== "string") {
    throw new TypeError("recommendation operation is missing resourceName.");
  }

  return resourceName;
}

function assertRecommendationResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertResourceName(
    resourceName,
    /^customers\/\d+\/recommendations\/[^/]+$/u,
    fieldName
  );
  assertCustomerResourceMatches(resourceName, customerId, fieldName);
}

function assertRecommendationType(value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/u.test(value)) {
    throw new Error("recommendation type must be an upper-case enum value.");
  }
}

function normalizeImpactMetrics(value: unknown): RecommendationImpactMetrics {
  const metrics = asRecord(value);

  return {
    clicks: toNumber(readFirst(metrics, ["clicks"])),
    conversions: toNumber(readFirst(metrics, ["conversions"])),
    cost: microsToCurrency(readFirst(metrics, ["costMicros", "cost_micros"])),
    impressions: toNumber(readFirst(metrics, ["impressions"])),
  };
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

function toNumber(value: unknown): number {
  const numericValue = Number(value ?? 0);

  return Number.isFinite(numericValue) ? numericValue : 0;
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
