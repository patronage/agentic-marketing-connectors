/**
 * Connector container invocation for Qualified Runs.
 *
 * This module owns the wrapper HTTP contract from the seam side:
 * `/metadata` exact-match verification with a bounded cold-start retry,
 * `/read-artifact` for a source, and `/write` for the destination. It also
 * owns failure-text redaction and bounds, so connector output never carries
 * secret material or unbounded text into control rows or logs.
 */
import type { AdsSyncProvider } from "./provider-contract.js";

/** A Cloudflare Container stub, or any object with the same shape. */
export interface ConnectorContainerHandle {
  destroy?: () => Promise<void>;
  fetch: (request: Request) => Promise<Response>;
  stop: (signal?: "SIGTERM" | number) => Promise<void>;
}

/** Exact metadata pin a running image must report before the seam uses it. */
export interface ContainerImagePin {
  connectorImage: string;
  wrapperVersion: string;
}

export type ContainerKind = AdsSyncProvider | "destination";

export interface ConnectorContainerResponse {
  args?: unknown;
  exitCode?: unknown;
  stderr: string;
  stderrLength?: unknown;
  stdout: string;
  stdoutLength?: unknown;
  success?: unknown;
  summary?: unknown;
}

/**
 * Bounded retry for a container whose wrapper is not yet responding.
 *
 * Only an unavailable image retries: a network failure or a 5xx from
 * `/metadata`. A responding image that reports the wrong pin fails at once.
 */
export interface ColdStartRetryPolicy {
  /** Total attempts, including the first. Must be at least 1. */
  maxAttempts: number;
  /** Delay between attempts. */
  retryDelayMs: number;
  /** Injectable sleep for tests. Defaults to a timer. */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_COLD_START_RETRY: ColdStartRetryPolicy = {
  maxAttempts: 5,
  retryDelayMs: 2000,
};

/** Upper bound for redacted failure text kept in control rows and logs. */
export const MAX_FAILURE_TEXT_BYTES = 4096;

export type ContainerFailureReason = "metadata_mismatch" | "unavailable";

/**
 * A container that could not be qualified. `metadata_mismatch` means the
 * image responded with the wrong pin; `unavailable` means the wrapper never
 * responded within the cold-start retry budget.
 */
export class ContainerQualificationError extends Error {
  override name = "ContainerQualificationError";
  readonly reason: ContainerFailureReason;

