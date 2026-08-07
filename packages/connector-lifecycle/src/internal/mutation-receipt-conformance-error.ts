export class MutationReceiptConformanceError extends Error {
  readonly findings: string[];

  constructor(findings: string[]) {
    super(`Mutation receipt is not conformant: ${findings.join("; ")}`);
    this.name = "MutationReceiptConformanceError";
    this.findings = findings;
  }
}
