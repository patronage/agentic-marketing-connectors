import { MutationPlanMismatchError } from "./internal/mutation-plan-mismatch-error.js";
import { MutationReceiptConformanceError } from "./internal/mutation-receipt-conformance-error.js";

export { MutationPlanMismatchError } from "./internal/mutation-plan-mismatch-error.js";
export { MutationReceiptConformanceError } from "./internal/mutation-receipt-conformance-error.js";

export type MutationLifecycleStage =
  | "executed"
  | "planned"
  | "provider-validated";

export type MutationReceiptStatus =
  | "ambiguous"
  | "failed"
  | "planned"
  | "succeeded"
  | "validated";

export type MutationStepStatus =
  | "ambiguous"
  | "failed"
  | "pending"
  | "succeeded";

export interface MutationReceiptStep {
  attempted: boolean;
  failureDetail?: string;
  key:
    | "execution"
    | "local-plan"
    | "operation-label-cleanup"
    | "provider-validation";
  providerRequestId?: string;
  providerResourceIds?: string[];
  status: MutationStepStatus;
}

/** Shared provider-owned receipt envelope for simple and compound mutations. */
export interface GuardedMutationReceipt<
  TStep,
  TStatus extends string,
  TOperationKind extends string = string,
> {
  operationId: string;
  operationKind: TOperationKind;
  planFingerprint: string;
  provider: string;
  status: TStatus;
  steps: TStep[];
}

export interface ConnectorMutationReceipt extends GuardedMutationReceipt<
  MutationReceiptStep,
  MutationReceiptStatus
> {
  evidenceRequirements: { executionResourceIds: boolean };
  stage: MutationLifecycleStage;
}

export interface MutationLifecycleConformanceImplementation {
  run: (
    targetStage: MutationLifecycleStage,
    resumeReceipt?: ConnectorMutationReceipt
  ) => Promise<ConnectorMutationReceipt>;
}

export async function verifyMutationLifecycleImplementationConformance(
  implementation: MutationLifecycleConformanceImplementation
): Promise<ConnectorMutationReceipt> {
  const planned = await implementation.run("planned");
  assertMutationReceiptConformance(planned);
  if (planned.stage !== "planned") {
    throw new MutationReceiptConformanceError([
      "plan run must stop at planned",
    ]);
  }
  const validated = await implementation.run("provider-validated", planned);
  assertMutationReceiptConformance(validated);
  if (validated.stage !== "provider-validated") {
    throw new MutationReceiptConformanceError([
      "validation run must stop at provider-validated",
    ]);
  }
  assertSameOperation(planned, validated);
  const executed = await implementation.run("executed", validated);
  assertMutationReceiptConformance(executed);
  if (executed.stage !== "executed") {
    throw new MutationReceiptConformanceError([
      "execution run must stop at executed",
    ]);
  }
  assertSameOperation(planned, executed);
  // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- JSON persistence round-trip is part of provider conformance.
  const roundTripped = JSON.parse(
    JSON.stringify(executed)
  ) as ConnectorMutationReceipt;
  assertMutationReceiptConformance(roundTripped);
  return executed;
}

export function createPlannedMutationReceipt(input: {
  evidenceRequirements?: { executionResourceIds: boolean };
  operationId: string;
  operationKind: string;
  planFingerprint: string;
  provider: string;
}): ConnectorMutationReceipt {
  const receipt: ConnectorMutationReceipt = {
    ...input,
    evidenceRequirements: input.evidenceRequirements ?? {
      executionResourceIds: false,
    },
    stage: "planned",
    status: "planned",
    steps: [
      { attempted: true, key: "local-plan", status: "succeeded" },
      { attempted: false, key: "provider-validation", status: "pending" },
      { attempted: false, key: "execution", status: "pending" },
    ],
  };
  assertMutationReceiptConformance(receipt);
  return receipt;
}

export function recordProviderValidation(
  receipt: ConnectorMutationReceipt,
  evidence: { providerRequestId: string }
): ConnectorMutationReceipt {
  return recordProviderValidationOutcome(receipt, {
    ...evidence,
    status: "succeeded",
  });
}

export function recordProviderValidationOutcome(
  receipt: ConnectorMutationReceipt,
  evidence: {
    failureDetail?: string;
    providerRequestId?: string;
    status: "ambiguous" | "failed" | "succeeded";
  }
): ConnectorMutationReceipt {
  assertResumePlanFingerprint(receipt, receipt.planFingerprint);
  const next = updateStep(receipt, "provider-validation", {
    attempted: true,
    ...(evidence.failureDetail === undefined
      ? {}
      : { failureDetail: evidence.failureDetail }),
    providerRequestId: evidence.providerRequestId,
    status: evidence.status,
  });
  const validated: ConnectorMutationReceipt = {
    ...next,
    stage: "provider-validated",
    status: outcomeReceiptStatus(evidence.status, "validated"),
  };
  assertMutationReceiptConformance(validated);
  return validated;
}

