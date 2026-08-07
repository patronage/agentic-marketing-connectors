import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildBiddingAdjustmentOperations,
  validateBiddingAdjustments,
} from "./bidding-adjustments.js";
import type { BiddingAdjustment } from "./bidding-adjustments.js";

const validSeasonalityAdjustment = {
  advertisingChannelTypes: ["SEARCH"],
  conversionRateModifier: 1.25,
  endDateTime: "2026-08-02 09:00:00",
  name: "Holiday lift",
  scope: "CHANNEL",
  startDateTime: "2026-08-01 09:00:00",
  type: "seasonalityAdjustment",
} satisfies BiddingAdjustment;

describe("bidding adjustments workflow", () => {
  it("builds seasonality adjustment and data exclusion operations", () => {
    expect(
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            advertisingChannelTypes: ["SEARCH", "SHOPPING"],
            conversionRateModifier: 1.25,
            description: "  Holiday promotion  ",
            devices: ["DESKTOP", "MOBILE"],
            endDateTime: "2026-08-02 09:00:00",
            name: "  Holiday lift  ",
            scope: "CHANNEL",
            startDateTime: "2026-08-01 09:00:00",
            type: "seasonalityAdjustment",
          },
          {
            campaigns: ["customers/1234567890/campaigns/42"],
            endDateTime: "2026-07-30 10:00:00",
            name: "Tracking outage",
            scope: "CAMPAIGN",
            startDateTime: "2026-07-30 08:00:00",
            type: "dataExclusion",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        biddingSeasonalityAdjustmentOperation: {
          create: {
            advertisingChannelTypes: ["SEARCH", "SHOPPING"],
            conversionRateModifier: 1.25,
            description: "Holiday promotion",
            devices: ["DESKTOP", "MOBILE"],
            endDateTime: "2026-08-02 09:00:00",
            name: "Holiday lift",
            scope: "CHANNEL",
            startDateTime: "2026-08-01 09:00:00",
          },
        },
      },
      {
        biddingDataExclusionOperation: {
          create: {
            campaigns: ["customers/1234567890/campaigns/42"],
            endDateTime: "2026-07-30 10:00:00",
            name: "Tracking outage",
            scope: "CAMPAIGN",
            startDateTime: "2026-07-30 08:00:00",
          },
        },
      },
    ]);
  });

  it("rejects invalid scope targeting and cross-customer campaigns", () => {
    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [],
        customerId: "123",
      })
    ).toThrow("At least one bidding adjustment");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            campaigns: ["customers/123/campaigns/42"],
          } as unknown as BiddingAdjustment,
        ],
        customerId: "123",
      })
    ).toThrow("cannot include campaigns");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            campaigns: ["customers/999/campaigns/42"],
            endDateTime: "2026-07-30 10:00:00",
            name: "Tracking outage",
            scope: "CAMPAIGN",
            startDateTime: "2026-07-30 08:00:00",
            type: "dataExclusion",
          },
        ],
        customerId: "123",
      })
    ).toThrow("must belong to customer 123");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            advertisingChannelTypes: ["VIDEO"],
          } as unknown as BiddingAdjustment,
        ],
        customerId: "123",
      })
    ).toThrow("supports only DISPLAY, SEARCH, and SHOPPING");
  });

  it("rejects invalid text, device, and modifier fields", () => {
    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [{ ...validSeasonalityAdjustment, name: " " }],
        customerId: "123",
      })
    ).toThrow("name must not be empty");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            description: "x".repeat(2049),
          },
        ],
        customerId: "123",
      })
    ).toThrow("description must be 2048 characters or fewer");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            devices: ["UNKNOWN"],
          } as unknown as BiddingAdjustment,
        ],
        customerId: "123",
      })
    ).toThrow("Unsupported bidding adjustment device");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          { ...validSeasonalityAdjustment, conversionRateModifier: 10.01 },
        ],
        customerId: "123",
      })
    ).toThrow("conversionRateModifier must be between 0.1 and 10");
  });

  it("rejects malformed, reversed, and overlong date intervals", () => {
    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            startDateTime: "2026-08-01T09:00:00Z",
          },
        ],
        customerId: "123",
      })
    ).toThrow("yyyy-MM-dd HH:mm:ss");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            endDateTime: "2026-08-01 09:00:00",
          },
        ],
        customerId: "123",
      })
    ).toThrow("endDateTime must be after startDateTime");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            endDateTime: "2026-08-15 09:00:01",
          },
        ],
        customerId: "123",
      })
    ).toThrow("cannot exceed 14 days");

    expect(() =>
      buildBiddingAdjustmentOperations({
        adjustments: [
          {
            ...validSeasonalityAdjustment,
            startDateTime: "2026-02-30 09:00:00",
          },
        ],
        customerId: "123",
      })
    ).toThrow("must be a valid date and time");
  });

  it("always performs provider validation and rejects execute mode", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "request-1",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const input = {
      adjustments: [validSeasonalityAdjustment],
      customerId: "123-456-7890",
      partialFailure: true,
    };

    await validateBiddingAdjustments(client, input);

    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          biddingSeasonalityAdjustmentOperation: {
            create: {
              advertisingChannelTypes: ["SEARCH"],
              conversionRateModifier: 1.25,
              endDateTime: "2026-08-02 09:00:00",
              name: "Holiday lift",
              scope: "CHANNEL",
              startDateTime: "2026-08-01 09:00:00",
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      validateBiddingAdjustments(client, { ...input, mode: "execute" })
    ).rejects.toThrow("does not support execute mode");
    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
