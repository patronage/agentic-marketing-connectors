import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildBiddingStrategyOperations,
  validateBiddingStrategies,
} from "./bidding-strategies.js";
import type { TargetSpendPortfolioBiddingStrategy } from "./bidding-strategies.js";

const validStrategy = {
  cpcBidCeilingMicros: 2_000_000,
  name: "Maximize Clicks",
} satisfies TargetSpendPortfolioBiddingStrategy;

describe("portfolio bidding strategies workflow", () => {
  it("builds TARGET_SPEND creates with REST int64 strings", () => {
    expect(
      buildBiddingStrategyOperations({
        customerId: "123-456-7890",
        strategies: [
          { ...validStrategy, name: "  Maximize Clicks  " },
          { name: "Uncapped Maximize Clicks" },
          { cpcBidCeilingMicros: 0, name: "Zero ceiling" },
        ],
      })
    ).toStrictEqual([
      {
        biddingStrategyOperation: {
          create: {
            name: "Maximize Clicks",
            targetSpend: { cpcBidCeilingMicros: "2000000" },
          },
        },
      },
      {
        biddingStrategyOperation: {
          create: {
            name: "Uncapped Maximize Clicks",
            targetSpend: {},
          },
        },
      },
      {
        biddingStrategyOperation: {
          create: {
            name: "Zero ceiling",
            targetSpend: { cpcBidCeilingMicros: "0" },
          },
        },
      },
    ]);
  });

  it("rejects missing, empty, overlong, and duplicate names", () => {
    expect(() =>
      buildBiddingStrategyOperations({ customerId: "123", strategies: [] })
    ).toThrow("At least one portfolio bidding strategy");

    expect(() =>
      buildBiddingStrategyOperations({
        customerId: "123",
        strategies: [{ name: " " }],
      })
    ).toThrow("name must not be empty");

    expect(() =>
      buildBiddingStrategyOperations({
        customerId: "123",
        strategies: [{ name: "é".repeat(128) }],
      })
    ).toThrow("255 UTF-8 bytes or fewer");

    expect(() =>
      buildBiddingStrategyOperations({
        customerId: "123",
        strategies: [{ name: "Duplicate" }, { name: " Duplicate " }],
      })
    ).toThrow("duplicate portfolio bidding strategy name");
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid CPC bid ceiling %s",
    (cpcBidCeilingMicros) => {
      expect(() =>
        buildBiddingStrategyOperations({
          customerId: "123",
          strategies: [{ cpcBidCeilingMicros, name: "Invalid bid ceiling" }],
        })
      ).toThrow("finite nonnegative safe integer");
    }
  );

  it("passes partial failure through and always validates with the provider", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "request-1",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await validateBiddingStrategies(client, {
      customerId: "123-456-7890",
      partialFailure: true,
      strategies: [validStrategy],
    });

    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          biddingStrategyOperation: {
            create: {
              name: "Maximize Clicks",
              targetSpend: { cpcBidCeilingMicros: "2000000" },
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });
  });

  it("rejects execute mode before mutating", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      validateBiddingStrategies(client, {
        customerId: "123",
        mode: "execute",
        strategies: [validStrategy],
      })
    ).rejects.toThrow("does not support execute mode");
    expect(client.mutate).not.toHaveBeenCalled();
  });
});
