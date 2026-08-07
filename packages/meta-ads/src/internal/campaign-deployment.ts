import {
  assertResumePlanFingerprint,
  fingerprintMutationPlan,
} from "@patronage/connector-lifecycle";

import { MetaAdsAmbiguousWriteError } from "./meta-ads-ambiguous-write-error.js";
import { MetaAdsApiError } from "./meta-ads-api-error.js";
import type { MetaAdsClient } from "./meta-ads-client.js";
import type {
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
} from "./types.js";

export interface MetaCampaignDeploymentPlan {
  ads?: CreateAdInput[];
  adSets?: CreateAdSetInput[];
  campaign: CreateCampaignInput;
}

export type MetaCampaignDeploymentStatus =
  | "ambiguous"
  | "failed"
  | "manual-review"
  | "pending"
  | "succeeded";

export interface MetaCampaignDeploymentStep {
  attempted: boolean;
  key: string;
  providerRequestId?: string;
  providerResourceId?: string;
  stableIdentity: string;
  status: MetaCampaignDeploymentStatus;
}

export interface MetaCampaignDeploymentReceipt {
  operationId: string;
  operationKind: "campaign.deploy";
  planFingerprint: string;
  provider: "meta";
  status: MetaCampaignDeploymentStatus;
  steps: MetaCampaignDeploymentStep[];
}

export interface DeployMetaCampaignPlanOptions {
  operationId: string;
  resumeReceipt?: MetaCampaignDeploymentReceipt;
}

export interface PreviewMetaCampaignPlanOptions {
  operationId: string;
}

export interface MetaCampaignDeploymentResult {
  plan: MetaCampaignDeploymentPlan;
  receipt: MetaCampaignDeploymentReceipt;
  result?: {
    adIds: string[];
    adSetIds: string[];
    campaignId: string;
  };
}

export type MetaCampaignPlanPreview = Omit<
  MetaCampaignDeploymentResult,
  "result"
>;

interface CampaignStepDefinition {
  execute: (
    receipt: MetaCampaignDeploymentReceipt
  ) => Promise<{ id: string; providerRequestId?: string }>;
  key: string;
  reconcile: (
    receipt: MetaCampaignDeploymentReceipt
  ) => Promise<{ id: string } | undefined>;
  stableIdentity: string;
}

export async function deployMetaCampaignPlan(
  client: MetaAdsClient,
  sourcePlan: MetaCampaignDeploymentPlan,
  options: DeployMetaCampaignPlanOptions
): Promise<MetaCampaignDeploymentResult> {
  const preview = await previewMetaCampaignPlan(sourcePlan, options);
  const { plan } = preview;
  const definitions = campaignStepDefinitions(client, plan);
  const fingerprint = preview.receipt.planFingerprint;
  let receipt = options.resumeReceipt ?? preview.receipt;
  assertResumePlanFingerprint(receipt, fingerprint);
  assertReceipt(receipt, definitions, options.operationId);
  if (["manual-review", "succeeded"].includes(receipt.status)) {
    return campaignResult(plan, receipt);
  }
  if (options.resumeReceipt) {
    receipt = await verifySucceededSteps(definitions, receipt);
    if (receipt.status === "manual-review") {
      return campaignResult(plan, receipt);
    }
  }
  for (const definition of definitions) {
    const step = requireStep(receipt, definition.key);
    if (step.status === "succeeded") {
      continue;
    }
    if (step.status === "ambiguous") {
      let found: { id: string } | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- reconciliation follows the provider dependency chain.
        found = await definition.reconcile(receipt);
      } catch {
        found = undefined;
      }
      if (!found) {
        return campaignResult(
          plan,
          setOutcome(receipt, definition.key, "manual-review")
        );
      }
      receipt = updateStep(receipt, definition.key, {
        ...step,
        providerResourceId: found.id,
        status: "succeeded",
      });
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- every child write depends on resolved predecessor IDs.
      const created = await definition.execute(receipt);
      if (!created.id.trim()) {
        throw new MetaAdsAmbiguousWriteError({
          method: "POST",
          path: definition.key,
          providerRequestId: created.providerRequestId,
        });
      }
      receipt = updateStep(receipt, definition.key, {
        ...step,
        attempted: true,
        ...(created.providerRequestId
          ? { providerRequestId: created.providerRequestId }
          : {}),
        providerResourceId: created.id,
        status: "succeeded",
      });
    } catch (error) {
      const status =
        error instanceof MetaAdsAmbiguousWriteError ? "ambiguous" : "failed";
      return campaignResult(
        plan,
        setOutcome(receipt, definition.key, status, requestId(error))
      );
    }
  }
  return campaignResult(plan, { ...receipt, status: "succeeded" });
}

