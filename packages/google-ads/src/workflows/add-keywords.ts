import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface AddKeywordsInput {
  adGroupId: string;
  customerId: string;
  keywords: { matchType: "EXACT" | "PHRASE" | "BROAD"; text: string }[];
  mode?: "execute" | "validate";
}

export function buildAddKeywordsOperations(input: AddKeywordsInput): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");
  assertNumericId(input.adGroupId, "adGroupId");

  if (input.keywords.length === 0) {
    throw new Error("At least one keyword is required.");
  }

  const seen = new Set<string>();

  return input.keywords.map((keyword) => {
    const text = keyword.text.trim();

    if (text.length === 0) {
      throw new Error("Keyword text is required.");
    }

    if (
      !(
        keyword.matchType === "EXACT" ||
        keyword.matchType === "PHRASE" ||
        keyword.matchType === "BROAD"
      )
    ) {
      throw new Error(`Unsupported keyword matchType: ${keyword.matchType}`);
    }

    const dedupeKey = `${keyword.matchType}:${text.toLocaleLowerCase()}`;

    if (seen.has(dedupeKey)) {
      throw new Error(`duplicate keyword: ${text}`);
    }

    seen.add(dedupeKey);

    return {
      adGroupCriterionOperation: {
        create: {
          adGroup: `customers/${customerId}/adGroups/${input.adGroupId}`,
          keyword: {
            matchType: keyword.matchType,
            text,
          },
          status: "ENABLED",
        },
      },
    };
  });
}

export async function addKeywords(
  client: GoogleAdsClient,
  input: AddKeywordsInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildAddKeywordsOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}
