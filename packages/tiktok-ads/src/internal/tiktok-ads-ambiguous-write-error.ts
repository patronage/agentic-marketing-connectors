import type { MutationStepStatus } from "@patronage/connector-lifecycle";

export interface TikTokAdsAmbiguousWriteEvidence {
  cause?: unknown;
  method: "POST";
  path: string;
  providerRequestId?: string;
  status?: number;
}

/**
 * A write may have reached TikTok, but the connector cannot prove its outcome.
 * Callers must reconcile provider state before attempting the operation again.
 */
export class TikTokAdsAmbiguousWriteError extends Error {
  readonly method: "POST";
  readonly outcome: Extract<MutationStepStatus, "ambiguous"> = "ambiguous";
  readonly path: string;
  readonly provider = "tiktok" as const;
  readonly providerRequestId: string | undefined;
  readonly status: number | undefined;

  constructor(evidence: TikTokAdsAmbiguousWriteEvidence) {
    super(
      `TikTok Ads ${evidence.method} outcome is ambiguous for ${evidence.path}; reconcile provider state before retrying.`,
      { cause: evidence.cause }
    );
    this.name = "TikTokAdsAmbiguousWriteError";
    this.method = evidence.method;
    this.path = evidence.path;
    this.providerRequestId = evidence.providerRequestId;
    this.status = evidence.status;
  }
}
