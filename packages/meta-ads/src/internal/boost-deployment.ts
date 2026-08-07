import {
  assertResumePlanFingerprint,
  fingerprintMutationPlan,
} from "@patronage/connector-lifecycle";
import type { MutationStepStatus } from "@patronage/connector-lifecycle";

import { MetaAdsAmbiguousWriteError } from "./meta-ads-ambiguous-write-error.js";
import { MetaAdsApiError } from "./meta-ads-api-error.js";
import type { MetaAdsClient } from "./meta-ads-client.js";
import type { BoostPostPlan, BoostPostResult } from "./types.js";

export type MetaBoostDeploymentStepKey =
  | "ad"
  | "ad-creative"
  | "ad-set"
  | "campaign";

export interface MetaBoostDeploymentStep {
  attempted: boolean;
  key: MetaBoostDeploymentStepKey;
  providerRequestId?: string;
  providerResourceId?: string;
  stableIdentity: string;
  status: MutationStepStatus | "manual-review";
}

export interface MetaBoostDeploymentReceipt {
  operationId: string;
  operationKind: "boost.deploy";
  planFingerprint: string;
  provider: "meta";
  status: "ambiguous" | "failed" | "manual-review" | "pending" | "succeeded";
  steps: MetaBoostDeploymentStep[];
}

export interface DeployMetaBoostPlanOptions {
  operationId: string;
  resumeReceipt?: MetaBoostDeploymentReceipt;
}

export interface MetaBoostDeploymentResult {
  plan: BoostPostPlan;
  receipt: MetaBoostDeploymentReceipt;
  result?: BoostPostResult;
}

const STEP_KEYS: MetaBoostDeploymentStepKey[] = [
  "campaign",
  "ad-set",
  "ad-creative",
  "ad",
];

export async function deployMetaBoostPlan(
  client: MetaAdsClient,
  plan: BoostPostPlan,
  options: DeployMetaBoostPlanOptions
): Promise<MetaBoostDeploymentResult> {
  assertOperationId(options.operationId);
  const deploymentPlan = bindMetaBoostPlan(plan, options.operationId);
  const planFingerprint = await fingerprintMutationPlan(
    jsonSafeMetaBoostPlan(deploymentPlan)
  );
  let receipt =
    options.resumeReceipt ??
    createMetaBoostReceipt(
      deploymentPlan,
      options.operationId,
      planFingerprint
    );
  assertMetaBoostReceipt(receipt, options.operationId, deploymentPlan);
  assertResumePlanFingerprint(receipt, planFingerprint);

  if (["manual-review", "succeeded"].includes(receipt.status)) {
    return resultFromReceipt(deploymentPlan, receipt);
  }
  if (options.resumeReceipt) {
    receipt = await verifySucceededMetaBoostSteps(
      client,
      deploymentPlan,
      receipt
    );
    if (receipt.status === "manual-review") {
      return resultFromReceipt(deploymentPlan, receipt);
    }
  }

  for (const key of STEP_KEYS) {
    const step = requireStep(receipt, key);
    if (step.status === "succeeded") {
      continue;
    }
    if (step.status === "ambiguous") {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- reconciliation follows the first unresolved provider step in order.
      let found: { id: string } | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- reconciliation follows the first unresolved provider step in order.
        found = await reconcileMetaBoostStep(
          client,
          deploymentPlan,
          receipt,
          key
        );
      } catch {
        found = undefined;
      }
      if (!found) {
        receipt = updateMetaBoostStep(receipt, key, {
          ...step,
          status: "manual-review",
        });
        return resultFromReceipt(deploymentPlan, {
          ...receipt,
          status: "manual-review",
        });
      }
      receipt = updateMetaBoostStep(receipt, key, {
        ...step,
        attempted: true,
        providerResourceId: found.id,
        status: "succeeded",
      });
      continue;
    }

    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- each provider resource depends on the preceding resource ID.
      const created = await executeMetaBoostStep(
        client,
        deploymentPlan,
        receipt,
        key
      );
      receipt = updateMetaBoostStep(receipt, key, {
        ...step,
        attempted: true,
        ...(created.providerRequestId
          ? { providerRequestId: created.providerRequestId }
          : {}),
        providerResourceId: created.id,
        status: "succeeded",
      });
    } catch (error) {
      if (error instanceof MetaAdsAmbiguousWriteError) {
        receipt = updateMetaBoostStep(receipt, key, {
          ...step,
          attempted: true,
          ...(error.providerRequestId
            ? { providerRequestId: error.providerRequestId }
            : {}),
          status: "ambiguous",
        });
        return resultFromReceipt(deploymentPlan, {
          ...receipt,
          status: "ambiguous",
        });
      }
      receipt = updateMetaBoostStep(receipt, key, {
        ...step,
        attempted: true,
        ...(error instanceof MetaAdsApiError && error.fbtraceId
          ? { providerRequestId: error.fbtraceId }
          : {}),
        status: "failed",
      });
      return resultFromReceipt(deploymentPlan, {
        ...receipt,
        status: "failed",
      });
    }
  }

  return resultFromReceipt(deploymentPlan, { ...receipt, status: "succeeded" });
}

function assertOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(operationId)) {
    throw new Error("Meta boost operation ID must be 1-64 safe characters.");
  }
}

function bindMetaBoostPlan(
  plan: BoostPostPlan,
  operationId: string
): BoostPostPlan {
  const marker = ` [patronage:${operationId}]`;
  return {
    ad: { ...plan.ad, name: `${plan.ad.name}${marker}` },
    adCreative: {
      ...plan.adCreative,
      name: `${plan.adCreative.name}${marker}`,
    },
    adSet: { ...plan.adSet, name: `${plan.adSet.name}${marker}` },
    campaign: { ...plan.campaign, name: `${plan.campaign.name}${marker}` },
  };
}

function jsonSafeMetaBoostPlan(plan: BoostPostPlan): unknown {
  // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- provider request semantics omit undefined optional fields before fingerprinting.
  return JSON.parse(JSON.stringify(plan)) as unknown;
}

function createMetaBoostReceipt(
  plan: BoostPostPlan,
  operationId: string,
  planFingerprint: string
): MetaBoostDeploymentReceipt {
  const identities: Record<MetaBoostDeploymentStepKey, string> = {
    ad: plan.ad.name,
    "ad-creative": plan.adCreative.name,
    "ad-set": plan.adSet.name,
    campaign: plan.campaign.name,
  };
  return {
    operationId,
    operationKind: "boost.deploy",
    planFingerprint,
    provider: "meta",
    status: "pending",
    steps: STEP_KEYS.map((key) => ({
      attempted: false,
      key,
      stableIdentity: identities[key],
      status: "pending",
    })),
  };
}

function executeMetaBoostStep(
  client: MetaAdsClient,
  plan: BoostPostPlan,
  receipt: MetaBoostDeploymentReceipt,
  key: MetaBoostDeploymentStepKey
): Promise<{ id: string; providerRequestId?: string }> {
  if (key === "campaign") {
    return client.createCampaign(plan.campaign);
  }
  if (key === "ad-set") {
    return client.createAdSet({
      ...plan.adSet,
      campaignId: requireResourceId(receipt, "campaign"),
    });
  }
  if (key === "ad-creative") {
    return client.createAdCreative(plan.adCreative);
  }
  return client.createAd({
    ...plan.ad,
    adsetId: requireResourceId(receipt, "ad-set"),
    creativeId: requireResourceId(receipt, "ad-creative"),
  });
}

function reconcileMetaBoostStep(
  client: MetaAdsClient,
  plan: BoostPostPlan,
  receipt: MetaBoostDeploymentReceipt,
  key: MetaBoostDeploymentStepKey
): Promise<{ id: string } | undefined> {
  if (key === "campaign") {
    return client.findCampaignByName({ name: plan.campaign.name });
  }
  if (key === "ad-set") {
    return client.findAdSetByName({
      campaignId: requireResourceId(receipt, "campaign"),
      name: plan.adSet.name,
    });
  }
  if (key === "ad-creative") {
    return client.findAdCreativeByName({ name: plan.adCreative.name });
  }
  return client.findAdByName({
    adSetId: requireResourceId(receipt, "ad-set"),
    name: plan.ad.name,
  });
}

async function verifySucceededMetaBoostSteps(
  client: MetaAdsClient,
  plan: BoostPostPlan,
  receipt: MetaBoostDeploymentReceipt
): Promise<MetaBoostDeploymentReceipt> {
  let verifiedReceipt = receipt;
  for (const key of STEP_KEYS) {
    const step = requireStep(verifiedReceipt, key);
    if (step.status !== "succeeded") {
      break;
    }
    let found: { id: string } | undefined;
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- predecessor identities must be verified in dependency order before another write.
      found = await reconcileMetaBoostStep(client, plan, verifiedReceipt, key);
    } catch {
      found = undefined;
    }
    if (!found || found.id !== step.providerResourceId) {
      verifiedReceipt = updateMetaBoostStep(verifiedReceipt, key, {
        ...step,
        status: "manual-review",
      });
      return { ...verifiedReceipt, status: "manual-review" };
    }
  }
  return verifiedReceipt;
}

