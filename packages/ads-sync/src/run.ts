/**
 * `@patronage/ads-sync/run` — the Qualified Run seam.
 *
 * A Qualified Run is one execution of one Sync Connection at an exact
 * connection version. Both the open-source Reference Deployment and Loop
 * execute runs only through this entry point. The seam hides, with the
 * invariants built in:
 *
 * - source-container invocation with an exact `connectorImage` +
 *   `wrapperVersion` metadata pin, and a bounded, unavailable-only cold-start
 *   retry that still fails at once on a responding image with the wrong pin;
 * - artifact bounds and redaction, including non-JSON secret representations
 *   and bounded failure text;
 * - destination write;
 * - state commit only after destination success and a fresh lifecycle check.
 *
 * ## Shape
 *
 * `createQualifiedRunAdapter(dependencies)` returns one adapter whose methods
 * are the durable step boundaries of a run (`prepare`, `acquireLease`,
 * `readSource`, `compileDestinationInput`, `writeDestination`, `commitState`,
 * `recordGeneration`, `finalizeSucceeded`, `finalizeFailed`, `releaseLease`)
 * plus `run()`, which executes them inline in order. A Cloudflare Workflow
 * wraps each method in `step.do`; a local runner calls `run()`.
 *
 * ## What the caller supplies
 *
 * Cloudflare-native by identity, Postgres-generic by contract (ADR 0011):
 *
 * - `containers`: source and destination container handles (Cloudflare
 *   Container stubs) keyed by provider, plus the exact image pins;
 * - `artifacts`: an R2 bucket (or any object with `get`/`put`);
 * - `sql()`: a fresh postgres.js client per step (Hyperdrive on Cloudflare);
 * - `custody`: a `QualifiedRunCustodyAdapter` (ADR 0047). The seam never
 *   reads deployment env fields itself and never accepts caller routing. This
 *   package ships the single-tenant `workerSecretsCustodyAdapter`;
 * - `connections.configuredCatalog`: the app-owned catalog for a connection;
 * - optional policy hooks: `runWindow`, `onSucceeded`, `onFailed` for
 *   backfill bookkeeping, `progress` for event publication, `limits`,
 *   `coldStart`.
 *
 * Destination provisioning (schemas, roles, DDL), scheduling, provider
 * admission, and Dockerfiles stay outside this seam.
 */
import type postgres from "postgres";

import {
  artifactKeys,
  artifactManifestForText,
  compileDestinationInput,
  committedStateAfterDestinationResult,
  destinationConfigForProvider,
  enforceTextArtifactLimits,
  firstConfiguredStreamGeneration,
  sourceConfigStateKeyInput,
  stampConfiguredCatalog,
  summarizeAirbyteMessages,
  truncateTextArtifact,
} from "./core.js";
import type {
  ArtifactKeys,
  ArtifactLimitConfig,
  ArtifactManifest,
  SyncConnectionDefinition,
} from "./core.js";
import type { AdsSyncProvider } from "./provider-contract.js";
import { sourceConfigForReporting } from "./providers.js";
import {
  boundedFailureText,
  connectorContainerIdForStreamRun,
  readSourceArtifact,
  sanitizeConnectorFailureText,
  writeDestination as writeDestinationContainer,
} from "./run-containers.js";
import type {
  ColdStartRetryPolicy,
  ConnectorContainerHandle,
  ConnectorContainerResponse,
  ContainerImagePin,
  ContainerKind,
} from "./run-containers.js";
import {
  acquireStreamLease,
  assertRunMayCommit,
  extendStreamLease,
  hasStateCommit,
  insertArtifact,
  insertStateCommit,
  loadCommittedState,
  loadEnabledConnection,
  releaseStreamLease,
} from "./run-control.js";
import type { ControlSql, StreamLease } from "./run-control.js";
import type { QualifiedRunCustodyAdapter } from "./run-custody.js";