  constructor(reason: ContainerFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export async function assertContainerImagePin(
  container: Pick<ConnectorContainerHandle, "fetch">,
  kind: ContainerKind,
  expected: ContainerImagePin,
  retry: ColdStartRetryPolicy = DEFAULT_COLD_START_RETRY
) {
  const maxAttempts = Math.max(1, Math.floor(retry.maxAttempts));
  const sleep = retry.sleep ?? defaultSleep;
  let lastUnavailable: ContainerQualificationError | undefined;

  // oxlint-disable-next-line no-await-in-loop -- a retry loop is sequential by definition
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each probe depends on the previous one failing
    const outcome = await probeMetadata(container, kind);
    if (outcome.status === "responding") {
      assertPinMatches(kind, expected, outcome.metadata);
      return { attempts: attempt };
    }
    lastUnavailable = outcome.error;
    if (attempt < maxAttempts) {
      // oxlint-disable-next-line no-await-in-loop -- delay between sequential probes
      await sleep(retry.retryDelayMs);
    }
  }

  throw new ContainerQualificationError(
    "unavailable",
    `${kind} container did not respond to /metadata after ${maxAttempts} attempt(s): ${lastUnavailable?.message ?? "unknown"}`
  );
}

export async function readSourceArtifact(
  container: ConnectorContainerHandle,
  options: {
    coldStart?: ColdStartRetryPolicy;
    expected: ContainerImagePin;
    payload: { catalog: unknown; config: unknown; state?: unknown };
    provider: AdsSyncProvider;
  }
) {
  try {
    await assertContainerImagePin(
      container,
      options.provider,
      options.expected,
      options.coldStart
    );
    const response = await container.fetch(
      new Request("http://container/read-artifact", {
        body: JSON.stringify(options.payload),
        headers: { "content-type": "application/json; charset=utf-8" },
        method: "POST",
      })
    );

    if (!response.ok) {
      throw new Error(
        `Source ${options.provider} read failed: ${boundedFailureText(
          await response.text()
        )}`
      );
    }

    const parsed =
      (await response.json()) as Partial<ConnectorContainerResponse>;
    if (
      typeof parsed.stdout !== "string" ||
      typeof parsed.stderr !== "string"
    ) {
      throw new TypeError(
        `Source ${options.provider} did not return stdout/stderr artifact`
      );
    }

    return parsed as ConnectorContainerResponse;
  } finally {
    await stopContainer(container, `${options.provider} source`);
  }
}

export async function writeDestination(
  container: ConnectorContainerHandle,
  options: {
    coldStart?: ColdStartRetryPolicy;
    expected: ContainerImagePin;
    payload: { catalog: unknown; config: unknown; messages: string };
  }
) {
  try {
    await assertContainerImagePin(
      container,
      "destination",
      options.expected,
      options.coldStart
    );
    const response = await container.fetch(
      new Request("http://container/write", {
        body: JSON.stringify({ ...options.payload, include_output: true }),
        headers: { "content-type": "application/json; charset=utf-8" },
        method: "POST",
      })
    );

    if (!response.ok) {
      throw new Error(
        `Destination write failed: ${boundedFailureText(await response.text())}`
      );
    }

    const parsed =
      (await response.json()) as Partial<ConnectorContainerResponse>;
    if (parsed.success !== true) {
      throw new Error(
        `Destination write failed: ${boundedFailureText(
          parsed.stderr ?? parsed.stdout ?? JSON.stringify(parsed)
        )}`
      );
    }
    if (parsed.exitCode !== 0) {
      throw new Error(
        `Destination write exited with code ${String(parsed.exitCode)}: ${boundedFailureText(
          parsed.stderr ?? parsed.stdout ?? JSON.stringify(parsed)
        )}`
      );
    }
    if (
      typeof parsed.stdout !== "string" ||
      typeof parsed.stderr !== "string"
    ) {
      throw new TypeError("Destination did not return stdout/stderr artifact");
    }

    return parsed as ConnectorContainerResponse;
  } finally {
    await stopContainer(container, "destination");
  }
}

export function connectorContainerIdForStreamRun(
  kind: ContainerKind,
  streamRunId: string
) {
  return `ads-sync-${kind}-${streamRunId}`.replaceAll(/[^a-zA-Z0-9_-]/gu, "-");
}

/**
 * The `[a-z0-9-]{0,64}_` prefix is bounded so a long hyphenated run scans in
 * linear time; no real key name is longer.
 */
const SENSITIVE_KEY = String.raw`(?:[a-z0-9-]{0,64}_(?:secret|token|key)|(?:api|access|secret)-?key|credentials|credentials_json|client_id|password|passwd|secret|token|authorization)`;
const JSON_PAIR = new RegExp(
  `"(?<key>${SENSITIVE_KEY})"\\s*:\\s*"(?:\\\\.|[^"\\\\])*"`,
  "giu"
);
const ESCAPED_JSON_PAIR = new RegExp(
  String.raw`\\"(?<key>${SENSITIVE_KEY})\\"\s*:\s*\\"(?:\\\\.|(?!\\")[^\\])*\\"`,
  "giu"
);
const PYTHON_REPR_PAIR = new RegExp(
  `'(?<key>${SENSITIVE_KEY})'\\s*:\\s*'(?:\\\\.|[^'\\\\])*'`,
  "giu"
);
const MIXED_QUOTE_PAIR = new RegExp(
  `(?<open>["'])(?<key>${SENSITIVE_KEY})\\k<open>\\s*[:=]\\s*(?<valueOpen>["'])(?:\\\\.|(?!\\k<valueOpen>)[^\\\\])*\\k<valueOpen>`,
  "giu"
);
/** JSON pair with a non-string scalar value: `"client_id": 1234567`. */
const JSON_SCALAR_PAIR = new RegExp(
  `"(?<key>${SENSITIVE_KEY})"\\s*:\\s*(?:-?\\d[\\d.eE+-]*|true|false|null)(?![^\\s,;&"'()\\[\\]{}])`,
  "giu"
);
/** Unquoted key with a quoted value: `password: "hunter2"` or `password: 'h'`. */
const QUOTED_VALUE_COLON = new RegExp(
  `(?<![A-Za-z0-9_"'\\\\])(?<key>${SENSITIVE_KEY})\\s*:\\s*(?<valueOpen>["'])(?:\\\\.|(?!\\k<valueOpen>)[^\\\\])*\\k<valueOpen>`,
  "giu"
);
/** Unquoted key with an escaped-quoted value: `password: \"hunter2\"`. */
const ESCAPED_QUOTED_VALUE_ASSIGNMENT = new RegExp(
  String.raw`(?<![A-Za-z0-9_])(?<key>${SENSITIVE_KEY})(?<sep>\s*[:=]\s*)\\"(?:\\\\.|(?!\\")[^\\])*\\"`,
  "giu"
);
/** Python kwargs or dataclass repr: `Config(refresh_token='…')`. */
const KWARG_QUOTED_ASSIGNMENT = new RegExp(
  `(?<![A-Za-z0-9_])(?<key>${SENSITIVE_KEY})\\s*=\\s*(?<valueOpen>["'])(?:\\\\.|(?!\\k<valueOpen>)[^\\\\])*\\k<valueOpen>`,
  "giu"
);
/** Unquoted `key=value` until whitespace or a delimiter. */
const BARE_ASSIGNMENT = new RegExp(
  `(?<![A-Za-z0-9_])(?<key>${SENSITIVE_KEY})\\s*=\\s*(?<value>[^\\s,;&"'()\\[\\]{}\\\\][^\\s,;&"'()\\[\\]{}]*)`,
  "giu"
);
/**
 * Unquoted `key: value` log or YAML form until whitespace or a delimiter.
 * Runs after the quoted-pair patterns, so it never touches a JSON value, and
 * after the header pattern, so a redacted `Authorization: Bearer <redacted>`
 * keeps its scheme.
 */
const COLON_ASSIGNMENT = new RegExp(
  `(?<![A-Za-z0-9_])(?<key>${SENSITIVE_KEY})(?<close>["']?)\\s*:\\s*(?!(?:bearer|basic|token|digest)\\s)(?<value>[^\\s,;&"'()\\[\\]{}\\\\][^\\s,;&"'()\\[\\]{}]*)`,
  "giu"
);
/** HTTP header form: `Authorization: Bearer <token>` (also Basic, Token). */
const AUTHORIZATION_HEADER =
  /(?<![A-Za-z0-9_-])(?<header>(?:proxy-)?authorization)\s*[:=]\s*(?<scheme>bearer|basic|token|digest)\s+[^\s"'\\,;]+/giu;
/** Credentials in a URI: `scheme://user:secret@host`. */
const URI_USERINFO =
  /(?<![a-z0-9+.-])(?<scheme>[a-z][a-z0-9+.-]*):\/\/(?<user>[^\s/:@"'\\]+):[^\s/@"'\\]+@/giu;

/**
 * Redacts secret values in connector failure text.
 *
 * Covers JSON pairs (string and non-string scalar values), escaped-JSON
 * pairs, Python repr pairs (`{'refresh_token': '...'}`), mixed-quote pairs,
 * quoted and escape-quoted YAML values (`password: "hunter2"`,
 * `password: \"hunter2\"`), Python kwargs and dataclass reprs
 * (`Config(refresh_token='...')`), `Authorization: Bearer <token>` headers
 * (`:` or `=`), credentials in URIs (`scheme://user:secret@host`), bare
 * `key=value` assignments, and unquoted `key: value` log or YAML lines
 * (including angle-wrapped values like `token: <SECRETVAL>`) for the same
 * sensitive key set.
 *
 * A redacted JSON scalar stays a valid JSON string (`"client_id":"<redacted>"`)
 * so redaction never turns a RECORD line into invalid JSON.
 *
 * Order matters: the header and URI patterns run before the bare assignment,
 * so `Authorization=Bearer <token>` redacts the token and not the scheme word.
 */
export function sanitizeConnectorFailureText(text: string) {
  return text
    .replaceAll(JSON_PAIR, '"$<key>":"<redacted>"')
    .replaceAll(JSON_SCALAR_PAIR, '"$<key>":"<redacted>"')
    .replaceAll(ESCAPED_JSON_PAIR, '\\"$<key>\\":\\"<redacted>\\"')
    .replaceAll(PYTHON_REPR_PAIR, "'$<key>': '<redacted>'")
    .replaceAll(
      MIXED_QUOTE_PAIR,
      "$<open>$<key>$<open>: $<valueOpen><redacted>$<valueOpen>"
    )
    .replaceAll(
      QUOTED_VALUE_COLON,
      "$<key>: $<valueOpen><redacted>$<valueOpen>"
    )
    .replaceAll(ESCAPED_QUOTED_VALUE_ASSIGNMENT, '$<key>$<sep>\\"<redacted>\\"')
    .replaceAll(
      KWARG_QUOTED_ASSIGNMENT,
      "$<key>=$<valueOpen><redacted>$<valueOpen>"
    )
    .replaceAll(AUTHORIZATION_HEADER, "$<header>: $<scheme> <redacted>")
    .replaceAll(URI_USERINFO, "$<scheme>://$<user>:<redacted>@")
    .replaceAll(BARE_ASSIGNMENT, "$<key>=<redacted>")
    .replaceAll(COLON_ASSIGNMENT, "$<key>$<close>: <redacted>");
}

/**
 * Redacts and bounds failure text. Redaction runs on the full text first so a
 * truncation boundary can never split a secret and leave a prefix visible.
 */
export function boundedFailureText(
  text: string,
  maxBytes = MAX_FAILURE_TEXT_BYTES
) {
  const sanitized = sanitizeConnectorFailureText(text);
  const encoder = new TextEncoder();
  const byteLength = encoder.encode(sanitized).length;
  if (byteLength <= maxBytes) {
    return sanitized;
  }
  const marker = ` … [truncated ${byteLength - maxBytes} bytes]`;
  const budget = Math.max(0, maxBytes - encoder.encode(marker).length);
  return `${truncateToBytes(sanitized, budget)}${marker}`;
}

function truncateToBytes(text: string, maxBytes: number) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) {
    return text;
  }
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: false })
    .decode(bytes.subarray(0, maxBytes))
    .replace(/�+$/u, "");
}

type MetadataProbe =
  | { error: ContainerQualificationError; status: "unavailable" }
  | { metadata: Record<string, unknown>; status: "responding" };

async function probeMetadata(
  container: Pick<ConnectorContainerHandle, "fetch">,
  kind: ContainerKind
): Promise<MetadataProbe> {
  let response: Response;
  try {
    response = await container.fetch(new Request("http://container/metadata"));
  } catch (error) {
    return {
      error: new ContainerQualificationError(
        "unavailable",
        `${kind} container metadata request failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      ),
      status: "unavailable",
    };
  }
  if (response.status >= 500) {
    return {
      error: new ContainerQualificationError(
        "unavailable",
        `${kind} container metadata returned ${response.status}`
      ),
      status: "unavailable",
    };
  }
  if (!response.ok) {
    throw new Error(
      `Could not read ${kind} container metadata (status ${response.status})`
    );
  }
  const parsed = (await response.json()) as unknown;
  return {
    metadata:
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {},
    status: "responding",
  };
}

function assertPinMatches(
  kind: ContainerKind,
  expected: ContainerImagePin,
  metadata: Record<string, unknown>
) {
  if (
    metadata.connectorImage !== expected.connectorImage ||
    metadata.wrapperVersion !== expected.wrapperVersion
  ) {
    throw new ContainerQualificationError(
      "metadata_mismatch",
      `${kind} container metadata mismatch: expected ${expected.connectorImage} ${expected.wrapperVersion}, got ${String(metadata.connectorImage)} ${String(metadata.wrapperVersion)}`
    );
  }
}

async function stopContainer(
  container: ConnectorContainerHandle,
  label: string
) {
  try {
    await (typeof container.destroy === "function"
      ? container.destroy()
      : container.stop("SIGTERM"));
  } catch (error) {
    console.warn(`Could not stop ${label} container`, error);
  }
}

function defaultSleep(ms: number) {
  // oxlint-disable-next-line promise/avoid-new -- a timer has no promise form on every runtime
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
