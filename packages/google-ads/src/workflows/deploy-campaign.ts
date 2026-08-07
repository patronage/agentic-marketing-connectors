import {
  assertMutationReceiptConformance,
  assertResumePlanFingerprint,
  createPlannedMutationReceipt,
  fingerprintMutationPlan,
  recordMutationExecution,
  recordMutationExecutionOutcome,
  recordProviderValidation,
  recordProviderValidationOutcome,
} from "@patronage/connector-lifecycle";
import type {
  ConnectorMutationReceipt,
  MutationLifecycleStage,
} from "@patronage/connector-lifecycle";

import { normalizeCustomerId } from "../core/index.js";
import type {
  BriefSitelink,
  CampaignBrief,
  DeployCampaignInput,
} from "../deploy/types.js";
import { validateCampaignBrief } from "../deploy/validate-brief.js";
import { GoogleAdsRequestError } from "../rest/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

const BUDGET_TEMP_ID = "-1";
const CAMPAIGN_TEMP_ID = "-2";
const OPERATION_LABEL_TEMP_ID = "-3";
const AD_GROUP_TEMP_ID_START = -10;
const ASSET_TEMP_ID_START = -100;
const MAX_RECEIPT_FAILURE_DETAIL_LENGTH = 500;

const LANGUAGE_MAP: Record<string, number> = {
  de: 1001,
  german: 1001,
  en: 1000,
  "en-us": 1000,
  english: 1000,
  es: 1003,
  spanish: 1003,
  fr: 1002,
  french: 1002,
  ja: 1005,
  japanese: 1005,
  ko: 1012,
  korean: 1012,
  pt: 1014,
  portuguese: 1014,
  zh: 1017,
  chinese: 1017,
};

export interface DeployCampaignPlan {
  operations: unknown[];
  summary: {
    adGroups: number;
    ads: number;
    bidding: CampaignBrief["frontmatter"]["bidding"];
    campaignNegativeKeywords: number;
    callouts: number;
    keywords: number;
    negativeKeywords: number;
    sitelinks: number;
    structuredSnippets: number;
  };
}

export interface DeployCampaignLifecycleResult {
  plan: DeployCampaignPlan;
  providerResult?: Awaited<ReturnType<GoogleAdsClient["mutate"]>>;
  reconciliation?: {
    status: "manual-review-required" | "resolved";
  };
  receipt: ConnectorMutationReceipt;
}

export interface DeployCampaignLifecycleOptions {
  operationId: string;
  resumeReceipt?: ConnectorMutationReceipt;
  targetStage: MutationLifecycleStage;
}

export function buildDeployCampaignOperations(
  input: DeployCampaignInput
): unknown[] {
  return planDeployCampaign(input).operations;
}

export function planDeployCampaign(
  input: DeployCampaignInput
): DeployCampaignPlan {
  const customerId = normalizeCustomerId(input.customerId);
  assertNumericId(customerId, "customerId");
  assertStatus(input.status);

  const validationFindings = validateCampaignBrief(input.brief);
  if (validationFindings.length > 0) {
    throw new Error(
      `Invalid Campaign Brief:\n${validationFindings
        .map(({ message, path }) => `${path}: ${message}`)
        .join("\n")}`
    );
  }

  const budgetResourceName = `customers/${customerId}/campaignBudgets/${BUDGET_TEMP_ID}`;
  const campaignResourceName = `customers/${customerId}/campaigns/${CAMPAIGN_TEMP_ID}`;
  const adGroupResourceNames = input.brief.ad_groups.map(
    (_, index) =>
      `customers/${customerId}/adGroups/${AD_GROUP_TEMP_ID_START - index}`
  );
  const operations: unknown[] = [
    buildBudgetOperation(input.brief, budgetResourceName),
    buildCampaignOperation(
      input.brief,
      campaignResourceName,
      budgetResourceName,
      input.status
    ),
    ...buildCampaignNegativeKeywordOperations(
      input.brief,
      campaignResourceName
    ),
    ...buildGeoTargetOperations(input.brief, campaignResourceName),
    buildLanguageTargetOperation(input.brief, campaignResourceName),
    ...buildAdGroupOperations(
      input.brief,
      campaignResourceName,
      adGroupResourceNames
    ),
    ...buildKeywordOperations(input.brief, adGroupResourceNames),
    ...buildNegativeKeywordOperations(input.brief, adGroupResourceNames),
    ...buildAdOperations(input.brief, adGroupResourceNames),
    ...buildExtensionOperations(input.brief, customerId, campaignResourceName),
  ];

  return {
    operations,
    summary: summarizeBrief(input.brief),
  };
}

