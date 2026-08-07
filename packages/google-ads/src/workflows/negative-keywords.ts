import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface CampaignNegativeKeywordInput {
  campaignId: string;
  customerId: string;
  keywords: { matchType: "EXACT" | "PHRASE"; text: string }[];
  mode?: "execute" | "validate";
}

export function buildCampaignNegativeKeywordOperations(
  input: CampaignNegativeKeywordInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");
  assertNumericId(input.campaignId, "campaignId");

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
      campaignCriterionOperation: {
        create: {
          campaign: `customers/${customerId}/campaigns/${input.campaignId}`,
          keyword: {
            matchType: keyword.matchType,
            text,
          },
          negative: true,
        },
      },
    };
  });
}

export async function addCampaignNegativeKeywords(
  client: GoogleAdsClient,
  input: CampaignNegativeKeywordInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildCampaignNegativeKeywordOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}
