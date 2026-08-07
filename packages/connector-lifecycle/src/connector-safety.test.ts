import { afterEach, describe, expect, it, vi } from "vitest";

describe("connector lifecycle safety contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads without fetch access or runtime bootstrap", async () => {
    const fetchTrap = vi.fn<typeof fetch>(() => {
      throw new Error("root import must not touch fetch");
    });
    vi.stubGlobal("fetch", fetchTrap);

    const root = await import("./index.js");

    expect(Object.keys(root).toSorted()).toStrictEqual([
      "MutationPlanMismatchError",
      "MutationReceiptConformanceError",
      "assertMutationReceiptConformance",
      "assertResumePlanFingerprint",
      "createPlannedMutationReceipt",
      "fingerprintMutationPlan",
      "recordMutationExecution",
      "recordMutationExecutionOutcome",
      "recordProviderValidation",
      "recordProviderValidationOutcome",
      "verifyMutationLifecycleImplementationConformance",
    ]);
    expect(fetchTrap).not.toHaveBeenCalled();
  });
});
