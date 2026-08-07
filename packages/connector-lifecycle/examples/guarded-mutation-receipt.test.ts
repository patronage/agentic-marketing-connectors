import { describe, expect, it } from "vitest";

import { runGuardedMutationReceiptTutorial } from "./guarded-mutation-receipt.js";

describe("guarded mutation receipt tutorial", () => {
  it("completes the canonical receipt stages with JSON-safe evidence", () => {
    const receipt = runGuardedMutationReceiptTutorial();
    const roundTripped = structuredClone(receipt);

    expect(roundTripped).toMatchObject({
      operationId: "tutorial-budget-update-001",
      stage: "executed",
      status: "succeeded",
    });
    expect(roundTripped.steps.map(({ key }) => key)).toStrictEqual([
      "local-plan",
      "provider-validation",
      "execution",
    ]);
  });
});
