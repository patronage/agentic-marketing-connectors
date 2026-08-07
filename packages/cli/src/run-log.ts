import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_FLAG_NAMES = new Set(["code"]);
const SENSITIVE_KEY_NAMES = new Set([
  "apikey",
  "appsecret",
  "appsecretproof",
  "authorization",
  "bearertoken",
  "clientsecret",
  "cookie",
  "credential",
  "credentials",
  "developertoken",
  "password",
  "passphrase",
  "privatekey",
  "sessioncookie",
  "testeventcode",
  "token",
  "userdata",
]);

export type CliRunMode = "execute" | "validate";

interface ProviderMutationResult {
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
  mkdirSync(input.runLogDir, { mode: 0o700, recursive: true });

  const timestamp = formatTimestamp(new Date());
  const commandSlug = input.command
    .replaceAll(/[^a-z0-9]+/giu, "-")
    .replaceAll(/^-|-$/gu, "");
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
          argv: redactArgv(process.argv.slice(2)),
          cwd: process.cwd(),
          git: readGitContext(),
        },
        input: redactSensitiveValues(input.input),
        inputFile: input.inputFile ? path.resolve(input.inputFile) : null,
        mode: input.mode,
        operations: redactSensitiveValues(input.operations),
        provider: input.provider,
        result: redactSensitiveValues(serializeResult(input.result)),
        schemaVersion: 1,
        timestamp,
      },
      null,
      2
    )}\n`,
    { encoding: "utf-8", mode: 0o600 }
  );
  chmodSync(filePath, 0o600);

  return { path: filePath };
}

function redactArgv(argv: string[]): string[] {
  const redacted: string[] = [];
  let redactNext = false;

  for (const argument of argv) {
    if (redactNext) {
      redacted.push(REDACTED_VALUE);
      redactNext = false;
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    if (!flag.startsWith("-") || !isSensitiveFlag(flag)) {
      redacted.push(argument);
      continue;
    }

    if (equalsIndex === -1) {
      redacted.push(argument);
      redactNext = true;
    } else {
      redacted.push(`${flag}=${REDACTED_VALUE}`);
    }
  }

  return redacted;
}

function isSensitiveFlag(flag: string): boolean {
  const normalized = normalizeKey(flag);
  return SENSITIVE_FLAG_NAMES.has(normalized) || isSensitiveKey(flag);
}

function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValues(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const audienceDataIsSensitive = Object.hasOwn(record, "schema");

  return Object.fromEntries(
    Object.entries(record).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) || (key === "data" && audienceDataIsSensitive)
        ? REDACTED_VALUE
        : redactSensitiveValues(nestedValue),
    ])
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEY_NAMES.has(normalized) ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("credential") ||
    normalized.endsWith("password") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token")
  );
}

function normalizeKey(key: string): string {
  return key.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
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
    encoding: "utf-8",
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
