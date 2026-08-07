import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildPerformanceMaxAllProductsListingGroupOperations,
  createPerformanceMaxAllProductsListingGroup,
} from "./performance-max-listing-groups.js";

describe("Performance Max listing group workflow", () => {
  it("builds an all-products retail listing group root", () => {
    expect(
      buildPerformanceMaxAllProductsListingGroupOperations({
        assetGroupId: "222",
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        assetGroupListingGroupFilterOperation: {
          create: {
            assetGroup: "customers/1234567890/assetGroups/222",
            listingSource: "SHOPPING",
            type: "UNIT_INCLUDED",
          },
        },
      },
    ]);
  });

  it("rejects invalid listing group inputs locally", () => {
    expect(() =>
      buildPerformanceMaxAllProductsListingGroupOperations({
        assetGroupId: "bad",
        customerId: "1234567890",
      })
    ).toThrow("assetGroupId");
  });

  it("validates all-products roots atomically and blocks execution", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const input = {
      assetGroupId: "222",
      customerId: "123-456-7890",
    };

    await expect(
      createPerformanceMaxAllProductsListingGroup(client, input)
    ).resolves.toStrictEqual({
      mutateOperationResponses: [],
      requestId: "req",
    });
    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          assetGroupListingGroupFilterOperation: {
            create: {
              assetGroup: "customers/1234567890/assetGroups/222",
              listingSource: "SHOPPING",
              type: "UNIT_INCLUDED",
            },
          },
        },
      ],
      partialFailure: false,
      validateOnly: true,
    });

    await expect(
      createPerformanceMaxAllProductsListingGroup(client, {
        ...input,
        partialFailure: true,
      })
    ).rejects.toThrow("do not support partial failure");
    await expect(
      createPerformanceMaxAllProductsListingGroup(client, {
        ...input,
        mode: "execute",
      })
    ).rejects.toThrow("Merchant Center linkage");
    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
