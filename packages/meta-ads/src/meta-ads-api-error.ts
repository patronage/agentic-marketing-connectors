import type { GraphApiError } from "./types.js";

export class MetaAdsApiError extends Error {
  readonly code: number | undefined;
  readonly errorSubcode: number | undefined;
  readonly fbtraceId: string | undefined;
  readonly type: string | undefined;
  readonly userMessage: string | undefined;

  constructor(error: GraphApiError) {
    super(error.message);
    this.name = "MetaAdsApiError";
    this.code = error.code;
    this.errorSubcode = error.error_subcode;
    this.fbtraceId = error.fbtrace_id;
    this.type = error.type;
    this.userMessage = error.error_user_msg;
  }
}
