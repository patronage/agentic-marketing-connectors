import type { GoogleAdsClient, MutateResult } from "../rest/index.js";
import {
  assertCustomerResourceMatches,
  assertNonEmptyArray,
  assertNumericId,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export interface AssetSetAssetLink {
  assetResourceName: string;
  assetSetResourceName: string;
}

export interface CampaignAssetSetLink {
  assetSetResourceName: string;
  campaignId: string;
}

export interface LinkAssetSetsInput {
  assetLinks?: AssetSetAssetLink[];
  campaignLinks?: CampaignAssetSetLink[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildAssetSetLinkOperations(
  input: Pick<LinkAssetSetsInput, "assetLinks" | "campaignLinks" | "customerId">
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  const operations = [
    ...buildAssetLinks(customerId, input.assetLinks ?? []),
    ...buildCampaignLinks(customerId, input.campaignLinks ?? []),
  ];

  assertNonEmptyArray(
    operations,
    "At least one asset-set asset or campaign link is required."
  );

  return operations;
}

export async function linkAssetSets(
  client: GoogleAdsClient,
  input: LinkAssetSetsInput
): Promise<MutateResult> {
  if (input.mode === "execute") {
    throw new Error(
      "linkAssetSets does not support execute mode; use validate mode until asset-set compatibility and existing-link guards are implemented."
    );
  }

  return await client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildAssetSetLinkOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

function buildAssetLinks(
  customerId: string,
  links: AssetSetAssetLink[]
): unknown[] {
  const seen = new Set<string>();

  return links.map((link, index) => {
    assertAssetResourceName(
      link.assetResourceName,
      customerId,
      `assetLinks[${index}].assetResourceName`
    );
    assertAssetSetResourceName(
      link.assetSetResourceName,
      customerId,
      `assetLinks[${index}].assetSetResourceName`
    );

    const key = `${link.assetSetResourceName}:${link.assetResourceName}`;
    if (seen.has(key)) {
      throw new Error(`duplicate asset-set asset link: ${key}`);
    }
    seen.add(key);

    // Google Ads API v24 AssetSetAsset create contract:
    // https://developers.google.com/google-ads/api/reference/rpc/v24/AssetSetAsset
    // https://developers.google.com/google-ads/api/reference/rpc/v24/AssetSetAssetOperation
    return {
      assetSetAssetOperation: {
        create: {
          asset: link.assetResourceName,
          assetSet: link.assetSetResourceName,
        },
      },
    };
  });
}

function buildCampaignLinks(
  customerId: string,
  links: CampaignAssetSetLink[]
): unknown[] {
  const seen = new Set<string>();

  return links.map((link, index) => {
    assertNumericId(link.campaignId, `campaignLinks[${index}].campaignId`);
    assertAssetSetResourceName(
      link.assetSetResourceName,
      customerId,
      `campaignLinks[${index}].assetSetResourceName`
    );

    const campaign = `customers/${customerId}/campaigns/${link.campaignId}`;
    const key = `${campaign}:${link.assetSetResourceName}`;
    if (seen.has(key)) {
      throw new Error(`duplicate campaign asset-set link: ${key}`);
    }
    seen.add(key);

    // Google Ads API v24 CampaignAssetSet create contract:
    // https://developers.google.com/google-ads/api/reference/rpc/v24/CampaignAssetSet
    // https://developers.google.com/google-ads/api/reference/rpc/v24/CampaignAssetSetOperation
    return {
      campaignAssetSetOperation: {
        create: {
          assetSet: link.assetSetResourceName,
          campaign,
        },
      },
    };
  });
}

function assertAssetResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertResourceName(resourceName, /^customers\/\d+\/assets\/\d+$/u, fieldName);
  assertCustomerResourceMatches(resourceName, customerId, fieldName);
}

function assertAssetSetResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertResourceName(
    resourceName,
    /^customers\/\d+\/assetSets\/\d+$/u,
    fieldName
  );
  assertCustomerResourceMatches(resourceName, customerId, fieldName);
}