export function recordMutationExecution(
  receipt: ConnectorMutationReceipt,
  evidence: {
    providerRequestId: string;
    providerResourceIds?: string[];
  }
): ConnectorMutationReceipt {
  return recordMutationExecutionOutcome(receipt, {
    ...evidence,
    status: "succeeded",
  });
}

export function recordMutationExecutionOutcome(
  receipt: ConnectorMutationReceipt,
  evidence: {
    failureDetail?: string;
    providerRequestId?: string;
    providerResourceIds?: string[];
    status: "ambiguous" | "failed" | "succeeded";
  }
): ConnectorMutationReceipt {
  const validation = receipt.steps.find(
    ({ key }) => key === "provider-validation"
  );
  if (
    receipt.stage !== "provider-validated" ||
    validation?.status !== "succeeded"
  ) {
    throw new MutationReceiptConformanceError([
      "execution requires successful provider validation",
    ]);
  }
  const next = updateStep(receipt, "execution", {
    attempted: true,
    ...evidence,
  });
  const executed: ConnectorMutationReceipt = {
    ...next,
    stage: "executed",
    status: outcomeReceiptStatus(evidence.status, "succeeded"),
  };
  assertMutationReceiptConformance(executed);
  return executed;
}

export function assertResumePlanFingerprint(
  receipt: Pick<ConnectorMutationReceipt, "planFingerprint">,
  actualFingerprint: string
): void {
  if (receipt.planFingerprint !== actualFingerprint) {
    throw new MutationPlanMismatchError(
      receipt.planFingerprint,
      actualFingerprint
    );
  }
}

export function assertMutationReceiptConformance(
  receipt: ConnectorMutationReceipt
): void {
  const findings = [
    ...identityConformanceFindings(receipt),
    ...lifecycleConformanceFindings(receipt),
  ];
  if (findings.length > 0) {
    throw new MutationReceiptConformanceError(findings);
  }
}

function identityConformanceFindings(
  receipt: ConnectorMutationReceipt
): string[] {
  const findings: string[] = [];
  if (
    [receipt.operationId, receipt.operationKind, receipt.provider].some(
      (value) => typeof value !== "string" || !value.trim()
    )
  ) {
    findings.push("operation identity fields are required");
  }
  if (
    !["executed", "planned", "provider-validated"].includes(receipt.stage) ||
    !["ambiguous", "failed", "planned", "succeeded", "validated"].includes(
      receipt.status
    )
  ) {
    findings.push("lifecycle stage and status must be recognized values");
  }
  if (typeof receipt.evidenceRequirements?.executionResourceIds !== "boolean") {
    findings.push("receipt evidence requirements are required");
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(receipt.planFingerprint)) {
    findings.push("plan fingerprint must be sha256");
  }
  if (!Array.isArray(receipt.steps)) {
    findings.push("receipt steps must be an array");
    return findings;
  }
  const stepKeys = receipt.steps.map(({ key }) => key).join(",");
  if (
    stepKeys !== "local-plan,provider-validation,execution" &&
    stepKeys !==
      "local-plan,provider-validation,execution,operation-label-cleanup"
  ) {
    findings.push("steps must use the canonical order");
  }
  const allowedStepStatuses = new Set<MutationStepStatus>([
    "ambiguous",
    "failed",
    "pending",
    "succeeded",
  ]);
  if (
    receipt.steps.some(
      (step) =>
        typeof step.attempted !== "boolean" ||
        !allowedStepStatuses.has(step.status) ||
        (step.failureDetail !== undefined &&
          (typeof step.failureDetail !== "string" ||
            !step.failureDetail.trim())) ||
        (step.providerRequestId !== undefined &&
          (typeof step.providerRequestId !== "string" ||
            !step.providerRequestId.trim())) ||
        (step.providerResourceIds !== undefined &&
          (!Array.isArray(step.providerResourceIds) ||
            step.providerResourceIds.some(
              (id) => typeof id !== "string" || !id.trim()
            )))
    )
  ) {
    findings.push("step evidence must use valid JSON-safe values");
  }
  return findings;
}

function lifecycleConformanceFindings(
  receipt: ConnectorMutationReceipt
): string[] {
  if (!Array.isArray(receipt.steps)) {
    return [];
  }
  const findings: string[] = [];
  const validation = receipt.steps.find(
    ({ key }) => key === "provider-validation"
  );
  const execution = receipt.steps.find(({ key }) => key === "execution");
  const operationLabelCleanup = receipt.steps.find(
    ({ key }) => key === "operation-label-cleanup"
  );
  findings.push(
    ...validationEvidenceFindings(receipt.stage, validation),
    ...executionEvidenceFindings(receipt, execution),
    ...transitionStateFindings(
      receipt.stage,
      validation,
      execution,
      operationLabelCleanup
    )
  );
  const expectedStatus = expectedReceiptStatus(
    receipt.stage,
    validation,
    execution
  );
  if (receipt.status !== expectedStatus) {
    findings.push("overall status must match the furthest lifecycle outcome");
  }
  const localPlan = receipt.steps.find(({ key }) => key === "local-plan");
  if (!(localPlan?.attempted && localPlan.status === "succeeded")) {
    findings.push("every receipt requires a successful local plan");
  }
  return findings;
}

