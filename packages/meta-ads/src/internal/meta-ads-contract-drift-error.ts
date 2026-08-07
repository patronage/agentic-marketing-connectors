export interface MetaAdsContractDriftEvidence {
  operation: string;
  providerRequestId?: string;
  providerVersion: string;
}

/** A successful Graph response that does not match the connector contract. */
export class MetaAdsContractDriftError extends Error {
  readonly operation: string;
  readonly providerRequestId: string | undefined;
  readonly providerVersion: string;

  constructor(evidence: MetaAdsContractDriftEvidence) {
    super(
      `Meta Graph API returned an invalid response for ${evidence.operation}.`
    );
    this.name = "MetaAdsContractDriftError";
    this.operation = evidence.operation;
    this.providerRequestId = evidence.providerRequestId;
    this.providerVersion = evidence.providerVersion;
  }
}
