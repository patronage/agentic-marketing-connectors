import {
  assertResumePlanFingerprint,
  fingerprintMutationPlan,
} from "@patronage/connector-lifecycle";
import type { GuardedMutationReceipt } from "@patronage/connector-lifecycle";

import type {
  LinkedInBriefDeploymentPlan,
  LinkedInBriefConcept,
} from "./internal/brief-deployment.js";
import { LinkedInAdsApiError } from "./internal/linkedin-ads-api-error.js";
import type { LinkedInAdsClient } from "./internal/linkedin-ads-client.js";
import type {
  BoostLinkedInPostPlan,
  CreateLinkedInCreativeInput,
  LinkedInCampaign,
  LinkedInCreative,
  LinkedInLeadForm,
} from "./internal/types.js";

export type LinkedInDeploymentStatus =
  | "ambiguous"
  | "failed"
  | "manual-review"
  | "pending"
  | "succeeded";

export interface LinkedInDeploymentStep {
  attempted: boolean;
  key: string;
  providerResourceId?: string;
  stableIdentity: string;
  status: LinkedInDeploymentStatus;
}

export interface LinkedInDeploymentReceipt extends GuardedMutationReceipt<
  LinkedInDeploymentStep,
  LinkedInDeploymentStatus,
  "boost.deploy" | "brief.deploy"
> {
  provider: "linkedin";
}

export interface LinkedInDeploymentOptions {
  operationId: string;
  resumeReceipt?: LinkedInDeploymentReceipt;
}

export interface LinkedInBriefDeploymentResult {
  campaign?: LinkedInCampaign;
  creatives?: LinkedInCreative[];
  leadForm?: LinkedInLeadForm;
  plan: LinkedInBriefDeploymentPlan;
  receipt: LinkedInDeploymentReceipt;
}

export interface LinkedInBoostDeploymentResult {
  campaign?: LinkedInCampaign;
  creative?: LinkedInCreative;
  plan: BoostLinkedInPostPlan;
  receipt: LinkedInDeploymentReceipt;
}

interface DeploymentDefinition {
  kind: LinkedInDeploymentReceipt["operationKind"];
  plan: unknown;
  steps: {
    execute: (receipt: LinkedInDeploymentReceipt) => Promise<string>;
    key: string;
    reconcile: (
      receipt: LinkedInDeploymentReceipt
    ) => Promise<string | undefined>;
    stableIdentity: string;
  }[];
}

class LocalDeploymentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalDeploymentError";
  }
}

export async function deployLinkedInBriefResumable(input: {
  client: LinkedInAdsClient;
  options: LinkedInDeploymentOptions;
  plan: LinkedInBriefDeploymentPlan;
  resolveImage: (path: string) => Promise<{
    bytes: ArrayBuffer | ArrayBufferView;
    contentType: "image/gif" | "image/jpeg" | "image/png";
  }>;
}): Promise<LinkedInBriefDeploymentResult> {
  assertOperationId(input.options.operationId);
  assertUniqueConceptIds(input.plan.concepts);
  const plan = bindBriefPlan(input.plan, input.options.operationId);
  const definition = briefDefinition(input.client, plan, input.resolveImage);
  const receipt = await runDeployment(definition, input.options);
  if (receipt.status !== "succeeded") {
    return { plan, receipt };
  }
  return {
    campaign: {
      id: requireResource(receipt, "campaign"),
      name: plan.campaign.name,
    },
    creatives: plan.concepts.map((concept) => ({
      id: requireResource(receipt, creativeKey(concept)),
    })),
    leadForm: {
      id: requireResource(receipt, "lead-form"),
      name: plan.leadForm.name,
    },
    plan,
    receipt,
  };
}

export async function deployLinkedInBoostResumable(input: {
  client: LinkedInAdsClient;
  options: LinkedInDeploymentOptions;
  plan: BoostLinkedInPostPlan;
}): Promise<LinkedInBoostDeploymentResult> {
  assertOperationId(input.options.operationId);
  const plan = bindBoostPlan(input.plan, input.options.operationId);
  const definition = boostDefinition(input.client, plan);
  const receipt = await runDeployment(definition, input.options);
  if (receipt.status !== "succeeded") {
    return { plan, receipt };
  }
  return {
    campaign: {
      id: requireResource(receipt, "campaign"),
      name: plan.campaign.name,
    },
    creative: { id: requireResource(receipt, "creative") },
    plan,
    receipt,
  };
}

