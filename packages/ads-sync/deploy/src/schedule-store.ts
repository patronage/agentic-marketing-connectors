/**
 * Postgres persistence for the scheduled tick (`ScheduleStore`).
 *
 * The store writes only control rows: the connection row the seam loads, the
 * run row, the tick ledger, and the watermark. It never stores secret
 * material (ADR 0047).
 */
import type { SyncConnectionDefinition } from "@patronage/ads-sync";
import { releaseRunLeases } from "@patronage/ads-sync/run";
import type { ControlSql } from "@patronage/ads-sync/run";
import type postgres from "postgres";

import { advanceWatermark } from "./schedule.js";
import type {
  ScheduleStore,
  ScheduleTickRecord,
  ScheduledRunRow,
} from "./scheduled-run.js";

interface WatermarkRow {
  watermark_end: Date | string;
}

/** Reads the committed watermark. Exported for the `/runs` view. */
export async function loadWatermark(
  sql: ControlSql,
  connectionId: string
): Promise<Date | null> {
  const rows = await sql<WatermarkRow[]>`
    SELECT watermark_end
    FROM ads_sync.sync_watermarks
    WHERE connection_id = ${connectionId}
    LIMIT 1
  `;
  const [row] = rows;
  return row ? new Date(row.watermark_end) : null;
}

/**
 * Monotonic watermark commit. Locks the row when it exists, applies
 * `advanceWatermark`, and upserts with a guard that only moves the
 * watermark forward. The guard also serializes the first-ever commit, where
 * `FOR UPDATE` locks nothing: a concurrent commit that lands first turns the
 * upsert into a no-op, and a no-op against a higher committed value is a
 * regression. A regression throws and aborts the enclosing transaction.
 */
export async function commitWatermark(
  sql: ControlSql,
  input: { connectionId: string; runId: string; watermarkEnd: Date }
): Promise<{ changed: boolean }> {
  const rows = await sql<WatermarkRow[]>`
    SELECT watermark_end
    FROM ads_sync.sync_watermarks
    WHERE connection_id = ${input.connectionId}
    FOR UPDATE
  `;
  const committed = rows[0] ? new Date(rows[0].watermark_end) : null;
  const next = advanceWatermark(committed, input.watermarkEnd);
  if (!next.changed) {
    return { changed: false };
  }
  const advanced = await sql<WatermarkRow[]>`
    INSERT INTO ads_sync.sync_watermarks (connection_id, watermark_end, run_id, committed_at)
    VALUES (${input.connectionId}, ${next.watermark}, ${input.runId}, now())
    ON CONFLICT (connection_id) DO UPDATE
    SET watermark_end = EXCLUDED.watermark_end,
        run_id = EXCLUDED.run_id,
        committed_at = now()
    WHERE EXCLUDED.watermark_end > ads_sync.sync_watermarks.watermark_end
    RETURNING watermark_end
  `;
  if (advanced[0]) {
    return { changed: true };
  }
  // The guard rejected the write: another commit landed between the read
  // and the upsert. Re-read and apply the same monotonic rule to it.
  const current = await sql<WatermarkRow[]>`
    SELECT watermark_end
    FROM ads_sync.sync_watermarks
    WHERE connection_id = ${input.connectionId}
    LIMIT 1
  `;
  const concurrent = current[0] ? new Date(current[0].watermark_end) : null;
  return { changed: advanceWatermark(concurrent, next.watermark).changed };
}

