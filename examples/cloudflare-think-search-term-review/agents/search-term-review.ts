import { Think } from "@cloudflare/think";
import { getAgentByName } from "agents";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

import {
  buildSearchTermReview,
  createDemoGoogleAdsClient,
  searchTermReviewInputSchema,
  type ApprovedSearchTermReview,
  type SearchTermReview,
  type SearchTermReviewInput,
  type SearchTermReviewWithValidation,
  validateNegativeKeywordDraft,
} from "../src/search-term-review.js";

type StoredReview =
  | ApprovedSearchTermReview
  | SearchTermReview
  | SearchTermReviewWithValidation;

export class SearchTermReviewAgent extends Think<Cloudflare.Env> {
  override getModel(): LanguageModel {
    return createWorkersAI({ binding: this.env.AI })(
      "@cf/moonshotai/kimi-k2.6"
    );
  }

  override getSystemPrompt(): string {
    return [
      "You are a paid-search review agent for a marketing team.",
      "Help the user identify search terms that wasted spend and draft negative keyword recommendations.",
      "Use validate-only operations for Google Ads changes. Never execute account changes without explicit human approval.",
      `Keep the workflow state clear for ${this.name}: draft, reviewed, then approved.`,
    ].join(" ");
  }

  override onStart(): void {
    const _created = this.sql`
      CREATE TABLE IF NOT EXISTS search_term_reviews (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;
  }

  async createReview(
    rawInput: Partial<SearchTermReviewInput> = {}
  ): Promise<StoredReview> {
    const input = searchTermReviewInputSchema.parse(rawInput);
    const draft = await buildSearchTermReview(
      createDemoGoogleAdsClient(),
      input
    );
    this.saveReview(draft);

    return draft;
  }

  async getLatestReview(): Promise<StoredReview | null> {
    const [row] = this.sql<{ data: string }>`
      SELECT data
      FROM search_term_reviews
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    if (!row) {
      return null;
    }

    return JSON.parse(row.data) as StoredReview;
  }

  async validateLatestReview(): Promise<SearchTermReviewWithValidation> {
    const latest = await this.getLatestReview();

    if (!latest) {
      const draft = await this.createReview();
      return this.validateReview(draft);
    }

    return this.validateReview(latest);
  }

  async approveLatestReview(): Promise<ApprovedSearchTermReview> {
    const latest = await this.getLatestReview();

    if (!latest) {
      throw new Error("Create and validate a review before approving it.");
    }

    if (isApprovedReview(latest)) {
      return latest;
    }

    const reviewed = isReviewedReview(latest)
      ? latest
      : await this.validateReview(latest);
    const approved: ApprovedSearchTermReview = {
      ...reviewed,
      approvedAt: new Date().toISOString(),
      status: "approved",
    };
    this.saveReview(approved);

    return approved;
  }

  override getTools(): ToolSet {
    return {
      analyze_search_terms: tool({
        description:
          "Draft negative keyword recommendations from synthetic Google Ads search-term data.",
        inputSchema: searchTermReviewInputSchema.partial(),
        execute: async (input) => this.createReview(input),
      }),
      approve_negative_keyword_review: tool({
        description:
          "Mark the latest validate-only negative keyword review as approved for a human operator.",
        inputSchema: z.object({}),
        execute: async () => this.approveLatestReview(),
      }),
      validate_negative_keywords: tool({
        description:
          "Validate the latest negative keyword draft with a validate-only Google Ads mutate call.",
        inputSchema: z.object({}),
        execute: async () => this.validateLatestReview(),
      }),
    };
  }

  private async validateReview(
    review: StoredReview
  ): Promise<SearchTermReviewWithValidation> {
    const reviewed = await validateNegativeKeywordDraft(
      createDemoGoogleAdsClient(),
      {
        ...review,
        status: "draft",
      }
    );
    this.saveReview(reviewed);

    return reviewed;
  }

  private saveReview(review: StoredReview): void {
    const _saved = this.sql`
      INSERT INTO search_term_reviews (id, status, data, updated_at)
      VALUES (
        ${this.name},
        ${review.status},
        ${JSON.stringify(review)},
        ${new Date().toISOString()}
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        data = excluded.data,
        updated_at = excluded.updated_at
    `;
  }
}

export async function getSearchTermReviewAgent(env: Cloudflare.Env) {
  return (await getAgentByName(
    env.SearchTermReviewAgent,
    "demo-search-term-review"
  )) as unknown as DurableObjectStub<SearchTermReviewAgent>;
}

function isApprovedReview(
  review: StoredReview
): review is ApprovedSearchTermReview {
  return review.status === "approved" && "validation" in review;
}

function isReviewedReview(
  review: StoredReview
): review is SearchTermReviewWithValidation {
  return review.status === "reviewed" && "validation" in review;
}