async function runDeployment(
  definition: DeploymentDefinition,
  options: LinkedInDeploymentOptions
): Promise<LinkedInDeploymentReceipt> {
  const planFingerprint = await fingerprintMutationPlan(
    jsonSafe(definition.plan)
  );
  let receipt =
    options.resumeReceipt ??
    createReceipt(definition, options.operationId, planFingerprint);
  assertResumePlanFingerprint(receipt, planFingerprint);
  assertReceipt(receipt, definition, options.operationId);
  if (["manual-review", "succeeded"].includes(receipt.status)) {
    return receipt;
  }
  if (options.resumeReceipt) {
    receipt = await verifySucceededSteps(definition, receipt);
    if (receipt.status === "manual-review") {
      return receipt;
    }
  }
  for (const stepDefinition of definition.steps) {
    const step = requireStep(receipt, stepDefinition.key);
    if (step.status === "succeeded") {
      continue;
    }
    if (step.status === "ambiguous") {
      let found: string | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- reconciliation follows provider dependency order.
        found = await stepDefinition.reconcile(receipt);
      } catch {
        found = undefined;
      }
      if (!found) {
        return setOutcome(receipt, step.key, "manual-review");
      }
      receipt = updateStep(receipt, step.key, {
        ...step,
        providerResourceId: found,
        status: "succeeded",
      });
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- provider resources form a strict dependency chain.
      const providerResourceId = await stepDefinition.execute(receipt);
      if (!providerResourceId.trim()) {
        throw new Error(
          `LinkedIn ${stepDefinition.key} write returned no resource ID.`
        );
      }
      receipt = updateStep(receipt, step.key, {
        ...step,
        attempted: true,
        providerResourceId,
        status: "succeeded",
      });
    } catch (error) {
      return setOutcome(receipt, step.key, classifyWriteError(error));
    }
  }
  return { ...receipt, status: "succeeded" };
}

async function verifySucceededSteps(
  definition: DeploymentDefinition,
  receipt: LinkedInDeploymentReceipt
): Promise<LinkedInDeploymentReceipt> {
  for (const stepDefinition of definition.steps) {
    const step = requireStep(receipt, stepDefinition.key);
    if (step.status !== "succeeded") {
      break;
    }
    let found: string | undefined;
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- stored dependencies must be verified before resumed writes.
      found = await stepDefinition.reconcile(receipt);
    } catch {
      found = undefined;
    }
    if (!found || found !== step.providerResourceId) {
      return setOutcome(receipt, step.key, "manual-review");
    }
  }
  return receipt;
}

function briefDefinition(
  client: LinkedInAdsClient,
  plan: LinkedInBriefDeploymentPlan,
  resolveImage: (path: string) => Promise<{
    bytes: ArrayBuffer | ArrayBufferView;
    contentType: "image/gif" | "image/jpeg" | "image/png";
  }>
): DeploymentDefinition {
  return {
    kind: "brief.deploy",
    plan,
    steps: [
      {
        execute: async () => {
          const created = await client.createLeadForm(plan.leadForm);
          return created.id;
        },
        key: "lead-form",
        reconcile: async () =>
          uniqueId(await allLeadForms(client), plan.leadForm.name),
        stableIdentity: plan.leadForm.name,
      },
      campaignStep(client, plan.campaign),
      ...plan.concepts.flatMap((concept) => [
        imageStep(client, concept, resolveImage),
        creativeStep(client, concept),
      ]),
    ],
  };
}

function boostDefinition(
  client: LinkedInAdsClient,
  plan: BoostLinkedInPostPlan
): DeploymentDefinition {
  return {
    kind: "boost.deploy",
    plan,
    steps: [
      campaignStep(client, plan.campaign),
      {
        execute: async (receipt) => {
          const created = await client.createCreative({
            ...plan.creative,
            campaign: requireResource(receipt, "campaign"),
          });
          return created.id;
        },
        key: "creative",
        reconcile: async (receipt) =>
          uniqueCreativeId(
            await allCreatives(client, requireResource(receipt, "campaign")),
            plan.creative
          ),
        stableIdentity: creativeIdentity(plan.creative),
      },
    ],
  };
}

function campaignStep(
  client: LinkedInAdsClient,
  campaign: LinkedInBriefDeploymentPlan["campaign"]
): DeploymentDefinition["steps"][number] {
  return {
    execute: async () => {
      const created = await client.createCampaign(campaign);
      return created.id;
    },
    key: "campaign",
    reconcile: async () => uniqueId(await allCampaigns(client), campaign.name),
    stableIdentity: campaign.name,
  };
}

