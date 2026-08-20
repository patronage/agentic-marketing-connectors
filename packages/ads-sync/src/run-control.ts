/**
 * Control-store operations a Qualified Run needs on the package-owned
 * `ads_sync` schema: connection loading, stream leases, committed-state
 * lookup, the fresh lifecycle check before a state commit, and artifact rows.
 *
 * Every function takes a postgres.js client so the caller owns connection
 * lifetime (Hyperdrive on Cloudflare, a direct client elsewhere).
 */
import type postgres from "postgres";

import type { ArtifactManifest, SyncConnectionDefinition } from "./core.js";
import type { AdsSyncProvider } from "./provider-contract.js";
import { isAdsSyncProvider, providerDefinitions } from "./providers.js";

export type ControlSql = postgres.Sql | postgres.TransactionSql;

export interface StreamLease {
  leaseKey: string;
  runId: string;
  streamRunId: string;
}

export interface SyncConnectionRow {
  account_id: string | null;
  airbyte_schema: string;
  configured_catalog_hash: string | null;
  configured_catalog_ref: string | null;
  display_name: string | null;
  id: string;
  next_run_at: Date | string | null;
  provider: string;
  reporting_enabled: boolean;
  schedule_cron: string | null;
  schedule_every_minutes: number | null;
  selected_streams: unknown;
  source_config_fingerprint: string | null;
  source_config_ref: string | null;
  source_identity: unknown;
  state_config_ref: string | null;
  status: string;
  stream_group: string | null;
  stream_name: string;
}

export class RunLifecycleError extends Error {
  override name = "RunLifecycleError";
}

export function syncConnectionFromRow(
  row: SyncConnectionRow
): SyncConnectionDefinition {
  if (!isAdsSyncProvider(row.provider)) {
    throw new Error(`Unsupported connection provider ${row.provider}`);
  }
  const definition = providerDefinitions[row.provider];
  return {
    accountId: row.account_id,
    airbyteSchema: row.airbyte_schema,
    catalogConfigRef:
      row.configured_catalog_ref ?? `ads-sync.config.ts#${row.id}.catalog`,
    catalogHash: row.configured_catalog_hash ?? "",
    connectionId: row.id,
    displayName: row.display_name || `${definition.displayName} default`,
    enabled: row.status === "enabled",
    provider: row.provider,
    reportingEnabled: row.reporting_enabled,
    scheduleCron: row.schedule_cron,
    scheduleEveryMinutes: row.schedule_every_minutes,
    selectedStreams: normalizedSelectedStreams(row.selected_streams),
    sourceConfigFingerprint: row.source_config_fingerprint ?? "",
    sourceConfigRef: row.source_config_ref ?? definition.sourceConfigSecret,
    sourceIdentity: normalizedSourceIdentity(row.source_identity),
    stateConfigRef: row.state_config_ref ?? definition.stateSecret,
    streamGroup: row.stream_group || row.stream_name,
    streamName: row.stream_name,
  };
}

export async function loadEnabledConnection(
  sql: ControlSql,
  connectionId: string
) {
  const rows = await sql<SyncConnectionRow[]>`
    SELECT *
    FROM ads_sync.sync_connections
    WHERE id = ${connectionId}
      AND status = 'enabled'
    LIMIT 1
  `;
  if (!rows[0]) {
    throw new Error(`Enabled sync connection ${connectionId} was not found`);
  }
  return syncConnectionFromRow(rows[0]);
}

export function normalizedSourceIdentity(
  value: unknown
): Record<string, string | string[] | null> {
  if (!isPlainRecord(value)) {
    return {};
  }

  const entries: [string, string | string[] | null][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === "string") {
      entries.push([key, item]);
    } else if (Array.isArray(item)) {
      if (item.some((entry) => typeof entry !== "string")) {
        throw new Error(
          "Sync connection source identity arrays may contain only strings."
        );
      }
      entries.push([key, [...item]]);
    } else {
      throw new TypeError(
        "Sync connection source identity values may contain only strings, string arrays, or null."
      );
    }
  }
  return Object.fromEntries(entries);
}

