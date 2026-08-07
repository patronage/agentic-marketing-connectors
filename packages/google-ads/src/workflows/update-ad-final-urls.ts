import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface UpdateAdFinalUrlInput {
  ads: { adId: string; finalUrls: string[] }[];
  customerId: string;
  mode?: "execute" | "validate";
}

/**
 * Updates the `final_urls` field on one or more existing ads. Only the
 * landing-page URL is changed — headlines, descriptions, paths, and ad
 * structure are untouched. Editing final_urls triggers Google's automatic
 * ad re-review against the new destination.
 *
 * NOTE: this changes the destination on the ad creative. Treat this as a
 * creative change for any internal approval workflow even though it does
 * not modify visible copy.
 */
export function buildUpdateAdFinalUrlOperations(
  input: UpdateAdFinalUrlInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");

  if (input.ads.length === 0) {
    throw new Error("At least one ad is required.");
  }

  const seen = new Set<string>();

  return input.ads.map((entry) => {
    assertNumericId(entry.adId, "adId");

    if (seen.has(entry.adId)) {
      throw new Error(`duplicate adId: ${entry.adId}`);
    }
    seen.add(entry.adId);

    if (entry.finalUrls.length === 0) {
      throw new Error(`Ad ${entry.adId} requires at least one finalUrl.`);
    }

    const cleaned = entry.finalUrls.map((url) => {
      const trimmed = url.trim();
      if (trimmed.length === 0) {
        throw new Error(`Ad ${entry.adId} has an empty finalUrl.`);
      }
      if (!/^https?:\/\//iu.test(trimmed)) {
        throw new Error(
          `Ad ${entry.adId} finalUrl must start with http:// or https:// — got "${trimmed}".`
        );
      }
      return trimmed;
    });

    return {
      adOperation: {
        update: {
          finalUrls: cleaned,
          resourceName: `customers/${customerId}/ads/${entry.adId}`,
        },
        updateMask: "final_urls",
      },
    };
  });
}

export async function updateAdFinalUrls(
  client: GoogleAdsClient,
  input: UpdateAdFinalUrlInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildUpdateAdFinalUrlOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}