export async function deployCampaign(
  client: GoogleAdsClient,
  input: DeployCampaignInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildDeployCampaignOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

export async function runDeployCampaignLifecycle(
  client: GoogleAdsClient,
  input: DeployCampaignInput,
  options: DeployCampaignLifecycleOptions
): Promise<DeployCampaignLifecycleResult> {
  assertLifecycleOperationId(options.operationId);
  const customerId = normalizeCustomerId(input.customerId);
  const basePlan = planDeployCampaign(input);
  const operationLabel = operationLabelName(options.operationId);
  const plan: DeployCampaignPlan = {
    ...basePlan,
    operations: [
      ...basePlan.operations,
      ...buildOperationLabelOperations(customerId, operationLabel),
    ],
  };
  const planFingerprint = await fingerprintMutationPlan({
    customerId,
    operations: plan.operations,
    status: input.status,
  });
  let receipt = ensureOperationLabelCleanupStep(
    options.resumeReceipt ??
      createPlannedMutationReceipt({
        evidenceRequirements: { executionResourceIds: true },
        operationId: options.operationId,
        operationKind: "campaign.deploy",
        planFingerprint,
        provider: "google-ads",
      })
  );
  assertMutationReceiptConformance(receipt);
  if (
    receipt.operationId !== options.operationId ||
    receipt.operationKind !== "campaign.deploy" ||
    receipt.provider !== "google-ads"
  ) {
    throw new Error("Google Ads deployment receipt identity does not match.");
  }
  assertResumePlanFingerprint(receipt, planFingerprint);

  if (options.targetStage === "planned") {
    return { plan, receipt };
  }

  let reconciliation: DeployCampaignLifecycleResult["reconciliation"];
  const ambiguousResult = await maybeReconcileAmbiguousExecution({
    client,
    customerId,
    operationLabel,
    plan,
    receipt,
    targetStage: options.targetStage,
  });
  if (ambiguousResult) {
    if (ambiguousResult.reconciliation?.status !== "resolved") {
      return ambiguousResult;
    }
    const {
      receipt: reconciledReceipt,
      reconciliation: resolvedReconciliation,
    } = ambiguousResult;
    receipt = reconciledReceipt;
    reconciliation = resolvedReconciliation;
  }

  if (
    options.targetStage === "executed" &&
    options.resumeReceipt?.status === "succeeded"
  ) {
    return {
      plan,
      receipt: await cleanupOperationLabel(
        client,
        customerId,
        operationLabel,
        receipt
      ),
    };
  }
  if (receipt.stage === "executed" && receipt.status === "failed") {
    receipt = resetExecution(receipt);
  }

  let providerResult:
    | Awaited<ReturnType<GoogleAdsClient["mutate"]>>
    | undefined;
  if (shouldRunProviderValidation(receipt)) {
    receipt = resetProviderValidation(receipt);
    try {
      providerResult = await client.mutate({
        customerId,
        operations: plan.operations,
        partialFailure: false,
        validateOnly: true,
      });
      receipt = recordCampaignValidationResult(receipt, providerResult);
    } catch (error) {
      receipt = recordProviderValidationOutcome(receipt, {
        failureDetail: receiptFailureDetail(error),
        ...(error instanceof GoogleAdsRequestError && error.requestId
          ? { providerRequestId: error.requestId }
          : {}),
        status: "failed",
      });
    }
  }
  if (
    options.targetStage === "provider-validated" ||
    receipt.status !== "validated"
  ) {
    return { plan, providerResult, receipt, reconciliation };
  }

  ({ providerResult, receipt } = await executeCampaignPlan(
    client,
    customerId,
    plan,
    receipt
  ));
  return {
    plan,
    providerResult,
    reconciliation,
    receipt,
  };
}

async function maybeReconcileAmbiguousExecution(input: {
  client: GoogleAdsClient;
  customerId: string;
  operationLabel: string;
  plan: DeployCampaignPlan;
  receipt: ConnectorMutationReceipt;
  targetStage: MutationLifecycleStage;
}): Promise<DeployCampaignLifecycleResult | undefined> {
  if (
    input.receipt.stage !== "executed" ||
    input.receipt.status !== "ambiguous"
  ) {
    return undefined;
  }
  if (input.targetStage !== "executed") {
    return { plan: input.plan, receipt: input.receipt };
  }
  const reconciliation = await reconcileAmbiguousCampaignExecution(
    input.client,
    input.customerId,
    input.operationLabel,
    input.receipt
  );
  if (!reconciliation.receipt) {
    return {
      plan: input.plan,
      receipt: input.receipt,
      reconciliation: { status: "manual-review-required" },
    };
  }
  return {
    plan: input.plan,
    receipt: reconciliation.receipt,
    reconciliation: { status: "resolved" },
  };
}

function recordCampaignValidationResult(
  receipt: ConnectorMutationReceipt,
  providerResult: Awaited<ReturnType<GoogleAdsClient["mutate"]>>
): ConnectorMutationReceipt {
  if (providerResult.requestId && !providerResult.partialFailureError) {
    return recordProviderValidation(receipt, {
      providerRequestId: providerResult.requestId,
    });
  }
  return recordProviderValidationOutcome(receipt, {
    providerRequestId: providerResult.requestId ?? undefined,
    status: "failed",
  });
}

function shouldRunProviderValidation(
  receipt: ConnectorMutationReceipt
): boolean {
  return (
    receipt.stage === "planned" ||
    (receipt.stage === "provider-validated" && receipt.status === "failed")
  );
}

async function executeCampaignPlan(
  client: GoogleAdsClient,
  customerId: string,
  plan: DeployCampaignPlan,
  receipt: ConnectorMutationReceipt
): Promise<{
  providerResult?: Awaited<ReturnType<GoogleAdsClient["mutate"]>>;
  receipt: ConnectorMutationReceipt;
}> {
  try {
    const providerResult = await client.mutate({
      customerId,
      operations: plan.operations,
      partialFailure: false,
      validateOnly: false,
    });
    const providerResourceIds = collectCampaignResourceNames(
      providerResult.mutateOperationResponses
    );
    const operationLabelResourceNames = collectLabelResourceNames(
      providerResult.mutateOperationResponses
    );
    let nextReceipt: ConnectorMutationReceipt;
    if (providerResult.partialFailureError) {
      nextReceipt = recordMutationExecutionOutcome(receipt, {
        providerRequestId: providerResult.requestId ?? undefined,
        providerResourceIds,
        status: "failed",
      });
    } else if (providerResult.requestId && providerResourceIds.length > 0) {
      nextReceipt = recordMutationExecution(receipt, {
        providerRequestId: providerResult.requestId,
        providerResourceIds,
      });
      nextReceipt = recordOperationLabelCleanupEvidence(
        nextReceipt,
        operationLabelResourceNames
      );
    } else {
      nextReceipt = recordMutationExecutionOutcome(receipt, {
        providerRequestId: providerResult.requestId ?? undefined,
        providerResourceIds,
        status: "ambiguous",
      });
    }
    return { providerResult, receipt: nextReceipt };
  } catch (error) {
    return {
      receipt: recordMutationExecutionOutcome(receipt, {
        failureDetail: receiptFailureDetail(error),
        ...(error instanceof GoogleAdsRequestError && error.requestId
          ? { providerRequestId: error.requestId }
          : {}),
        status:
          error instanceof GoogleAdsRequestError && error.status < 500
            ? "failed"
            : "ambiguous",
      }),
    };
  }
}

function receiptFailureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  const detail =
    message || "Google Ads request failed without an error message.";
  return detail.slice(0, MAX_RECEIPT_FAILURE_DETAIL_LENGTH);
}

function assertLifecycleOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(operationId)) {
    throw new Error("Google Ads deployment operation ID is invalid.");
  }
}

function operationLabelName(operationId: string): string {
  return `patronage:${operationId}`;
}

function buildOperationLabelOperations(
  customerId: string,
  labelName: string
): unknown[] {
  const labelResourceName = `customers/${customerId}/labels/${OPERATION_LABEL_TEMP_ID}`;
  const campaignResourceName = `customers/${customerId}/campaigns/${CAMPAIGN_TEMP_ID}`;

  // Google Ads API v24 labels are filterable through campaign_label, letting a
  // resume reconcile the campaign without exposing an internal ID in its name.
  // https://developers.google.com/google-ads/api/reference/rpc/v24/Label
  // https://developers.google.com/google-ads/api/reference/rpc/v24/CampaignLabel
  return [
    {
      labelOperation: {
        create: { name: labelName, resourceName: labelResourceName },
      },
    },
    {
      campaignLabelOperation: {
        create: { campaign: campaignResourceName, label: labelResourceName },
      },
    },
  ];
}

function resetProviderValidation(
  receipt: ConnectorMutationReceipt
): ConnectorMutationReceipt {
  return {
    ...receipt,
    stage: "planned",
    status: "planned",
    steps: receipt.steps.map((step) =>
      step.key === "provider-validation"
        ? { attempted: false, key: step.key, status: "pending" }
        : step
    ),
  };
}

