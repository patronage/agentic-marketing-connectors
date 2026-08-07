import { microsToCurrency } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export const GRANT_LIMITS = {
  maxCpc: 2,
  minCtr: 0.05,
  minPerCampaign: 2,
  minQualityScore: 3,
} as const;
export const ALLOWED_SINGLE_WORD_KEYWORDS = new Set(["eitc"]);
export type ComplianceCheckName =
  | "ad-groups"
  | "conversion"
  | "cpc"
  | "ctr"
  | "quality"
  | "single-word"
  | "sitelinks";
export interface ComplianceResult {
  check: ComplianceCheckName;
  details: string[];
  message: string;
  passed: boolean;
  severity: "error" | "info" | "warning";
}

const ALL_CHECKS: ComplianceCheckName[] = [
  "ctr",
  "conversion",
  "cpc",
  "quality",
  "single-word",
  "ad-groups",
  "sitelinks",
];

export function runComplianceChecks(
  client: GoogleAdsClient,
  input: { checks?: ComplianceCheckName[]; customerId: string }
): Promise<ComplianceResult[]> {
  return Promise.all(
    (input.checks?.length ? input.checks : ALL_CHECKS).map((check) =>
      runComplianceCheck(client, input.customerId, check)
    )
  );
}

function runComplianceCheck(
  client: GoogleAdsClient,
  customerId: string,
  check: ComplianceCheckName
): Promise<ComplianceResult> {
  switch (check) {
    case "ctr": {
      return checkCtr(client, customerId);
    }
    case "conversion": {
      return checkConversions(client, customerId);
    }
    case "cpc": {
      return checkCpc(client, customerId);
    }
    case "quality": {
      return checkQuality(client, customerId);
    }
    case "single-word": {
      return checkSingleWords(client, customerId);
    }
    case "ad-groups": {
      return checkMinimumPerCampaign(client, customerId, "ad-groups");
    }
    case "sitelinks": {
      return checkMinimumPerCampaign(client, customerId, "sitelinks");
    }
    default: {
      throw new Error(`Unsupported compliance check: ${check}`);
    }
  }
}

async function checkCtr(
  client: GoogleAdsClient,
  customerId: string
): Promise<ComplianceResult> {
  const response = await client.search({
    customerId,
    query:
      "SELECT customer.id, metrics.impressions, metrics.clicks FROM customer WHERE segments.date DURING LAST_30_DAYS",
  });
  const { rows } = response;
  const impressions = rows.reduce(
    (sum, row) => sum + number(record(row.metrics).impressions),
    0
  );
  const clicks = rows.reduce(
    (sum, row) => sum + number(record(row.metrics).clicks),
    0
  );
  const ctr = impressions ? clicks / impressions : 0;
  const passed = ctr >= GRANT_LIMITS.minCtr;
  return result(
    "ctr",
    passed,
    passed
      ? "Account CTR meets the 5% minimum"
      : "Account CTR is below 5% — grant at risk",
    "error",
    [
      `Impressions: ${impressions}`,
      `Clicks: ${clicks}`,
      `CTR: ${(ctr * 100).toFixed(2)}%`,
    ]
  );
}

async function checkConversions(
  client: GoogleAdsClient,
  customerId: string
): Promise<ComplianceResult> {
  const response = await client.search({
    customerId,
    query:
      "SELECT conversion_action.name, conversion_action.type, conversion_action.status FROM conversion_action WHERE conversion_action.status = 'ENABLED'",
  });
  const { rows } = response;
  const details = rows.map((row) => {
    const action = record(row.conversionAction ?? row.conversion_action);
    return `${action.name ?? "Unnamed"} (${action.type ?? "unknown"})`;
  });
  return result(
    "conversion",
    rows.length > 0,
    rows.length
      ? `${rows.length} enabled conversion action(s)`
      : "No enabled conversion tracking detected",
    "error",
    details
  );
}

async function checkCpc(
  client: GoogleAdsClient,
  customerId: string
): Promise<ComplianceResult> {
  const response = await client.search({
    customerId,
    query:
      "SELECT campaign.name, campaign.status, ad_group.name, ad_group.status, ad_group_criterion.keyword.text, ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.negative, ad_group_criterion.status FROM keyword_view WHERE campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE",
  });
  const { rows } = response;
  const offenders = rows.flatMap((row) => {
    const criterion = record(row.adGroupCriterion ?? row.ad_group_criterion);
    const micros = number(
      criterion.effectiveCpcBidMicros ?? criterion.effective_cpc_bid_micros
    );
    if (micros <= GRANT_LIMITS.maxCpc * 1_000_000) {
      return [];
    }
    const keyword = record(criterion.keyword);
    return [
      `${keyword.text ?? "Unknown"} ($${microsToCurrency(micros).toFixed(2)}) in ${campaignLabel(row)}`,
    ];
  });
  return result(
    "cpc",
    offenders.length === 0,
    offenders.length
      ? `${offenders.length} keyword(s) exceed the $2.00 CPC cap`
      : "All keyword bids are within the $2.00 cap",
    "error",
    offenders
  );
}

