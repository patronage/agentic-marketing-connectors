import type { GoogleAdsClient, MutateResult } from "../rest/index.js";
import {
  assertCustomerResourceMatches,
  assertNonEmptyArray,
  assertNonEmptyString,
  assertNumericId,
  assertResourceName,
  normalizeAndAssertCustomerId,
} from "./shared.js";
import type { WorkflowMode } from "./shared.js";

export type UserListMembershipStatus = "CLOSED" | "OPEN";

export interface ConversionUserListCreate {
  conversionActionIds: string[];
  description?: string;
  membershipLifeSpan: number;
  membershipStatus?: UserListMembershipStatus;
  name: string;
}

export interface AdGroupUserListAttachment {
  adGroupId: string;
  bidModifier?: number;
  negative?: boolean;
  status?: "ENABLED" | "PAUSED";
  userListResourceName: string;
}

export interface BuildAudienceSegmentOperationsInput {
  attachments?: AdGroupUserListAttachment[];
  customerId: string;
  userLists?: ConversionUserListCreate[];
}

export interface UpdateAudienceSegmentsInput extends BuildAudienceSegmentOperationsInput {
  mode?: WorkflowMode;
  partialFailure?: boolean;
}

export function buildAudienceSegmentOperations(
  input: BuildAudienceSegmentOperationsInput
): unknown[] {
  const customerId = normalizeAndAssertCustomerId(input.customerId);
  const operations = [
    ...buildUserListCreateOperations(customerId, input.userLists ?? []),
    ...buildAdGroupAttachmentOperations(customerId, input.attachments ?? []),
  ];

  assertNonEmptyArray(
    operations,
    "At least one user list create or ad group attachment is required."
  );

  return operations;
}

export async function updateAudienceSegments(
  client: GoogleAdsClient,
  input: UpdateAudienceSegmentsInput
): Promise<MutateResult> {
  assertValidateOnlyMode(input.mode);

  const result = await client.mutate({
    customerId: normalizeAndAssertCustomerId(input.customerId),
    operations: buildAudienceSegmentOperations(input),
    partialFailure: input.partialFailure,
    validateOnly: true,
  });

  return result;
}

function buildUserListCreateOperations(
  customerId: string,
  userLists: ConversionUserListCreate[]
): unknown[] {
  const seenNames = new Set<string>();

  return userLists.map((userList, userListIndex) => {
    const name = userList.name.trim();
    assertNonEmptyString(name, `userLists[${userListIndex}].name`);

    if (seenNames.has(name)) {
      throw new Error(`duplicate user list name: ${name}`);
    }
    seenNames.add(name);

    assertMembershipLifeSpan(
      userList.membershipLifeSpan,
      `userLists[${userListIndex}].membershipLifeSpan`
    );
    assertMembershipStatus(userList.membershipStatus);
    assertNonEmptyArray(
      userList.conversionActionIds,
      `userLists[${userListIndex}].conversionActionIds must not be empty.`
    );

    const seenConversionActionIds = new Set<string>();
    const actions = userList.conversionActionIds.map(
      (conversionActionId, conversionActionIndex) => {
        const fieldName =
          `userLists[${userListIndex}].conversionActionIds` +
          `[${conversionActionIndex}]`;
        assertNumericId(conversionActionId, fieldName);

        if (seenConversionActionIds.has(conversionActionId)) {
          throw new Error(
            `duplicate conversionActionId in user list ${name}: ${conversionActionId}`
          );
        }
        seenConversionActionIds.add(conversionActionId);

        return {
          conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
        };
      }
    );

    const description = normalizeOptionalDescription(
      userList.description,
      `userLists[${userListIndex}].description`
    );

    // Google Ads API v24 basic user list create contract:
    // https://developers.google.com/google-ads/api/samples/add-conversion-based-user-list
    return {
      userListOperation: {
        create: {
          basicUserList: { actions },
          ...(description === undefined ? {} : { description }),
          membershipLifeSpan: String(userList.membershipLifeSpan),
          membershipStatus: userList.membershipStatus ?? "OPEN",
          name,
        },
      },
    };
  });
}

function buildAdGroupAttachmentOperations(
  customerId: string,
  attachments: AdGroupUserListAttachment[]
): unknown[] {
  const seen = new Set<string>();

  return attachments.map((attachment, attachmentIndex) => {
    assertNumericId(
      attachment.adGroupId,
      `attachments[${attachmentIndex}].adGroupId`
    );
    assertUserListResourceName(
      attachment.userListResourceName,
      customerId,
      `attachments[${attachmentIndex}].userListResourceName`
    );
    assertAttachmentStatus(attachment.status);

    if (attachment.bidModifier !== undefined) {
      if (attachment.negative === true) {
        throw new Error(
          `attachments[${attachmentIndex}].bidModifier is not supported for negative criteria.`
        );
      }
      assertBidModifier(attachment.bidModifier, attachmentIndex);
    }

    const dedupeKey = `${attachment.adGroupId}:${attachment.userListResourceName}`;
    if (seen.has(dedupeKey)) {
      throw new Error(`duplicate ad group user list attachment: ${dedupeKey}`);
    }
    seen.add(dedupeKey);

    // Google Ads API v24 ad group user list criterion contract:
    // https://developers.google.com/google-ads/api/docs/remarketing/audience-segments/multiple-user-lists#target_the_list
    return {
      adGroupCriterionOperation: {
        create: {
          adGroup: `customers/${customerId}/adGroups/${attachment.adGroupId}`,
          ...(attachment.bidModifier === undefined
            ? {}
            : { bidModifier: attachment.bidModifier }),
          ...(attachment.negative === undefined
            ? {}
            : { negative: attachment.negative }),
          ...(attachment.status === undefined
            ? {}
            : { status: attachment.status }),
          userList: { userList: attachment.userListResourceName },
        },
      },
    };
  });
}

function assertMembershipLifeSpan(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 540) {
    throw new Error(`${fieldName} must be an integer between 0 and 540.`);
  }
}

function assertMembershipStatus(
  value: UserListMembershipStatus | undefined
): void {
  if (value !== undefined && value !== "CLOSED" && value !== "OPEN") {
    throw new Error(`Unsupported user list membershipStatus: ${value}`);
  }
}

function normalizeOptionalDescription(
  value: string | undefined,
  fieldName: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const description = value.trim();
  assertNonEmptyString(description, fieldName);
  return description;
}

function assertUserListResourceName(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  assertResourceName(
    resourceName,
    /^customers\/\d+\/userLists\/\d+$/u,
    fieldName
  );
  assertCustomerResourceMatches(resourceName, customerId, fieldName);
}

function assertAttachmentStatus(
  value: AdGroupUserListAttachment["status"]
): void {
  if (value !== undefined && value !== "ENABLED" && value !== "PAUSED") {
    throw new Error(`Unsupported ad group criterion status: ${value}`);
  }
}

function assertBidModifier(value: number, attachmentIndex: number): void {
  if (!Number.isFinite(value) || value < 0.1 || value > 10) {
    throw new Error(
      `attachments[${attachmentIndex}].bidModifier must be between 0.1 and 10.`
    );
  }
}

function assertValidateOnlyMode(
  mode: UpdateAudienceSegmentsInput["mode"]
): void {
  if (mode === "execute") {
    throw new Error(
      "updateAudienceSegments execute mode requires audience eligibility, targeting-level, consent, and existing-criterion baseline review; use validate mode until apply-mode guards are implemented."
    );
  }
}