export {
  ADS_SYNC_MANAGED_SECRET_NAMES,
  ADS_SYNC_RUNNER_TOKEN_SECRET_NAME,
  assertManagedSecretName,
  CustodyFenceError,
  optionalManagedJsonSecret,
  POSTGRES_DESTINATION_CONFIG_SECRET_NAME,
  requireManagedJsonSecret,
  workerSecretsCustodyAdapter,
} from "./run-custody.js";
export type { QualifiedRunCustodyAdapter } from "./run-custody.js";
export {
  assertContainerImagePin,
  boundedFailureText,
  connectorContainerIdForStreamRun,
  ContainerQualificationError,
  DEFAULT_COLD_START_RETRY,
  MAX_FAILURE_TEXT_BYTES,
  readSourceArtifact,
  sanitizeConnectorFailureText,
  writeDestination as writeDestinationContainer,
} from "./run-containers.js";
export type {
  ColdStartRetryPolicy,
  ConnectorContainerHandle,
  ConnectorContainerResponse,
  ContainerImagePin,
  ContainerKind,
} from "./run-containers.js";
export {
  acquireStreamLease,
  assertRunMayCommit,
  extendStreamLease,
  insertArtifact,
  loadCommittedState,
  loadEnabledConnection,
  normalizedSourceIdentity,
  releaseRunLeases,
  releaseStreamLease,
  RunLifecycleError,
  syncConnectionFromRow,
} from "./run-control.js";
export type {
  ControlSql,
  StreamLease,
  SyncConnectionRow,
} from "./run-control.js";

/** An R2 bucket, or any object with the same `get`/`put` shape. */
export interface ArtifactBucket {
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
  put: (
    key: string,
    body: string,
    options?: { httpMetadata?: { contentType?: string } }
  ) => Promise<unknown>;
}

export interface QualifiedRunWindow {
  id: string;
  windowEnd: string;
  windowStart: string;
}

export interface QualifiedRunParams {
  connectionId: string;
  runId: string;
}

export interface PreparedQualifiedRun {
  catalogHash: string;
  connection: SyncConnectionDefinition;
  configuredCatalogHash: string;
  generationId: number;
  generationMetadata: ReturnType<typeof firstConfiguredStreamGeneration>;
  keys: ArtifactKeys;
  lockKey: string;
  runId: string;
  runWindow?: QualifiedRunWindow;
  sourceConfigHash: string;
  streamRunId: string;
}

export interface SourceReadResult {
  source: ReturnType<typeof summarizeAirbyteMessages>;
  sourceStderrManifest: ArtifactManifest;
  sourceStdoutManifest: ArtifactManifest;
}

export interface DestinationInputResult {
  destinationInputManifest: ArtifactManifest;
  droppedLines: number;
  summary: ReturnType<typeof summarizeAirbyteMessages>;
}

export interface DestinationWriteResult {
  destination: ReturnType<typeof summarizeAirbyteMessages>;
  destinationStderrManifest: ArtifactManifest;
  destinationStdoutManifest: ArtifactManifest;
  stateCommit: StateCommitResult;
}

export type StateCommitResult =
  | { alreadyCommitted?: boolean; committed: true }
  | { committed: false; reason: "no_state" };

export interface QualifiedRunSummary {
  destination: ReturnType<typeof summarizeAirbyteMessages>;
  destinationInput: {
    droppedLines: number;
    manifest: ArtifactManifest;
    summary: ReturnType<typeof summarizeAirbyteMessages>;
  };
  provider: AdsSyncProvider;
  source: ReturnType<typeof summarizeAirbyteMessages>;
  stateCommit: StateCommitResult;
  streamName: string;
  streamRunId: string;
}

export interface QualifiedRunDependencies {
  /** R2 bucket for raw connector artifacts. */
  artifacts: ArtifactBucket;
  /** Cold-start retry policy for the `/metadata` probe. */
  coldStart?: ColdStartRetryPolicy;
  /** App-owned catalog and connection policy. */
  connections: {
    configuredCatalog: (connection: SyncConnectionDefinition) => unknown;
  };
  /** Container handles and exact image pins. */
  containers: {
    destination: (containerId: string) => ConnectorContainerHandle;
    pins: Readonly<Record<ContainerKind, ContainerImagePin>>;
    source: (
      provider: AdsSyncProvider,
      containerId: string
    ) => ConnectorContainerHandle;
  };
  /** Custody adapter that resolves secret material (ADR 0047). */
  custody: QualifiedRunCustodyAdapter;
  /** Artifact bounds. Defaults are the package defaults. */
  limits?: ArtifactLimitConfig;
  /** Called inside the failed-run bookkeeping; app policy hook. */
  onFailed?: (sql: postgres.Sql, runId: string) => Promise<void>;
  /** Called inside the success transaction; app policy hook. */
  onSucceeded?: (
    sql: ControlSql,
    prepared: PreparedQualifiedRun
  ) => Promise<void>;
  /** Progress event sink. Events never carry secret material. */
  progress?: (runId: string, event: Record<string, unknown>) => void;
  /** Loads the run window (backfill policy) for a run, if any. */
  runWindow?: (
    sql: postgres.Sql,
    runId: string
  ) => Promise<QualifiedRunWindow | undefined>;
  /** Fresh control-store client per step. Caller owns `end()`. */
  sql: () => postgres.Sql;
  /** Lease refresh interval during long container calls. */
  streamLeaseRefreshIntervalMs?: number;
}

