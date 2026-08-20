/**
 * Provider-neutral Ads Sync protocol and state logic.
 *
 * Provider semantics live in the per-provider modules behind the registry
 * in `providers.ts`. SQL DDL lives in `sql.ts`.
 */
import type { AdsSyncProvider } from "./provider-contract.js";
import { integerValue, isRecord } from "./provider-contract.js";
import { providerModules } from "./providers.js";

export interface AirbyteMessageSummary {
  firstRecordEmittedAt: string | null;
  invalid: number;
  logs: number;
  lastRecordEmittedAt: string | null;
  records: number;
  recordsByStream: Record<string, number>;
  states: number;
  traces: number;
  total: number;
}

export interface ArtifactKeys {
  catalogKey: string;
  destinationInputKey: string;
  destinationStderrKey: string;
  destinationStdoutKey: string;
  prefix: string;
  sourceStderrKey: string;
  sourceStdoutKey: string;
  stateInputKey?: string;
  summaryKey: string;
}

export interface StateCommitInput {
  destinationStdout: string;
  sourceStdout: string;
  writeSucceeded: boolean;
}

export interface DestinationInput {
  droppedLines: number;
  messages: string;
  summary: AirbyteMessageSummary;
}

export interface ArtifactManifest {
  byteCount: number;
  firstRecordEmittedAt: string | null;
  kind: string;
  lastRecordEmittedAt: string | null;
  lineCount: number;
  logCount: number;
  recordCount: number;
  sha256: string;
  stateCount: number;
  traceCount: number;
}

export interface ArtifactLimitConfig {
  maxDestinationInputBytes: number;
  maxLines: number;
  maxSourceStdoutBytes: number;
}

export interface SyncConnectionDefinition {
  accountId: string | null;
  airbyteSchema: string;
  catalogConfigRef: string;
  catalogHash: string;
  connectionId: string;
  displayName: string;
  enabled: boolean;
  provider: AdsSyncProvider;
  reportingEnabled: boolean;
  scheduleCron: string | null;
  scheduleEveryMinutes: number | null;
  selectedStreams: string[];
  sourceConfigFingerprint: string;
  sourceConfigRef: string;
  sourceIdentity: Record<string, string | string[] | null>;
  stateConfigRef: string;
  streamGroup: string;
  streamName: string;
}

export type BackfillWindowDispatchAction = "ignore" | "start" | "wait";

export function backfillWindowDispatchAction(window: {
  runId?: null | string;
  status?: null | string;
}): BackfillWindowDispatchAction {
  if (window.status === "queued" || window.status === "running") {
    return window.runId ? "wait" : "start";
  }
  if (window.status === "failed" || window.status === "pending") {
    return "start";
  }
  return "ignore";
}

export function createRunId(now = new Date()) {
  return `${now.toISOString().replaceAll(/[:.]/gu, "-")}-${crypto.randomUUID()}`;
}

export function artifactKeys(options: {
  provider: AdsSyncProvider;
  runId: string;
  streamName: string;
}): ArtifactKeys {
  const prefix = `${options.provider}/${options.streamName}/${options.runId}`;
  return {
    catalogKey: `${prefix}/configured-catalog.json`,
    destinationInputKey: `${prefix}/destination-input.jsonl`,
    destinationStderrKey: `${prefix}/destination-write.stderr.log`,
    destinationStdoutKey: `${prefix}/destination-write.stdout.jsonl`,
    prefix,
    sourceStderrKey: `${prefix}/source-read.stderr.log`,
    sourceStdoutKey: `${prefix}/source-read.stdout.jsonl`,
    stateInputKey: `${prefix}/state-input.json`,
    summaryKey: `${prefix}/summary.json`,
  };
}

export function summarizeAirbyteMessages(text: string): AirbyteMessageSummary {
  const summary: AirbyteMessageSummary = {
    firstRecordEmittedAt: null,
    invalid: 0,
    logs: 0,
    lastRecordEmittedAt: null,
    records: 0,
    recordsByStream: {},
    states: 0,
    traces: 0,
    total: 0,
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    summary.total += 1;

    try {
      const message = JSON.parse(trimmed) as {
        record?: { emitted_at?: unknown; stream?: unknown };
        type?: unknown;
      };

      if (message.type === "RECORD") {
        summary.records += 1;
        const stream =
          typeof message.record?.stream === "string"
            ? message.record.stream
            : "unknown";
        summary.recordsByStream[stream] =
          (summary.recordsByStream[stream] ?? 0) + 1;
        const emittedAt =
          typeof message.record?.emitted_at === "number"
            ? new Date(message.record.emitted_at).toISOString()
            : null;
        summary.firstRecordEmittedAt ??= emittedAt;
        summary.lastRecordEmittedAt = emittedAt ?? summary.lastRecordEmittedAt;
      } else if (message.type === "STATE") {
        summary.states += 1;
      } else if (message.type === "LOG") {
        summary.logs += 1;
      } else if (message.type === "TRACE") {
        summary.traces += 1;
      }
    } catch {
      summary.invalid += 1;
    }
  }

  return summary;
}

