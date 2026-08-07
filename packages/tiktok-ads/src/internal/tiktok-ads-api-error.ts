import type { TikTokApiErrorBody } from "./types.js";

export class TikTokAdsApiError extends Error {
  readonly body: TikTokApiErrorBody | undefined;
  readonly code: number | undefined;
  readonly requestId: string | undefined;
  readonly status: number;

  constructor(status: number, body?: TikTokApiErrorBody) {
    super(body?.message ?? `TikTok API request failed: HTTP ${status}`);
    this.name = "TikTokAdsApiError";
    this.status = status;
    this.body = body;
    this.code = body?.code;
    this.requestId = body?.request_id;
  }
}
