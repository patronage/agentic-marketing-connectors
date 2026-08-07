import type { GoogleAdsClient } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertNumericId,
  normalizeAndAssertCustomerId,
  updateMask,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export type ResponsiveSearchAdPinnedField =
  | "DESCRIPTION_1"
  | "DESCRIPTION_2"
  | "HEADLINE_1"
  | "HEADLINE_2"
  | "HEADLINE_3";

export interface ResponsiveSearchAdTextAsset {
  pinnedField?: ResponsiveSearchAdPinnedField;
  text: string;
}

export interface ResponsiveSearchAdCopyUpdate {
  adId: string;
  descriptions?: ResponsiveSearchAdTextAsset[];
  headlines?: ResponsiveSearchAdTextAsset[];
  path1?: string;
  path2?: string;
}

export interface UpdateResponsiveSearchAdsInput {
  ads: ResponsiveSearchAdCopyUpdate[];
  customerId: string;
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildUpdateResponsiveSearchAdOperations(
  input: UpdateResponsiveSearchAdsInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  assertNonEmptyArray(
    input.ads,
    "At least one responsive search ad is required."
  );

  const seen = new Set<string>();

  return input.ads.map((ad) => {
    assertNumericId(ad.adId, "adId");

    const resourceName = `customers/${customerId}/ads/${ad.adId}`;

    if (seen.has(resourceName)) {
      throw new Error(`duplicate responsive search ad: ${resourceName}`);
    }
    seen.add(resourceName);

    const responsiveSearchAd: Record<string, unknown> = {};
    const fields: string[] = [];

    if (ad.headlines !== undefined) {
      responsiveSearchAd.headlines = normalizeTextAssets(
        ad.headlines,
        "headlines",
        3,
        15,
        30
      );
      fields.push("responsive_search_ad.headlines");
    }

    if (ad.descriptions !== undefined) {
      responsiveSearchAd.descriptions = normalizeTextAssets(
        ad.descriptions,
        "descriptions",
        2,
        4,
        90
      );
      fields.push("responsive_search_ad.descriptions");
    }

    if (ad.path1 !== undefined) {
      responsiveSearchAd.path1 = normalizePath(ad.path1, "path1");
      fields.push("responsive_search_ad.path1");
    }

    if (ad.path2 !== undefined) {
      if (ad.path1 === undefined) {
        throw new Error("path2 requires path1 in the same update.");
      }
      responsiveSearchAd.path2 = normalizePath(ad.path2, "path2");
      fields.push("responsive_search_ad.path2");
    }

    return {
      adOperation: {
        update: {
          resourceName,
          responsiveSearchAd,
        },
        updateMask: updateMask(fields),
      },
    };
  });
}

export async function updateResponsiveSearchAds(
  client: GoogleAdsClient,
  input: UpdateResponsiveSearchAdsInput
) {
  assertValidateOnlyMode(input.mode);

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildUpdateResponsiveSearchAdOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

function normalizeTextAssets(
  assets: ResponsiveSearchAdTextAsset[],
  fieldName: "descriptions" | "headlines",
  minCount: number,
  maxCount: number,
  maxLength: number
): { pinnedField?: ResponsiveSearchAdPinnedField; text: string }[] {
  assertNonEmptyArray(assets, `${fieldName} must include at least one asset.`);

  if (assets.length < minCount) {
    throw new Error(
      `${fieldName} must include at least ${minCount} assets for full replacement.`
    );
  }

  if (assets.length > maxCount) {
    throw new Error(
      `${fieldName} must include no more than ${maxCount} assets.`
    );
  }

  const seenText = new Set<string>();

  return assets.map((asset, index) => {
    const text = normalizeText(asset.text, `${fieldName}[${index}].text`);

    if (text.length > maxLength) {
      throw new Error(
        `${fieldName}[${index}].text must be ${maxLength} characters or fewer.`
      );
    }

    if (seenText.has(text)) {
      throw new Error(`${fieldName} contains duplicate text: ${text}`);
    }
    seenText.add(text);

    if (asset.pinnedField !== undefined) {
      assertPinnedField(asset.pinnedField);
      return { pinnedField: asset.pinnedField, text };
    }

    return { text };
  });
}

function normalizePath(value: string, fieldName: string): string {
  const path = normalizeText(value, fieldName);

  if (path.length > 15) {
    throw new Error(`${fieldName} must be 15 characters or fewer.`);
  }

  if (path.includes("/") || path.includes("?") || path.includes("#")) {
    throw new Error(`${fieldName} must not include URL separators.`);
  }

  return path;
}

function normalizeText(value: string, fieldName: string): string {
  const text = value.trim();

  if (text.length === 0) {
    throw new Error(`${fieldName} must not be empty.`);
  }

  return text;
}

function assertPinnedField(value: ResponsiveSearchAdPinnedField): void {
  if (
    !(
      value === "HEADLINE_1" ||
      value === "HEADLINE_2" ||
      value === "HEADLINE_3" ||
      value === "DESCRIPTION_1" ||
      value === "DESCRIPTION_2"
    )
  ) {
    throw new Error(`Unsupported pinnedField: ${value}`);
  }
}

function assertValidateOnlyMode(
  mode: UpdateResponsiveSearchAdsInput["mode"]
): void {
  if (mode === "execute") {
    throw new Error(
      "updateResponsiveSearchAds execute mode requires creative approval, policy preflight, and copy baseline guardrails; use validate mode until apply-mode guards are implemented."
    );
  }
}