function resetExecution(
  receipt: ConnectorMutationReceipt
): ConnectorMutationReceipt {
  return {
    ...receipt,
    stage: "provider-validated",
    status: "validated",
    steps: receipt.steps.map((step) =>
      step.key === "execution"
        ? { attempted: false, key: step.key, status: "pending" }
        : step
    ),
  };
}

function ensureOperationLabelCleanupStep(
  receipt: ConnectorMutationReceipt
): ConnectorMutationReceipt {
  if (receipt.steps.some(({ key }) => key === "operation-label-cleanup")) {
    return receipt;
  }
  return {
    ...receipt,
    steps: [
      ...receipt.steps,
      {
        attempted: false,
        key: "operation-label-cleanup",
        status: "pending",
      },
    ],
  };
}

function recordOperationLabelCleanupEvidence(
  receipt: ConnectorMutationReceipt,
  resourceNames: string[]
): ConnectorMutationReceipt {
  const uniqueResourceNames = [...new Set(resourceNames)];
  return updateOperationLabelCleanupStep(receipt, {
    attempted: false,
    ...(uniqueResourceNames.length === 1
      ? { providerResourceIds: uniqueResourceNames }
      : {}),
    status: "pending",
  });
}

function recordOperationLabelCleanupOutcome(
  receipt: ConnectorMutationReceipt,
  outcome: {
    failureDetail?: string;
    providerRequestId?: string;
    status: "failed" | "succeeded";
  }
): ConnectorMutationReceipt {
  return updateOperationLabelCleanupStep(receipt, {
    attempted: true,
    ...(outcome.failureDetail === undefined
      ? {}
      : { failureDetail: outcome.failureDetail }),
    ...(outcome.providerRequestId === undefined
      ? {}
      : { providerRequestId: outcome.providerRequestId }),
    status: outcome.status,
  });
}

function updateOperationLabelCleanupStep(
  receipt: ConnectorMutationReceipt,
  update: {
    attempted: boolean;
    failureDetail?: string;
    providerRequestId?: string;
    providerResourceIds?: string[];
    status: "failed" | "pending" | "succeeded";
  }
): ConnectorMutationReceipt {
  const next: ConnectorMutationReceipt = {
    ...receipt,
    steps: receipt.steps.map((step) =>
      step.key === "operation-label-cleanup"
        ? { key: step.key, ...update }
        : step
    ),
  };
  assertMutationReceiptConformance(next);
  return next;
}

