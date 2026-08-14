import { routeAgentRequest } from "agents";

import {
  getSearchTermReviewAgent,
  SearchTermReviewAgent,
} from "../agents/search-term-review.js";
import {
  searchTermReviewInputSchema,
  type SearchTermReviewInput,
} from "./search-term-review.js";

export { SearchTermReviewAgent };

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        example: "Cloudflare Think search-term review",
        routes: [
          "GET /demo-review",
          "POST /demo-review",
          "POST /demo-review/validate",
          "GET /demo-review/latest",
        ],
        thinkRoute: "/agents/SearchTermReviewAgent/demo-search-term-review",
      });
    }

    if (url.pathname === "/demo-review") {
      const agent = await getSearchTermReviewAgent(env);

      if (request.method === "GET") {
        return Response.json(await agent.createReview(inputFromSearch(url)));
      }

      if (request.method === "POST") {
        return Response.json(
          await agent.createReview(await inputFromBody(request))
        );
      }
    }

    if (url.pathname === "/demo-review/validate") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Use POST for /demo-review/validate." },
          { status: 405 }
        );
      }

      const agent = await getSearchTermReviewAgent(env);
      return Response.json(await agent.validateLatestReview());
    }

    if (url.pathname === "/demo-review/latest") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "Use GET for /demo-review/latest." },
          { status: 405 }
        );
      }

      const agent = await getSearchTermReviewAgent(env);
      return Response.json(await agent.getLatestReview());
    }

    return (
      (await routeAgentRequest(request, env)) ||
      Response.json({ error: "Not found" }, { status: 404 })
    );
  },
};

function inputFromSearch(url: URL): Record<string, string> {
  const input: Record<string, string> = {};

  for (const key of [
    "campaignId",
    "customerId",
    "days",
    "maxRecommendations",
    "minimumWastedSpend",
  ]) {
    const value = url.searchParams.get(key);

    if (value) {
      input[key] = value;
    }
  }

  return input;
}

async function inputFromBody(
  request: Request
): Promise<Partial<SearchTermReviewInput>> {
  const body = await request.text();

  if (!body.trim()) {
    return {};
  }

  return searchTermReviewInputSchema
    .partial()
    .parse(JSON.parse(body) as unknown);
}
