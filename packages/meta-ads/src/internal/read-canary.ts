import type { GetInsightsInput, MetaAdsClient } from "./meta-ads-client.js";

export const META_ADS_READ_VERIFICATION_MATRIX = [
  "getInsights",
  "listCustomAudiences",
  "listAdLabels",
  "listAutomatedRules",
  "listAdAccountActivities",
] as const;

export type MetaAdsReadCanaryOperation =
  (typeof META_ADS_READ_VERIFICATION_MATRIX)[number];

export interface MetaAdsReadCanaryResult {
  error?: { message: string; name: string };
  operation: MetaAdsReadCanaryOperation;
  status: "failed" | "passed";
}

type MetaAdsReadClient = Pick<
  MetaAdsClient,
  | "getInsights"
  | "listAdAccountActivities"
  | "listAdLabels"
  | "listAutomatedRules"
  | "listCustomAudiences"
>;

/** Exercises representative account reads without invoking a mutation method. */
export async function runMetaAdsReadCanary(
  client: MetaAdsReadClient,
  input: Pick<GetInsightsInput, "since" | "until">
): Promise<MetaAdsReadCanaryResult[]> {
  const handlers: Record<MetaAdsReadCanaryOperation, () => Promise<unknown>> = {
    getInsights: () => client.getInsights({ ...input, level: "campaign" }),
    listAdAccountActivities: () =>
      client.listAdAccountActivities({ maxResults: 1, pageSize: 1 }),
    listAdLabels: () => client.listAdLabels({ maxResults: 1, pageSize: 1 }),
    listAutomatedRules: () =>
      client.listAutomatedRules({ maxResults: 1, pageSize: 1 }),
    listCustomAudiences: () => client.listCustomAudiences(),
  };

  const results: MetaAdsReadCanaryResult[] = [];
  for (const operation of META_ADS_READ_VERIFICATION_MATRIX) {
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- live canaries are serialized to remain low impact.
      await handlers[operation]();
      results.push({ operation, status: "passed" });
    } catch (error) {
      results.push({ error: safeError(error), operation, status: "failed" });
    }
  }
  return results;
}

function safeError(error: unknown): { message: string; name: string } {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: String(error), name: "UnknownError" };
}