export function extractLastStateInput(text: string): unknown[] | null {
  const statesByDescriptor = new Map<string, unknown>();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as { state?: unknown; type?: string };
      if (parsed.type === "STATE" && parsed.state !== undefined) {
        statesByDescriptor.set(stateDescriptorKey(parsed.state), parsed.state);
      }
    } catch {
      // Connector logs may emit non-JSON lines; continue parsing later lines.
    }
  }

  const states = [...statesByDescriptor.values()];
  return states.length === 0 ? null : states;
}

function stateDescriptorKey(state: unknown) {
  if (!isRecord(state)) {
    return "legacy";
  }

  if (state.type === "GLOBAL") {
    return "global";
  }

  if (state.type === "STREAM" && isRecord(state.stream)) {
    const descriptor = isRecord(state.stream.stream_descriptor)
      ? state.stream.stream_descriptor
      : {};
    return `stream:${JSON.stringify({
      name: descriptor.name ?? null,
      namespace: descriptor.namespace ?? null,
    })}`;
  }

  return "legacy";
}

export function committedStateAfterSuccessfulDestinationWrite(
  destinationStdout: string,
  _sourceStdout: string
) {
  return extractLastStateInput(destinationStdout);
}

export function committedStateAfterDestinationResult(input: StateCommitInput) {
  if (!input.writeSucceeded) {
    return null;
  }

  return committedStateAfterSuccessfulDestinationWrite(
    input.destinationStdout,
    input.sourceStdout
  );
}

export function progressEventPayload(
  event: unknown,
  emittedAt = new Date().toISOString()
) {
  return {
    ...(isRecord(event) ? event : {}),
    emittedAt,
  };
}

export function compileDestinationInput(
  text: string,
  limits?: Pick<ArtifactLimitConfig, "maxDestinationInputBytes" | "maxLines">
): DestinationInput {
  const messages: string[] = [];
  let droppedLines = 0;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const message = JSON.parse(trimmed) as {
        trace?: { type?: unknown };
        type?: unknown;
      };
      if (isDestinationInputMessage(message)) {
        messages.push(JSON.stringify(message));
      } else {
        droppedLines += 1;
      }
    } catch {
      droppedLines += 1;
    }
  }

  const compiled = messages.length > 0 ? `${messages.join("\n")}\n` : "";
  const byteCount = utf8ByteLength(compiled);
  const lineCount = countNonEmptyLines(compiled);
  if (limits && byteCount > limits.maxDestinationInputBytes) {
    throw new Error(
      `Destination input is ${byteCount} bytes, above limit ${limits.maxDestinationInputBytes}`
    );
  }
  if (limits && lineCount > limits.maxLines) {
    throw new Error(
      `Destination input has ${lineCount} lines, above limit ${limits.maxLines}`
    );
  }
  return {
    droppedLines,
    messages: compiled,
    summary: summarizeAirbyteMessages(compiled),
  };
}

function isDestinationInputMessage(message: {
  trace?: { type?: unknown };
  type?: unknown;
}) {
  return (
    message.type === "RECORD" ||
    message.type === "STATE" ||
    (message.type === "TRACE" && message.trace?.type === "STREAM_STATUS")
  );
}

export async function artifactManifestForText(
  kind: string,
  text: string
): Promise<ArtifactManifest> {
  const summary = summarizeAirbyteMessages(text);
  return {
    byteCount: utf8ByteLength(text),
    firstRecordEmittedAt: summary.firstRecordEmittedAt,
    kind,
    lastRecordEmittedAt: summary.lastRecordEmittedAt,
    lineCount: countNonEmptyLines(text),
    logCount: summary.logs,
    recordCount: summary.records,
    sha256: await sha256Text(text),
    stateCount: summary.states,
    traceCount: summary.traces,
  };
}

