import {
  createGoogleAdsClient,
  type GoogleAdsClient,
  type MutateResult,
} from "@patronage/google-ads";
import {
  microsToCurrency,
  type GoogleAdsRow,
} from "@patronage/google-ads/core";
import { addCampaignNegativeKeywords } from "@patronage/google-ads/workflows/negative-keywords";
import { z } from "zod";

export interface CustomToolRunContext {
  env: unknown;
}

export interface CustomToolDefinition<InputSchema extends z.ZodTypeAny> {
  description: string;
  inputSchema: InputSchema;
  name: string;
  run(
    input: z.output<InputSchema>,
    context: CustomToolRunContext
  ): Promise<string> | string;
}

const negativeKeywordOptimizationInputSchema = z.object({
  campaignId: z
    .string()
    .min(1)
    .default("111222333")
    .describe("Google Ads campaign ID to optimize."),
  customerId: z
    .string()
    .min(1)
    .default("123-456-7890")
    .describe("Google Ads customer ID with or without dashes."),
  dateRange: z
    .enum(["LAST_7_DAYS", "LAST_30_DAYS"])
    .default("LAST_7_DAYS")
    .describe("Search-term window to inspect before proposing action."),
  maxRecommendations: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe("Maximum negative keywords to propose for approval."),
});

type NegativeKeywordOptimizationInput = z.output<
  typeof negativeKeywordOptimizationInputSchema
>;

interface SearchTermEvidence {
  clicks: number;
  conversions: number;
  searchTerm: string;
  spend: number;
}

interface OptimizationContext {
  campaignId: string;
  campaignName: string | null;
  customerId: string;
  requestId: string | null;
  searchTerms: SearchTermEvidence[];
}

interface NegativeKeywordRecommendation {
  evidence: {
    clicks: number;
    conversions: number;
    spend: number;
  };
  keyword: {
    matchType: "PHRASE";
    text: string;
  };
  reason: string;
}

const demoCampaignId = "111222333";
const demoCustomerId = "123-456-7890";
const syntheticCampaignName = "Brand Search - US";
const syntheticSearchTerms = [
  {
    clicks: 31,
    conversions: 0,
    costMicros: "186420000",
    searchTerm: "free campaign signs",
  },
  {
    clicks: 22,
    conversions: 0,
    costMicros: "128360000",
    searchTerm: "political jobs",
  },
  {
    clicks: 18,
    conversions: 0,
    costMicros: "91450000",
    searchTerm: "candidate wikipedia",
  },
  {
    clicks: 41,
    conversions: 7,
    costMicros: "221760000",
    searchTerm: "donate to climate campaign",
  },
];

export function patronageGoogleAdsOptimizationTool<Tool>(
  defineTool: <InputSchema extends z.ZodTypeAny>(
    tool: CustomToolDefinition<InputSchema>
  ) => Tool
): Tool {
  return defineTool({
    name: "patronage_google_ads_negative_keyword_optimizer",
    description:
      "Use Patronage Google Ads connectors to propose and validate negative keyword optimizations for approval.",
    inputSchema: negativeKeywordOptimizationInputSchema,
    run: async (input) => {
      const client = createDemoClient();
      const context = await fetchSearchTermWasteContext(
        client,
        input.customerId,
        input.campaignId,
        input.dateRange
      );
      const recommendations = buildNegativeKeywordRecommendations(
        context.searchTerms,
        input.maxRecommendations
      );
      const validation = await validateNegativeKeywordAction(
        client,
        input,
        recommendations
      );

      return JSON.stringify(
        buildGovernedOptimizationPlan(
          input,
          context,
          recommendations,
          validation
        ),
        null,
        2
      );
    },
  });
}

export function searchTermWasteQuery(
  campaignId: string,
  dateRange: NegativeKeywordOptimizationInput["dateRange"]
) {
  return `
    SELECT
      customer.id,
      campaign.id,
      campaign.name,
      search_term_view.search_term,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros
    FROM search_term_view
    WHERE campaign.id = ${campaignId}
      AND segments.date DURING ${dateRange}
    ORDER BY metrics.cost_micros DESC
    LIMIT 20
  `;
}

async function fetchSearchTermWasteContext(
  client: GoogleAdsClient,
  customerId: string,
  campaignId: string,
  dateRange: NegativeKeywordOptimizationInput["dateRange"]
): Promise<OptimizationContext> {
  const result = await client.search({
    customerId,
    query: searchTermWasteQuery(campaignId, dateRange),
  });

  const rows = result.rows as GoogleAdsRow[];
  const [firstRow] = rows;
  const campaign = asRecord(firstRow?.campaign);
  const customer = asRecord(firstRow?.customer);

  return {
    campaignId:
      typeof campaign?.id === "string" ? campaign.id : campaignId.trim(),
    campaignName: typeof campaign?.name === "string" ? campaign.name : null,
    customerId:
      typeof customer?.id === "string"
        ? customer.id
        : customerId.replaceAll("-", ""),
    requestId: result.requestId,
    searchTerms: rows.map(searchTermEvidenceFromRow),
  };
}