export const DEFAULT_ARTIFACT_LIMITS: ArtifactLimitConfig = {
  maxDestinationInputBytes: 25 * 1024 * 1024,
  maxLines: 250_000,
  maxSourceStdoutBytes: 50 * 1024 * 1024,
};

const DEFAULT_LEASE_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const AIRBYTE_DATA_LINE = /"type"\s*:\s*"(?:RECORD|STATE)"/u;

/**
 * Redacts every Airbyte stdout line that is not a RECORD or STATE message.
 * Data lines stay byte-identical so a cursor field such as `next_page_token`
 * reaches the destination unchanged; LOG, TRACE, and unparseable lines carry
 * connector diagnostics and are the lines that can echo a config value.
 */
export function sanitizeAirbyteStdout(stdout: string) {
  if (stdout.length === 0) {
    return stdout;
  }
  return stdout
    .split("\n")
    .map((line) =>
      AIRBYTE_DATA_LINE.test(line) ? line : sanitizeConnectorFailureText(line)
    )
    .join("\n");
}

export interface QualifiedRunAdapter {
  acquireLease: (
    prepared: PreparedQualifiedRun
  ) => Promise<{ leaseKey: string }>;
  commitState: (prepared: PreparedQualifiedRun) => Promise<StateCommitResult>;
  compileDestinationInput: (
    prepared: PreparedQualifiedRun
  ) => Promise<DestinationInputResult>;
  finalizeFailed: (
    params: QualifiedRunParams,
    prepared: PreparedQualifiedRun | undefined,
    message: string
  ) => Promise<void>;
  finalizeSucceeded: (
    prepared: PreparedQualifiedRun,
    result: {
      destination: DestinationWriteResult;
      destinationInput: DestinationInputResult;
    }
  ) => Promise<QualifiedRunSummary>;
  prepare: (params: QualifiedRunParams) => Promise<PreparedQualifiedRun>;
  readSource: (prepared: PreparedQualifiedRun) => Promise<SourceReadResult>;
  recordGeneration: (
    prepared: PreparedQualifiedRun
  ) => Promise<{ recorded: boolean }>;
  releaseLease: (
    prepared: PreparedQualifiedRun
  ) => Promise<{ error?: string; released: boolean }>;
  run: (params: QualifiedRunParams) => Promise<QualifiedRunSummary>;
  writeDestination: (
    prepared: PreparedQualifiedRun
  ) => Promise<DestinationWriteResult>;
}