export async function ensureConnection(
  sql: ControlSql,
  connection: SyncConnectionDefinition
) {
  await sql`
    INSERT INTO ads_sync.sync_connections (
      id, provider, display_name, account_id, source_identity, source_config_ref,
      source_config_fingerprint, configured_catalog_ref, configured_catalog_hash,
      selected_streams, stream_group, stream_name, airbyte_schema, status,
      reporting_enabled, schedule_cron, schedule_every_minutes, state_config_ref,
      updated_at
    )
    VALUES (
      ${connection.connectionId}, ${connection.provider}, ${connection.displayName},
      ${connection.accountId}, ${sql.json(connection.sourceIdentity as never)},
      ${connection.sourceConfigRef}, ${connection.sourceConfigFingerprint},
      ${connection.catalogConfigRef}, ${connection.catalogHash},
      ${sql.json(connection.selectedStreams as never)}, ${connection.streamGroup},
      ${connection.streamName}, ${connection.airbyteSchema},
      ${connection.enabled ? "enabled" : "disabled"}, ${connection.reportingEnabled},
      ${connection.scheduleCron}, ${connection.scheduleEveryMinutes},
      ${connection.stateConfigRef}, now()
    )
    ON CONFLICT (id) DO UPDATE
    SET provider = EXCLUDED.provider,
        display_name = EXCLUDED.display_name,
        account_id = EXCLUDED.account_id,
        source_identity = EXCLUDED.source_identity,
        source_config_ref = EXCLUDED.source_config_ref,
        source_config_fingerprint = EXCLUDED.source_config_fingerprint,
        configured_catalog_ref = EXCLUDED.configured_catalog_ref,
        configured_catalog_hash = EXCLUDED.configured_catalog_hash,
        selected_streams = EXCLUDED.selected_streams,
        stream_group = EXCLUDED.stream_group,
        stream_name = EXCLUDED.stream_name,
        airbyte_schema = EXCLUDED.airbyte_schema,
        status = EXCLUDED.status,
        reporting_enabled = EXCLUDED.reporting_enabled,
        schedule_cron = EXCLUDED.schedule_cron,
        schedule_every_minutes = EXCLUDED.schedule_every_minutes,
        state_config_ref = EXCLUDED.state_config_ref,
        updated_at = now()
  `;
}

export async function insertRun(sql: ControlSql, row: ScheduledRunRow) {
  await sql`
    INSERT INTO ads_sync.sync_runs (
      id, connection_id, trigger_type, requested_providers, status, started_at, finished_at
    )
    VALUES (
      ${row.runId}, ${row.connectionId}, ${row.triggerType},
      ${sql.json([row.provider] as never)}, ${row.status}, now(),
      CASE WHEN ${row.finished}::boolean THEN now() ELSE NULL END
    )
  `;
}

const ORPHANED_RUN_MESSAGE =
  "Run lost its executor before it finalized; failed closed by the next tick";
const STALE_WINDOW_MESSAGE =
  "Committed watermark moved after the run was planned; the plan-time window is stale";

/**
 * Fails closed the runs of a connection that are still `queued` or `running`,
 * started before `startedBefore`, and hold no unexpired stream lease. Then it
 * releases the (expired) leases of each orphan through the seam so the next
 * tick can acquire the lease at once.
 *
 * Liveness comes from the lease, not from age: a run whose lease is still
 * valid is a live run and is never swept, whatever its age. Age only bounds
 * runs that hold no lease at all (`queued` runs whose executor never started
 * them).
 */
export async function failOrphanedRuns(
  sql: ControlSql,
  input: { connectionId: string; runId?: string; startedBefore: Date }
): Promise<{ runIds: string[] }> {
  // Scalar parameters only: the Worker client runs with `fetch_types: false`,
  // so postgres.js cannot serialize array parameters.
  const runId = input.runId ?? null;
  const rows = await sql<{ id: string }[]>`
    UPDATE ads_sync.sync_runs AS r
    SET
      status = 'failed',
      finished_at = now(),
      error_type = 'orphaned',
      error_message = ${ORPHANED_RUN_MESSAGE}
    WHERE r.connection_id = ${input.connectionId}
      AND r.status IN ('queued', 'running')
      AND r.started_at < ${input.startedBefore}
      AND (${runId}::text IS NULL OR r.id = ${runId}::text)
      AND NOT EXISTS (
        SELECT 1
        FROM ads_sync.sync_stream_leases AS lease
        WHERE lease.run_id = r.id
          AND lease.expires_at > now()
      )
    RETURNING r.id
  `;
  const runIds = rows.map((row) => row.id);
  // oxlint-disable no-await-in-loop, react-doctor/async-await-in-loop -- releases are ordered per run on one client
  for (const id of runIds) {
    await releaseRunLeases(sql, id);
  }
  // oxlint-enable no-await-in-loop, react-doctor/async-await-in-loop
  return { runIds };
}

const INTERRUPTED_RUN_MESSAGE =
  "Run executor was interrupted before it finalized; failed closed by the dispatcher retry";

