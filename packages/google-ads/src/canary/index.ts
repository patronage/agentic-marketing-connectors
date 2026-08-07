import type { GoogleAdsClient } from "../rest/index.js";

export interface GoogleAdsReadCanaryResult {
  operation: "campaigns" | "keywords" | "search-terms";
  rowCount?: number;
  status: "failed" | "passed";
  error?: { message: string; name: string };
}

const READ_QUERIES: readonly [
  GoogleAdsReadCanaryResult["operation"],
  string,
][] = [
  [
    "campaigns",
    "SELECT campaign.id, campaign.name, campaign.status FROM campaign LIMIT 1",
  ],
  [
    "keywords",
    "SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text FROM keyword_view LIMIT 1",
  ],
  [
    "search-terms",
    "SELECT search_term_view.search_term FROM search_term_view LIMIT 1",
  ],
];

export async function runGoogleAdsReadCanary(
  client: GoogleAdsClient,
  input: { customerId: string }
): Promise<GoogleAdsReadCanaryResult[]> {
  const results: GoogleAdsReadCanaryResult[] = [];
  for (const [operation, query] of READ_QUERIES) {
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- canary reads are serialized to respect provider quotas and attribute failures.
      const response = await client.search({
        customerId: input.customerId,
        query,
      });
      results.push({
        operation,
        rowCount: response.rows.length,
        status: "passed",
      });
    } catch (error) {
      results.push({
        error: safeError(error),
        operation,
        status: "failed",
      });
    }
  }
  return results;
}

function safeError(error: unknown): { message: string; name: string } {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: "Unknown provider error", name: "Error" };
}