async function cleanupOperationLabel(
  client: GoogleAdsClient,
  customerId: string,
  operationLabel: string,
  receipt: ConnectorMutationReceipt
): Promise<ConnectorMutationReceipt> {
  const cleanup = receipt.steps.find(
    ({ key }) => key === "operation-label-cleanup"
  );
  if (cleanup?.status === "succeeded") {
    return receipt;
  }
  const campaignResourceName = receipt.steps.find(
    ({ key }) => key === "execution"
  )?.providerResourceIds?.[0];
  const labelResourceName =
    cleanup?.providerResourceIds?.[0] ??
    (await findOperationLabelResourceName(client, customerId, operationLabel));
  if (!campaignResourceName || !labelResourceName) {
    return recordOperationLabelCleanupOutcome(receipt, {
      failureDetail:
        "Operation label cleanup could not resolve the campaign or label resource name.",
      status: "failed",
    });
  }

  const campaignLabelAssociationResourceName =
    operationCampaignLabelResourceName(campaignResourceName, labelResourceName);
  if (!campaignLabelAssociationResourceName) {
    return recordOperationLabelCleanupOutcome(receipt, {
      failureDetail:
        "Operation label cleanup received unsupported campaign or label resource names.",
      status: "failed",
    });
  }

  try {
    // Remove the CampaignLabel relationship before the Label itself. Both v24
    // operation resources accept their respective resource name in `remove`.
    // https://developers.google.com/google-ads/api/reference/rpc/v24/CampaignLabelOperation
    // https://developers.google.com/google-ads/api/reference/rpc/v24/LabelOperation
    const result = await client.mutate({
      customerId,
      operations: [
        {
          campaignLabelOperation: {
            remove: campaignLabelAssociationResourceName,
          },
        },
        { labelOperation: { remove: labelResourceName } },
      ],
      partialFailure: false,
      validateOnly: false,
    });
    return recordOperationLabelCleanupOutcome(receipt, {
      ...(result.requestId ? { providerRequestId: result.requestId } : {}),
      status: "succeeded",
    });
  } catch (error) {
    return recordOperationLabelCleanupOutcome(receipt, {
      failureDetail: receiptFailureDetail(error),
      ...(error instanceof GoogleAdsRequestError && error.requestId
        ? { providerRequestId: error.requestId }
        : {}),
      status: "failed",
    });
  }
}

async function findOperationLabelResourceName(
  client: GoogleAdsClient,
  customerId: string,
  operationLabel: string
): Promise<string | undefined> {
  try {
    const result = await client.search({
      customerId,
      query: `SELECT label.resource_name FROM label WHERE label.name = '${escapeGaqlString(operationLabel)}'`,
    });
    const resourceNames = [
      ...new Set(result.rows.flatMap((row) => extractLabelResourceName(row))),
    ];
    return resourceNames.length === 1 ? resourceNames[0] : undefined;
  } catch {
    return undefined;
  }
}

async function reconcileAmbiguousCampaignExecution(
  client: GoogleAdsClient,
  customerId: string,
  operationLabel: string,
  receipt: ConnectorMutationReceipt
): Promise<{ receipt?: ConnectorMutationReceipt }> {
  const campaignResourceNames: string[] = [];
  const labelResourceNames: string[] = [];
  let pageToken: string | undefined;
  let requestId: string | null = null;
  try {
    do {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- duplicate-safe reconciliation must inspect every provider page.
      const result = await client.search({
        customerId,
        ...(pageToken ? { pageToken } : {}),
        query: `SELECT campaign.resource_name, label.resource_name FROM campaign_label WHERE label.name = '${escapeGaqlString(operationLabel)}'`,
      });
      requestId = result.requestId ?? requestId;
      campaignResourceNames.push(
        ...result.rows.flatMap((row) => extractCampaignResourceName(row))
      );
      labelResourceNames.push(
        ...result.rows.flatMap((row) => extractLabelResourceName(row))
      );
      pageToken = result.nextPageToken;
    } while (pageToken);
  } catch {
    return {};
  }
  const uniqueCampaignResourceNames = [...new Set(campaignResourceNames)];
  const uniqueLabelResourceNames = [...new Set(labelResourceNames)];
  if (
    uniqueCampaignResourceNames.length !== 1 ||
    uniqueLabelResourceNames.length !== 1 ||
    !requestId
  ) {
    return {};
  }
  const executedReceipt = recordMutationExecution(resetExecution(receipt), {
    providerRequestId: requestId,
    providerResourceIds: uniqueCampaignResourceNames,
  });
  return {
    receipt: recordOperationLabelCleanupEvidence(
      executedReceipt,
      uniqueLabelResourceNames
    ),
  };
}

