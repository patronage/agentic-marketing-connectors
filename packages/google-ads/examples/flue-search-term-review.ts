import { createGoogleAdsClient } from "../src/index.js";
import type { GoogleAdsClient } from "../src/index.js";
import { getSearchTerms } from "../src/reports/index.js";
import type { SearchTermMetrics } from "../src/reports/index.js";
import {
  addCampaignNegativeKeywords,
  buildCampaignNegativeKeywordOperations,
} from "../src/workflows/negative-keywords.js";

export interface SearchTermReview {
  campaignId: string;
  customerId: string;
  recommendations: {
    cost: number;
    matchType: "PHRASE";
    searchTerm: string;
    text: string;
  }[];
  status: "draft" | "provider-validated";
  validation?: {
    operationCount: number;
    requestId: string | null;
    validateOnly: true;
  };
}

export interface FlueWorkflowDefinition<TInput, TOutput> {
  run: (context: { input: TInput }) => Promise<TOutput>;
}

export type DefineFlueWorkflow = <TInput, TOutput>(
  definition: FlueWorkflowDefinition<TInput, TOutput>
) => unknown;

/**
 * Registers the connector task with Flue without making the provider package
 * depend on Flue. The Flue application passes its own `defineWorkflow`.
 */
export function registerFlueSearchTermReview(
  defineWorkflow: DefineFlueWorkflow,
  client: GoogleAdsClient
) {
  return defineWorkflow<
    { campaignId: string; customerId: string },
    SearchTermReview
  >({
    async run({ input }) {
      const draft = await buildSearchTermReview(client, input);
      return validateSearchTermReview(client, draft);
    },
  });
}

export async function buildSearchTermReview(
  client: GoogleAdsClient,
  input: { campaignId: string; customerId: string }
): Promise<SearchTermReview> {
  const rows = await getSearchTerms(client, {
    campaignId: input.campaignId,
    customerId: input.customerId,
    days: 30,
  });

  return {
    ...input,
    recommendations: recommendNegativeKeywords(rows),
    status: "draft",
  };
}

export async function validateSearchTermReview(
  client: GoogleAdsClient,
  review: SearchTermReview
): Promise<SearchTermReview> {
  const keywords = review.recommendations.map(({ matchType, text }) => ({
    matchType,
    text,
  }));
  const operations = buildCampaignNegativeKeywordOperations({
    campaignId: review.campaignId,
    customerId: review.customerId,
    keywords,
  });
  const result = await addCampaignNegativeKeywords(client, {
    campaignId: review.campaignId,
    customerId: review.customerId,
    keywords,
    mode: "validate",
  });

  return {
    ...review,
    status: "provider-validated",
    validation: {
      operationCount: operations.length,
      requestId: result.requestId,
      validateOnly: true,
    },
  };
}

/** Runs the same task core a Flue workflow composes, without live credentials. */
export async function runSyntheticFlueSearchTermReview() {
  const client = createSyntheticClient();
  return validateSearchTermReview(
    client,
    await buildSearchTermReview(client, {
      campaignId: "987654321",
      customerId: "1234567890",
    })
  );
}

function recommendNegativeKeywords(rows: SearchTermMetrics[]) {
  return rows
    .filter(({ conversions, cost }) => conversions === 0 && cost >= 75)
    .map(({ cost, searchTerm }) => ({
      cost,
      matchType: "PHRASE" as const,
      searchTerm,
      text: searchTerm.toLocaleLowerCase(),
    }));
}

function createSyntheticClient() {
  return createGoogleAdsClient({
    auth: {
      getAccessToken() {
        return Promise.resolve("synthetic-access-token");
      },
    },
    developerToken: "synthetic-developer-token",
    fetch: (url, init) => {
      const { pathname } = new URL(String(url));
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query?: string;
        validateOnly?: boolean;
      };
      if (pathname.endsWith("googleAds:search")) {
        return Promise.resolve(
          Response.json({
            results: [
              searchTermRow("free grant templates", "125000000"),
              searchTermRow("nonprofit marketing agency", "85000000", "2"),
            ],
          })
        );
      }
      if (pathname.endsWith("googleAds:mutate") && body.validateOnly === true) {
        return Promise.resolve(
          Response.json(
            { mutateOperationResponses: [] },
            { headers: { "request-id": "tutorial-validate-001" } }
          )
        );
      }
      return Promise.resolve(
        Response.json(
          { error: { message: "Unexpected tutorial request." } },
          { status: 400 }
        )
      );
    },
  });
}

function searchTermRow(
  searchTerm: string,
  costMicros: string,
  conversions = "0"
) {
  return {
    adGroup: { id: "222", name: "General" },
    campaign: { id: "987654321", name: "Nonprofit search" },
    metrics: {
      clicks: "10",
      conversions,
      costMicros,
      impressions: "100",
    },
    searchTermView: { searchTerm, status: "NONE" },
  };
}
