export class GoogleAdsContractError extends Error {
  readonly apiVersion: string;
  readonly operation: string;
  readonly requestId: string | null;

  constructor(input: {
    apiVersion: string;
    operation: string;
    requestId: string | null;
  }) {
    super(
      `Google Ads ${input.operation} returned an unexpected response shape.`
    );
    this.name = "GoogleAdsContractError";
    this.apiVersion = input.apiVersion;
    this.operation = input.operation;
    this.requestId = input.requestId;
  }
}