/** Validates, binds, and fingerprints a campaign plan without provider activity. */
export async function previewMetaCampaignPlan(
  sourcePlan: MetaCampaignDeploymentPlan,
  options: PreviewMetaCampaignPlanOptions
): Promise<MetaCampaignPlanPreview> {
  assertOperationId(options.operationId);
  assertCampaignPlan(sourcePlan);
  const plan = bindCampaignPlan(sourcePlan, options.operationId);
  const definitions = campaignStepMetadata(plan);
  const fingerprint = await fingerprintMutationPlan(jsonSafe(plan));
  return {
    plan,
    receipt: createReceipt(definitions, options.operationId, fingerprint),
  };
}

function campaignStepDefinitions(
  client: MetaAdsClient,
  plan: MetaCampaignDeploymentPlan
): CampaignStepDefinition[] {
  return [
    {
      execute: () => client.createCampaign(plan.campaign),
      key: "campaign",
      reconcile: () => client.findCampaignByName({ name: plan.campaign.name }),
      stableIdentity: plan.campaign.name,
    },
    ...(plan.adSets ?? []).map((adSet, index) => ({
      execute: (receipt: MetaCampaignDeploymentReceipt) =>
        client.createAdSet({
          ...adSet,
          campaignId: resolveCampaignId(adSet.campaignId, receipt),
        }),
      key: adSetKey(index),
      reconcile: (receipt: MetaCampaignDeploymentReceipt) =>
        client.findAdSetByName({
          campaignId: resolveCampaignId(adSet.campaignId, receipt),
          name: adSet.name,
        }),
      stableIdentity: adSet.name,
    })),
    ...(plan.ads ?? []).map((ad, index) => ({
      execute: (receipt: MetaCampaignDeploymentReceipt) =>
        client.createAd({
          ...ad,
          adsetId: resolveAdSetId(ad.adsetId, receipt),
        }),
      key: adKey(index),
      reconcile: (receipt: MetaCampaignDeploymentReceipt) =>
        client.findAdByName({
          adSetId: resolveAdSetId(ad.adsetId, receipt),
          name: ad.name,
        }),
      stableIdentity: ad.name,
    })),
  ];
}

function campaignStepMetadata(
  plan: MetaCampaignDeploymentPlan
): Pick<CampaignStepDefinition, "key" | "stableIdentity">[] {
  return [
    { key: "campaign", stableIdentity: plan.campaign.name },
    ...(plan.adSets ?? []).map((adSet, index) => ({
      key: adSetKey(index),
      stableIdentity: adSet.name,
    })),
    ...(plan.ads ?? []).map((ad, index) => ({
      key: adKey(index),
      stableIdentity: ad.name,
    })),
  ];
}

function bindCampaignPlan(
  plan: MetaCampaignDeploymentPlan,
  operationId: string
): MetaCampaignDeploymentPlan {
  return {
    ads: plan.ads?.map((ad, index) => ({
      ...ad,
      name: `${ad.name} [patronage:${operationId}:ad:${index + 1}]`,
    })),
    adSets: plan.adSets?.map((adSet, index) => ({
      ...adSet,
      name: `${adSet.name} [patronage:${operationId}:ad-set:${index + 1}]`,
    })),
    campaign: {
      ...plan.campaign,
      name: `${plan.campaign.name} [patronage:${operationId}]`,
    },
  };
}

async function verifySucceededSteps(
  definitions: CampaignStepDefinition[],
  receipt: MetaCampaignDeploymentReceipt
): Promise<MetaCampaignDeploymentReceipt> {
  for (const definition of definitions) {
    const step = requireStep(receipt, definition.key);
    if (step.status !== "succeeded") {
      break;
    }
    let found: { id: string } | undefined;
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- predecessor evidence must be verified before resumed writes.
      found = await definition.reconcile(receipt);
    } catch {
      found = undefined;
    }
    if (!found || found.id !== step.providerResourceId) {
      return setOutcome(receipt, definition.key, "manual-review");
    }
  }
  return receipt;
}

function createReceipt(
  definitions: Pick<CampaignStepDefinition, "key" | "stableIdentity">[],
  operationId: string,
  planFingerprint: string
): MetaCampaignDeploymentReceipt {
  return {
    operationId,
    operationKind: "campaign.deploy",
    planFingerprint,
    provider: "meta",
    status: "pending",
    steps: definitions.map((definition) => ({
      attempted: false,
      key: definition.key,
      stableIdentity: definition.stableIdentity,
      status: "pending",
    })),
  };
}

function assertReceipt(
  receipt: MetaCampaignDeploymentReceipt,
  definitions: CampaignStepDefinition[],
  operationId: string
): void {
  if (
    receipt.operationId !== operationId ||
    receipt.operationKind !== "campaign.deploy" ||
    receipt.provider !== "meta" ||
    receipt.steps.length !== definitions.length
  ) {
    throw new Error("Meta campaign deployment receipt identity is invalid.");
  }
  let incomplete = false;
  for (const [index, step] of receipt.steps.entries()) {
    const definition = definitions[index];
    if (
      !definition ||
      step.key !== definition.key ||
      step.stableIdentity !== definition.stableIdentity ||
      (step.status === "pending") !== !step.attempted ||
      (step.status === "succeeded" && !step.providerResourceId)
    ) {
      throw new Error(`Meta campaign deployment step ${step.key} is invalid.`);
    }
    if (step.status !== "succeeded") {
      incomplete = true;
    } else if (incomplete) {
      throw new Error("Meta campaign deployment receipt success is unordered.");
    }
  }
  const expected =
    receipt.steps.find(({ status }) => status !== "succeeded")?.status ??
    "succeeded";
  if (receipt.status !== expected) {
    throw new Error("Meta campaign deployment receipt status is incoherent.");
  }
}

