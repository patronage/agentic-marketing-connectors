export function parseLiveSmokeArgs(argv) {
  const parsed = { allowMutations: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--customer-id") {
      parsed.customerId = argv.at(index + 1);
      index += 1;
    } else if (arg === "--allow-mutations") {
      parsed.allowMutations = true;
    } else if (arg === "--mutation-fixtures") {
      parsed.mutationFixtures = argv.at(index + 1);
      index += 1;
    }
  }

  return parsed;
}

export function hasFailedSmokeResults(results) {
  return results.some(({ status }) => status === "failed");
}

export function summarizeMutationResults(results) {
  const summary = { failed: 0, passed: 0, skipped: 0 };
  for (const { status } of results) {
    summary[status] += 1;
  }
  return summary;
}
