export class MutationPlanMismatchError extends Error {
  readonly actualFingerprint: string;
  readonly expectedFingerprint: string;

  constructor(expectedFingerprint: string, actualFingerprint: string) {
    super("Mutation receipt does not match the current plan fingerprint.");
    this.name = "MutationPlanMismatchError";
    this.expectedFingerprint = expectedFingerprint;
    this.actualFingerprint = actualFingerprint;
  }
}
