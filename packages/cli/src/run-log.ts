import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type CliRunMode = "execute" | "validate";

export interface ProviderMutationResult {
  mutateOperationResponses?: unknown[];
  partialFailureError?: unknown;
  requestId?: null | string;
}

export interface WriteRunLogInput {
  command: string;
  input: unknown;
  inputFile?: string;
  mode: CliRunMode;
  operations: unknown[];
  provider: string;
  result: unknown;
  runLogDir: string;
}

export interface WriteRunLogResult {
  path: string;
}

export function writeRunLog(input: WriteRunLogInput): WriteRunLogResult {
  mkdirSync(input.runLogDir, { recursive: true });

  const timestamp = formatTimestamp(new Date());
  const commandSlug = input.command
    .replaceAll(/[^a-z0-9]+/gi, "-")
    .replaceAll(/^-|-$/g, "");
  const filePath = path.join(
    input.runLogDir,
    `${timestamp}-${input.provider}-${commandSlug}-${input.mode}.json`
  );

  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        command: input.command,
        context: {
          argv: process.argv.slice(2),
          cwd: process.cwd(),
          git: readGitContext(),
        },
        input: input.input,
        inputFile: input.inputFile ? path.resolve(input.inputFile) : null,
        mode: input.mode,
        operations: input.operations,
        provider: input.provider,
        result: serializeResult(input.result),
        schemaVersion: 1,
        timestamp,
      },
      null,
      2
    )}\n`
  );

  return { path: filePath };
}

export function formatTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "");
}

function readGitContext():
  | { branch: string | null; sha: string | null }
  | undefined {
  try {
    return {
      branch: execGit(["branch", "--show-current"]) || null,
      sha: execGit(["rev-parse", "HEAD"]) || null,
    };
  } catch {
    return undefined;
  }
}

function execGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function serializeResult(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }

  const mutationResult = result as ProviderMutationResult;
  const resultKeys = Object.keys(result);
  const googleResultKeys = new Set([
    "mutateOperationResponses",
    "partialFailureError",
    "requestId",
  ]);
  if (
    ("mutateOperationResponses" in mutationResult ||
      "partialFailureError" in mutationResult) &&
    resultKeys.every((key) => googleResultKeys.has(key))
  ) {
    return {
      mutateOperationResponses: mutationResult.mutateOperationResponses ?? [],
      partialFailureError: mutationResult.partialFailureError ?? null,
      requestId: mutationResult.requestId,
    };
  }

  return result;
}