function resultFromReceipt(
  plan: BoostPostPlan,
  receipt: MetaBoostDeploymentReceipt
): MetaBoostDeploymentResult {
  if (receipt.status !== "succeeded") {
    return { plan, receipt };
  }
  return {
    plan,
    receipt,
    result: {
      adId: requireResourceId(receipt, "ad"),
      adSetId: requireResourceId(receipt, "ad-set"),
      campaignId: requireResourceId(receipt, "campaign"),
      creativeId: requireResourceId(receipt, "ad-creative"),
      plan,
    },
  };
}

function requireStep(
  receipt: MetaBoostDeploymentReceipt,
  key: MetaBoostDeploymentStepKey
): MetaBoostDeploymentStep {
  const step = receipt.steps.find((candidate) => candidate.key === key);
  if (!step) {
    throw new Error(`Meta boost receipt is missing ${key}.`);
  }
  return step;
}

function requireResourceId(
  receipt: MetaBoostDeploymentReceipt,
  key: MetaBoostDeploymentStepKey
): string {
  const id = requireStep(receipt, key).providerResourceId;
  if (!id) {
    throw new Error(`Meta boost receipt has no resource ID for ${key}.`);
  }
  return id;
}

function updateMetaBoostStep(
  receipt: MetaBoostDeploymentReceipt,
  key: MetaBoostDeploymentStepKey,
  update: MetaBoostDeploymentStep
): MetaBoostDeploymentReceipt {
  return {
    ...receipt,
    steps: receipt.steps.map((step) => (step.key === key ? update : step)),
  };
}

function assertMetaBoostReceipt(
  receipt: MetaBoostDeploymentReceipt,
  operationId: string,
  plan: BoostPostPlan
): void {
  const identities: Record<MetaBoostDeploymentStepKey, string> = {
    ad: plan.ad.name,
    "ad-creative": plan.adCreative.name,
    "ad-set": plan.adSet.name,
    campaign: plan.campaign.name,
  };
  if (
    receipt.operationId !== operationId ||
    receipt.operationKind !== "boost.deploy" ||
    receipt.provider !== "meta" ||
    receipt.steps.map(({ key }) => key).join(",") !== STEP_KEYS.join(",")
  ) {
    throw new Error("Meta boost receipt identity or step order is invalid.");
  }
  let encounteredIncomplete = false;
  for (const step of receipt.steps) {
    assertMetaBoostStep(step, identities[step.key]);
    if (step.status !== "succeeded") {
      encounteredIncomplete = true;
    } else if (encounteredIncomplete) {
      throw new Error(
        "Meta boost receipt has succeeded steps after an incomplete step."
      );
    }
  }
  const firstIncomplete = receipt.steps.find(
    ({ status }) => status !== "succeeded"
  );
  const expectedStatus = firstIncomplete?.status ?? "succeeded";
  if (receipt.status !== expectedStatus) {
    throw new Error("Meta boost receipt status does not match its next step.");
  }
  if (
    receipt.status === "succeeded" &&
    !receipt.steps.every(({ status }) => status === "succeeded")
  ) {
    throw new Error("Meta boost succeeded receipt has incomplete steps.");
  }
  if (
    ["ambiguous", "failed", "manual-review"].includes(receipt.status) &&
    !receipt.steps.some(({ status }) => status === receipt.status)
  ) {
    throw new Error("Meta boost receipt status has no matching step outcome.");
  }
}

function assertMetaBoostStep(
  step: MetaBoostDeploymentStep,
  expectedIdentity: string
): void {
  if (
    step.stableIdentity !== expectedIdentity ||
    (step.status === "pending" && step.attempted) ||
    (step.status !== "pending" && !step.attempted)
  ) {
    throw new Error(`Meta boost receipt ${step.key} attempt state is invalid.`);
  }
  if (step.status === "succeeded" && !step.providerResourceId) {
    throw new Error(
      `Meta boost receipt ${step.key} success has no resource ID.`
    );
  }
}
