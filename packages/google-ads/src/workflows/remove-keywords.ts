import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export type KeywordScope = "negative" | "positive";

export interface RemoveKeywordCriterion {
  adGroupId: string;
  criterionId: string;
  matchType?: string;
  /**
   * Whether the criterion is a negative keyword, as read from the account.
   * Callers must supply this from the source row rather than assume it.
   */
  negative: boolean;
  text?: string;
}

export interface RemoveKeywordsInput {
  criteria: RemoveKeywordCriterion[];
  customerId: string;
  /**
   * The kind of keyword the caller intends to remove. Every criterion must
   * match, or nothing is removed.
   */
  expect: KeywordScope;
  mode?: "execute" | "validate";
}

/**
 * Build ad group criterion remove operations.
 *
 * Removal is not reversible, and `keyword_view` returns positive and negative
 * criteria together — a read without a `negative` filter looks identical to one
 * with it. So the scope is declared explicitly and every criterion is checked
 * against it: asking to remove positives and passing a negative is an error,
 * not a silent deletion of a negative keyword list.
 */
export function buildRemoveKeywordsOperations(
  input: RemoveKeywordsInput
): unknown[] {
  const customerId = normalizeCustomerId(input.customerId);

  assertNumericId(customerId, "customerId");

  if (input.criteria.length === 0) {
    throw new Error("At least one criterion is required.");
  }

  if (!(input.expect === "positive" || input.expect === "negative")) {
    throw new Error(
      `expect must be "positive" or "negative", received: ${input.expect}`
    );
  }

  const wantNegative = input.expect === "negative";
  const mismatched = input.criteria.filter(
    (criterion) => criterion.negative !== wantNegative
  );

  if (mismatched.length > 0) {
    const found = wantNegative ? "positive" : "negative";
    const listed = mismatched
      .map((criterion) => criterion.text ?? criterion.criterionId)
      .join(", ");

    throw new Error(
      `Refusing to remove: expected ${input.expect} keywords but ${mismatched.length} of ${input.criteria.length} are ${found} (${listed}). Re-read the criteria with an explicit negative filter, or pass expect: "${found}".`
    );
  }

  const seen = new Set<string>();

  return input.criteria.map((criterion) => {
    assertNumericId(criterion.adGroupId, "adGroupId");
    assertNumericId(criterion.criterionId, "criterionId");

    const resourceName = `customers/${customerId}/adGroupCriteria/${criterion.adGroupId}~${criterion.criterionId}`;

    if (seen.has(resourceName)) {
      throw new Error(`duplicate criterion: ${resourceName}`);
    }

    seen.add(resourceName);

    return { adGroupCriterionOperation: { remove: resourceName } };
  });
}

/**
 * Read each criterion's actual `negative` value from the account.
 *
 * The declared scope is only worth as much as the data behind it. A caller that
 * does not know whether a criterion is negative will guess, and guessing is the
 * incident this command exists to prevent — so the account is the authority,
 * not the caller.
 *
 * Scoped to `type = 'KEYWORD'`: a non-keyword criterion (an audience, an age
 * range) carries `negative: false` and would otherwise pass a positive-scope
 * check. Excluding it here makes it read as unverifiable rather than safe.
 */
export async function readActualKeywordScopes(
  client: GoogleAdsClient,
  customerId: string,
  criteria: RemoveKeywordCriterion[]
): Promise<Map<string, boolean>> {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  const ids = [...new Set(criteria.map((c) => c.criterionId))];

  assertNumericId(normalizedCustomerId, "customerId");
  if (criteria.length === 0) {
    throw new Error("At least one criterion is required.");
  }
  for (const criterion of criteria) {
    assertNumericId(criterion.adGroupId, "adGroupId");
    assertNumericId(criterion.criterionId, "criterionId");
  }

  const actual = new Map<string, boolean>();

  const positiveKeys = await readKeywordScopeKeys(
    client,
    normalizedCustomerId,
    ids,
    false
  );
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- Keep provider scope reads ordered and low-volume before an irreversible mutation.
  const negativeKeys = await readKeywordScopeKeys(
    client,
    normalizedCustomerId,
    ids,
    true
  );

  for (const key of positiveKeys) {
    actual.set(key, false);
  }
  for (const key of negativeKeys) {
    if (actual.has(key)) {
      throw new Error(
        `Google Ads returned criterion ${key} in both positive and negative scope queries.`
      );
    }
    actual.set(key, true);
  }

  return actual;
}

async function readKeywordScopeKeys(
  client: GoogleAdsClient,
  customerId: string,
  criterionIds: string[],
  negative: boolean
): Promise<Set<string>> {
  const keys = new Set<string>();
  let pageToken: string | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- Each request needs the preceding page token and scope reads must complete before mutation.
    const response = await client.search({
      customerId,
      ...(pageToken ? { pageToken } : {}),
      query: `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.negative, ad_group_criterion.type FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.criterion_id IN (${criterionIds.join(",")}) AND ad_group_criterion.negative = ${negative ? "TRUE" : "FALSE"}`,
    });

    for (const row of response.rows) {
      const criterion = (row.adGroupCriterion ?? row.ad_group_criterion) as
        | Record<string, unknown>
        | undefined;
      const adGroup = (row.adGroup ?? row.ad_group) as
        | Record<string, unknown>
        | undefined;
      const criterionId = String(
        criterion?.criterionId ?? criterion?.criterion_id ?? ""
      );
      const adGroupId = String(adGroup?.id ?? "");

      if (!(criterionId && adGroupId)) {
        continue;
      }

      const key = `${adGroupId}~${criterionId}`;
      const returnedNegative = criterion?.negative;
      const invalidScopeValue = negative
        ? returnedNegative !== true
        : returnedNegative !== undefined && returnedNegative !== false;
      if (invalidScopeValue) {
        throw new Error(
          `Google Ads ${negative ? "negative" : "positive"} scope query returned an invalid negative value for criterion ${key}.`
        );
      }
      keys.add(key);
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return keys;
}

export async function removeKeywords(
  client: GoogleAdsClient,
  input: RemoveKeywordsInput
) {
  // Validate every local invariant before making a provider request. Retain the
  // exact operations so validation and execution cannot drift.
  const operations = buildRemoveKeywordsOperations(input);
  const actual = await readActualKeywordScopes(
    client,
    input.customerId,
    input.criteria
  );
  const wantNegative = input.expect === "negative";
  const unknown: string[] = [];
  const contradicted: string[] = [];

  for (const criterion of input.criteria) {
    const key = `${criterion.adGroupId}~${criterion.criterionId}`;
    const label = criterion.text ?? key;

    if (!actual.has(key)) {
      unknown.push(label);
      continue;
    }

    if (actual.get(key) !== wantNegative) {
      contradicted.push(label);
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `Refusing to remove: ${unknown.length} criterion(s) were not found in the account, so their scope cannot be verified (${unknown.join(", ")}).`
    );
  }

  if (contradicted.length > 0) {
    const found = wantNegative ? "positive" : "negative";

    throw new Error(
      `Refusing to remove: the account reports ${contradicted.length} of ${input.criteria.length} criterion(s) as ${found}, not ${input.expect} (${contradicted.join(", ")}). The declared scope does not match the account.`
    );
  }

  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations,
    partialFailure: false,
    validateOnly: input.mode !== "execute",
  });
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}
