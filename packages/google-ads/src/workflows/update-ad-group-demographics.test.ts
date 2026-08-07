import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildUpdateAdGroupDemographicOperations,
  updateAdGroupDemographics,
} from "./update-ad-group-demographics.js";

describe("update ad group demographics workflow", () => {
  it("builds ad group criterion bid modifier update operations", () => {
    expect(
      buildUpdateAdGroupDemographicOperations({
        criteria: [
          {
            adGroupId: "222",
            bidModifierPct: -50,
            criterionId: "503002",
            criterionType: "AGE_RANGE",
            segmentValue: "AGE_RANGE_25_34",
          },
          {
            adGroupId: "222",
            bidModifierPct: 20,
            criterionId: "11",
            criterionType: "GENDER",
            segmentValue: "FEMALE",
          },
          {
            adGroupId: "333",
            bidModifierPct: -10,
            criterionId: "911",
            criterionType: "INCOME_RANGE",
            segmentValue: "INCOME_RANGE_0_50",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        adGroupCriterionOperation: {
          update: {
            bidModifier: 0.5,
            resourceName: "customers/1234567890/adGroupCriteria/222~503002",
          },
          updateMask: "bid_modifier",
        },
      },
      {
        adGroupCriterionOperation: {
          update: {
            bidModifier: 1.2,
            resourceName: "customers/1234567890/adGroupCriteria/222~11",
          },
          updateMask: "bid_modifier",
        },
      },
      {
        adGroupCriterionOperation: {
          update: {
            bidModifier: 0.9,
            resourceName: "customers/1234567890/adGroupCriteria/333~911",
          },
          updateMask: "bid_modifier",
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous demographic inputs", () => {
    expect(() =>
      buildUpdateAdGroupDemographicOperations({
        criteria: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one demographic");

    expect(() =>
      buildUpdateAdGroupDemographicOperations({
        criteria: [
          {
            adGroupId: "abc",
            bidModifierPct: 10,
            criterionId: "503002",
            criterionType: "AGE_RANGE",
            segmentValue: "AGE_RANGE_25_34",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("adGroupId");

    expect(() =>
      buildUpdateAdGroupDemographicOperations({
        criteria: [
          {
            adGroupId: "222",
            bidModifierPct: 10,
            criterionId: "503002",
            criterionType: "PARENTAL_STATUS" as "AGE_RANGE",
            segmentValue: "PARENT_PARENT",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("Unsupported demographic");

    expect(() =>
      buildUpdateAdGroupDemographicOperations({
        criteria: [
          {
            adGroupId: "222",
            bidModifierPct: Number.NaN,
            criterionId: "503002",
            criterionType: "AGE_RANGE",
            segmentValue: "AGE_RANGE_25_34",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("finite");

    expect(() =>
      buildUpdateAdGroupDemographicOperations({
        criteria: [
          {
            adGroupId: "222",
            bidModifierPct: 10,
            criterionId: "503002",
            criterionType: "AGE_RANGE",
            segmentValue: "AGE_RANGE_25_34",
          },
          {
            adGroupId: "222",
            bidModifierPct: 20,
            criterionId: "503002",
            criterionType: "AGE_RANGE",
            segmentValue: "AGE_RANGE_25_34",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate ad group criterion");
  });

  it("defaults writes to validation mode and blocks execution until apply guards exist", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const criteria = [
      {
        adGroupId: "222",
        bidModifierPct: -50,
        criterionId: "503002",
        criterionType: "AGE_RANGE" as const,
        segmentValue: "AGE_RANGE_25_34",
      },
    ];

    await updateAdGroupDemographics(client, {
      criteria,
      customerId: "1234567890",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      partialFailure: undefined,
      validateOnly: true,
    });

    await expect(
      updateAdGroupDemographics(client, {
        criteria,
        customerId: "1234567890",
        mode: "execute",
        partialFailure: true,
      })
    ).rejects.toThrow("requires live preflight");
    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
