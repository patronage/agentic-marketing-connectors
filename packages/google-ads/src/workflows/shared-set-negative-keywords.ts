import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

const SHARED_SET_TEMP_ID = "-1";

export interface ApplyAccountNegativeKeywordListInput {
  /**
   * Campaigns the shared set should be attached to. Must include at least one.
   */
  campaignIds: string[];
  customerId: string;
  keywords: { matchType: "EXACT" | "PHRASE"; text: string }[];
  /**
   * Display name for the new shared set. Must be unique within the account.
   */
  listName: string;
  mode?: "execute" | "validate";
}

/**
 * Builds a single batched mutate that:
 *   1. creates a SharedSet of type NEGATIVE_KEYWORDS named `listName`
 *   2. adds every entry in `keywords` as a SharedCriterion in that set
 *   3. attaches the set to every campaign in `campaignIds`
 *
 * Operations 2 and 3 reference the set using the Google Ads temp resource
 * name pattern (`customers/<id>/sharedSets/-1`), so the whole flow lands in
 * one API call.
 */
export function buildApplyAccountNegativeKeywordListOperations(
  input: ApplyAccountNegativeKeywordListInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");

  const listName = input.listName.trim();
  if (listName.length === 0) {
    throw new Error("listName is required.");
  }

  if (input.keywords.length === 0) {
    throw new Error("At least one negative keyword is required.");
  }

  if (input.campaignIds.length === 0) {
    throw new Error(
      "At least one campaignId is required to attach the shared set."
    );
  }

  for (const campaignId of input.campaignIds) {
    assertNumericId(campaignId, "campaignId");
  }

  const seenCampaigns = new Set<string>();
  for (const campaignId of input.campaignIds) {
    if (seenCampaigns.has(campaignId)) {
      throw new Error(`duplicate campaignId: ${campaignId}`);
    }
    seenCampaigns.add(campaignId);
  }

  const sharedSetTempResourceName = `customers/${customerId}/sharedSets/${SHARED_SET_TEMP_ID}`;

  const operations: unknown[] = [
    {
      sharedSetOperation: {
        create: {
          name: listName,
          resourceName: sharedSetTempResourceName,
          type: "NEGATIVE_KEYWORDS",
        },
      },
    },
  ];

  const seenKeywords = new Set<string>();
  for (const keyword of input.keywords) {
    const text = keyword.text.trim();

    if (text.length === 0) {
      throw new Error("Negative keyword text is required.");
    }

    if (!(keyword.matchType === "EXACT" || keyword.matchType === "PHRASE")) {
      throw new Error(
        `Unsupported negative keyword matchType: ${keyword.matchType}`
      );
    }

    const dedupeKey = `${keyword.matchType}:${text.toLocaleLowerCase()}`;
    if (seenKeywords.has(dedupeKey)) {
      throw new Error(`duplicate negative keyword: ${text}`);
    }
    seenKeywords.add(dedupeKey);

    operations.push({
      sharedCriterionOperation: {
        create: {
          keyword: { matchType: keyword.matchType, text },
          sharedSet: sharedSetTempResourceName,
        },
      },
    });
  }

  for (const campaignId of input.campaignIds) {
    operations.push({
      campaignSharedSetOperation: {
        create: {
          campaign: `customers/${customerId}/campaigns/${campaignId}`,
          sharedSet: sharedSetTempResourceName,
        },
      },
    });
  }

  return operations;
}

export async function applyAccountNegativeKeywordList(
  client: GoogleAdsClient,
  input: ApplyAccountNegativeKeywordListInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildApplyAccountNegativeKeywordListOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

export interface AddSharedSetNegativeKeywordInput {
  customerId: string;
  keywords: { matchType: "EXACT" | "PHRASE"; text: string }[];
  mode?: "execute" | "validate";
  sharedSetId: string;
}

/**
 * Adds negative keywords to an EXISTING shared set. Useful for top-up
 * additions when the account-level list is already in place.
 */
export function buildAddSharedSetNegativeKeywordOperations(
  input: AddSharedSetNegativeKeywordInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");
  assertNumericId(input.sharedSetId, "sharedSetId");

  if (input.keywords.length === 0) {
    throw new Error("At least one negative keyword is required.");
  }

  const seen = new Set<string>();

  return input.keywords.map((keyword) => {
    const text = keyword.text.trim();

    if (text.length === 0) {
      throw new Error("Negative keyword text is required.");
    }

    if (!(keyword.matchType === "EXACT" || keyword.matchType === "PHRASE")) {
      throw new Error(
        `Unsupported negative keyword matchType: ${keyword.matchType}`
      );
    }

    const dedupeKey = `${keyword.matchType}:${text.toLocaleLowerCase()}`;
    if (seen.has(dedupeKey)) {
      throw new Error(`duplicate negative keyword: ${text}`);
    }
    seen.add(dedupeKey);

    return {
      sharedCriterionOperation: {
        create: {
          keyword: { matchType: keyword.matchType, text },
          sharedSet: `customers/${customerId}/sharedSets/${input.sharedSetId}`,
        },
      },
    };
  });
}

export async function addSharedSetNegativeKeywords(
  client: GoogleAdsClient,
  input: AddSharedSetNegativeKeywordInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildAddSharedSetNegativeKeywordOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}
