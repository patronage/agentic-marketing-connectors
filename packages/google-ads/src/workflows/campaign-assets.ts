import type { GoogleAdsClient } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertNonEmptyString,
  assertNumericId,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export type AssetFieldType =
  | "BUSINESS_LOGO"
  | "BUSINESS_NAME"
  | "CALL"
  | "CALLOUT"
  | "LANDSCAPE_LOGO"
  | "MARKETING_IMAGE"
  | "PORTRAIT_MARKETING_IMAGE"
  | "SITELINK"
  | "SQUARE_MARKETING_IMAGE";

export type AssetLinkScope = "adGroup" | "campaign" | "customer";

export type CreateAssetInput =
  | {
      countryCode: string;
      name?: string;
      phoneNumber: string;
      resourceName: string;
      type: "call";
    }
  | {
      data: string;
      name?: string;
      resourceName: string;
      type: "image";
    }
  | {
      calloutText: string;
      name?: string;
      resourceName: string;
      type: "callout";
    }
  | {
      finalUrls: string[];
      description1?: string;
      description2?: string;
      linkText: string;
      name?: string;
      resourceName: string;
      type: "sitelink";
    }
  | {
      businessName: string;
      name?: string;
      resourceName: string;
      type: "businessName";
    }
  | {
      name?: string;
      resourceName: string;
      type: "youtubeVideo";
      youtubeVideoId: string;
    };

export type AssetLinkInput =
  | {
      assetResourceName: string;
      campaignId: string;
      fieldType: AssetFieldType;
      scope: "campaign";
    }
  | {
      adGroupId: string;
      assetResourceName: string;
      fieldType: AssetFieldType;
      scope: "adGroup";
    }
  | {
      assetResourceName: string;
      fieldType: AssetFieldType;
      scope: "customer";
    };

export interface BuildCampaignAssetOperationsInput {
  assets?: CreateAssetInput[];
  customerId: string;
  links?: AssetLinkInput[];
}

export interface UpdateCampaignAssetsInput extends BuildCampaignAssetOperationsInput {
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildCampaignAssetOperations(
  input: BuildCampaignAssetOperationsInput
): unknown[] {
  const createdAssetResourceNames = new Set(
    input.assets?.map((asset) => asset.resourceName)
  );

  return [
    ...buildCreateAssetOperations(input),
    ...buildLinkAssetOperations({
      ...input,
      createdAssetResourceNames,
    }),
  ];
}

export function buildCreateAssetOperations(input: {
  assets?: CreateAssetInput[];
  customerId: string;
}): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  if (!input.assets || input.assets.length === 0) {
    return [];
  }

  const seen = new Set<string>();

  return input.assets.map((asset) => {
    assertTempAssetResourceName(asset.resourceName, customerId, "resourceName");

    if (seen.has(asset.resourceName)) {
      throw new Error(`duplicate asset resourceName: ${asset.resourceName}`);
    }
    seen.add(asset.resourceName);

    return {
      assetOperation: {
        create: createAssetPayload(asset),
      },
    };
  });
}

export function buildLinkAssetOperations(input: {
  createdAssetResourceNames?: ReadonlySet<string>;
  customerId: string;
  links?: AssetLinkInput[];
}): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);

  if (!input.links || input.links.length === 0) {
    return [];
  }

  const seen = new Set<string>();

  return input.links.map((link) => {
    assertAssetResourceName(
      link.assetResourceName,
      customerId,
      "assetResourceName"
    );
    assertAssetFieldTypeForScope(link.fieldType, link.scope);

    if (
      isTempAssetResourceName(link.assetResourceName) &&
      !input.createdAssetResourceNames?.has(link.assetResourceName)
    ) {
      throw new Error(
        "negative temp asset links require a matching asset create in the same request."
      );
    }

    const operationKey = assetLinkDedupeKey(customerId, link);
    if (seen.has(operationKey)) {
      throw new Error(`duplicate asset link: ${operationKey}`);
    }
    seen.add(operationKey);

    return assetLinkOperation(customerId, link);
  });
}

export async function updateCampaignAssets(
  client: GoogleAdsClient,
  input: UpdateCampaignAssetsInput
) {
  assertValidateOnlyMode(input.mode);
  assertNoPartialFailureForDependentTempAssetLinks(input);

  const operations = buildCampaignAssetOperations(input);
  assertNonEmptyArray(
    operations,
    "At least one asset create or link operation is required."
  );

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations,
    partialFailure: input.partialFailure,
    validateOnly: true,
  });
}