export async function acquireStreamLease(sql: ControlSql, lease: StreamLease) {
  await sql`
    UPDATE ads_sync.sync_stream_runs
    SET
      status = 'failed',
      finished_at = COALESCE(finished_at, now()),
      error_type = COALESCE(error_type, 'lease_expired'),
      error_message = COALESCE(error_message, 'Stream lease expired before release')
    WHERE status = 'running'
      AND id IN (
        SELECT stream_run_id
        FROM ads_sync.sync_stream_leases
        WHERE lease_key = ${lease.leaseKey}
          AND expires_at < now()
      )
  `;

  const rows = await sql<{ lease_key: string }[]>`
    INSERT INTO ads_sync.sync_stream_leases (
      lease_key, run_id, stream_run_id, acquired_at, expires_at
    )
    VALUES (
      ${lease.leaseKey}, ${lease.runId}, ${lease.streamRunId}, now(), now() + interval '2 hours'
    )
    ON CONFLICT (lease_key) DO UPDATE
      SET run_id = EXCLUDED.run_id,
          stream_run_id = EXCLUDED.stream_run_id,
          acquired_at = now(),
          expires_at = EXCLUDED.expires_at
      WHERE ads_sync.sync_stream_leases.expires_at < now()
    RETURNING lease_key
  `;

  if (!rows[0]) {
    throw new Error(`A sync is already running for ${lease.leaseKey}`);
  }
}

export async function extendStreamLease(sql: ControlSql, lease: StreamLease) {
  const rows = await sql<{ lease_key: string }[]>`
    UPDATE ads_sync.sync_stream_leases
    SET expires_at = now() + interval '2 hours'
    WHERE lease_key = ${lease.leaseKey}
      AND run_id = ${lease.runId}
      AND stream_run_id = ${lease.streamRunId}
    RETURNING lease_key
  `;

  if (!rows[0]) {
    throw new Error(`Lost stream lease for ${lease.leaseKey}`);
  }
}

export async function releaseStreamLease(sql: ControlSql, lease: StreamLease) {
  await sql`
    DELETE FROM ads_sync.sync_stream_leases
    WHERE lease_key = ${lease.leaseKey}
      AND run_id = ${lease.runId}
      AND stream_run_id = ${lease.streamRunId}
  `;
}

export async function releaseRunLeases(sql: ControlSql, runId: string) {
  // oxlint-disable-next-line react-doctor/async-parallel -- these stateful operations intentionally preserve observable ordering
  const failedStreams = await sql<{ id: string }[]>`
    UPDATE ads_sync.sync_stream_runs
    SET
      status = 'failed',
      finished_at = COALESCE(finished_at, now()),
      error_type = COALESCE(error_type, 'manual_lease_release'),
      error_message = COALESCE(error_message, 'Stream lease manually released')
    WHERE run_id = ${runId}
      AND status = 'running'
    RETURNING id
  `;

  // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- these stateful operations intentionally preserve observable ordering
  const failedRuns = await sql<{ id: string }[]>`
    UPDATE ads_sync.sync_runs
    SET
      status = 'failed',
      finished_at = COALESCE(finished_at, now()),
      error_type = COALESCE(error_type, 'manual_lease_release'),
      error_message = COALESCE(error_message, 'Run lease manually released')
    WHERE id = ${runId}
      AND status = 'running'
    RETURNING id
  `;

  const releasedLeases = await sql<{ lease_key: string }[]>`
    DELETE FROM ads_sync.sync_stream_leases
    WHERE run_id = ${runId}
    RETURNING lease_key
  `;

  return {
    leases: releasedLeases.map((row) => row.lease_key),
    runsMarkedFailed: failedRuns.length,
    streamsMarkedFailed: failedStreams.length,
  };
}

