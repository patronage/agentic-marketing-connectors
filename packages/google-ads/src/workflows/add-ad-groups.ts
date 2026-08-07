import type { GoogleAdsClient } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export interface AddAdGroupBrief {
  adGroups: {
    ads: {
      descriptions: string[];
      finalUrl: string;
      headlines: string[];
      path1?: string;
      path2?: string;
    }[];
    cpcBidMicros?: number;
    keywords: { matchType: "BROAD" | "EXACT" | "PHRASE"; text: string }[];
    name: string;
  }[];
  parentCampaignResourceName: string;
}

export const DEFAULT_AD_GROUP_CPC_BID_MICROS = 1_500_000;

export interface AddAdGroupsInput extends AddAdGroupBrief {
  customerId: string;
  mode?: WorkflowMode;
  status?: "ENABLED" | "PAUSED";
}

export function buildAddAdGroupOperations(input: AddAdGroupsInput): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  assertResourceName(
    input.parentCampaignResourceName,
    new RegExp(`^customers/${customerId}/campaigns/\\d+$`, "u"),
    "parentCampaignResourceName"
  );
  assertNonEmptyArray(input.adGroups, "At least one ad group is required.");
  return input.adGroups.flatMap((adGroup, index) => {
    const resourceName = `customers/${customerId}/adGroups/${-10 - index}`;
    if (!adGroup.name.trim()) {
      throw new Error("Ad group name is required.");
    }
    assertNonEmptyArray(
      adGroup.keywords,
      `Ad group ${adGroup.name} requires keywords.`
    );
    assertNonEmptyArray(adGroup.ads, `Ad group ${adGroup.name} requires ads.`);
    return [
      {
        adGroupOperation: {
          create: {
            campaign: input.parentCampaignResourceName,
            cpcBidMicros:
              adGroup.cpcBidMicros ?? DEFAULT_AD_GROUP_CPC_BID_MICROS,
            name: adGroup.name.trim(),
            resourceName,
            status: input.status ?? "PAUSED",
            type: "SEARCH_STANDARD",
          },
        },
      },
      ...adGroup.keywords.map((keyword) => ({
        adGroupCriterionOperation: {
          create: {
            adGroup: resourceName,
            keyword: {
              matchType: keyword.matchType,
              text: keyword.text.trim(),
            },
            status: "ENABLED",
          },
        },
      })),
      ...adGroup.ads.map((ad) => ({
        adGroupAdOperation: {
          create: {
            adGroup: resourceName,
            ad: {
              finalUrls: [ad.finalUrl],
              responsiveSearchAd: {
                descriptions: ad.descriptions.map((text) => ({ text })),
                headlines: ad.headlines.map((text) => ({ text })),
                ...(ad.path1 ? { path1: ad.path1 } : {}),
                ...(ad.path2 ? { path2: ad.path2 } : {}),
              },
            },
            status: "ENABLED",
          },
        },
      })),
    ];
  });
}

export function addAdGroups(client: GoogleAdsClient, input: AddAdGroupsInput) {
  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildAddAdGroupOperations(input),
    validateOnly: input.mode !== "execute",
  });
}
