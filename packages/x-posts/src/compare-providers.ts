import { listRecentPosts } from "./list-recent-posts.js";
import type {
  CompareProvidersInput,
  CompareProvidersResult,
  ListRecentPostsInput,
  ListRecentPostsResult,
  XProviderName,
} from "./types.js";

export interface CompareProvidersDependencies {
  listRecentPostsImpl?: (
    input: ListRecentPostsInput
  ) => Promise<ListRecentPostsResult>;
}

export async function compareProviders(
  input: CompareProvidersInput,
  deps: CompareProvidersDependencies = {}
): Promise<CompareProvidersResult> {
  const listRecentPostsImpl = deps.listRecentPostsImpl ?? listRecentPosts;
  const results: CompareProvidersResult["results"] = {};
  const warnings: string[] = [];

  for (const provider of ["x-api", "xai-grok"] satisfies XProviderName[]) {
    if (provider === "x-api" && !input.xApiBearerToken) {
      warnings.push("Skipped x-api: missing xApiBearerToken.");
      continue;
    }

    if (provider === "xai-grok" && !input.xAiApiKey) {
      warnings.push("Skipped xai-grok: missing xAiApiKey.");
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- this stateful operation intentionally runs in deterministic sequence (#507).
    results[provider] = await listRecentPostsImpl({
      ...input,
      provider,
    });
  }

  return {
    comparison: buildComparison(results),
    handle: input.handle,
    results,
    since: input.since,
    until: input.until,
    warnings,
  };
}

function buildComparison(
  results: CompareProvidersResult["results"]
): CompareProvidersResult["comparison"] {
  const xApiPosts = results["x-api"]?.posts ?? [];
  const xAiPosts = results["xai-grok"]?.posts ?? [];
  const xApiUrls = new Set(xApiPosts.map((post) => post.url));
  const xAiUrls = new Set(xAiPosts.map((post) => post.url));
  const xApiPostsByUrl = new Map(xApiPosts.map((post) => [post.url, post]));
  const xAiPostsByUrl = new Map(xAiPosts.map((post) => [post.url, post]));
  const overlapUrls = [...xApiUrls].filter((url) => xAiUrls.has(url));
  const videoAgreement = { matched: 0, mismatched: 0 };

  for (const url of overlapUrls) {
    const xApiPost = xApiPostsByUrl.get(url);
    const xAiPost = xAiPostsByUrl.get(url);

    if (!xApiPost || !xAiPost) {
      continue;
    }

    if (xApiPost.hasVideo === xAiPost.hasVideo) {
      videoAgreement.matched += 1;
    } else {
      videoAgreement.mismatched += 1;
    }
  }

  return {
    metricsAvailability: {
      "x-api": countPostsWithMetrics(xApiPosts),
      "xai-grok": countPostsWithMetrics(xAiPosts),
    },
    overlapUrls,
    videoAgreement,
    xAiOnlyUrls: xAiPosts.flatMap((post) =>
      xApiUrls.has(post.url) ? [] : [post.url]
    ),
    xApiOnlyUrls: xApiPosts.flatMap((post) =>
      xAiUrls.has(post.url) ? [] : [post.url]
    ),
  };
}

function countPostsWithMetrics(posts: ListRecentPostsResult["posts"]): number {
  return posts.filter((post) =>
    Object.values(post.metrics ?? {}).some((value) => typeof value === "number")
  ).length;
}