function createAssetPayload(asset: CreateAssetInput): Record<string, unknown> {
  switch (asset.type) {
    case "call": {
      const phoneNumber = asset.phoneNumber.trim();
      assertNonEmptyString(phoneNumber, "phoneNumber");

      // Google Ads API v24 CallAsset contract and official add-call sample:
      // https://developers.google.com/google-ads/api/reference/rpc/v24/CallAsset
      // https://developers.google.com/google-ads/api/samples/add-call
      return {
        callAsset: {
          countryCode: normalizedCountryCode(asset.countryCode),
          phoneNumber,
        },
        name: asset.name?.trim() || `Call: ${phoneNumber}`,
        resourceName: asset.resourceName,
      };
    }
    case "image": {
      return createImageAssetPayload(asset);
    }
    case "callout": {
      const calloutText = normalizedText(asset.calloutText, "calloutText", 25);
      return {
        calloutAsset: { calloutText },
        name: asset.name?.trim() || `Callout: ${calloutText}`,
        resourceName: asset.resourceName,
      };
    }
    case "sitelink": {
      const linkText = normalizedText(asset.linkText, "linkText", 25);
      assertNonEmptyArray(asset.finalUrls, "finalUrls must not be empty.");
      const finalUrls = asset.finalUrls.map((url, index) =>
        normalizedUrl(url, `finalUrls[${index}]`)
      );

      return {
        finalUrls,
        name: asset.name?.trim() || `Sitelink: ${linkText}`,
        resourceName: asset.resourceName,
        sitelinkAsset: {
          ...(asset.description1 === undefined
            ? {}
            : {
                description1: normalizedText(
                  asset.description1,
                  "description1",
                  35
                ),
              }),
          ...(asset.description2 === undefined
            ? {}
            : {
                description2: normalizedText(
                  asset.description2,
                  "description2",
                  35
                ),
              }),
          linkText,
        },
      };
    }
    case "businessName": {
      const businessName = normalizedText(
        asset.businessName,
        "businessName",
        25
      );
      return {
        name: asset.name?.trim() || `Business name: ${businessName}`,
        resourceName: asset.resourceName,
        textAsset: { text: businessName },
      };
    }
    case "youtubeVideo": {
      return createYoutubeVideoAssetPayload(asset);
    }
    default: {
      throw new Error(
        `Unsupported asset create type: ${
          (asset as { type?: string }).type ?? "unknown"
        }`
      );
    }
  }
}

function createImageAssetPayload(
  asset: Extract<CreateAssetInput, { type: "image" }>
): Record<string, unknown> {
  const data = normalizedBase64ImageData(asset.data);
  const name = asset.name?.trim();

  // Google Ads API v24 image bytes contract and REST upload sample:
  // https://developers.google.com/google-ads/api/reference/rpc/v24/ImageAsset
  // https://developers.google.com/google-ads/api/samples/upload-image-asset
  return {
    imageAsset: { data },
    ...(name ? { name } : {}),
    resourceName: asset.resourceName,
  };
}

function createYoutubeVideoAssetPayload(
  asset: Extract<CreateAssetInput, { type: "youtubeVideo" }>
): Record<string, unknown> {
  const youtubeVideoId = asset.youtubeVideoId.trim();
  if (youtubeVideoId.length !== 11) {
    throw new Error(
      "youtubeVideoId must be the 11-character value from the YouTube video URL."
    );
  }

  const name = asset.name?.trim();

  // Google Ads API v24 Asset and YoutubeVideoAsset REST contracts:
  // https://developers.google.com/google-ads/api/reference/rpc/v24/Asset
  // https://developers.google.com/google-ads/api/reference/rpc/v24/YoutubeVideoAsset
  // The video ID can be used to create an asset with MutateAssets:
  // https://developers.google.com/google-ads/api/docs/assets/upload-videos#use_the_uploaded_video
  return {
    ...(name ? { name } : {}),
    resourceName: asset.resourceName,
    youtubeVideoAsset: { youtubeVideoId },
  };
}

function assetLinkOperation(customerId: string, link: AssetLinkInput): unknown {
  if (link.scope === "campaign") {
    assertNumericId(link.campaignId, "campaignId");
    return {
      campaignAssetOperation: {
        create: {
          asset: link.assetResourceName,
          campaign: `customers/${customerId}/campaigns/${link.campaignId}`,
          fieldType: link.fieldType,
        },
      },
    };
  }

  if (link.scope === "adGroup") {
    assertNumericId(link.adGroupId, "adGroupId");
    return {
      adGroupAssetOperation: {
        create: {
          adGroup: `customers/${customerId}/adGroups/${link.adGroupId}`,
          asset: link.assetResourceName,
          fieldType: link.fieldType,
        },
      },
    };
  }

  // CustomerAsset infers the customer from the mutate request path; its v24
  // create resource has only asset and fieldType as caller-set linkage fields:
  // https://developers.google.com/google-ads/api/reference/rpc/v24/CustomerAsset
  return {
    customerAssetOperation: {
      create: {
        asset: link.assetResourceName,
        fieldType: link.fieldType,
      },
    },
  };
}

