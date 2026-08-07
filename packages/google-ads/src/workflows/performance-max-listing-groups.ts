import type { GoogleAdsClient, MutateResult } from "../rest/index.js";
import { assertNumericId, normalizeAndAssertCustomerId } from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export interface BuildPerformanceMaxAllProductsListingGroupInput {
  assetGroupId: string;
  customerId: string;
}

export interface CreatePerformanceMaxAllProductsListingGroupInput extends BuildPerformanceMaxAllProductsListingGroupInput {
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildPerformanceMaxAllProductsListingGroupOperations(
  input: BuildPerformanceMaxAllProductsListingGroupInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  assertNumericId(input.assetGroupId, "assetGroupId");

  // Google Ads API v24 all-products PMax retail listing group:
  // https://developers.google.com/google-ads/api/samples/add-performance-max-retail-campaign
  // https://developers.google.com/google-ads/api/reference/rpc/v24/AssetGroupListingGroupFilter
  return [
    {
      assetGroupListingGroupFilterOperation: {
        create: {
          assetGroup: `customers/${customerId}/assetGroups/${input.assetGroupId}`,
          listingSource: "SHOPPING",
          type: "UNIT_INCLUDED",
        },
      },
    },
  ];
}

export async function createPerformanceMaxAllProductsListingGroup(
  client: GoogleAdsClient,
  input: CreatePerformanceMaxAllProductsListingGroupInput
): Promise<MutateResult> {
  if (input.mode === "execute") {
    throw new Error(
      "createPerformanceMaxAllProductsListingGroup execute mode requires Merchant Center linkage, inventory, and existing-tree review; use validate mode until apply-mode guards are implemented."
    );
  }
  if (input.partialFailure === true) {
    throw new Error(
      "Performance Max listing group trees must be validated atomically and do not support partial failure."
    );
  }

  return await client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildPerformanceMaxAllProductsListingGroupOperations(input),
    partialFailure: false,
    validateOnly: true,
  });
}
