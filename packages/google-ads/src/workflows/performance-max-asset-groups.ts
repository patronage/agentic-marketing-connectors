import type { GoogleAdsClient } from "../rest/index.js";
import {
  assertNonEmptyArray,
  assertNonEmptyString,
  assertNumericId,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export type PerformanceMaxAssetGroupStatus = "ENABLED" | "PAUSED" | "REMOVED";

export type PerformanceMaxAssetFieldType =
  | "DESCRIPTION"
  | "HEADLINE"
  | "LONG_HEADLINE"
  | "MARKETING_IMAGE"
  | "PORTRAIT_MARKETING_IMAGE"
  | "SQUARE_MARKETING_IMAGE"
  | "YOUTUBE_VIDEO";

export interface PerformanceMaxAssetGroupCreate {
  campaignId: string;
  finalMobileUrls?: string[];
  finalUrls: string[];
  name: string;
  resourceName: string;
  status?: PerformanceMaxAssetGroupStatus;
}

export interface PerformanceMaxTextAssetCreate {
  fieldType: "DESCRIPTION" | "HEADLINE" | "LONG_HEADLINE";
  name?: string;
  resourceName: string;
  text: string;
}

export interface PerformanceMaxAssetGroupAssetLink {
  assetGroupResourceName: string;
  assetResourceName: string;
  fieldType: PerformanceMaxAssetFieldType;
}

export interface BuildPerformanceMaxAssetGroupOperationsInput {
  assetGroups?: PerformanceMaxAssetGroupCreate[];
  customerId: string;
  links: PerformanceMaxAssetGroupAssetLink[];
  textAssets?: PerformanceMaxTextAssetCreate[];
}

export interface DeployPerformanceMaxAssetGroupsInput extends BuildPerformanceMaxAssetGroupOperationsInput {
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildPerformanceMaxAssetGroupOperations(
  input: BuildPerformanceMaxAssetGroupOperationsInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  const assetGroupCreates = normalizeAssetGroupCreates(
    customerId,
    input.assetGroups ?? []
  );
  const textAssetCreates = normalizeTextAssetCreates(
    customerId,
    input.textAssets ?? []
  );
  const links = normalizeAssetGroupAssetLinks(customerId, input.links, {
    assetGroupResourceNames: new Set(
      assetGroupCreates.map((assetGroup) => assetGroup.resourceName)
    ),
    textAssetResourceNames: new Set(
      textAssetCreates.map((asset) => asset.resourceName)
    ),
  });

  return [
    ...assetGroupCreates.map((assetGroup) => ({
      assetGroupOperation: { create: assetGroup },
    })),
    ...textAssetCreates.map((asset) => ({
      assetOperation: { create: asset },
    })),
    ...links.map((link) => ({
      assetGroupAssetOperation: { create: link },
    })),
  ];
}

export async function deployPerformanceMaxAssetGroups(
  client: GoogleAdsClient,
  input: DeployPerformanceMaxAssetGroupsInput
) {
  assertValidateOnlyMode(input.mode);
  assertNoPartialFailure(input.partialFailure);

  return client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildPerformanceMaxAssetGroupOperations(input),
    partialFailure: false,
    validateOnly: true,
  });
}

function normalizeAssetGroupCreates(
  customerId: string,
  assetGroups: PerformanceMaxAssetGroupCreate[]
): (Record<string, unknown> & { resourceName: string })[] {
  const seen = new Set<string>();

  return assetGroups.map((assetGroup) => {
    assertTempAssetGroupResourceName(
      assetGroup.resourceName,
      customerId,
      "assetGroup.resourceName"
    );
    assertNumericId(assetGroup.campaignId, "campaignId");

    if (seen.has(assetGroup.resourceName)) {
      throw new Error(`duplicate asset group: ${assetGroup.resourceName}`);
    }
    seen.add(assetGroup.resourceName);

    const name = normalizedText(assetGroup.name, "assetGroup.name", 128);
    const finalUrls = normalizeUrls(assetGroup.finalUrls, "finalUrls");
    const finalMobileUrls = assetGroup.finalMobileUrls
      ? normalizeUrls(assetGroup.finalMobileUrls, "finalMobileUrls")
      : undefined;

    if (assetGroup.status !== undefined) {
      assertAssetGroupStatus(assetGroup.status);
    }

    return {
      campaign: `customers/${customerId}/campaigns/${assetGroup.campaignId}`,
      ...(finalMobileUrls ? { finalMobileUrls } : {}),
      finalUrls,
      name,
      resourceName: assetGroup.resourceName,
      status: assetGroup.status ?? "PAUSED",
    };
  });
}

function normalizeTextAssetCreates(
  customerId: string,
  assets: PerformanceMaxTextAssetCreate[]
): (Record<string, unknown> & { resourceName: string })[] {
  const seen = new Set<string>();

  return assets.map((asset) => {
    assertTempAssetResourceName(
      asset.resourceName,
      customerId,
      "textAsset.resourceName"
    );
    assertPerformanceMaxTextFieldType(asset.fieldType);

    if (seen.has(asset.resourceName)) {
      throw new Error(`duplicate text asset: ${asset.resourceName}`);
    }
    seen.add(asset.resourceName);

    const text = normalizedText(
      asset.text,
      "textAsset.text",
      textLimitForFieldType(asset.fieldType)
    );

    return {
      name: asset.name?.trim() || `${asset.fieldType}: ${text}`,
      resourceName: asset.resourceName,
      textAsset: { text },
    };
  });
}

