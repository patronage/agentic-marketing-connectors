import { describe, expect, it } from "vitest";

import {
  assertMutationReceiptConformance,
  assertResumePlanFingerprint,
  createPlannedMutationReceipt,
  fingerprintMutationPlan,
  recordMutationExecution,
  recordMutationExecutionOutcome,
  recordProviderValidation,
  recordProviderValidationOutcome,
} from "./index.js";

describe("connector mutation lifecycle conformance", () => {
  it("round-trips a complete ordered receipt through JSON", async () => {
    const planFingerprint = await fingerprintMutationPlan({ b: 2, a: 1 });
    const planned = createPlannedMutationReceipt({
      operationId: "operation-1",
      operationKind: "campaign.deploy",
      planFingerprint,
      provider: "google-ads",
    });
    const validated = recordProviderValidation(planned, {
      providerRequestId: "validate-request",
    });
    const executed = recordMutationExecution(validated, {
      providerRequestId: "execute-request",
      providerResourceIds: ["customers/1/campaigns/2"],
    });
    // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- JSON persistence round-trip is the contract under test.
    const roundTripped = JSON.parse(JSON.stringify(executed));

    expect(roundTripped).toStrictEqual(executed);
    expect(() => assertMutationReceiptConformance(roundTripped)).not.toThrow();
  });

  it("rejects resume with a mismatched plan fingerprint", async () => {
    const first = await fingerprintMutationPlan({ value: 1 });
    const second = await fingerprintMutationPlan({ value: 2 });
    const receipt = createPlannedMutationReceipt({
      operationId: "operation-1",
      operationKind: "test",
      planFingerprint: first,
      provider: "test",
    });

    expect(() => assertResumePlanFingerprint(receipt, second)).toThrow(
      "does not match"
    );
  });

  it("requires provider request evidence for validated receipts", async () => {
    const receipt = createPlannedMutationReceipt({
      operationId: "operation-1",
      operationKind: "test",
      planFingerprint: await fingerprintMutationPlan({}),
      provider: "test",
    });

    expect(() =>
      assertMutationReceiptConformance({
        ...receipt,
        stage: "provider-validated",
        status: "validated",
        steps: receipt.steps.map((step) =>
          step.key === "provider-validation"
            ? { ...step, attempted: true, status: "succeeded" }
            : step
        ),
      })
    ).toThrow("provider request evidence");
  });

  it("serializes an ambiguous execution outcome without overstating success", async () => {
    const planned = createPlannedMutationReceipt({
      operationId: "operation-1",
      operationKind: "test",
      planFingerprint: await fingerprintMutationPlan({}),
      provider: "test",
    });
    const validated = recordProviderValidation(planned, {
      providerRequestId: "validation-request",
    });
    const ambiguous = recordMutationExecutionOutcome(validated, {
      providerRequestId: "execution-request",
      status: "ambiguous",
    });

    expect(ambiguous).toMatchObject({
      stage: "executed",
      status: "ambiguous",
      steps: [{}, {}, { key: "execution", status: "ambiguous" }],
    });
  });

  it("accepts ambiguous attempt evidence without inventing a request ID", async () => {
    const planned = createPlannedMutationReceipt({
      operationId: "operation-1",
      operationKind: "test",
      planFingerprint: await fingerprintMutationPlan({}),
      provider: "test",
    });
    const ambiguous = recordProviderValidationOutcome(planned, {
      status: "ambiguous",
    });

    expect(ambiguous).toMatchObject({
      stage: "provider-validated",
      status: "ambiguous",
      steps: [
        {},
        { attempted: true, providerRequestId: undefined, status: "ambiguous" },
        {},
      ],
    });
    expect(() => assertMutationReceiptConformance(ambiguous)).not.toThrow();
  });

  it("preserves optional failure detail as receipt step evidence", async () => {
    const receipt = createPlannedMutationReceipt({
      operationId: "operation-1",
      operationKind: "test",
      planFingerprint: await fingerprintMutationPlan({}),
      provider: "test",
    });

    const failed = recordProviderValidationOutcome(receipt, {
      failureDetail: "Provider rejected the operation.",
      status: "failed",
    });

    expect(failed.steps[1]).toMatchObject({
      failureDetail: "Provider rejected the operation.",
      status: "failed",
    });
    expect(() => assertMutationReceiptConformance(failed)).not.toThrow();
  });

  it("uses a locale-independent canonical fingerprint vector", async () => {
    await expect(
      fingerprintMutationPlan({ a: 3, A: 4, ä: 2, "!": 1 })
    ).resolves.toBe(
      "sha256:df2bab30b14fd714940f5c34231b208173746670cfcd666bd0e5fe77de0fec9a"
    );
  });

  it.each([new Map(), new Date(0), Number.NaN, undefined])(
    "rejects unsupported non-JSON plan value %j",
    async (value) => {
      await expect(fingerprintMutationPlan({ value })).rejects.toThrow(
        "Mutation plans"
      );
    }
  );

  it("rejects sparse arrays instead of colliding with empty arrays", async () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    await expect(fingerprintMutationPlan(sparse)).rejects.toThrow(
      "sparse arrays"
    );
    await expect(fingerprintMutationPlan([])).resolves.toMatch(
      /^sha256:[a-f0-9]{64}$/u
    );
  });

  it("requires successful local planning for every later stage", async () => {
    const planned = createPlannedMutationReceipt({
      operationId: "operation-1",
      operationKind: "test",
      planFingerprint: await fingerprintMutationPlan({}),
      provider: "test",
    });
    const forged = {
      ...planned,
      stage: "provider-validated" as const,
      status: "validated" as const,
      steps: planned.steps.map((step) => {
        if (step.key === "local-plan") {
          return { ...step, status: "failed" as const };
        }
        if (step.key === "provider-validation") {
          return {
            ...step,
            attempted: true,
            providerRequestId: "request-1",
            status: "succeeded" as const,
          };
        }
        return step;
      }),
    };

    expect(() => assertMutationReceiptConformance(forged)).toThrow(
      "successful local plan"
    );
  });
});
