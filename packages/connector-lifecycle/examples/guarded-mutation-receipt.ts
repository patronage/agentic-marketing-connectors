import {
  createPlannedMutationReceipt,
  recordMutationExecution,
  recordProviderValidation,
} from "../src/index.js";
import type { ConnectorMutationReceipt } from "../src/index.js";

const exampleFingerprint = `sha256:${"a".repeat(64)}`;

/**
 * Runs the provider-neutral receipt lifecycle with synthetic provider evidence.
 *
 * A real connector owns its provider calls and reconciliation. This example
 * isolates the receipt contract so callers can see what they must persist.
 */
export function runGuardedMutationReceiptTutorial(): ConnectorMutationReceipt {
  const planned = createPlannedMutationReceipt({
    evidenceRequirements: { executionResourceIds: true },
    operationId: "tutorial-budget-update-001",
    operationKind: "campaign-budget-update",
    planFingerprint: exampleFingerprint,
    provider: "tutorial-provider",
  });
  const validated = recordProviderValidation(planned, {
    providerRequestId: "validate-request-001",
  });

  return recordMutationExecution(validated, {
    providerRequestId: "execute-request-001",
    providerResourceIds: ["campaign-123"],
  });
}
