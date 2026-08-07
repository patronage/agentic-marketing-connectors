import type { GoogleAdsClient } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertPositiveInteger,
  customerResourceName,
  normalizeAndAssertCustomerId,
  updateMask,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export interface CampaignBudgetUpdate {
  amountMicros?: number;
  budgetId: string;
  deliveryMethod?: "ACCELERATED" | "STANDARD";
  name?: string;
}

export interface UpdateCampaignBudgetInput {
  budgets: CampaignBudgetUpdate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildUpdateCampaignBudgetOperations(
  input: UpdateCampaignBudgetInput
): unknown[] {
  assertNonEmptyArray(
    input.budgets,
    "At least one campaign budget is required."
  );

  const seen = new Set<string>();

  return input.budgets.map((budget) => {
    if (seen.has(budget.budgetId)) {
      throw new Error(`duplicate budgetId: ${budget.budgetId}`);
    }
    seen.add(budget.budgetId);

    const update: Record<string, unknown> = {
      resourceName: customerResourceName(
        input.customerId,
        "campaignBudgets",
        budget.budgetId,
        "budgetId"
      ),
    };
    const fields: string[] = [];

    if (budget.amountMicros !== undefined) {
      assertPositiveInteger(budget.amountMicros, "amountMicros");
      update.amountMicros = budget.amountMicros;
      fields.push("amount_micros");
    }

    if (budget.deliveryMethod !== undefined) {
      assertDeliveryMethod(budget.deliveryMethod);
      update.deliveryMethod = budget.deliveryMethod;
      fields.push("delivery_method");
    }

    if (budget.name !== undefined) {
      const name = budget.name.trim();
      if (name.length === 0) {
        throw new Error("name must not be empty.");
      }
      update.name = name;
      fields.push("name");
    }

    return {
      campaignBudgetOperation: {
        update,
        updateMask: updateMask(fields),
      },
    };
  });
}

export async function updateCampaignBudget(
  client: GoogleAdsClient,
  input: UpdateCampaignBudgetInput
) {
  assertValidateOnlyMode(input.mode);

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildUpdateCampaignBudgetOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

function assertValidateOnlyMode(mode: UpdateCampaignBudgetInput["mode"]): void {
  if (mode === "execute") {
    throw new Error(
      "updateCampaignBudget execute mode requires approval, a current-budget baseline, and max-change guardrails; use validate mode until apply-mode guards are implemented."
    );
  }
}

function assertDeliveryMethod(
  value: CampaignBudgetUpdate["deliveryMethod"]
): void {
  if (!(value === "ACCELERATED" || value === "STANDARD")) {
    throw new Error(`Unsupported deliveryMethod: ${value}`);
  }
}