function imageStep(
  client: LinkedInAdsClient,
  concept: LinkedInBriefConcept,
  resolveImage: (path: string) => Promise<{
    bytes: ArrayBuffer | ArrayBufferView;
    contentType: "image/gif" | "image/jpeg" | "image/png";
  }>
): DeploymentDefinition["steps"][number] {
  const key = imageKey(concept);
  return {
    execute: async () => {
      let image: Awaited<ReturnType<typeof resolveImage>>;
      try {
        image = await resolveImage(concept.image);
      } catch (error) {
        throw new LocalDeploymentError("LinkedIn image resolution failed.", {
          cause: error,
        });
      }
      return client.uploadImage(image);
    },
    key,
    reconcile: async (receipt) => {
      const urn = requireResource(receipt, key);
      await client.getImage(urn);
      return urn;
    },
    stableIdentity: `${concept.id}:${concept.image}`,
  };
}

function creativeStep(
  client: LinkedInAdsClient,
  concept: LinkedInBriefConcept
): DeploymentDefinition["steps"][number] {
  const key = creativeKey(concept);
  return {
    execute: async (receipt) => {
      const created = await client.createCreative({
        campaign: requireResource(receipt, "campaign"),
        content: {
          callToAction: concept.cta,
          description: concept.body,
          headline: concept.headline,
          leadGenerationForm: requireResource(receipt, "lead-form"),
          media: requireResource(receipt, imageKey(concept)),
        },
        intendedStatus: "ACTIVE",
      });
      return created.id;
    },
    key,
    reconcile: async (receipt) =>
      uniqueCreativeId(
        await allCreatives(client, requireResource(receipt, "campaign")),
        { campaign: "", content: { headline: concept.headline } }
      ),
    stableIdentity: concept.headline,
  };
}

function bindBriefPlan(
  plan: LinkedInBriefDeploymentPlan,
  operationId: string
): LinkedInBriefDeploymentPlan {
  const marker = ` [patronage:${operationId}]`;
  return {
    campaign: { ...plan.campaign, name: `${plan.campaign.name}${marker}` },
    concepts: plan.concepts.map((concept) => ({
      ...concept,
      headline: `${concept.headline} [patronage:${operationId}:concept:${concept.id}]`,
    })),
    leadForm: { ...plan.leadForm, name: `${plan.leadForm.name}${marker}` },
  };
}

function bindBoostPlan(
  plan: BoostLinkedInPostPlan,
  operationId: string
): BoostLinkedInPostPlan {
  return {
    campaign: {
      ...plan.campaign,
      name: `${plan.campaign.name} [patronage:${operationId}]`,
    },
    creative: { ...plan.creative },
  };
}

async function allCampaigns(
  client: LinkedInAdsClient
): Promise<LinkedInCampaign[]> {
  const found: LinkedInCampaign[] = [];
  let start = 0;
  let hasMore = true;
  while (hasMore) {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- duplicate-safe reconciliation consumes every page.
    const page = await client.listCampaigns({
      count: 100,
      start,
      statuses: [
        "ACTIVE",
        "ARCHIVED",
        "CANCELED",
        "COMPLETED",
        "DRAFT",
        "PAUSED",
      ],
    });
    found.push(...page.campaigns);
    start += page.campaigns.length;
    hasMore = start < page.total && page.campaigns.length > 0;
  }
  return found;
}

async function allLeadForms(
  client: LinkedInAdsClient
): Promise<LinkedInLeadForm[]> {
  const found: LinkedInLeadForm[] = [];
  let start = 0;
  let hasMore = true;
  while (hasMore) {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- duplicate-safe reconciliation consumes every page.
    const page = await client.listLeadForms({ count: 100, start });
    found.push(...page.forms);
    start += page.forms.length;
    hasMore = start < page.total && page.forms.length > 0;
  }
  return found;
}

async function allCreatives(
  client: LinkedInAdsClient,
  campaignId: string
): Promise<LinkedInCreative[]> {
  const found: LinkedInCreative[] = [];
  let start = 0;
  let hasMore = true;
  while (hasMore) {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- duplicate-safe reconciliation consumes every page.
    const page = await client.listCreatives({ campaignId, count: 100, start });
    found.push(...page.creatives);
    start += page.creatives.length;
    hasMore = start < page.total && page.creatives.length > 0;
  }
  return found;
}

function uniqueId(
  resources: { id: string; name: string }[],
  name: string
): string | undefined {
  const ids = resources.flatMap((item) =>
    item.name === name ? [item.id] : []
  );
  return ids.length === 1 ? ids[0] : undefined;
}