function normalizeAssetGroupAssetLinks(
  customerId: string,
  links: PerformanceMaxAssetGroupAssetLink[],
  tempResources: {
    assetGroupResourceNames: ReadonlySet<string>;
    textAssetResourceNames: ReadonlySet<string>;
  }
): {
  asset: string;
  assetGroup: string;
  fieldType: PerformanceMaxAssetFieldType;
}[] {
  assertNonEmptyArray(
    links,
    "At least one asset group asset link is required."
  );

  const seen = new Set<string>();

  return links.map((link) => {
    assertAssetGroupResourceName(
      link.assetGroupResourceName,
      customerId,
      "assetGroupResourceName"
    );
    assertAssetResourceName(
      link.assetResourceName,
      customerId,
      "assetResourceName"
    );
    assertPerformanceMaxAssetFieldType(link.fieldType);

    if (
      isTempAssetGroupResourceName(link.assetGroupResourceName) &&
      !tempResources.assetGroupResourceNames.has(link.assetGroupResourceName)
    ) {
      throw new Error(
        "negative temp asset group links require a matching asset group create in the same request."
      );
    }

    if (
      isTempAssetResourceName(link.assetResourceName) &&
      !tempResources.textAssetResourceNames.has(link.assetResourceName)
    ) {
      throw new Error(
        "negative temp asset links require a matching text asset create in the same request."
      );
    }

    if (
      isTempAssetResourceName(link.assetResourceName) &&
      !isPerformanceMaxTextFieldType(link.fieldType)
    ) {
      throw new Error(
        "negative temp text assets can only be linked to text-compatible PMax field types."
      );
    }

    const dedupeKey = `${link.assetGroupResourceName}:${link.assetResourceName}:${link.fieldType}`;
    if (seen.has(dedupeKey)) {
      throw new Error(`duplicate asset group asset link: ${dedupeKey}`);
    }
    seen.add(dedupeKey);

    return {
      asset: link.assetResourceName,
      assetGroup: link.assetGroupResourceName,
      fieldType: link.fieldType,
    };
  });
}

function assertAssetGroupResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertResourceName(
    resourceName,
    /^customers\/\d+\/assetGroups\/-?\d+$/u,
    fieldName
  );

  if (!resourceName.startsWith(`customers/${customerId}/`)) {
    throw new Error(`${fieldName} must belong to customer ${customerId}.`);
  }
}

function assertTempAssetGroupResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertAssetGroupResourceName(resourceName, customerId, fieldName);

  if (!isTempAssetGroupResourceName(resourceName)) {
    throw new Error(`${fieldName} must use a negative asset group temp ID.`);
  }
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

function isTempAssetGroupResourceName(resourceName: string): boolean {
  return /\/assetGroups\/-[1-9]\d*$/u.test(resourceName);
}

function isTempAssetResourceName(resourceName: string): boolean {
  return /\/assets\/-[1-9]\d*$/u.test(resourceName);
}

function assertAssetGroupStatus(status: PerformanceMaxAssetGroupStatus): void {
  if (!(status === "ENABLED" || status === "PAUSED" || status === "REMOVED")) {
    throw new Error(`Unsupported asset group status: ${status}`);
  }
}

function assertPerformanceMaxAssetFieldType(
  fieldType: PerformanceMaxAssetFieldType
): void {
  if (
    !(
      fieldType === "HEADLINE" ||
      fieldType === "LONG_HEADLINE" ||
      fieldType === "DESCRIPTION" ||
      fieldType === "MARKETING_IMAGE" ||
      fieldType === "SQUARE_MARKETING_IMAGE" ||
      fieldType === "PORTRAIT_MARKETING_IMAGE" ||
      fieldType === "YOUTUBE_VIDEO"
    )
  ) {
    throw new Error(
      `Unsupported Performance Max asset fieldType: ${fieldType}`
    );
  }
}

function assertPerformanceMaxTextFieldType(
  fieldType: PerformanceMaxTextAssetCreate["fieldType"]
): void {
  if (
    !(
      fieldType === "HEADLINE" ||
      fieldType === "LONG_HEADLINE" ||
      fieldType === "DESCRIPTION"
    )
  ) {
    throw new Error(`Unsupported Performance Max text fieldType: ${fieldType}`);
  }
}

function isPerformanceMaxTextFieldType(
  fieldType: PerformanceMaxAssetFieldType
): boolean {
  return (
    fieldType === "HEADLINE" ||
    fieldType === "LONG_HEADLINE" ||
    fieldType === "DESCRIPTION"
  );
}

function textLimitForFieldType(
  fieldType: PerformanceMaxTextAssetCreate["fieldType"]
): number {
  if (fieldType === "HEADLINE") {
    return 30;
  }

  return 90;
}

function normalizeUrls(values: string[], fieldName: string): string[] {
  assertNonEmptyArray(values, `${fieldName} must not be empty.`);

  return values.map((value, index) =>
    normalizedUrl(value, `${fieldName}[${index}]`)
  );
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

function assertValidateOnlyMode(
  mode: DeployPerformanceMaxAssetGroupsInput["mode"]
): void {
  if (mode === "execute") {
    throw new Error(
      "deployPerformanceMaxAssetGroups execute mode requires PMax asset policy review, brand approval, and asset group baseline guardrails; use validate mode until apply-mode guards are implemented."
    );
  }
}

function assertNoPartialFailure(
  partialFailure: DeployPerformanceMaxAssetGroupsInput["partialFailure"]
): void {
  if (partialFailure === true) {
    throw new Error(
      "deployPerformanceMaxAssetGroups does not support partialFailure because asset group operations can depend on temp IDs."
    );
  }
}