/**
 * Latest committed state for this connection, source-config hash, and
 * configured-catalog hash. Returns `undefined` when no commit exists.
 */
export async function loadCommittedState(
  sql: ControlSql,
  options: {
    configuredCatalogHash: string;
    connectionId?: string;
    provider: AdsSyncProvider;
    sourceConfigHash: string;
    streamName: string;
  }
) {
  const rows = await sql<{ state_json: unknown }[]>`
    SELECT state_commits.state_json
    FROM ads_sync.sync_state_commits AS state_commits
    INNER JOIN ads_sync.sync_stream_runs AS stream_runs
      ON stream_runs.id = state_commits.stream_run_id
    WHERE state_commits.provider = ${options.provider}
      AND state_commits.stream_name = ${options.streamName}
      AND stream_runs.status = 'succeeded'
      AND (
        ${options.connectionId ?? null}::text IS NULL
        OR state_commits.connection_id = ${options.connectionId ?? null}
        OR state_commits.connection_id IS NULL
      )
      AND state_commits.source_config_hash = ${options.sourceConfigHash}
      AND state_commits.configured_catalog_hash = ${options.configuredCatalogHash}
    ORDER BY
      (state_commits.connection_id = ${options.connectionId ?? null}) DESC NULLS LAST,
      state_commits.committed_at DESC
    LIMIT 1
  `;

  return rows[0]?.state_json;
}

/**
 * Fresh lifecycle check before a state commit (friction #20).
 *
 * The connection must still be enabled and the stream run must still be
 * running under this run. A released lease, a disabled connection, or a run
 * that was marked failed while the destination wrote all block the commit.
 */
export async function assertRunMayCommit(
  sql: ControlSql,
  options: {
    connectionId: string;
    leaseKey: string;
    runId: string;
    streamRunId: string;
  }
) {
  const rows = await sql<
    {
      connection_status: string | null;
      lease_run_id: string | null;
      run_status: string | null;
      stream_status: string | null;
    }[]
  >`
    SELECT
      connection.status AS connection_status,
      run.status AS run_status,
      stream_run.status AS stream_status,
      lease.run_id AS lease_run_id
    FROM ads_sync.sync_stream_runs AS stream_run
    LEFT JOIN ads_sync.sync_runs AS run ON run.id = stream_run.run_id
    LEFT JOIN ads_sync.sync_connections AS connection ON connection.id = stream_run.connection_id
    LEFT JOIN ads_sync.sync_stream_leases AS lease ON lease.lease_key = ${options.leaseKey}
    WHERE stream_run.id = ${options.streamRunId}
      AND stream_run.run_id = ${options.runId}
      AND stream_run.connection_id = ${options.connectionId}
    LIMIT 1
  `;
  const [row] = rows;
  if (!row) {
    throw new RunLifecycleError(
      `Stream run ${options.streamRunId} is not part of run ${options.runId}; state commit refused`
    );
  }
  if (row.connection_status !== "enabled") {
    throw new RunLifecycleError(
      `Connection ${options.connectionId} is no longer enabled; state commit refused`
    );
  }
  if (row.run_status !== "running" || row.stream_status !== "running") {
    throw new RunLifecycleError(
      `Run ${options.runId} is no longer running; state commit refused`
    );
  }
  if (row.lease_run_id !== options.runId) {
    throw new RunLifecycleError(
      `Stream lease ${options.leaseKey} is not held by run ${options.runId}; state commit refused`
    );
  }
}