export function enforceTextArtifactLimits(
  label: string,
  text: string,
  limits: Pick<ArtifactLimitConfig, "maxLines" | "maxSourceStdoutBytes">
) {
  const byteCount = utf8ByteLength(text);
  const lineCount = countNonEmptyLines(text);
  if (byteCount > limits.maxSourceStdoutBytes) {
    throw new Error(
      `${label} is ${byteCount} bytes, above limit ${limits.maxSourceStdoutBytes}`
    );
  }
  if (lineCount > limits.maxLines) {
    throw new Error(
      `${label} has ${lineCount} lines, above limit ${limits.maxLines}`
    );
  }
}

/**
 * Bounds a text artifact that must persist even when it is oversized, such as
 * connector stderr. Keeps the leading text inside `maxSourceStdoutBytes` and
 * `maxLines` and ends a truncated artifact with a marker line that names the
 * dropped byte count. Text inside both bounds is returned unchanged.
 */
export function truncateTextArtifact(
  text: string,
  limits: Pick<ArtifactLimitConfig, "maxLines" | "maxSourceStdoutBytes">
) {
  const byteCount = utf8ByteLength(text);
  const lineCount = countNonEmptyLines(text);
  if (
    byteCount <= limits.maxSourceStdoutBytes &&
    lineCount <= limits.maxLines
  ) {
    return text;
  }
  // The marker is one more non-empty line, so keep one line of budget for it.
  let kept = text;
  const lineBudget = Math.max(0, limits.maxLines - 1);
  if (lineCount > lineBudget) {
    let remaining = lineBudget;
    let end = 0;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) {
        if (remaining === 0) {
          break;
        }
        remaining -= 1;
      }
      end += line.length + 1;
    }
    kept = text.slice(0, Math.min(end, text.length));
  }
  const keptBytes = utf8ByteLength(kept);
  const budget =
    limits.maxSourceStdoutBytes - utf8ByteLength(truncationMarker(byteCount));
  if (keptBytes > budget) {
    kept = truncateUtf8(kept, Math.max(0, budget));
  }
  return `${kept}${truncationMarker(byteCount - utf8ByteLength(kept))}`;
}

function truncationMarker(droppedBytes: number) {
  return `\n… [truncated ${droppedBytes} bytes at artifact limits]\n`;
}

function truncateUtf8(text: string, maxBytes: number) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) {
    return text;
  }
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: false })
    .decode(bytes.subarray(0, maxBytes))
    .replace(/�+$/u, "");
}

export function stampConfiguredCatalog(
  catalog: unknown,
  generationId = Date.now()
) {
  const stamped = structuredClone(catalog);
  if (!isRecord(stamped) || !Array.isArray(stamped.streams)) {
    return stamped;
  }

  for (const stream of stamped.streams) {
    if (!isRecord(stream)) {
      continue;
    }

    stream.sync_id = generationId;
    stream.generation_id = generationId;
    stream.minimum_generation_id =
      stream.destination_sync_mode === "overwrite" ? generationId : 0;
  }

  return stamped;
}

export function firstConfiguredStreamGeneration(
  catalog: unknown,
  fallbackGenerationId: number
) {
  if (!isRecord(catalog) || !Array.isArray(catalog.streams)) {
    return {
      generationId: fallbackGenerationId,
      minimumGenerationId: fallbackGenerationId,
      syncId: fallbackGenerationId,
    };
  }

  const [stream] = catalog.streams;
  if (!isRecord(stream)) {
    return {
      generationId: fallbackGenerationId,
      minimumGenerationId: fallbackGenerationId,
      syncId: fallbackGenerationId,
    };
  }

  const stampedGenerationId =
    integerValue(stream.generation_id) ?? fallbackGenerationId;
  return {
    generationId: stampedGenerationId,
    minimumGenerationId:
      integerValue(stream.minimum_generation_id) ?? stampedGenerationId,
    syncId: integerValue(stream.sync_id) ?? stampedGenerationId,
  };
}

export function destinationConfigForProvider(
  config: unknown,
  provider: AdsSyncProvider,
  schema: string = providerModules[provider].defaultAirbyteSchema
) {
  const cloned = structuredClone(config);
  if (!isRecord(cloned)) {
    return cloned;
  }

  cloned.schema = schema;
  return cloned;
}

export function sourceConfigStateKeyInput(config: unknown) {
  return redactSensitiveConfigValues(config);
}

export function defaultConnectionId(provider: AdsSyncProvider) {
  return `${provider}_default`;
}

