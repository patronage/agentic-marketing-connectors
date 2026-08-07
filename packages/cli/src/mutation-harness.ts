import { writeRunLog } from "./run-log.js";
import type {
  CliRunMode,
  WriteRunLogInput,
  WriteRunLogResult,
} from "./run-log.js";

export type CliMutationLifecycle =
  | "executed"
  | "local-planned"
  | "provider-validated";

export interface CliMutationHarnessResult<TResult> {
  lifecycle: CliMutationLifecycle;
  mode: CliRunMode;
  result: TResult | { plan: unknown };
  runLogPath: string;
}

export async function runCliMutationHarness<
  TClient,
  TResult,
  TPrepared = unknown,
>(input: {
  command: string;
  createClient: () => TClient;
  execute?: boolean;
  format?: string;
  input: unknown;
  inputFile?: string;
  localPlan?: unknown;
  logOperations?: (result: TResult | { plan: unknown }) => unknown[];
  logResult?: (input: {
    lifecycle: CliMutationLifecycle;
    result: TResult | { plan: unknown };
  }) => unknown;
  operations: unknown[];
  output?: (value: string) => void;
  presentation?: (result: CliMutationHarnessResult<TResult>) => unknown;
  prepare?: (client: TClient) => Promise<{
    context: TPrepared;
    localResult: TResult;
    operations: unknown[];
  }>;
  provider: string;
  run: (
    client: TClient,
    mode: CliRunMode,
    prepared?: TPrepared
  ) => Promise<TResult>;
  runLogDir: string;
  validation: "local" | "provider";
  writeLog?: (input: WriteRunLogInput) => WriteRunLogResult;
}): Promise<CliMutationHarnessResult<TResult>> {
  const mode: CliRunMode = input.execute ? "execute" : "validate";
  const lifecycle = resolveMutationLifecycle(mode, input.validation);
  const client =
    lifecycle !== "local-planned" || input.prepare
      ? input.createClient()
      : undefined;
  const prepared =
    client && input.prepare ? await input.prepare(client) : undefined;
  const effectiveOperations = prepared?.operations ?? input.operations;
  let result: TResult | { plan: unknown };
  try {
    result = await resolveHarnessResult({
      client,
      createClient: input.createClient,
      effectiveOperations,
      lifecycle,
      localPlan: input.localPlan,
      mode,
      prepared,
      run: input.run,
    });
  } catch (error) {
    if (!isMutationPlanMismatchError(error)) {
      throw error;
    }
    result = {
      receipt: {
        stage: "executed",
        status: "manual-review",
        steps: [
          {
            attempted: true,
            failureDetail:
              "The saved deployment plan differs from this version. Do not retry; inspect the prior run log and reconcile the provider state manually.",
            key: "plan-fingerprint",
            status: "failed",
          },
        ],
      },
    } as unknown as TResult;
  }
  const writeLog = input.writeLog ?? writeRunLog;
  const loggedResult = input.logResult
    ? input.logResult({ lifecycle, result })
    : { lifecycle, providerResult: result };
  const runLog = writeLog({
    command: input.command,
    input: input.input,
    inputFile: input.inputFile,
    mode,
    operations: input.logOperations?.(result) ?? effectiveOperations,
    provider: input.provider,
    result: loggedResult,
    runLogDir: input.runLogDir,
  });
  const harnessResult = {
    lifecycle,
    mode,
    result,
    runLogPath: runLog.path,
  };
  const output = input.output ?? ((value: string) => console.log(value));
  output(
    renderMutationHarnessOutput(
      input.command,
      harnessResult,
      input.format,
      input.presentation?.(harnessResult)
    )
  );
  if (extractReceiptFailure(result)) {
    process.exitCode = 1;
  }
  return harnessResult;
}

function isMutationPlanMismatchError(error: unknown): boolean {
  return error instanceof Error && error.name === "MutationPlanMismatchError";
}

interface ReceiptFailure {
  failureDetails: string[];
  failedSteps: string[];
  stage: string | undefined;
  status: "ambiguous" | "failed" | "manual-review";
}