function transitionStateFindings(
  stage: MutationLifecycleStage,
  validation: MutationReceiptStep | undefined,
  execution: MutationReceiptStep | undefined,
  operationLabelCleanup: MutationReceiptStep | undefined
): string[] {
  if (stage === "planned") {
    return isPendingUnattempted(validation) &&
      isPendingUnattempted(execution) &&
      (operationLabelCleanup === undefined ||
        isPendingUnattempted(operationLabelCleanup))
      ? []
      : ["planned receipts require untouched validation and execution steps"];
  }
  if (stage === "provider-validated") {
    return validation?.attempted &&
      validation.status !== "pending" &&
      isPendingUnattempted(execution) &&
      (operationLabelCleanup === undefined ||
        isPendingUnattempted(operationLabelCleanup))
      ? []
      : ["validated receipts require one terminal validation outcome only"];
  }
  return validation?.attempted &&
    validation.status === "succeeded" &&
    Boolean(validation.providerRequestId) &&
    execution?.attempted &&
    execution.status !== "pending"
    ? []
    : ["executed receipts require successful validation before execution"];
}

function isPendingUnattempted(step: MutationReceiptStep | undefined): boolean {
  return Boolean(step && !step.attempted && step.status === "pending");
}

function validationEvidenceFindings(
  stage: MutationLifecycleStage,
  validation: MutationReceiptStep | undefined
): string[] {
  if (stage === "planned") {
    return [];
  }
  if (!validation?.attempted) {
    return ["provider validation outcomes require attempt evidence"];
  }
  if (validation.status === "succeeded" && !validation.providerRequestId) {
    return [
      "successful provider validation requires provider request evidence",
    ];
  }
  return [];
}

function executionEvidenceFindings(
  receipt: ConnectorMutationReceipt,
  execution: MutationReceiptStep | undefined
): string[] {
  if (receipt.stage !== "executed") {
    return [];
  }
  const findings: string[] = [];
  if (!execution?.attempted) {
    findings.push("execution outcomes require attempt evidence");
  }
  if (execution?.status === "succeeded" && !execution.providerRequestId) {
    findings.push("successful execution requires provider request evidence");
  }
  if (
    execution?.status === "succeeded" &&
    receipt.evidenceRequirements.executionResourceIds &&
    !execution.providerResourceIds?.length
  ) {
    findings.push("successful execution requires provider resource evidence");
  }
  return findings;
}

function expectedReceiptStatus(
  stage: MutationLifecycleStage,
  validation: MutationReceiptStep | undefined,
  execution: MutationReceiptStep | undefined
): MutationReceiptStatus | MutationStepStatus | undefined {
  if (stage === "planned") {
    return "planned";
  }
  if (stage === "provider-validated") {
    return validation?.status === "succeeded"
      ? "validated"
      : validation?.status;
  }
  return execution?.status;
}

function outcomeReceiptStatus(
  status: "ambiguous" | "failed" | "succeeded",
  successStatus: "succeeded" | "validated"
): MutationReceiptStatus {
  return status === "succeeded" ? successStatus : status;
}

function assertSameOperation(
  expected: ConnectorMutationReceipt,
  actual: ConnectorMutationReceipt
): void {
  if (
    expected.operationId !== actual.operationId ||
    expected.operationKind !== actual.operationKind ||
    expected.provider !== actual.provider ||
    expected.planFingerprint !== actual.planFingerprint
  ) {
    throw new MutationReceiptConformanceError([
      "lifecycle stages must preserve operation identity and fingerprint",
    ]);
  }
}

export async function fingerprintMutationPlan(plan: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(stableJson(plan));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function stableJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Mutation plans cannot contain non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (
      Array.from({ length: value.length }, (_, index) => index).some(
        (index) => !(index in value)
      )
    ) {
      throw new TypeError("Mutation plans cannot contain sparse arrays.");
    }
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        "Mutation plans can contain only plain JSON objects."
      );
    }
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => compareJsonKeys(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Mutation plans must be JSON-serializable.");
}

function compareJsonKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function updateStep(
  receipt: ConnectorMutationReceipt,
  key: MutationReceiptStep["key"],
  update: Omit<MutationReceiptStep, "key">
): ConnectorMutationReceipt {
  return {
    ...receipt,
    steps: receipt.steps.map((step) =>
      step.key === key ? { key, ...update } : step
    ),
  };
}