export async function defaultSyncConnectionDefinition(options: {
  catalog: unknown;
  provider: AdsSyncProvider;
  sourceConfig: unknown;
}): Promise<SyncConnectionDefinition> {
  const module = providerModules[options.provider];
  return {
    accountId: module.sourceAccountId(options.sourceConfig),
    airbyteSchema: module.defaultAirbyteSchema,
    catalogConfigRef: `ads-sync.config.ts#${defaultConnectionId(options.provider)}.catalog`,
    catalogHash: await sha256Json(options.catalog),
    connectionId: defaultConnectionId(options.provider),
    displayName: `${module.displayName} default`,
    enabled: true,
    provider: options.provider,
    reportingEnabled: true,
    scheduleCron: null,
    scheduleEveryMinutes: module.defaultScheduleEveryMinutes,
    selectedStreams: configuredCatalogStreamNames(
      options.catalog,
      module.streamName
    ),
    sourceConfigFingerprint: await sha256Json(
      sourceConfigStateKeyInput(options.sourceConfig)
    ),
    sourceConfigRef: module.sourceConfigSecret,
    sourceIdentity: module.sourceIdentity(options.sourceConfig),
    stateConfigRef: module.stateSecret,
    streamGroup: module.streamName,
    streamName: module.streamName,
  };
}

function configuredCatalogStreamNames(
  catalog: unknown,
  fallbackStreamName: string
) {
  if (!isRecord(catalog) || !Array.isArray(catalog.streams)) {
    return [fallbackStreamName];
  }

  const streamNames = catalog.streams.flatMap((configuredStream) => {
    if (!isRecord(configuredStream) || !isRecord(configuredStream.stream)) {
      return [];
    }
    return typeof configuredStream.stream.name === "string"
      ? [configuredStream.stream.name]
      : [];
  });

  return streamNames.length > 0
    ? [...new Set(streamNames)]
    : [fallbackStreamName];
}

export function configuredCatalogForSelectedStreams(
  catalog: unknown,
  selectedStreams?: readonly string[]
) {
  if (!selectedStreams || selectedStreams.length === 0) {
    return catalog;
  }

  const selected = new Set(selectedStreams);
  const cloned = structuredClone(catalog);
  if (!isRecord(cloned) || !Array.isArray(cloned.streams)) {
    return cloned;
  }

  const found = new Set<string>();
  cloned.streams = cloned.streams.filter((configuredStream) => {
    if (!isRecord(configuredStream) || !isRecord(configuredStream.stream)) {
      return false;
    }
    if (typeof configuredStream.stream.name !== "string") {
      return false;
    }
    if (selected.has(configuredStream.stream.name)) {
      found.add(configuredStream.stream.name);
      return true;
    }
    return false;
  });
  const missing = selectedStreams.filter(
    (streamName) => !found.has(streamName)
  );
  if (missing.length > 0) {
    throw new Error(
      `Configured catalog is missing selected streams: ${missing.join(", ")}`
    );
  }
  return cloned;
}

export function validateDestinationSchemaIsolation(
  connections: SyncConnectionDefinition[]
) {
  const schemaOwners = new Map<string, string>();
  for (const connection of connections) {
    if (!connection.enabled) {
      continue;
    }
    const existing = schemaOwners.get(connection.airbyteSchema);
    if (existing && existing !== connection.connectionId) {
      throw new Error(
        `Enabled connections ${existing} and ${connection.connectionId} share Airbyte schema ${connection.airbyteSchema}`
      );
    }
    schemaOwners.set(connection.airbyteSchema, connection.connectionId);
  }
}

function utf8ByteLength(text: string) {
  return new TextEncoder().encode(text).byteLength;
}

function countNonEmptyLines(text: string) {
  return text.split("\n").filter((line) => line.trim()).length;
}

async function sha256Text(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Json(value: unknown) {
  return sha256Text(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const sortedKeys: string[] = [];
  for (const key of Object.keys(record)) {
    const index = sortedKeys.findIndex((current) => current > key);
    if (index === -1) {
      sortedKeys.push(key);
    } else {
      sortedKeys.splice(index, 0, key);
    }
  }

  return `{${sortedKeys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function redactSensitiveConfigValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveConfigValues(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      isSensitiveConfigKey(key)
        ? []
        : [[key, redactSensitiveConfigValues(item)] as const]
    )
  );
}

function isSensitiveConfigKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized === "credentials" ||
    normalized === "access_token" ||
    normalized === "refresh_token" ||
    normalized === "client_secret" ||
    normalized === "client_id" ||
    normalized === "developer_token" ||
    normalized === "password" ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("_token")
  );
}
