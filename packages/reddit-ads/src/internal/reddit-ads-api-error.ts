import type { RedditAdsApiErrorPayload } from "./types.js";

export class RedditAdsApiError extends Error {
  readonly body: RedditAdsApiErrorPayload;
  readonly status: number;

  constructor(status: number, body?: RedditAdsApiErrorPayload) {
    super(
      errorMessage(body) ?? `Reddit Ads API request failed: HTTP ${status}`
    );
    this.name = "RedditAdsApiError";
    this.status = status;
    this.body = body;
  }
}

function errorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  if (typeof body.message === "string") {
    return body.message;
  }

  return isRecord(body.error) && typeof body.error.message === "string"
    ? body.error.message
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