function assetLinkDedupeKey(customerId: string, link: AssetLinkInput): string {
  if (link.scope === "campaign") {
    assertNumericId(link.campaignId, "campaignId");
    return `${link.scope}:${customerId}:${link.campaignId}:${link.fieldType}:${link.assetResourceName}`;
  }

  if (link.scope === "adGroup") {
    assertNumericId(link.adGroupId, "adGroupId");
    return `${link.scope}:${customerId}:${link.adGroupId}:${link.fieldType}:${link.assetResourceName}`;
  }

  return `${link.scope}:${customerId}:${link.fieldType}:${link.assetResourceName}`;
}

function assertAssetResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertResourceName(
    resourceName,
    /^customers\/\d+\/assets\/-?\d+$/u,
    fieldName
  );

  if (!resourceName.startsWith(`customers/${customerId}/`)) {
    throw new Error(`${fieldName} must belong to customer ${customerId}.`);
  }
}

function assertTempAssetResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertAssetResourceName(resourceName, customerId, fieldName);

  if (!isTempAssetResourceName(resourceName)) {
    throw new Error(`${fieldName} must use a negative asset temp ID.`);
  }
}

function isTempAssetResourceName(resourceName: string): boolean {
  return /\/assets\/-[1-9]\d*$/u.test(resourceName);
}

function assertAssetFieldTypeForScope(
  fieldType: AssetFieldType,
  scope: AssetLinkScope
): void {
  if (!supportedFieldTypesForScope(scope).has(fieldType)) {
    throw new Error(
      `${fieldType} is not supported for ${scope} asset links in this workflow.`
    );
  }
}

function supportedFieldTypesForScope(
  scope: AssetLinkScope
): ReadonlySet<AssetFieldType> {
  // v24 links YOUTUBE_VIDEO assets directly to supported ads or to Performance
  // Max asset groups, not through CustomerAsset, CampaignAsset, or AdGroupAsset:
  // https://developers.google.com/google-ads/api/docs/assets/overview#asset_types_linked_to_ads
  // https://developers.google.com/google-ads/api/docs/assets/working-with-assets#asset_association_levels
  if (scope === "adGroup") {
    return new Set(["CALLOUT", "SITELINK"]);
  }

  if (scope === "customer") {
    return new Set(["BUSINESS_LOGO", "BUSINESS_NAME", "CALLOUT", "SITELINK"]);
  }

  return new Set([
    "BUSINESS_LOGO",
    "BUSINESS_NAME",
    "CALL",
    "CALLOUT",
    "LANDSCAPE_LOGO",
    "MARKETING_IMAGE",
    "PORTRAIT_MARKETING_IMAGE",
    "SITELINK",
    "SQUARE_MARKETING_IMAGE",
  ]);
}

function normalizedCountryCode(value: string): string {
  const countryCode = value.trim().toUpperCase();

  if (!/^[A-Z]{2}$/u.test(countryCode)) {
    throw new Error("countryCode must be a two-letter ISO-3166 country code.");
  }

  return countryCode;
}

function normalizedBase64ImageData(value: string): string {
  const data = value.trim();
  assertNonEmptyString(data, "data");

  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(data)) {
    throw new Error("data must be a base64-encoded image byte string.");
  }

  return data;
}

function normalizedText(
  value: string,
  fieldName: string,
  maxLength: number
): string {
  const text = value.trim();
  assertNonEmptyString(text, fieldName);

  if (text.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return text;
}

function normalizedUrl(value: string, fieldName: string): string {
  const url = value.trim();
  assertNonEmptyString(url, fieldName);

  if (!/^https?:\/\//iu.test(url)) {
    throw new Error(`${fieldName} must start with http:// or https://.`);
  }

  return url;
}

function assertValidateOnlyMode(mode: UpdateCampaignAssetsInput["mode"]): void {
  if (mode === "execute") {
    throw new Error(
      "updateCampaignAssets execute mode requires asset policy review, brand approval, and link baseline guardrails; use validate mode until apply-mode guards are implemented."
    );
  }
}

function assertNoPartialFailureForDependentTempAssetLinks(
  input: UpdateCampaignAssetsInput
): void {
  if (input.partialFailure === true) {
    const createdAssetResourceNames = new Set(
      input.assets?.map((asset) => asset.resourceName)
    );
    const hasDependentTempAssetLink = input.links?.some(
      (link) =>
        isTempAssetResourceName(link.assetResourceName) &&
        createdAssetResourceNames.has(link.assetResourceName)
    );

    if (hasDependentTempAssetLink) {
      throw new Error(
        "updateCampaignAssets does not support partialFailure when linking temp assets created in the same request."
      );
    }
  }
}