export function createQualifiedRunAdapter(
  deps: QualifiedRunDependencies
): QualifiedRunAdapter {
  const limits = deps.limits ?? DEFAULT_ARTIFACT_LIMITS;
  const leaseRefreshMs =
    deps.streamLeaseRefreshIntervalMs ?? DEFAULT_LEASE_REFRESH_INTERVAL_MS;

  const withSql = async <T>(operation: (sql: postgres.Sql) => Promise<T>) => {
    const sql = deps.sql();
    try {
      return await operation(sql);
    } finally {
      await sql.end();
    }
  };

  const withLeaseRefresh = async <T>(
    prepared: PreparedQualifiedRun,
    operation: () => Promise<T>
  ) => {
    let refreshError: unknown;
    const refresh = async () => {
      try {
        await withSql((sql) => extendStreamLease(sql, leaseOf(prepared)));
      } catch (error) {
        refreshError = error;
        clearInterval(interval);
      }
    };
    const interval = setInterval(() => {
      void refresh();
    }, leaseRefreshMs);
    try {
      // oxlint-disable-next-line react-doctor/async-defer-await -- the operation result and a concurrent lease error are both required
      const result = await operation();
      if (refreshError) {
        throw refreshError instanceof Error
          ? refreshError
          : new Error(String(refreshError));
      }
      return result;
    } finally {
      clearInterval(interval);
    }
  };

  const sourceConfigFor = async (prepared: {
    connection: SyncConnectionDefinition;
    runWindow?: QualifiedRunWindow;
  }) =>
    sourceConfigForReporting(
      prepared.connection.provider,
      await deps.custody.sourceConfig(prepared.connection),
      deps.connections.configuredCatalog(prepared.connection),
      {
        endDate: prepared.runWindow?.windowEnd,
        startDate: prepared.runWindow?.windowStart,
      }
    );

  const putText = async (key: string, body: string, contentType: string) => {
    await deps.artifacts.put(key, body, { httpMetadata: { contentType } });
  };
  const putJson = (key: string, body: unknown) =>
    putText(
      key,
      JSON.stringify(body, null, 2),
      "application/json; charset=utf-8"
    );
  const readText = async (key: string) => {
    const object = await deps.artifacts.get(key);
    if (!object) {
      throw new Error(`Artifact ${key} was not found`);
    }
    return object.text();
  };

  /**
   * Redacts one connector response. Stdout is Airbyte NDJSON: RECORD and
   * STATE lines are data and stay byte-identical; every other line (LOG,
   * TRACE, unparseable) is redacted. Stderr is redacted as a whole.
   */
  const redactConnectorResponse = (
    response: ConnectorContainerResponse
  ): ConnectorContainerResponse => ({
    ...response,
    stderr: sanitizeConnectorFailureText(response.stderr),
    stdout: sanitizeAirbyteStdout(response.stdout),
  });

  /**
   * Bounds one redacted connector response to `limits` before anything
   * persists it. Redaction runs first so a cut can never expose a secret
   * prefix.
   */
  const boundConnectorResponse = (
    redacted: ConnectorContainerResponse
  ): ConnectorContainerResponse => ({
    ...redacted,
    stderr: truncateTextArtifact(redacted.stderr, limits),
    stdout: truncateTextArtifact(redacted.stdout, limits),
  });

  const persistPair = async (
    sql: ControlSql,
    prepared: PreparedQualifiedRun,
    pair: {
      response: ConnectorContainerResponse;
      stderrKey: string;
      stderrKind: string;
      stdoutKey: string;
      stdoutKind: string;
    }
  ) => {
    // oxlint-disable-next-line react-doctor/async-parallel -- artifact writes preserve observable ordering
    const stdoutManifest = await artifactManifestForText(
      pair.stdoutKind,
      pair.response.stdout
    );
    // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- artifact writes preserve observable ordering
    const stderrManifest = await artifactManifestForText(
      pair.stderrKind,
      pair.response.stderr
    );
    await putText(
      pair.stdoutKey,
      pair.response.stdout,
      "application/x-ndjson; charset=utf-8"
    );
    await putText(
      pair.stderrKey,
      pair.response.stderr,
      "text/plain; charset=utf-8"
    );
    const common = {
      provider: prepared.connection.provider,
      runId: prepared.runId,
      streamRunId: prepared.streamRunId,
    };
    await Promise.all([
      insertArtifact(sql, {
        ...common,
        contentType: "application/x-ndjson; charset=utf-8",
        key: pair.stdoutKey,
        kind: pair.stdoutKind,
        manifest: stdoutManifest,
      }),
      insertArtifact(sql, {
        ...common,
        contentType: "text/plain; charset=utf-8",
        key: pair.stderrKey,
        kind: pair.stderrKind,
        manifest: stderrManifest,
      }),
    ]);
    return { stderrManifest, stdoutManifest };
  };

  const prepare = (params: QualifiedRunParams) =>
    withSql(async (sql) => {
      const connection = await loadEnabledConnection(sql, params.connectionId);
      // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- control-store reads preserve observable ordering
      const runWindow = await deps.runWindow?.(sql, params.runId);
      const configuredCatalogSource =
        deps.connections.configuredCatalog(connection);
      const sourceConfig = await sourceConfigFor({ connection, runWindow });
      const sourceConfigHash = await sha256Json(
        sourceConfigStateKeyInput(sourceConfig)
      );
      // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- hashes are computed in a fixed order
      const configuredCatalogHash = await sha256Json(configuredCatalogSource);
      const generationId = Date.now();
      const configuredCatalog = stampConfiguredCatalog(
        configuredCatalogSource,
        generationId
      );
      const generationMetadata = firstConfiguredStreamGeneration(
        configuredCatalog,
        generationId
      );
      const streamRunId = crypto.randomUUID();
      const keys = artifactKeys({
        provider: connection.provider,
        runId: params.runId,
        streamName: connection.streamName,
      });

      // A run that a sweep already failed closed must not come back to life
      // when a late executor reaches it: only a `queued` or `running` row is
      // promoted. The guarded UPDATE is the whole check; no separate read.
      const promoted = await sql<{ id: string }[]>`
        UPDATE ads_sync.sync_runs
        SET status = 'running'
        WHERE id = ${params.runId}
          AND status IN ('queued', 'running')
        RETURNING id
      `;
      if (promoted.length === 0) {
        throw new Error(
          `Run ${params.runId} is not queued or running; it was already finalized and does not restart`
        );
      }
      await sql`
        INSERT INTO ads_sync.sync_stream_runs (
          id, run_id, connection_id, provider, stream_name, status, generation_id
        )
        VALUES (
          ${streamRunId}, ${params.runId}, ${connection.connectionId},
          ${connection.provider}, ${connection.streamName}, 'running', ${generationId}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      deps.progress?.(params.runId, {
        connectionId: connection.connectionId,
        event: "stream_started",
        provider: connection.provider,
        runId: params.runId,
        streamName: connection.streamName,
        streamRunId,
      });

      return {
        catalogHash: connection.catalogHash,
        connection,
        configuredCatalogHash,
        generationId,
        generationMetadata,
        keys,
        lockKey: `ads_sync:${connection.connectionId}:${connection.streamName}`,
        runId: params.runId,
        runWindow,
        sourceConfigHash,
        streamRunId,
      } satisfies PreparedQualifiedRun;
    });

  const acquireLease = (prepared: PreparedQualifiedRun) =>
    withSql(async (sql) => {
      await acquireStreamLease(sql, leaseOf(prepared));
      return { leaseKey: prepared.lockKey };
    });

  const releaseLease = async (prepared: PreparedQualifiedRun) => {
    try {
      await withSql((sql) => releaseStreamLease(sql, leaseOf(prepared)));
      return { released: true };
    } catch (error) {
      const message = boundedFailureText(
        error instanceof Error ? error.message : String(error)
      );
      console.warn("Could not release ads sync stream lease", {
        connectionId: prepared.connection.connectionId,
        error: message,
        runId: prepared.runId,
        streamRunId: prepared.streamRunId,
      });
      return { error: message, released: false };
    }
  };

  const readSource = (prepared: PreparedQualifiedRun) =>
    withSql(async (sql): Promise<SourceReadResult> => {
      await extendStreamLease(sql, leaseOf(prepared));
      const catalogSource = deps.connections.configuredCatalog(
        prepared.connection
      );
      const sourceConfig = await sourceConfigFor(prepared);
      const configuredCatalog = stampConfiguredCatalog(
        catalogSource,
        prepared.generationId
      );
      const sourceState = prepared.runWindow
        ? undefined
        : ((await loadCommittedState(sql, {
            configuredCatalogHash: prepared.configuredCatalogHash,
            connectionId: prepared.connection.connectionId,
            provider: prepared.connection.provider,
            sourceConfigHash: prepared.sourceConfigHash,
            streamName: prepared.connection.streamName,
          })) ?? (await deps.custody.seedState(prepared.connection)));

      // oxlint-disable-next-line react-doctor/async-parallel -- artifact and control writes preserve observable ordering
      await putJson(prepared.keys.catalogKey, configuredCatalog);
      await insertArtifact(sql, {
        contentType: "application/json; charset=utf-8",
        key: prepared.keys.catalogKey,
        kind: "configured_catalog",
        manifest: await artifactManifestForText(
          "configured_catalog",
          JSON.stringify(configuredCatalog, null, 2)
        ),
        provider: prepared.connection.provider,
        runId: prepared.runId,
        streamRunId: prepared.streamRunId,
      });
      await sql`
        INSERT INTO ads_sync.sync_catalog_snapshots (
          id, run_id, stream_run_id, provider, stream_name, catalog_hash, catalog_json
        )
        VALUES (
          ${crypto.randomUUID()}, ${prepared.runId}, ${prepared.streamRunId},
          ${prepared.connection.provider}, ${prepared.connection.streamName},
          ${prepared.configuredCatalogHash}, ${sql.json(configuredCatalog as never)}
        )
        ON CONFLICT DO NOTHING
      `;

      if (sourceState !== undefined && prepared.keys.stateInputKey) {
        await putJson(prepared.keys.stateInputKey, sourceState);
        await insertArtifact(sql, {
          contentType: "application/json; charset=utf-8",
          key: prepared.keys.stateInputKey,
          kind: "state_input",
          manifest: await artifactManifestForText(
            "state_input",
            JSON.stringify(sourceState, null, 2)
          ),
          provider: prepared.connection.provider,
          runId: prepared.runId,
          streamRunId: prepared.streamRunId,
        });
      }

      deps.progress?.(prepared.runId, {
        connectionId: prepared.connection.connectionId,
        event: "source_read_started",
        provider: prepared.connection.provider,
        runId: prepared.runId,
        streamRunId: prepared.streamRunId,
      });
      const { provider } = prepared.connection;
      const sourceArtifact = await withLeaseRefresh(prepared, () =>
        readSourceArtifact(
          deps.containers.source(
            provider,
            connectorContainerIdForStreamRun(provider, prepared.streamRunId)
          ),
          {
            coldStart: deps.coldStart,
            expected: deps.containers.pins[provider],
            payload: {
              catalog: configuredCatalog,
              config: sourceConfig,
              state: sourceState,
            },
            provider,
          }
        )
      );
      // Enforce on the redacted text: it is the byte source for the
      // destination input, and redaction can grow the text by a few bytes.
      const redacted = redactConnectorResponse(sourceArtifact);
      enforceTextArtifactLimits("Source stdout", redacted.stdout, limits);
      const bounded = boundConnectorResponse(redacted);
      const manifests = await persistPair(sql, prepared, {
        response: bounded,
        stderrKey: prepared.keys.sourceStderrKey,
        stderrKind: "source_stderr",
        stdoutKey: prepared.keys.sourceStdoutKey,
        stdoutKind: "source_stdout",
      });
      return {
        source: summarizeAirbyteMessages(bounded.stdout),
        sourceStderrManifest: manifests.stderrManifest,
        sourceStdoutManifest: manifests.stdoutManifest,
      };
    });

  const compileDestinationInputStep = async (
    prepared: PreparedQualifiedRun
  ): Promise<DestinationInputResult> => {
    const sourceStdout = await readText(prepared.keys.sourceStdoutKey);
    const destinationInput = compileDestinationInput(sourceStdout, limits);
    const manifest = await artifactManifestForText(
      "destination_input",
      destinationInput.messages
    );
    return withSql(async (sql) => {
      await putText(
        prepared.keys.destinationInputKey,
        destinationInput.messages,
        "application/x-ndjson; charset=utf-8"
      );
      await insertArtifact(sql, {
        contentType: "application/x-ndjson; charset=utf-8",
        key: prepared.keys.destinationInputKey,
        kind: "destination_input",
        manifest,
        provider: prepared.connection.provider,
        runId: prepared.runId,
        streamRunId: prepared.streamRunId,
      });
      return {
        destinationInputManifest: manifest,
        droppedLines: destinationInput.droppedLines,
        summary: destinationInput.summary,
      };
    });
  };

  const writeDestination = (prepared: PreparedQualifiedRun) =>
    withSql(async (sql): Promise<DestinationWriteResult> => {
      await extendStreamLease(sql, leaseOf(prepared));
      const configuredCatalog = stampConfiguredCatalog(
        deps.connections.configuredCatalog(prepared.connection),
        prepared.generationId
      );
      const destinationConfig = destinationConfigForProvider(
        await deps.custody.destinationConfig(prepared.connection),
        prepared.connection.provider,
        prepared.connection.airbyteSchema
      );
      const messages = await readText(prepared.keys.destinationInputKey);
      deps.progress?.(prepared.runId, {
        connectionId: prepared.connection.connectionId,
        event: "destination_write_started",
        provider: prepared.connection.provider,
        records: summarizeAirbyteMessages(messages).records,
        runId: prepared.runId,
        streamRunId: prepared.streamRunId,
      });
      const destination = await withLeaseRefresh(prepared, () =>
        writeDestinationContainer(
          deps.containers.destination(
            connectorContainerIdForStreamRun(
              "destination",
              prepared.streamRunId
            )
          ),
          {
            coldStart: deps.coldStart,
            expected: deps.containers.pins.destination,
            payload: {
              catalog: configuredCatalog,
              config: destinationConfig,
              messages,
            },
          }
        )
      );
      // The destination write succeeded: commit state now, after a fresh
      // lifecycle check. A failed write threw above and never reaches here.
      const stateCommit = await commitFromDestinationStdout(
        sql,
        prepared,
        destination.stdout
      );
      const bounded = boundConnectorResponse(
        redactConnectorResponse(destination)
      );
      let manifests: {
        stderrManifest: ArtifactManifest;
        stdoutManifest: ArtifactManifest;
      };
      try {
        manifests = await persistPair(sql, prepared, {
          response: bounded,
          stderrKey: prepared.keys.destinationStderrKey,
          stderrKind: "destination_stderr",
          stdoutKey: prepared.keys.destinationStdoutKey,
          stdoutKind: "destination_stdout",
        });
      } catch (error) {
        console.warn("Could not persist ads sync destination artifacts", {
          connectionId: prepared.connection.connectionId,
          error: boundedFailureText(
            error instanceof Error ? error.message : String(error)
          ),
          provider: prepared.connection.provider,
          runId: prepared.runId,
          streamRunId: prepared.streamRunId,
        });
        manifests = {
          stderrManifest: await artifactManifestForText(
            "destination_stderr",
            bounded.stderr
          ),
          stdoutManifest: await artifactManifestForText(
            "destination_stdout",
            bounded.stdout
          ),
        };
      }
      return {
        destination: summarizeAirbyteMessages(destination.stdout),
        destinationStderrManifest: manifests.stderrManifest,
        destinationStdoutManifest: manifests.stdoutManifest,
        stateCommit,
      };
    });

  const commitState = async (
    prepared: PreparedQualifiedRun
  ): Promise<StateCommitResult> => {
    const already = await withSql((sql) =>
      hasStateCommit(sql, prepared.streamRunId)
    );
    if (already) {
      return { alreadyCommitted: true, committed: true };
    }
    const destinationStdout = await readText(
      prepared.keys.destinationStdoutKey
    );
    return withSql((sql) =>
      commitFromDestinationStdout(sql, prepared, destinationStdout)
    );
  };

  const recordGeneration = (prepared: PreparedQualifiedRun) =>
    withSql(async (sql) => {
      await sql`
        INSERT INTO ads_sync.sync_generation_ledger (
          id, run_id, stream_run_id, connection_id, provider, stream_name,
          generation_id, sync_id, minimum_generation_id
        )
        VALUES (
          ${crypto.randomUUID()}, ${prepared.runId}, ${prepared.streamRunId},
          ${prepared.connection.connectionId}, ${prepared.connection.provider},
          ${prepared.connection.streamName}, ${prepared.generationMetadata.generationId},
          ${prepared.generationMetadata.syncId}, ${prepared.generationMetadata.minimumGenerationId}
        )
        ON CONFLICT DO NOTHING
      `;
      return { recorded: true };
    });

  const finalizeSucceeded = (
    prepared: PreparedQualifiedRun,
    result: {
      destination: DestinationWriteResult;
      destinationInput: DestinationInputResult;
    }
  ) =>
    withSql(async (sql) => {
      let sourceSummary = summarizeAirbyteMessages("");
      try {
        sourceSummary = summarizeAirbyteMessages(
          await readText(prepared.keys.sourceStdoutKey)
        );
      } catch (error) {
        console.warn("Could not read ads sync source summary artifact", {
          error: boundedFailureText(
            error instanceof Error ? error.message : String(error)
          ),
          runId: prepared.runId,
          streamRunId: prepared.streamRunId,
        });
      }
      const summary: QualifiedRunSummary = {
        destination: result.destination.destination,
        destinationInput: {
          droppedLines: result.destinationInput.droppedLines,
          manifest: result.destinationInput.destinationInputManifest,
          summary: result.destinationInput.summary,
        },
        provider: prepared.connection.provider,
        source: sourceSummary,
        stateCommit: result.destination.stateCommit,
        streamName: prepared.connection.streamName,
        streamRunId: prepared.streamRunId,
      };
      const summaryManifest = await artifactManifestForText(
        "summary",
        JSON.stringify(summary, null, 2)
      );
      await (sql as postgres.Sql).begin(async (transaction) => {
        // oxlint-disable-next-line react-doctor/async-parallel -- the success transaction is ordered on purpose
        await transaction`
          UPDATE ads_sync.sync_runs
          SET status = 'succeeded', finished_at = now()
          WHERE id = ${prepared.runId}
        `;
        await deps.onSucceeded?.(transaction, prepared);
        await transaction`
          UPDATE ads_sync.sync_stream_runs
          SET
            status = 'succeeded',
            source_record_count = ${sourceSummary.records},
            state_count = ${sourceSummary.states},
            finished_at = now()
          WHERE id = ${prepared.streamRunId}
        `;
      });
      try {
        await putJson(prepared.keys.summaryKey, summary);
        await insertArtifact(sql, {
          contentType: "application/json; charset=utf-8",
          key: prepared.keys.summaryKey,
          kind: "summary",
          manifest: summaryManifest,
          provider: prepared.connection.provider,
          runId: prepared.runId,
          streamRunId: prepared.streamRunId,
        });
      } catch (error) {
        console.warn("Could not persist ads sync success summary artifact", {
          error: boundedFailureText(
            error instanceof Error ? error.message : String(error)
          ),
          runId: prepared.runId,
          streamRunId: prepared.streamRunId,
        });
      }
      try {
        deps.progress?.(prepared.runId, {
          event: "run_succeeded",
          runId: prepared.runId,
          ...summary,
        });
      } catch (error) {
        console.warn("Could not publish ads sync success progress", {
          error: boundedFailureText(
            error instanceof Error ? error.message : String(error)
          ),
          runId: prepared.runId,
        });
      }
      return summary;
    });

  const finalizeFailed = (
    params: QualifiedRunParams,
    prepared: PreparedQualifiedRun | undefined,
    rawMessage: string
  ) =>
    withSql(async (sql) => {
      const message = boundedFailureText(rawMessage);
      if (prepared) {
        await sql`
          UPDATE ads_sync.sync_stream_runs
          SET status = 'failed', finished_at = now(), error_type = 'runtime_error', error_message = ${message}
          WHERE id = ${prepared.streamRunId}
        `;
      }
      // A run that is already terminal (failed by a sweep, for example) keeps
      // its first verdict; only an active run is moved to `failed` here.
      // oxlint-disable-next-line react-doctor/async-parallel -- failure bookkeeping is ordered so the run is terminal first
      await sql`
        UPDATE ads_sync.sync_runs
        SET status = 'failed', finished_at = now(), error_type = 'runtime_error', error_message = ${message}
        WHERE id = ${params.runId}
          AND status IN ('queued', 'running')
      `;
      await deps.onFailed?.(sql, params.runId);
      await sql`
        UPDATE ads_sync.sync_run_windows
        SET status = 'failed', finished_at = now(), error_message = ${message}, updated_at = now()
        WHERE run_id = ${params.runId}
      `;
      await sql`
        INSERT INTO ads_sync.sync_errors (id, run_id, stream_run_id, provider, error_type, error_message, error_json)
        VALUES (
          ${crypto.randomUUID()}, ${params.runId}, ${prepared?.streamRunId ?? null},
          ${prepared?.connection.provider ?? null}, 'runtime_error', ${message},
          ${sql.json({ message } as never)}
        )
      `;
      deps.progress?.(params.runId, {
        connectionId: params.connectionId,
        error: message,
        event: "run_failed",
        runId: params.runId,
      });
    });

  const run = async (params: QualifiedRunParams) => {
    let prepared: PreparedQualifiedRun | undefined;
    try {
      prepared = await prepare(params);
      // oxlint-disable-next-line react-doctor/async-parallel -- a Qualified Run is a strict step sequence
      await acquireLease(prepared);
      await readSource(prepared);
      const destinationInput = await compileDestinationInputStep(prepared);
      const destination = await writeDestination(prepared);
      await commitState(prepared);
      await recordGeneration(prepared);
      return await finalizeSucceeded(prepared, {
        destination,
        destinationInput,
      });
    } catch (error) {
      await finalizeFailed(
        params,
        prepared,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    } finally {
      if (prepared) {
        await releaseLease(prepared);
      }
    }
  };

  return {
    acquireLease,
    commitState,
    compileDestinationInput: compileDestinationInputStep,
    finalizeFailed,
    finalizeSucceeded,
    prepare,
    readSource,
    recordGeneration,
    releaseLease,
    run,
    writeDestination,
  };
}

function leaseOf(prepared: PreparedQualifiedRun): StreamLease {
  return {
    leaseKey: prepared.lockKey,
    runId: prepared.runId,
    streamRunId: prepared.streamRunId,
  };
}

async function commitFromDestinationStdout(
  sql: ControlSql,
  prepared: PreparedQualifiedRun,
  destinationStdout: string
): Promise<StateCommitResult> {
  const committedState = committedStateAfterDestinationResult({
    destinationStdout,
    sourceStdout: "",
    writeSucceeded: true,
  });
  if (!committedState) {
    return { committed: false, reason: "no_state" };
  }
  await assertRunMayCommit(sql, {
    connectionId: prepared.connection.connectionId,
    leaseKey: prepared.lockKey,
    runId: prepared.runId,
    streamRunId: prepared.streamRunId,
  });
  await insertStateCommit(sql, {
    configuredCatalogHash: prepared.configuredCatalogHash,
    connectionId: prepared.connection.connectionId,
    provider: prepared.connection.provider,
    runId: prepared.runId,
    sourceConfigHash: prepared.sourceConfigHash,
    state: committedState,
    streamName: prepared.connection.streamName,
    streamRunId: prepared.streamRunId,
  });
  return { committed: true };
}

async function sha256Json(value: unknown) {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
