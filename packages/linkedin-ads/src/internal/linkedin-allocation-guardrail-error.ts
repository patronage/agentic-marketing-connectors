export class LinkedInAllocationGuardrailError extends Error {
  readonly creativeCount: number;
  readonly maxAllocation: number;
  readonly minAllocation: number;

  constructor(input: {
    creativeCount: number;
    maxAllocation: number;
    minAllocation: number;
  }) {
    super(
      `LinkedIn allocation guardrails are infeasible for ${input.creativeCount} creatives: min ${input.minAllocation} and max ${input.maxAllocation} cannot total 1.`
    );
    this.name = "LinkedInAllocationGuardrailError";
    this.creativeCount = input.creativeCount;
    this.maxAllocation = input.maxAllocation;
    this.minAllocation = input.minAllocation;
  }
}