export function extractReceiptFailure(
  result: unknown
): ReceiptFailure | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  const { receipt } = result as { receipt?: unknown };
  if (typeof receipt !== "object" || receipt === null) {
    return undefined;
  }
  const { stage, status, steps } = receipt as {
    stage?: unknown;
    status?: unknown;
    steps?: unknown;
  };
  const failedSteps: string[] = [];
  const failureDetails: string[] = [];
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (
        typeof step !== "object" ||
        step === null ||
        typeof (step as { key?: unknown }).key !== "string" ||
        (step as { status?: unknown }).status === "succeeded"
      ) {
        continue;
      }
      const {
        failureDetail,
        key,
        status: stepStatus,
      } = step as {
        failureDetail?: unknown;
        key: string;
        status?: unknown;
      };
      failedSteps.push(`${key}: ${String(stepStatus)}`);
      if (typeof failureDetail === "string" && failureDetail.trim()) {
        failureDetails.push(`${key}: ${failureDetail}`);
      }
    }
  }
  const hasFailedCleanup = failedSteps.some((step) =>
    step.startsWith("operation-label-cleanup: failed")
  );
  if (
    status !== "failed" &&
    status !== "ambiguous" &&
    status !== "manual-review" &&
    !hasFailedCleanup
  ) {
    return undefined;
  }
  return {
    failureDetails,
    failedSteps,
    stage: typeof stage === "string" ? stage : undefined,
    status: hasFailedCleanup
      ? "failed"
      : (status as "ambiguous" | "failed" | "manual-review"),
  };
}

function resolveHarnessResult<TClient, TResult, TPrepared>(input: {
  client: TClient | undefined;
  createClient: () => TClient;
  effectiveOperations: unknown[];
  lifecycle: CliMutationLifecycle;
  localPlan: unknown;
  mode: CliRunMode;
  prepared:
    | { context: TPrepared; localResult: TResult; operations: unknown[] }
    | undefined;
  run: (
    client: TClient,
    mode: CliRunMode,
    prepared?: TPrepared
  ) => Promise<TResult>;
}): Promise<TResult | { plan: unknown }> {
  if (input.lifecycle === "local-planned") {
    return Promise.resolve(
      input.prepared?.localResult ?? {
        plan: input.localPlan ?? input.effectiveOperations,
      }
    );
  }
  const client = input.client ?? input.createClient();
  return input.prepared
    ? input.run(client, input.mode, input.prepared.context)
    : input.run(client, input.mode);
}

export function resolveMutationLifecycle(
  mode: CliRunMode,
  validation: "local" | "provider"
): CliMutationLifecycle {
  if (mode === "execute") {
    return "executed";
  }
  return validation === "provider" ? "provider-validated" : "local-planned";
}

export function renderMutationHarnessOutput(
  command: string,
  result: CliMutationHarnessResult<unknown>,
  format?: string,
  presentation?: unknown
): string {
  const payload = presentation ?? { command, ...result };
  if (format === "json") {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
  const failure = extractReceiptFailure(result.result);
  if (failure) {
    const label = {
      ambiguous: "AMBIGUOUS",
      failed: "FAILED",
      "manual-review": "MANUAL REVIEW",
    }[failure.status];
    const stage = failure.stage ? ` at ${failure.stage}` : "";
    const steps = failure.failedSteps.length
      ? ` (${failure.failedSteps.join(", ")})`
      : "";
    const details = failure.failureDetails.length
      ? `\nFailure detail: ${failure.failureDetails.join("; ")}`
      : "";
    return `${label}${stage}${steps}${details} ${command}\nRun log: ${result.runLogPath}\n${JSON.stringify(result.result, null, 2)}\n`;
  }
  const label: Record<CliMutationLifecycle, string> = {
    executed: "Executed",
    "local-planned": "Planned locally",
    "provider-validated": "Provider validated",
  };
  return `${label[result.lifecycle]} ${command}\nRun log: ${result.runLogPath}\n${JSON.stringify(result.result, null, 2)}\n`;
}
