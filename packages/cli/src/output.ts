import chalk from "chalk";

import type { ProviderMutationResult } from "./run-log.js";

export function printMutateResult(input: {
  execute: boolean;
  result: ProviderMutationResult;
  runLogPath: string;
}): void {
  const mutateOperationResponses = input.result.mutateOperationResponses ?? [];

  console.log(chalk.green("API response:"));
  console.log(
    JSON.stringify(
      {
        operationCount: mutateOperationResponses.length,
        partialFailureError: input.result.partialFailureError ?? null,
        requestId: input.result.requestId,
        runLogPath: input.runLogPath,
      },
      null,
      2
    )
  );

  if (input.execute && mutateOperationResponses.length > 0) {
    console.log(chalk.green("\nResource names:"));
    for (const op of mutateOperationResponses) {
      const name = extractResourceName(op);
      if (name) {
        console.log(`  ${name}`);
      }
    }
  }

  if (input.execute) {
    console.log(chalk.green("\nChanges applied live."));
  } else {
    console.log(
      chalk.yellow(
        "\nThis was a dry-run. Re-run with --execute to apply changes live."
      )
    );
  }
}

function extractResourceName(op: unknown): string | undefined {
  if (!op || typeof op !== "object") {
    return undefined;
  }
  for (const value of Object.values(op as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const rn = (value as Record<string, unknown>).resourceName;
      if (typeof rn === "string") {
        return rn;
      }
    }
  }
  return undefined;
}