function uniqueCreativeId(
  resources: LinkedInCreative[],
  input: CreateLinkedInCreativeInput
): string | undefined {
  const identity = creativeIdentity(input);
  const ids = resources.flatMap((creative) =>
    creativeIdentity({ campaign: "", content: creative.content }) === identity
      ? [creative.id]
      : []
  );
  return ids.length === 1 ? ids[0] : undefined;
}

function creativeIdentity(input: CreateLinkedInCreativeInput): string {
  const content = input.content ?? {};
  return JSON.stringify({
    headline: content.headline,
    reference: content.reference ?? input.reference,
  });
}

function createReceipt(
  definition: DeploymentDefinition,
  operationId: string,
  planFingerprint: string
): LinkedInDeploymentReceipt {
  return {
    operationId,
    operationKind: definition.kind,
    planFingerprint,
    provider: "linkedin",
    status: "pending",
    steps: definition.steps.map((step) => ({
      attempted: false,
      key: step.key,
      stableIdentity: step.stableIdentity,
      status: "pending",
    })),
  };
}

function assertReceipt(
  receipt: LinkedInDeploymentReceipt,
  definition: DeploymentDefinition,
  operationId: string
): void {
  if (
    receipt.operationId !== operationId ||
    receipt.operationKind !== definition.kind ||
    receipt.provider !== "linkedin" ||
    receipt.steps.length !== definition.steps.length ||
    new Set(definition.steps.map(({ key }) => key)).size !==
      definition.steps.length
  ) {
    throw new Error("LinkedIn deployment receipt identity is invalid.");
  }
  let incomplete = false;
  for (const [index, step] of receipt.steps.entries()) {
    const expected = definition.steps[index];
    if (
      !expected ||
      step.key !== expected.key ||
      step.stableIdentity !== expected.stableIdentity ||
      (step.status === "pending") !== !step.attempted ||
      (step.status === "succeeded" && !step.providerResourceId)
    ) {
      throw new Error(
        `LinkedIn deployment receipt step ${step.key} is invalid.`
      );
    }
    if (step.status !== "succeeded") {
      incomplete = true;
    } else if (incomplete) {
      throw new Error("LinkedIn deployment receipt has out-of-order success.");
    }
  }
  const expectedStatus =
    receipt.steps.find(({ status }) => status !== "succeeded")?.status ??
    "succeeded";
  if (receipt.status !== expectedStatus) {
    throw new Error("LinkedIn deployment receipt status is incoherent.");
  }
}

function setOutcome(
  receipt: LinkedInDeploymentReceipt,
  key: string,
  status: "ambiguous" | "failed" | "manual-review"
): LinkedInDeploymentReceipt {
  const step = requireStep(receipt, key);
  return {
    ...updateStep(receipt, key, { ...step, attempted: true, status }),
    status,
  };
}

function updateStep(
  receipt: LinkedInDeploymentReceipt,
  key: string,
  step: LinkedInDeploymentStep
): LinkedInDeploymentReceipt {
  return {
    ...receipt,
    steps: receipt.steps.map((candidate) =>
      candidate.key === key ? step : candidate
    ),
  };
}

function requireStep(
  receipt: LinkedInDeploymentReceipt,
  key: string
): LinkedInDeploymentStep {
  const step = receipt.steps.find((candidate) => candidate.key === key);
  if (!step) {
    throw new Error(`LinkedIn deployment receipt is missing ${key}.`);
  }
  return step;
}

function requireResource(
  receipt: LinkedInDeploymentReceipt,
  key: string
): string {
  const resource = requireStep(receipt, key).providerResourceId;
  if (!resource) {
    throw new Error(`LinkedIn deployment receipt has no resource for ${key}.`);
  }
  return resource;
}

function imageKey(concept: LinkedInBriefConcept): string {
  return `concept:${concept.id}:image`;
}

function creativeKey(concept: LinkedInBriefConcept): string {
  return `concept:${concept.id}:creative`;
}

function classifyWriteError(error: unknown): "ambiguous" | "failed" {
  if (error instanceof LocalDeploymentError) {
    return "failed";
  }
  return error instanceof LinkedInAdsApiError && error.status < 500
    ? "failed"
    : "ambiguous";
}

function assertUniqueConceptIds(concepts: LinkedInBriefConcept[]): void {
  const ids = concepts.map(({ id }) => id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error("LinkedIn brief concept IDs must be nonempty and unique.");
  }
}

function assertOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(operationId)) {
    throw new Error("LinkedIn deployment operation ID is invalid.");
  }
}

function jsonSafe(value: unknown): unknown {
  // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- provider plan fingerprint omits undefined fields.
  return JSON.parse(JSON.stringify(value)) as unknown;
}