function extractCampaignResourceName(row: unknown): string[] {
  if (!(row && typeof row === "object" && "campaign" in row)) {
    return [];
  }
  const { campaign } = row;
  if (!(campaign && typeof campaign === "object")) {
    return [];
  }
  const record = campaign as Record<string, unknown>;
  const resourceName = record.resourceName ?? record.resource_name;
  return typeof resourceName === "string" ? [resourceName] : [];
}

function extractLabelResourceName(row: unknown): string[] {
  if (!(row && typeof row === "object" && "label" in row)) {
    return [];
  }
  const { label } = row;
  if (!(label && typeof label === "object")) {
    return [];
  }
  const record = label as Record<string, unknown>;
  const resourceName = record.resourceName ?? record.resource_name;
  return typeof resourceName === "string" ? [resourceName] : [];
}

function escapeGaqlString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function collectCampaignResourceNames(value: unknown): string[] {
  return collectResourceNames(value, /^customers\/\d+\/campaigns\/[^/]+$/u);
}

function collectLabelResourceNames(value: unknown): string[] {
  return collectResourceNames(value, /^customers\/\d+\/labels\/\d+$/u);
}

function collectResourceNames(value: unknown, pattern: RegExp): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectResourceNames(item, pattern));
  }
  if (!(value && typeof value === "object")) {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) =>
    key === "resourceName" && typeof item === "string" && pattern.test(item)
      ? [item]
      : collectResourceNames(item, pattern)
  );
}

function operationCampaignLabelResourceName(
  campaignResourceName: string,
  labelResourceName: string
): string | undefined {
  const [
    campaignCustomers,
    campaignCustomerId,
    campaignCollection,
    campaignId,
  ] = campaignResourceName.split("/");
  const [labelCustomers, labelCustomerId, labelCollection, labelId] =
    labelResourceName.split("/");
  if (
    campaignCustomers !== "customers" ||
    campaignCollection !== "campaigns" ||
    labelCustomers !== "customers" ||
    labelCollection !== "labels" ||
    !campaignCustomerId ||
    !campaignId ||
    !labelCustomerId ||
    !labelId ||
    campaignCustomerId !== labelCustomerId ||
    !/^\d+$/u.test(campaignCustomerId) ||
    !/^\d+$/u.test(campaignId) ||
    !/^\d+$/u.test(labelId)
  ) {
    return undefined;
  }
  return `customers/${campaignCustomerId}/campaignLabels/${campaignId}~${labelId}`;
}

function buildBudgetOperation(
  brief: CampaignBrief,
  resourceName: string
): unknown {
  return {
    campaignBudgetOperation: {
      create: {
        amountMicros: Math.round(brief.frontmatter.budget_daily * 1_000_000),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
        name: `${brief.frontmatter.campaign_name} Budget`,
        resourceName,
      },
    },
  };
}

function buildCampaignOperation(
  brief: CampaignBrief,
  resourceName: string,
  budgetResourceName: string,
  status: "ENABLED" | "PAUSED"
): unknown {
  return {
    campaignOperation: {
      create: {
        advertisingChannelType: "SEARCH",
        campaignBudget: budgetResourceName,
        containsEuPoliticalAdvertising:
          "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        // v24 replaced campaign start/end dates with datetimes; the end must be end-of-day.
        endDateTime: `${brief.frontmatter.end_date} 23:59:59`,
        geoTargetTypeSetting: {
          negativeGeoTargetType: "PRESENCE",
          positiveGeoTargetType: "PRESENCE",
        },
        ...campaignBiddingStrategy(brief.frontmatter),
        name: brief.frontmatter.campaign_name,
        networkSettings: {
          targetContentNetwork: false,
          targetGoogleSearch: true,
          targetSearchNetwork: false,
        },
        resourceName,
        startDateTime: `${brief.frontmatter.start_date} 00:00:00`,
        status,
      },
    },
  };
}