async function checkQuality(
  client: GoogleAdsClient,
  customerId: string
): Promise<ComplianceResult> {
  const response = await client.search({
    customerId,
    query:
      "SELECT campaign.name, campaign.status, ad_group.name, ad_group.status, ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, ad_group_criterion.negative, ad_group_criterion.status FROM keyword_view WHERE campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE",
  });
  const { rows } = response;
  const offenders = rows.flatMap((row) => {
    const criterion = record(row.adGroupCriterion ?? row.ad_group_criterion);
    const score = nullableNumber(
      record(criterion.qualityInfo ?? criterion.quality_info).qualityScore ??
        record(criterion.quality_info).quality_score
    );
    if (score === null || score >= GRANT_LIMITS.minQualityScore) {
      return [];
    }
    return [
      `${record(criterion.keyword).text ?? "Unknown"} (QS ${score}) in ${campaignLabel(row)}`,
    ];
  });
  return result(
    "quality",
    offenders.length === 0,
    offenders.length
      ? `${offenders.length} keyword(s) have Quality Score below 3`
      : "All scored keywords have Quality Score 3 or higher",
    "warning",
    offenders
  );
}

async function checkSingleWords(
  client: GoogleAdsClient,
  customerId: string
): Promise<ComplianceResult> {
  const response = await client.search({
    customerId,
    query:
      "SELECT campaign.name, campaign.status, ad_group.name, ad_group.status, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative, ad_group_criterion.status FROM keyword_view WHERE campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE",
  });
  const { rows } = response;
  const offenders = rows.flatMap((row) => {
    const criterion = record(row.adGroupCriterion ?? row.ad_group_criterion);
    if (criterion.negative === true) {
      return [];
    }
    const keyword = record(criterion.keyword);
    const text = String(keyword.text ?? "").trim();
    if (
      !text ||
      /\s/u.test(text) ||
      ALLOWED_SINGLE_WORD_KEYWORDS.has(text.toLowerCase())
    ) {
      return [];
    }
    return [
      `"${text}" [${keyword.matchType ?? keyword.match_type ?? "UNKNOWN"}] in ${campaignLabel(row)}`,
    ];
  });
  return result(
    "single-word",
    offenders.length === 0,
    offenders.length
      ? `${offenders.length} prohibited single-word keyword(s)`
      : "No prohibited single-word keywords",
    "warning",
    offenders
  );
}

async function checkMinimumPerCampaign(
  client: GoogleAdsClient,
  customerId: string,
  check: "ad-groups" | "sitelinks"
): Promise<ComplianceResult> {
  const query =
    check === "ad-groups"
      ? "SELECT campaign.id, campaign.name, campaign.status, ad_group.id, ad_group.status FROM ad_group WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'"
      : "SELECT campaign.id, campaign.name, campaign.status, campaign_asset.asset, campaign_asset.field_type FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.field_type = 'SITELINK'";
  const campaignsResponse = await client.search({
    customerId,
    query:
      "SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status = 'ENABLED'",
  });
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- these stateful operations intentionally preserve observable ordering; tracked in #684
  const response = await client.search({ customerId, query });
  const { rows } = response;
  const counts = new Map<string, { count: number; name: string }>();
  for (const row of campaignsResponse.rows) {
    const campaign = record(row.campaign);
    const id = String(campaign.id ?? "");
    counts.set(id, { count: 0, name: String(campaign.name ?? id) });
  }
  for (const row of rows) {
    const campaign = record(row.campaign);
    const id = String(campaign.id ?? "");
    const current = counts.get(id) ?? {
      count: 0,
      name: String(campaign.name ?? id),
    };
    current.count += 1;
    counts.set(id, current);
  }
  const offenders = [...counts.values()].flatMap(({ count, name }) =>
    count < GRANT_LIMITS.minPerCampaign ? [`${name}: ${count} ${check}`] : []
  );
  return result(
    check,
    offenders.length === 0 && counts.size > 0,
    offenders.length
      ? `${offenders.length} campaign(s) have fewer than 2 ${check}`
      : `Every active campaign has at least 2 ${check}`,
    "error",
    offenders
  );
}

function result(
  check: ComplianceCheckName,
  passed: boolean,
  message: string,
  failureSeverity: "error" | "warning",
  details: string[]
): ComplianceResult {
  return {
    check,
    details,
    message,
    passed,
    severity: passed ? "info" : failureSeverity,
  };
}
/**
 * Name the campaign an offending keyword sits in, flagging it when it is not
 * serving.
 *
 * Paused campaigns stay in scope on purpose — pausing is one click from
 * serving — but an unlabelled paused offender reads exactly like a live one,
 * which is the same confusion that let removed campaigns be reported as live
 * violations.
 */
function campaignLabel(row: Record<string, unknown>): string {
  const campaign = record(row.campaign);
  const adGroup = record(row.adGroup ?? row.ad_group);
  const name = campaign.name ?? "Unknown";
  if (campaign.status === "PAUSED") {
    return `${name} (paused campaign)`;
  }

  if (adGroup.status === "PAUSED") {
    return `${name} (paused ad group)`;
  }

  return String(name);
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return number(value);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
