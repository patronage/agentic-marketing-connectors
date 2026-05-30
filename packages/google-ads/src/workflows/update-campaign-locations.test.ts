import { describe, expect, it, vi } from "vitest";

import {
  buildUpdateCampaignLocationOperations,
  updateCampaignLocations,
} from "./update-campaign-locations.js";

describe("update campaign locations workflow", () => {
  it("builds campaign criterion create, update, and removal operations", () => {
    expect(
      buildUpdateCampaignLocationOperations({
        customerId: "123-456-7890",
        locations: [
          {
            bidModifierPct: 72.5,
            campaignId: "111",
            locationId: "9030972",
            zip: "90047",
          },
          {
            bidModifierPct: -25,
            campaignId: "111",
            existingCriterionId: "9040440",
            locationId: "9040440",
            zip: "90404",
          },
        ],
        removeLocations: [{ campaignId: "111", criterionId: "21137" }],
      })
    ).toEqual([
      {
        campaignCriterionOperation: {
          remove: "customers/1234567890/campaignCriteria/111~21137",
        },
      },
      {
        campaignCriterionOperation: {
          create: {
            bidModifier: 1.725,
            campaign: "customers/1234567890/campaigns/111",
            location: {
              geoTargetConstant: "geoTargetConstants/9030972",
            },
            negative: false,
          },
        },
      },
      {
        campaignCriterionOperation: {
          update: {
            bidModifier: 0.75,
            resourceName: "customers/1234567890/campaignCriteria/111~9040440",
          },
          updateMask: "bid_modifier",
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous location inputs", () => {
    expect(() =>
      buildUpdateCampaignLocationOperations({
        customerId: "1234567890",
        locations: [],
      })
    ).toThrow("At least one location");

    expect(() =>
      buildUpdateCampaignLocationOperations({
        customerId: "1234567890",
        locations: [
          {
            bidModifierPct: 10,
            campaignId: "abc",
            locationId: "9030972",
            zip: "90047",
          },
        ],
      })
    ).toThrow("campaignId");

    expect(() =>
      buildUpdateCampaignLocationOperations({
        customerId: "1234567890",
        locations: [
          {
            bidModifierPct: 10,
            campaignId: "111",
            locationId: "9030972",
            zip: "9004",
          },
        ],
      })
    ).toThrow("zip");

    expect(() =>
      buildUpdateCampaignLocationOperations({
        customerId: "1234567890",
        locations: [
          {
            bidModifierPct: -91,
            campaignId: "111",
            locationId: "9030972",
            zip: "90047",
          },
        ],
      })
    ).toThrow("0.1 to 10");

    expect(() =>
      buildUpdateCampaignLocationOperations({
        customerId: "1234567890",
        locations: [
          {
            bidModifierPct: 10,
            campaignId: "111",
            locationId: "9030972",
            zip: "90047",
          },
          {
            bidModifierPct: 20,
            campaignId: "111",
            locationId: "9030972",
            zip: "90047",
          },
        ],
      })
    ).toThrow("duplicate campaign/location");

    expect(() =>
      buildUpdateCampaignLocationOperations({
        customerId: "1234567890",
        locations: [
          {
            bidModifierPct: 20,
            campaignId: "111",
            existingCriterionId: "9040440",
            locationId: "9040440",
            zip: "90404",
          },
        ],
        removeLocations: [{ campaignId: "111", criterionId: "9040440" }],
      })
    ).toThrow("cannot be removed and updated");
  });

  it("defaults writes to validation mode and blocks execution until apply guards exist", async () => {
    const client = {
      mutate: vi.fn().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn(),
      searchStream: vi.fn(),
    };

    await updateCampaignLocations(client, {
      customerId: "1234567890",
      locations: [
        {
          bidModifierPct: 50,
          campaignId: "111",
          locationId: "9030972",
          zip: "90047",
        },
      ],
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      partialFailure: undefined,
      validateOnly: true,
    });

    await expect(
      updateCampaignLocations(client, {
        customerId: "1234567890",
        locations: [
          {
            bidModifierPct: 50,
            campaignId: "111",
            locationId: "9030972",
            zip: "90047",
          },
        ],
        mode: "execute",
        partialFailure: true,
      })
    ).rejects.toThrow("requires live preflight");
    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
