import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildUpdateCampaignBudgetOperations,
  updateCampaignBudget,
} from "./update-campaign-budget.js";

describe("update campaign budget workflow", () => {
  it("builds CampaignBudget update operations with exact masks", () => {
    expect(
      buildUpdateCampaignBudgetOperations({
        budgets: [
          {
            amountMicros: 25_000_000,
            budgetId: "111",
            deliveryMethod: "STANDARD",
          },
          {
            budgetId: "222",
            name: "May search budget",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        campaignBudgetOperation: {
          update: {
            amountMicros: 25_000_000,
            deliveryMethod: "STANDARD",
            resourceName: "customers/1234567890/campaignBudgets/111",
          },
          updateMask: "amount_micros,delivery_method",
        },
      },
      {
        campaignBudgetOperation: {
          update: {
            name: "May search budget",
            resourceName: "customers/1234567890/campaignBudgets/222",
          },
          updateMask: "name",
        },
      },
    ]);
  });

  it("rejects unsafe or ambiguous budget updates locally", () => {
    expect(() =>
      buildUpdateCampaignBudgetOperations({
        budgets: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one campaign budget");

    expect(() =>
      buildUpdateCampaignBudgetOperations({
        budgets: [{ amountMicros: 0, budgetId: "111" }],
        customerId: "1234567890",
      })
    ).toThrow("amountMicros");

    expect(() =>
      buildUpdateCampaignBudgetOperations({
        budgets: [
          { amountMicros: 1, budgetId: "111" },
          { amountMicros: 2, budgetId: "111" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate budgetId");

    expect(() =>
      buildUpdateCampaignBudgetOperations({
        budgets: [{ budgetId: "not-numeric", name: "Budget" }],
        customerId: "1234567890",
      })
    ).toThrow("budgetId");

    expect(() =>
      buildUpdateCampaignBudgetOperations({
        budgets: [{ budgetId: "111" }],
        customerId: "1234567890",
      })
    ).toThrow("At least one update field");
  });

  it("only allows validate-only writes until apply guardrails are implemented", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await updateCampaignBudget(client, {
      budgets: [{ amountMicros: 10_000_000, budgetId: "111" }],
      customerId: "1234567890",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: [
        {
          campaignBudgetOperation: {
            update: {
              amountMicros: 10_000_000,
              resourceName: "customers/1234567890/campaignBudgets/111",
            },
            updateMask: "amount_micros",
          },
        },
      ],
      partialFailure: undefined,
      validateOnly: true,
    });

    await expect(
      updateCampaignBudget(client, {
        budgets: [{ amountMicros: 10_000_000, budgetId: "111" }],
        customerId: "1234567890",
        mode: "execute",
        partialFailure: true,
      })
    ).rejects.toThrow("current-budget baseline");

    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("does not expose explicitlyShared as a generic budget update", () => {
    expect(
      buildUpdateCampaignBudgetOperations({
        budgets: [
          {
            budgetId: "222",
            name: "Shared budget rename only",
          },
        ],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        campaignBudgetOperation: {
          update: {
            name: "Shared budget rename only",
            resourceName: "customers/1234567890/campaignBudgets/222",
          },
          updateMask: "name",
        },
      },
    ]);
  });

  it("rejects unsupported delivery methods", () => {
    expect(() =>
      buildUpdateCampaignBudgetOperations({
        budgets: [
          {
            budgetId: "111",
            deliveryMethod: "UNKNOWN" as "STANDARD",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("Unsupported deliveryMethod");
  });

  it("trims budget names before building update operations", () => {
    expect(
      buildUpdateCampaignBudgetOperations({
        budgets: [{ budgetId: "111", name: "  Trimmed  " }],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        campaignBudgetOperation: {
          update: {
            name: "Trimmed",
            resourceName: "customers/1234567890/campaignBudgets/111",
          },
          updateMask: "name",
        },
      },
    ]);

    expect(() =>
      buildUpdateCampaignBudgetOperations({
        budgets: [{ budgetId: "111", name: "   " }],
        customerId: "1234567890",
      })
    ).toThrow("name must not be empty");
  });

  it("accepts explicit validate mode", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await updateCampaignBudget(client, {
      budgets: [{ amountMicros: 10_000_000, budgetId: "111" }],
      customerId: "1234567890",
      mode: "validate",
      partialFailure: true,
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      partialFailure: true,
      validateOnly: true,
    });
  });
});