function campaignBiddingStrategy(
  frontmatter: CampaignBrief["frontmatter"]
): Record<string, unknown> {
  // These are Google Ads Campaign create field names. targetCpaMicros and
  // cpcBidCeilingMicros are REST int64 strings; "0" is the live-verified
  // no-target value for create.
  switch (frontmatter.bidding) {
    case "manual-cpc": {
      return { manualCpc: { enhancedCpcEnabled: false } };
    }
    case "maximize-clicks": {
      // parse-brief guarantees max_cpc is a whole number of cents, so
      // cents * 10_000 converts to micros exactly.
      return {
        targetSpend:
          frontmatter.max_cpc === undefined
            ? {}
            : {
                cpcBidCeilingMicros: String(
                  Math.round(frontmatter.max_cpc * 100) * 10_000
                ),
              },
      };
    }
    case "maximize-conversions": {
      return { maximizeConversions: { targetCpaMicros: "0" } };
    }
    default: {
      throw new Error(
        `Unsupported Campaign Brief bidding strategy: ${frontmatter.bidding}`
      );
    }
  }
}

function buildCampaignNegativeKeywordOperations(
  brief: CampaignBrief,
  campaignResourceName: string
): unknown[] {
  return brief.campaign_negative_keywords.map((keyword) => ({
    campaignCriterionOperation: {
      create: {
        campaign: campaignResourceName,
        keyword: {
          matchType: keyword.match_type,
          text: keyword.text,
        },
        negative: true,
      },
    },
  }));
}

function buildGeoTargetOperations(
  brief: CampaignBrief,
  campaignResourceName: string
): unknown[] {
  return brief.frontmatter.geographic_targets.map((target) => ({
    campaignCriterionOperation: {
      create: {
        campaign: campaignResourceName,
        location: {
          geoTargetConstant: normalizeGeoTargetConstant(target),
        },
        negative: false,
      },
    },
  }));
}

function buildLanguageTargetOperation(
  brief: CampaignBrief,
  campaignResourceName: string
): unknown {
  const languageId = resolveLanguageId(brief.frontmatter.language);

  return {
    campaignCriterionOperation: {
      create: {
        campaign: campaignResourceName,
        language: {
          languageConstant: `languageConstants/${languageId}`,
        },
      },
    },
  };
}

function buildAdGroupOperations(
  brief: CampaignBrief,
  campaignResourceName: string,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.map((adGroup, index) => ({
    adGroupOperation: {
      create: {
        campaign: campaignResourceName,
        ...(brief.frontmatter.bidding === "manual-cpc"
          ? { cpcBidMicros: 1_500_000 }
          : {}),
        name: adGroup.name,
        resourceName: adGroupResourceNames[index],
        status: "ENABLED",
        type: "SEARCH_STANDARD",
      },
    },
  }));
}

function buildKeywordOperations(
  brief: CampaignBrief,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.flatMap((adGroup, index) =>
    adGroup.keywords.map((keyword) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResourceNames[index],
          keyword: {
            matchType: keyword.match_type,
            text: keyword.text,
          },
          status: "ENABLED",
        },
      },
    }))
  );
}

function buildNegativeKeywordOperations(
  brief: CampaignBrief,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.flatMap((adGroup, index) =>
    adGroup.negative_keywords.map((keyword) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResourceNames[index],
          keyword: {
            matchType: keyword.match_type,
            text: keyword.text,
          },
          negative: true,
        },
      },
    }))
  );
}

function buildAdOperations(
  brief: CampaignBrief,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.flatMap((adGroup, index) =>
    adGroup.ads.map((ad) => ({
      adGroupAdOperation: {
        create: {
          ad: {
            finalUrls: [ad.final_url],
            responsiveSearchAd: {
              descriptions: ad.descriptions.map((text) => ({ text })),
              headlines: ad.headlines.map((text) => ({ text })),
              ...(ad.path_1 ? { path1: ad.path_1 } : {}),
              ...(ad.path_2 ? { path2: ad.path_2 } : {}),
            },
          },
          adGroup: adGroupResourceNames[index],
          status: "ENABLED",
        },
      },
    }))
  );
}

