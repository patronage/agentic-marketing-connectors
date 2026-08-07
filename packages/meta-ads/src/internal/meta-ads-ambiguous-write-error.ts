export interface MetaAdsAmbiguousWriteEvidence {
  cause?: unknown;
  method: string;
  path: string;
  providerRequestId?: string;
  status?: number;
}

/**
 * A write may have reached Meta, but the connector cannot prove its outcome.
 * Callers must reconcile provider state before attempting the operation again.
 */
export class MetaAdsAmbiguousWriteError extends Error {
  readonly method: string;
  readonly path: string;
  readonly provider = "meta" as const;
  readonly providerRequestId: string | undefined;
  readonly status: number | undefined;

  constructor(evidence: MetaAdsAmbiguousWriteEvidence) {
    super(
      `Meta Ads ${evidence.method} outcome is ambiguous for ${evidence.path}; reconcile provider state before retrying.`,
      { cause: evidence.cause }
    );
    this.name = "MetaAdsAmbiguousWriteError";
    this.method = evidence.method;
    this.path = evidence.path;
    this.providerRequestId = evidence.providerRequestId;
    this.status = evidence.status;
  }
}