export async function insertStateCommit(
  sql: ControlSql,
  commit: {
    configuredCatalogHash: string;
    connectionId: string;
    provider: AdsSyncProvider;
    runId: string;
    sourceConfigHash: string;
    state: unknown;
    streamName: string;
    streamRunId: string;
  }
) {
  await sql`
    INSERT INTO ads_sync.sync_state_commits (
      id, run_id, stream_run_id, connection_id, provider, stream_name,
      source_config_hash, configured_catalog_hash, state_json
    )
    VALUES (
      ${crypto.randomUUID()}, ${commit.runId}, ${commit.streamRunId},
      ${commit.connectionId}, ${commit.provider},
      ${commit.streamName}, ${commit.sourceConfigHash},
      ${commit.configuredCatalogHash}, ${sql.json(commit.state as never)}
    )
    ON CONFLICT DO NOTHING
  `;
}

export async function hasStateCommit(sql: ControlSql, streamRunId: string) {
  const existing = await sql<{ id: string }[]>`
    SELECT id
    FROM ads_sync.sync_state_commits
    WHERE stream_run_id = ${streamRunId}
    LIMIT 1
  `;
  return existing.length > 0;
}

export async function insertArtifact(
  sql: ControlSql,
  artifact: {
    byteLength?: number;
    contentType?: string;
    key: string;
    kind: string;
    manifest?: ArtifactManifest;
    provider?: AdsSyncProvider;
    runId: string;
    streamRunId?: string;
  }
) {
  const manifest = artifactInsertMetrics(artifact);
  await sql`
    INSERT INTO ads_sync.sync_artifacts (
      id, run_id, stream_run_id, provider, artifact_kind, r2_key, content_type,
      byte_length, sha256, line_count, record_count, state_count, log_count,
      trace_count, first_record_emitted_at, last_record_emitted_at
    )
    VALUES (
      ${crypto.randomUUID()}, ${artifact.runId}, ${artifact.streamRunId ?? null},
      ${artifact.provider ?? null}, ${artifact.kind}, ${artifact.key},
      ${artifact.contentType ?? null},
      ${manifest.byteLength},
      ${manifest.sha256},
      ${manifest.lineCount},
      ${manifest.recordCount},
      ${manifest.stateCount},
      ${manifest.logCount},
      ${manifest.traceCount},
      ${manifest.firstRecordEmittedAt},
      ${manifest.lastRecordEmittedAt}
    )
    ON CONFLICT (stream_run_id, artifact_kind)
      WHERE stream_run_id IS NOT NULL
      DO UPDATE SET
        r2_key = EXCLUDED.r2_key,
        content_type = EXCLUDED.content_type,
        byte_length = EXCLUDED.byte_length,
        sha256 = EXCLUDED.sha256,
        line_count = EXCLUDED.line_count,
        record_count = EXCLUDED.record_count,
        state_count = EXCLUDED.state_count,
        log_count = EXCLUDED.log_count,
        trace_count = EXCLUDED.trace_count,
        first_record_emitted_at = EXCLUDED.first_record_emitted_at,
        last_record_emitted_at = EXCLUDED.last_record_emitted_at
  `;
}

function artifactInsertMetrics(artifact: {
  byteLength?: number;
  manifest?: ArtifactManifest;
}) {
  return {
    byteLength: artifact.manifest?.byteCount ?? artifact.byteLength ?? null,
    firstRecordEmittedAt: artifact.manifest?.firstRecordEmittedAt ?? null,
    lastRecordEmittedAt: artifact.manifest?.lastRecordEmittedAt ?? null,
    lineCount: artifact.manifest?.lineCount ?? null,
    logCount: artifact.manifest?.logCount ?? null,
    recordCount: artifact.manifest?.recordCount ?? null,
    sha256: artifact.manifest?.sha256 ?? null,
    stateCount: artifact.manifest?.stateCount ?? null,
    traceCount: artifact.manifest?.traceCount ?? null,
  };
}

const normalizedSelectedStreams = (value: unknown) => {
  if (
    !Array.isArray(value) ||
    value.some((streamName) => typeof streamName !== "string")
  ) {
    throw new TypeError(
      "Sync connection selected_streams must be an array of strings"
    );
  }
  return value;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