/**
 * Fails closed one run whose executor is known to be gone. The dispatcher
 * calls this on an alarm retry: the platform never runs two alarms of one
 * Durable Object at once, so the earlier attempt's JavaScript is dead.
 *
 * The connector Containers that attempt started are not proven dead: the
 * wrapper runs the connector as a subprocess that finishes on its own, so a
 * destination write may still be committing rows. An unexpired lease is
 * therefore left in place; only an expired lease is released. The lease TTL
 * (two hours) exceeds the wrapper's write timeout, so the next tick acquires
 * the key only after the orphaned write has ended one way or the other.
 */
export async function failInterruptedRun(
  sql: ControlSql,
  input: { connectionId: string; runId: string }
): Promise<{ failed: boolean; releasedLeases: string[] }> {
  // oxlint-disable-next-line react-doctor/async-parallel -- the run is terminal first, then its stream rows, then the expired lease
  const rows = await sql<{ id: string }[]>`
    UPDATE ads_sync.sync_runs
    SET
      status = 'failed',
      finished_at = now(),
      error_type = 'orphaned',
      error_message = ${INTERRUPTED_RUN_MESSAGE}
    WHERE connection_id = ${input.connectionId}
      AND id = ${input.runId}
      AND status IN ('queued', 'running')
    RETURNING id
  `;
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- ordered after the run row
  await sql`
    UPDATE ads_sync.sync_stream_runs
    SET
      status = 'failed',
      finished_at = COALESCE(finished_at, now()),
      error_type = COALESCE(error_type, 'orphaned'),
      error_message = COALESCE(error_message, ${INTERRUPTED_RUN_MESSAGE})
    WHERE run_id = ${input.runId}
      AND status = 'running'
  `;
  const released = await sql<{ lease_key: string }[]>`
    DELETE FROM ads_sync.sync_stream_leases
    WHERE run_id = ${input.runId}
      AND expires_at <= now()
    RETURNING lease_key
  `;
  return {
    failed: rows.length > 0,
    releasedLeases: released.map((row) => row.lease_key),
  };
}

/** The `queued` or `running` run of a connection, if one exists. */
/**
 * The newest `queued` run of the connection joined with its planning tick.
 * The tick carries the plan's window; `already_active` ticks carry none, so
 * the join keys on `result = 'queued'`.
 */
export async function findQueuedRunPlan(
  sql: ControlSql,
  connectionId: string
): Promise<{
  runId: string;
  tickId: string;
  windowEnd: Date | string;
  windowStart: Date | string;
} | null> {
  const rows = await sql<
    {
      run_id: string;
      tick_id: string;
      window_end: Date | string;
      window_start: Date | string;
    }[]
  >`
    SELECT r.id AS run_id, t.id AS tick_id,
           t.window_start, t.window_end
    FROM ads_sync.sync_runs AS r
    JOIN ads_sync.sync_schedule_ticks AS t
      ON t.run_id = r.id AND t.result = 'queued'
    WHERE r.connection_id = ${connectionId}
      AND r.status = 'queued'
      AND t.window_start IS NOT NULL
      AND t.window_end IS NOT NULL
    ORDER BY r.started_at DESC
    LIMIT 1
  `;
  const [row] = rows;
  return row
    ? {
        runId: row.run_id,
        tickId: row.tick_id,
        windowEnd: row.window_end,
        windowStart: row.window_start,
      }
    : null;
}

export async function findActiveRun(
  sql: ControlSql,
  connectionId: string
): Promise<{ runId: string; status: "queued" | "running" } | null> {
  const rows = await sql<{ id: string; status: "queued" | "running" }[]>`
    SELECT id, status
    FROM ads_sync.sync_runs
    WHERE connection_id = ${connectionId}
      AND status IN ('queued', 'running')
    ORDER BY started_at DESC
    LIMIT 1
  `;
  const [row] = rows;
  return row ? { runId: row.id, status: row.status } : null;
}

/**
 * Finishes a still-`queued` run whose plan-time window went stale before it
 * executed. The run ends as `no_new_final_data`, the same first-class result
 * a tick records when the horizon has not moved.
 */
