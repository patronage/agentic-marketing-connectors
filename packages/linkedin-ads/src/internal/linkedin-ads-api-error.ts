import type { LinkedInApiErrorBody } from "./types.js";

export class LinkedInAdsApiError extends Error {
  readonly body: LinkedInApiErrorBody | undefined;
  readonly status: number;

  constructor(status: number, body?: LinkedInApiErrorBody) {
    super(body?.message ?? `LinkedIn API request failed: HTTP ${status}`);
    this.name = "LinkedInAdsApiError";
    this.status = status;
    this.body = body;
  }
}