function searchTermEvidenceFromRow(row: GoogleAdsRow): SearchTermEvidence {
  const metrics = asRecord(row.metrics);
  const searchTermView = asRecord(row.searchTermView);

  return {
    clicks: toNumber(metrics?.clicks),
    conversions: toNumber(metrics?.conversions),
    searchTerm:
      typeof searchTermView?.searchTerm === "string"
        ? searchTermView.searchTerm
        : "unknown search term",
    spend: microsToCurrency(metrics?.costMicros),
  };
}

function buildNegativeKeywordRecommendations(
  searchTerms: SearchTermEvidence[],
  maxRecommendations: number
): NegativeKeywordRecommendation[] {
  return searchTerms
    .filter((term) => term.conversions === 0)
    .filter((term) => term.spend >= 25 || term.clicks >= 10)
    .toSorted((a, b) => b.spend - a.spend)
    .slice(0, maxRecommendations)
    .map((term) => ({
      evidence: {
        clicks: term.clicks,
        conversions: term.conversions,
        spend: roundCurrency(term.spend),
      },
      keyword: {
        matchType: "PHRASE",
        text: term.searchTerm,
      },
      reason: `${term.searchTerm} spent ${formatCurrency(
        term.spend
      )} with ${formatNumber(term.clicks)} clicks and no conversions.`,
    }));
}

async function validateNegativeKeywordAction(
  client: GoogleAdsClient,
  input: NegativeKeywordOptimizationInput,
  recommendations: NegativeKeywordRecommendation[]
): Promise<MutateResult | null> {
  if (recommendations.length === 0) {
    return null;
  }

  return addCampaignNegativeKeywords(client, {
    campaignId: input.campaignId,
    customerId: input.customerId,
    keywords: recommendations.map((recommendation) => recommendation.keyword),
    mode: "validate",
  });
}

function buildGovernedOptimizationPlan(
  { dateRange }: NegativeKeywordOptimizationInput,
  context: OptimizationContext,
  recommendations: NegativeKeywordRecommendation[],
  validation: MutateResult | null
) {
  const campaignName = context.campaignName ?? "Selected campaign";
  const wastedSpend = recommendations.reduce(
    (sum, recommendation) => sum + recommendation.evidence.spend,
    0
  );

  return {
    account: {
      customerId: context.customerId,
      provider: "google_ads",
    },
    agentUseCase:
      "Prepare a governed negative keyword optimization for a Claude Managed Agent.",
    approvalGate: {
      required: true,
      reason:
        "The connector validated the intended mutation only. A campaign-write approval path must authorize live execution.",
    },
    campaign: {
      id: context.campaignId,
      name: campaignName,
    },
    dateRange,
    mode: "demo",
    optimization: {
      candidateCount: recommendations.length,
      status:
        recommendations.length === 0
          ? "no_action_recommended"
          : "approval_required",
      validatedOnly: Boolean(validation),
      wastedSpend: roundCurrency(wastedSpend),
    },
    proposedAction: {
      operation: "add_campaign_negative_keywords",
      recommendations,
    },
    readRequestId: context.requestId,
    source: "synthetic_google_ads_search_terms",
    validation: validation
      ? {
          mutateOperationResponses: validation.mutateOperationResponses.length,
          requestId: validation.requestId,
          validateOnly: true,
        }
      : null,
  };
}

function createDemoClient(): GoogleAdsClient {
  const fakeFetch: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      mutateOperations?: unknown[];
      query?: string;
      validateOnly?: boolean;
    };
    const urlString = String(url);

    if (urlString.includes("googleAds:search")) {
      if (!matchesDemoQuery(body.query)) {
        return Response.json(
          { error: { message: "Unexpected example query." } },
          { status: 400 }
        );
      }

      return Response.json(
        {
          results: syntheticSearchTerms.map((term) => ({
            campaign: {
              id: demoCampaignId,
              name: syntheticCampaignName,
            },
            customer: {
              id: demoCustomerId.replaceAll("-", ""),
            },
            metrics: {
              clicks: term.clicks,
              conversions: term.conversions,
              costMicros: term.costMicros,
            },
            searchTermView: {
              searchTerm: term.searchTerm,
            },
          })),
        },
        {
          headers: {
            "request-id": "example-read-request-id",
          },
        }
      );
    }

    if (urlString.includes("googleAds:mutate")) {
      if (body.validateOnly !== true) {
        return Response.json(
          { error: { message: "Example writes must remain validation-only." } },
          { status: 400 }
        );
      }

      return Response.json(
        {
          mutateOperationResponses: [],
        },
        {
          headers: {
            "request-id": "example-validation-request-id",
          },
        }
      );
    }

    return Response.json(
      { error: { message: "Unexpected example endpoint." } },
      { status: 400 }
    );
  };

  return createGoogleAdsClient({
    auth: {
      getAccessToken: async () => "example-access-token",
    },
    developerToken: "example-developer-token",
    fetch: fakeFetch,
  });
}

function matchesDemoQuery(query: string | undefined): boolean {
  if (!query) {
    return false;
  }

  const normalizedQuery = normalizeWhitespace(query);

  return (
    normalizedQuery ===
      normalizeWhitespace(
        searchTermWasteQuery(demoCampaignId, "LAST_7_DAYS")
      ) ||
    normalizedQuery ===
      normalizeWhitespace(searchTermWasteQuery(demoCampaignId, "LAST_30_DAYS"))
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(roundCurrency(value));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim();
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown): number {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}