export async function markRunStale(sql: ControlSql, runId: string) {
  await sql`
    UPDATE ads_sync.sync_runs
    SET
      status = 'no_new_final_data',
      finished_at = now(),
      error_type = 'stale_window',
      error_message = ${STALE_WINDOW_MESSAGE}
    WHERE id = ${runId}
      AND status = 'queued'
  `;
}

export async function recordTick(sql: ControlSql, tick: ScheduleTickRecord) {
  await sql`
    INSERT INTO ads_sync.sync_schedule_ticks (
      id, connection_id, run_id, trigger, read_mode, horizon,
      window_start, window_end, result
    )
    VALUES (
      ${tick.id}, ${tick.connectionId}, ${tick.runId}, ${tick.trigger},
      ${tick.readMode}, ${tick.horizon}, ${tick.windowStart}, ${tick.windowEnd},
      ${tick.result}
    )
  `;
}

export interface RunListRow {
  connection_id: string | null;
  error_message: string | null;
  finished_at: Date | string | null;
  id: string;
  read_mode: string | null;
  started_at: Date | string;
  status: string;
  trigger_type: string;
  window_end: Date | string | null;
  window_start: Date | string | null;
}

/**
 * Recent runs with their scheduled window, newest first.
 *
 * Each run joins the one tick that planned it. A tick row's `run_id` names
 * the run the tick refers to: the run it planned (`queued`,
 * `no_new_final_data`) or the in-flight run it deferred to
 * (`already_active`). Only the planning tick carries the window, and only
 * that tick is one-to-one with the run, so the deferred ticks are excluded
 * from the join. The `already_active` rows keep their `run_id` because the
 * ledger's job is to say which run the tick waited on. `loadRun` uses the
 * same join; the quickstart's verification query mirrors it.
 */
export function listRuns(sql: ControlSql, limit: number) {
  return sql<RunListRow[]>`
    SELECT
      r.id, r.connection_id, r.trigger_type, r.status, r.started_at,
      r.finished_at, r.error_message,
      t.read_mode, t.window_start, t.window_end
    FROM ads_sync.sync_runs r
    LEFT JOIN ads_sync.sync_schedule_ticks t
      ON t.run_id = r.id AND t.result <> 'already_active'
    ORDER BY r.started_at DESC
    LIMIT ${limit}
  `;
}

export async function loadRun(sql: ControlSql, runId: string) {
  const rows = await sql<RunListRow[]>`
    SELECT
      r.id, r.connection_id, r.trigger_type, r.status, r.started_at,
      r.finished_at, r.error_message,
      t.read_mode, t.window_start, t.window_end
    FROM ads_sync.sync_runs r
    LEFT JOIN ads_sync.sync_schedule_ticks t
      ON t.run_id = r.id AND t.result <> 'already_active'
    WHERE r.id = ${runId}
    ORDER BY t.created_at ASC NULLS LAST
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Binds the store to a client factory. Each call opens a fresh client and
 * ends it, except `commitWatermark`, which runs on the caller's transaction.
 */
export function postgresScheduleStore(
  client: () => postgres.Sql
): ScheduleStore {
  const withSql = async <T>(operation: (sql: postgres.Sql) => Promise<T>) => {
    const sql = client();
    try {
      return await operation(sql);
    } finally {
      await sql.end();
    }
  };
  return {
    commitWatermark,
    ensureConnection: (connection) =>
      withSql((sql) => ensureConnection(sql, connection)),
    failInterruptedRun: (input) =>
      withSql((sql) => failInterruptedRun(sql, input)),
    failOrphanedRuns: (input) => withSql((sql) => failOrphanedRuns(sql, input)),
    findActiveRun: (connectionId) =>
      withSql((sql) => findActiveRun(sql, connectionId)),
    findQueuedRunPlan: (connectionId) =>
      withSql((sql) => findQueuedRunPlan(sql, connectionId)),
    insertRun: (row) => withSql((sql) => insertRun(sql, row)),
    loadWatermark: (connectionId) =>
      withSql((sql) => loadWatermark(sql, connectionId)),
    markRunStale: (runId) => withSql((sql) => markRunStale(sql, runId)),
    recordTick: (tick) => withSql((sql) => recordTick(sql, tick)),
  };
}
