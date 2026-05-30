import type { XPostsProvider } from "./providers/provider.js";
import { XApiTimelineProvider } from "./providers/x-api-timeline-provider.js";
import { XaiGrokSearchProvider } from "./providers/xai-grok-search-provider.js";
import type { ListRecentPostsInput, ListRecentPostsResult } from "./types.js";

export interface ListRecentPostsDependencies {
  createProvider?: (
    provider: ListRecentPostsResult["provider"],
    input: ListRecentPostsInput
  ) => XPostsProvider;
}

export async function listRecentPosts(
  input: ListRecentPostsInput,
  deps: ListRecentPostsDependencies = {}
): Promise<ListRecentPostsResult> {
  validateInput(input);

  const provider = resolveProvider(input);
  const providerFactory = deps.createProvider ?? createProvider;
  return providerFactory(provider, input).listRecentPosts();
}

function createProvider(
  provider: ListRecentPostsResult["provider"],
  input: ListRecentPostsInput
): XPostsProvider {
  switch (provider) {
    case "xai-grok": {
      return new XaiGrokSearchProvider(input);
    }
    default: {
      return new XApiTimelineProvider(input);
    }
  }
}

function resolveProvider(
  input: ListRecentPostsInput
): ListRecentPostsResult["provider"] {
  if (input.provider === "x-api") {
    if (!input.xApiBearerToken) {
      throw new Error("x-api provider requires xApiBearerToken.");
    }
    return "x-api";
  }

  if (input.provider === "xai-grok") {
    if (!input.xAiApiKey) {
      throw new Error("xai-grok provider requires xAiApiKey.");
    }
    return "xai-grok";
  }

  if (input.xApiBearerToken) {
    return "x-api";
  }

  if (input.xAiApiKey) {
    return "xai-grok";
  }

  throw new Error(
    "No X provider credentials configured. Provide xApiBearerToken or xAiApiKey."
  );
}

function validateInput(input: ListRecentPostsInput) {
  if (!input.handle.trim()) {
    throw new Error("X handle is required.");
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
  if (!datePattern.test(input.since) || !datePattern.test(input.until)) {
    throw new Error("Date window must use YYYY-MM-DD values.");
  }

  if (input.since > input.until) {
    throw new Error("since must be on or before until.");
  }
}