function buildExtensionOperations(
  brief: CampaignBrief,
  customerId: string,
  campaignResourceName: string
): unknown[] {
  const operations: unknown[] = [];
  let assetTempId = ASSET_TEMP_ID_START;
  const baseUrl = extractBaseUrl(brief);

  for (const sitelink of brief.extensions.sitelinks) {
    const assetResourceName = assetResource(customerId, assetTempId);
    assetTempId -= 1;
    operations.push(
      {
        assetOperation: {
          create: {
            finalUrls: [resolveSitelinkFinalUrl(sitelink, baseUrl)],
            name: `Sitelink: ${sitelink.link_text}`,
            resourceName: assetResourceName,
            sitelinkAsset: {
              ...(sitelink.description_1
                ? { description1: sitelink.description_1 }
                : {}),
              ...(sitelink.description_2
                ? { description2: sitelink.description_2 }
                : {}),
              linkText: sitelink.link_text,
            },
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: assetResourceName,
            campaign: campaignResourceName,
            fieldType: "SITELINK",
          },
        },
      }
    );
  }

  for (const callout of brief.extensions.callouts) {
    const assetResourceName = assetResource(customerId, assetTempId);
    assetTempId -= 1;
    operations.push(
      {
        assetOperation: {
          create: {
            calloutAsset: { calloutText: callout },
            name: `Callout: ${callout}`,
            resourceName: assetResourceName,
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: assetResourceName,
            campaign: campaignResourceName,
            fieldType: "CALLOUT",
          },
        },
      }
    );
  }

  for (const snippet of brief.extensions.structured_snippets) {
    const assetResourceName = assetResource(customerId, assetTempId);
    assetTempId -= 1;
    operations.push(
      {
        assetOperation: {
          create: {
            name: `Snippet: ${snippet.header}`,
            resourceName: assetResourceName,
            structuredSnippetAsset: {
              header: snippet.header,
              values: snippet.values,
            },
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: assetResourceName,
            campaign: campaignResourceName,
            fieldType: "STRUCTURED_SNIPPET",
          },
        },
      }
    );
  }

  return operations;
}

function resolveSitelinkFinalUrl(
  sitelink: BriefSitelink,
  baseUrl: string
): string {
  if (sitelink.final_url) {
    return sitelink.final_url;
  }

  const path = sitelink.path ?? "";
  if (!baseUrl) {
    return path;
  }

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    const separator = path.startsWith("/") ? "" : "/";
    return `${baseUrl}${separator}${path}`;
  }
}

function summarizeBrief(brief: CampaignBrief): DeployCampaignPlan["summary"] {
  return {
    adGroups: brief.ad_groups.length,
    ads: brief.ad_groups.reduce((sum, adGroup) => sum + adGroup.ads.length, 0),
    bidding: brief.frontmatter.bidding,
    campaignNegativeKeywords: brief.campaign_negative_keywords.length,
    callouts: brief.extensions.callouts.length,
    keywords: brief.ad_groups.reduce(
      (sum, adGroup) => sum + adGroup.keywords.length,
      0
    ),
    negativeKeywords: brief.ad_groups.reduce(
      (sum, adGroup) => sum + adGroup.negative_keywords.length,
      0
    ),
    sitelinks: brief.extensions.sitelinks.length,
    structuredSnippets: brief.extensions.structured_snippets.length,
  };
}

function normalizeGeoTargetConstant(target: string): string {
  const trimmed = target.trim();
  if (/^\d+$/u.test(trimmed)) {
    return `geoTargetConstants/${trimmed}`;
  }

  if (/^geoTargetConstants\/\d+$/u.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized === "us" ||
    normalized === "usa" ||
    normalized === "united states"
  ) {
    return "geoTargetConstants/2840";
  }

  throw new Error(
    `Unsupported geographic target "${target}". Use a numeric geo target ID, geoTargetConstants/<id>, or United States.`
  );
}

function resolveLanguageId(language: string): number {
  const id = LANGUAGE_MAP[language.trim().toLowerCase()];
  if (!id) {
    throw new Error(`Unknown language: ${language}`);
  }
  return id;
}

function extractBaseUrl(brief: CampaignBrief): string {
  for (const adGroup of brief.ad_groups) {
    for (const ad of adGroup.ads) {
      if (ad.final_url) {
        try {
          const url = new URL(ad.final_url);
          return `${url.protocol}//${url.host}`;
        } catch {
          return ad.final_url;
        }
      }
    }
  }
  return "";
}

function assetResource(customerId: string, tempId: number): string {
  return `customers/${customerId}/assets/${tempId}`;
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}

function assertStatus(value: string): asserts value is "ENABLED" | "PAUSED" {
  if (value !== "ENABLED" && value !== "PAUSED") {
    throw new Error("status must be ENABLED or PAUSED.");
  }
}
