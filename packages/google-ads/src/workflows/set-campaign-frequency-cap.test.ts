import { describe, expect, it, vi } from "vitest";

import {
  buildSetCampaignFrequencyCapOperations,
  setCampaignFrequencyCap,
} from "./set-campaign-frequency-cap.js";

describe("set campaign frequency cap workflow", () => {
  it("builds campaign frequency cap update operations", () => {
    expect(
      buildSetCampaignFrequencyCapOperations({
        campaignFrequencyCaps: [
          {
            campaignId: "111",
            cap: 4,
            timeUnit: "WEEK",
          },
          {
            campaignId: "111",
            cap: 2,
            timeUnit: "DAY",
          },
        ],
        customerId: "123-456-7890",
        replaceAll: true,
      })
    ).toEqual([
      {
        campaignOperation: {
          update: {
            frequencyCaps: [
              {
                cap: 4,
                key: {
                  eventType: "IMPRESSION",
                  level: "CAMPAIGN",
                  timeLength: 1,
                  timeUnit: "WEEK",
                },
              },
              {
                cap: 2,
                key: {
                  eventType: "IMPRESSION",
                  level: "CAMPAIGN",
                  timeLength: 1,
                  timeUnit: "DAY",
                },
              },
            ],
            resourceName: "customers/1234567890/campaigns/111",
          },
          updateMask: "frequency_caps",
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous frequency cap inputs", () => {
    expect(() =>
      buildSetCampaignFrequencyCapOperations({
        campaignFrequencyCaps: [],
        customerId: "1234567890",
        replaceAll: true,
      })
    ).toThrow("At least one campaign frequency cap");

    expect(() =>
      buildSetCampaignFrequencyCapOperations({
        campaignFrequencyCaps: [
          {
            campaignId: "abc",
            cap: 4,
            timeUnit: "WEEK",
          },
        ],
        customerId: "1234567890",
        replaceAll: true,
      })
    ).toThrow("campaignId");

    expect(() =>
      buildSetCampaignFrequencyCapOperations({
        campaignFrequencyCaps: [
          {
            campaignId: "111",
            cap: 0,
            timeUnit: "WEEK",
          },
        ],
        customerId: "1234567890",
        replaceAll: true,
      })
    ).toThrow("cap");

    expect(() =>
      buildSetCampaignFrequencyCapOperations({
        campaignFrequencyCaps: [
          {
            campaignId: "111",
            cap: 4,
            timeUnit: "YEAR" as "WEEK",
          },
        ],
        customerId: "1234567890",
        replaceAll: true,
      })
    ).toThrow("timeUnit");

    expect(() =>
      buildSetCampaignFrequencyCapOperations({
        campaignFrequencyCaps: [
          {
            campaignId: "111",
            cap: 4,
            timeUnit: "WEEK",
          },
          {
            campaignId: "111",
            cap: 5,
            timeUnit: "WEEK",
          },
        ],
        customerId: "1234567890",
        replaceAll: true,
      })
    ).toThrow("duplicate frequency cap");

    expect(() =>
      buildSetCampaignFrequencyCapOperations({
        campaignFrequencyCaps: [
          {
            campaignId: "111",
            cap: 4,
            timeUnit: "WEEK",
          },
        ],
        customerId: "1234567890",
        replaceAll: false as true,
      })
    ).toThrow("replaces all frequency caps");
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

    const campaignFrequencyCaps = [
      {
        campaignId: "111",
        cap: 4,
        timeUnit: "WEEK" as const,
      },
    ];

    await setCampaignFrequencyCap(client, {
      campaignFrequencyCaps,
      customerId: "1234567890",
      replaceAll: true,
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      partialFailure: undefined,
      validateOnly: true,
    });

    await expect(
      setCampaignFrequencyCap(client, {
        campaignFrequencyCaps,
        customerId: "1234567890",
        mode: "execute",
        partialFailure: true,
        replaceAll: true,
      })
    ).rejects.toThrow("requires live preflight");
    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