function campaignResult(
  plan: MetaCampaignDeploymentPlan,
  receipt: MetaCampaignDeploymentReceipt
): MetaCampaignDeploymentResult {
  if (receipt.status !== "succeeded") {
    return { plan, receipt };
  }
  return {
    plan,
    receipt,
    result: {
      adIds: (plan.ads ?? []).map((_, index) =>
        requireResource(receipt, adKey(index))
      ),
      adSetIds: (plan.adSets ?? []).map((_, index) =>
        requireResource(receipt, adSetKey(index))
      ),
      campaignId: requireResource(receipt, "campaign"),
    },
  };
}

function setOutcome(
  receipt: MetaCampaignDeploymentReceipt,
  key: string,
  status: "ambiguous" | "failed" | "manual-review",
  providerRequestId?: string
): MetaCampaignDeploymentReceipt {
  const step = requireStep(receipt, key);
  return {
    ...updateStep(receipt, key, {
      ...step,
      attempted: true,
      ...(providerRequestId ? { providerRequestId } : {}),
      status,
    }),
    status,
  };
}

function updateStep(
  receipt: MetaCampaignDeploymentReceipt,
  key: string,
  step: MetaCampaignDeploymentStep
): MetaCampaignDeploymentReceipt {
  return {
    ...receipt,
    steps: receipt.steps.map((candidate) =>
      candidate.key === key ? step : candidate
    ),
  };
}

function requireStep(
  receipt: MetaCampaignDeploymentReceipt,
  key: string
): MetaCampaignDeploymentStep {
  const step = receipt.steps.find((candidate) => candidate.key === key);
  if (!step) {
    throw new Error(`Meta campaign deployment receipt is missing ${key}.`);
  }
  return step;
}

function requireResource(
  receipt: MetaCampaignDeploymentReceipt,
  key: string
): string {
  const id = requireStep(receipt, key).providerResourceId;
  if (!id) {
    throw new Error(`Meta campaign deployment receipt has no ${key} ID.`);
  }
  return id;
}

function resolveAdSetId(
  source: string,
  receipt: MetaCampaignDeploymentReceipt
): string {
  if (source === "$adSetId") {
    return requireResource(receipt, adSetKey(0));
  }
  const match = /^\$adSetId(?<index>\d+)$/u.exec(source);
  return match?.groups?.index
    ? requireResource(receipt, adSetKey(Number(match.groups.index) - 1))
    : source;
}

function resolveCampaignId(
  source: string,
  receipt: MetaCampaignDeploymentReceipt
): string {
  return source === "$campaignId"
    ? requireResource(receipt, "campaign")
    : source;
}

function assertCampaignPlan(plan: MetaCampaignDeploymentPlan): void {
  const adSetCount = plan.adSets?.length ?? 0;
  for (const adSet of plan.adSets ?? []) {
    if (
      adSet.campaignId.startsWith("$") &&
      adSet.campaignId !== "$campaignId"
    ) {
      throw new Error(
        `Meta campaign plan has invalid campaign placeholder ${adSet.campaignId}.`
      );
    }
  }
  for (const ad of plan.ads ?? []) {
    if (ad.adsetId === "$adSetId" && adSetCount === 0) {
      throw new Error("Meta campaign plan references a missing first ad set.");
    }
    const match = /^\$adSetId(?<index>\d+)$/u.exec(ad.adsetId);
    const referencedIndex = match?.groups?.index;
    if (ad.adsetId.startsWith("$") && ad.adsetId !== "$adSetId" && !match) {
      throw new Error(
        `Meta campaign plan has invalid ad set placeholder ${ad.adsetId}.`
      );
    }
    if (
      referencedIndex &&
      (Number(referencedIndex) < 1 || Number(referencedIndex) > adSetCount)
    ) {
      throw new Error(
        `Meta campaign plan references missing ad set ${referencedIndex}.`
      );
    }
  }
}

function adSetKey(index: number): string {
  return `ad-set:${index + 1}`;
}

function adKey(index: number): string {
  return `ad:${index + 1}`;
}

function requestId(error: unknown): string | undefined {
  if (error instanceof MetaAdsAmbiguousWriteError) {
    return error.providerRequestId;
  }
  return error instanceof MetaAdsApiError ? error.fbtraceId : undefined;
}

function assertOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(operationId)) {
    throw new Error("Meta campaign deployment operation ID is invalid.");
  }
}

function jsonSafe(value: unknown): unknown {
  // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- provider plan fingerprint omits undefined values.
  return JSON.parse(JSON.stringify(value)) as unknown;
}
