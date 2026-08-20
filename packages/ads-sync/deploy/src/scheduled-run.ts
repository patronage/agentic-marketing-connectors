/**
 * One scheduled tick of the Reference Deployment.
 *
 * A tick plans one bounded window for the configured Sync Connection, then
 * either records `no_new_final_data` or creates a run row and executes one
 * Qualified Run through the package seam. The watermark commits inside the
 * seam's success transaction, so a run that fails leaves the watermark alone.
 *
 * The tick is split into `plan` (fast, records the decision) and `execute`
 * (long, starts containers) so an HTTP trigger can answer before the run
 * ends. `execute` is also reachable from a serializable `ScheduledRunRecord`
 * through `executeScheduledRun`, so a Durable Object alarm can run it after
 * the request that planned it has ended.
 *
 * Every tick first fails closed the orphans of earlier ticks. Liveness comes
 * from the seam's stream lease: a run that still holds an unexpired lease is
 * live and is left alone, whatever its age. A `queued` or `running` run with
 * no unexpired lease and older than `ORPHANED_RUN_AFTER_MS` lost its
 * executor, so the tick marks it failed and releases its expired lease.
 *
 * A tick then defers to an active run: while a run of the connection is
 * `queued` or `running`, the tick records an `already_active` ledger row and
 * returns that run instead of planning a duplicate. `POST /runs` is
 * therefore idempotent while a run is in flight.
 *
 * `executeScheduledRun` re-reads the committed watermark just before it
 * starts the seam. When the watermark moved after the plan, the plan-time
 * window is stale; the run finishes as `no_new_final_data` and starts no
 * containers.
 */
import type {
  ProviderBackfillPolicy,
  SyncConnectionDefinition,
} from "@patronage/ads-sync";
import type {
  ControlSql,
  PreparedQualifiedRun,
  QualifiedRunAdapter,
  QualifiedRunSummary,
  QualifiedRunWindow,
} from "@patronage/ads-sync/run";

import {
  finalDataHorizon,
  planScheduledWindow,
  scheduleSettings,
} from "./schedule.js";
import type { ScheduleReadMode, ScheduleSettingsInput } from "./schedule.js";

export type ScheduleTrigger = "cron" | "manual";

/**
 * Age after which a `queued` or `running` run that holds no unexpired
 * stream lease is an orphan. The Cron and alarm handlers are limited in CPU
 * time, not wall clock, so age alone never proves a run is dead; the lease
 * does. This bound only covers runs the executor never started (no lease
 * was ever acquired) and gives the dispatcher alarm ample time to fire.
 */
export const ORPHANED_RUN_AFTER_MS = 20 * 60 * 1000;

/** The serializable part of a queued plan that `executeScheduledRun` needs. */
export interface ScheduledRunRecord {
  connectionId: string;
  /** Committed watermark at plan time (ISO), or null before the first commit. */
  plannedWatermark: string | null;
  runId: string;
  tickId: string;
  window: QualifiedRunWindow;
}

export interface ScheduleTickRecord {
  connectionId: string;
  horizon: Date;
  id: string;
  readMode: ScheduleReadMode;
  /** `already_active` carries the in-flight run's id and no window. */
  result: "already_active" | "no_new_final_data" | "queued";
  runId: string | null;
  trigger: ScheduleTrigger;
  windowEnd: Date | null;
  windowStart: Date | null;
}

export interface ScheduledRunRow {
  connectionId: string;
  finished: boolean;
  provider: string;
  runId: string;
  status: "no_new_final_data" | "queued";
  triggerType: string;
}

/** Persistence the tick needs. `schedule-store.ts` implements it on Postgres. */
export interface ScheduleStore {
  /**
   * Monotonic watermark commit. Runs inside the seam's success transaction.
   * Must fail closed on a regression.
   */
  commitWatermark: (
    sql: ControlSql,
    input: { connectionId: string; runId: string; watermarkEnd: Date }
  ) => Promise<{ changed: boolean }>;
  /** Upserts the code-defined connection row the seam loads by id. */
  ensureConnection: (connection: SyncConnectionDefinition) => Promise<void>;
  /**
   * Fails closed one run whose executor is known to be dead (a dispatcher
   * alarm retry). Releases only an expired lease: the attempt's Containers
   * may still be writing, so an unexpired lease stays until its TTL ends.
   */
  failInterruptedRun: (input: {
    connectionId: string;
    runId: string;
  }) => Promise<{ failed: boolean; releasedLeases: string[] }>;
  /**
   * Marks `queued` or `running` runs of the connection that started before
   * `startedBefore` and hold no unexpired stream lease as failed
   * (`error_type = 'orphaned'`), then releases their leases. A run with a
   * valid lease is live and must be left alone. `runId` narrows the sweep to
   * that run.
   */
  failOrphanedRuns: (input: {
    connectionId: string;
    runId?: string;
    startedBefore: Date;
  }) => Promise<{ runIds: string[] }>;
  /** The `queued` or `running` run of the connection, if any. */
  findActiveRun: (
    connectionId: string
  ) => Promise<{ runId: string; status: "queued" | "running" } | null>;
  /**
   * The plan (tick id and window) of the connection's newest `queued` run,
   * from its planning tick. Rebuilds a `ScheduledRunRecord` so an
   * `already_active` tick can re-enqueue a run whose first enqueue was lost.
   */
  findQueuedRunPlan: (connectionId: string) => Promise<{
    runId: string;
    tickId: string;
    windowEnd: Date | string;
    windowStart: Date | string;
  } | null>;
  insertRun: (row: ScheduledRunRow) => Promise<void>;
  loadWatermark: (connectionId: string) => Promise<Date | null>;
  /** Finishes a `queued` run whose plan-time window went stale. */
  markRunStale: (runId: string) => Promise<void>;
  recordTick: (tick: ScheduleTickRecord) => Promise<void>;
}

export interface ScheduledRunHooks {
  onSucceeded: (
    sql: ControlSql,
    prepared: PreparedQualifiedRun
  ) => Promise<void>;
  runWindow: (
    sql: unknown,
    runId: string
  ) => Promise<QualifiedRunWindow | undefined>;
}

export interface ScheduledTickDependencies {
  /** Builds the seam adapter with the tick's window and watermark hooks. */
  adapter: (hooks: ScheduledRunHooks) => Pick<QualifiedRunAdapter, "run">;
  connection: SyncConnectionDefinition;
  ids?: () => string;
  now?: () => Date;
  policy: ProviderBackfillPolicy;
  store: ScheduleStore;
  trigger: ScheduleTrigger;
  vars: ScheduleSettingsInput;
}

export type ScheduledTickPlan =
  | {
      horizon: Date;
      orphanedRunIds: string[];
      readMode: ScheduleReadMode;
      /**
       * The still-queued run's record, rebuilt from its planning tick.
       * Present only for a `queued` run whose plan is recoverable; the
       * caller re-enqueues it idempotently so a lost enqueue heals (#1596).
       */
      record?: ScheduledRunRecord;
      /** A run of the connection is in flight; nothing new was planned. */
      result: "already_active";
      runId: string;
      status: "queued" | "running";
    }
  | {
      horizon: Date;
      /** Runs this tick failed closed before planning. */
      orphanedRunIds: string[];
      readMode: ScheduleReadMode;
      result: "no_new_final_data";
      runId: string;
      tickId: string;
      watermark: Date | null;
    }
  | {
      execute: () => Promise<ScheduledRunOutcome>;
      horizon: Date;
      orphanedRunIds: string[];
      readMode: ScheduleReadMode;
      record: ScheduledRunRecord;
      result: "queued";
      runId: string;
      tickId: string;
      window: QualifiedRunWindow;
    };

export type ScheduledRunExecutor = Pick<
  ScheduledTickDependencies,
  "adapter" | "connection" | "store"
>;

export type ScheduledRunOutcome =
  | { outcome: "executed"; runId: string; summary: QualifiedRunSummary }
  | {
      /** The committed watermark that superseded the plan. */
      committedWatermark: Date | null;
      outcome: "stale_window";
      plannedWatermark: Date | null;
      runId: string;
    };

/**
 * Executes the Qualified Run of a queued plan. Just before the seam starts,
 * the committed watermark is re-read; when it moved since the plan, the run
 * finishes as `no_new_final_data` and starts nothing. Otherwise the
 * watermark commits to the record's window end inside the seam's success
 * transaction.
 */
export async function executeScheduledRun(
  deps: ScheduledRunExecutor,
  record: ScheduledRunRecord
): Promise<ScheduledRunOutcome> {
  const { connection, store } = deps;
  if (record.connectionId !== connection.connectionId) {
    throw new Error(
      `Scheduled run ${record.runId} belongs to connection ${record.connectionId}, not ${connection.connectionId}`
    );
  }
  const committedWatermark = await store.loadWatermark(connection.connectionId);
  const plannedWatermark =
    record.plannedWatermark === null ? null : new Date(record.plannedWatermark);
  if (!sameInstant(committedWatermark, plannedWatermark)) {
    await store.markRunStale(record.runId);
    return {
      committedWatermark,
      outcome: "stale_window",
      plannedWatermark,
      runId: record.runId,
    };
  }
  const windowEnd = new Date(record.window.windowEnd);
  const adapter = deps.adapter({
    onSucceeded: async (sql, prepared) => {
      if (prepared.runId !== record.runId) {
        throw new Error(
          `Scheduled tick ${record.tickId} received success for run ${prepared.runId}, expected ${record.runId}`
        );
      }
      await store.commitWatermark(sql, {
        connectionId: connection.connectionId,
        runId: record.runId,
        watermarkEnd: windowEnd,
      });
    },
    runWindow: (_sql, requestedRunId) =>
      Promise.resolve(
        requestedRunId === record.runId ? record.window : undefined
      ),
  });
  const summary = await adapter.run({
    connectionId: connection.connectionId,
    runId: record.runId,
  });
  return { outcome: "executed", runId: record.runId, summary };
}

function sameInstant(a: Date | null, b: Date | null) {
  return a === null || b === null ? a === b : a.getTime() === b.getTime();
}

/**
 * Plans the tick and records the decision. The returned `execute` runs the
 * Qualified Run; the caller decides whether to await it.
 */
export async function planScheduledTick(
  deps: ScheduledTickDependencies
): Promise<ScheduledTickPlan> {
  const now = deps.now ?? (() => new Date());
  const ids = deps.ids ?? (() => crypto.randomUUID());
  const { connection, policy, store } = deps;
  const settings = scheduleSettings(connection.provider, policy, deps.vars);
  const horizon = finalDataHorizon({
    lagDays: settings.lagDays,
    mode: settings.mode,
    now: now(),
  });

  // oxlint-disable-next-line react-doctor/async-parallel -- the connection row must exist before the sweep and the watermark read
  await store.ensureConnection(connection);
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- orphans release leases before the watermark read
  const orphans = await store.failOrphanedRuns({
    connectionId: connection.connectionId,
    startedBefore: new Date(now().getTime() - ORPHANED_RUN_AFTER_MS),
  });
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- an active run is looked up after the sweep failed the orphans
  const active = await store.findActiveRun(connection.connectionId);
  if (active) {
    // The ledger records the deferred tick; the run row is the active one.
    await store.recordTick({
      connectionId: connection.connectionId,
      horizon,
      id: ids(),
      readMode: settings.mode,
      result: "already_active",
      runId: active.runId,
      trigger: deps.trigger,
      windowEnd: null,
      windowStart: null,
    });
    // A queued run whose enqueue was lost would otherwise stay stranded
    // until the orphan sweep fails it: rebuild its record from the planning
    // tick so the caller can re-enqueue it idempotently (#1596). The plan
    // set the window start to the plan-time watermark (or a lookback start
    // when the watermark was null), so the record is rebuilt only when the
    // live watermark is null or still equals the window start. A moved
    // watermark means a sibling run committed since the plan; rebuilding
    // with the live value would defeat executeScheduledRun's stale-window
    // check, so that run is left to the orphan sweep instead.
    let record: ScheduledRunRecord | undefined;
    if (active.status === "queued") {
      // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- the plan is read only for the active queued run
      const queuedPlan = await store.findQueuedRunPlan(connection.connectionId);
      if (queuedPlan && queuedPlan.runId === active.runId) {
        // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- the watermark is read only when a record is rebuilt
        const watermark = await store.loadWatermark(connection.connectionId);
        const windowStart = new Date(queuedPlan.windowStart).toISOString();
        const unmoved =
          watermark === null || watermark.toISOString() === windowStart;
        if (unmoved) {
          record = {
            connectionId: connection.connectionId,
            plannedWatermark: watermark?.toISOString() ?? null,
            runId: queuedPlan.runId,
            tickId: queuedPlan.tickId,
            window: {
              id: queuedPlan.tickId,
              windowEnd: new Date(queuedPlan.windowEnd).toISOString(),
              windowStart,
            },
          };
        }
      }
    }
    return {
      horizon,
      orphanedRunIds: orphans.runIds,
      readMode: settings.mode,
      ...(record ? { record } : {}),
      result: "already_active",
      runId: active.runId,
      status: active.status,
    };
  }
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- the watermark is read after orphans released their leases
  const committedWatermark = await store.loadWatermark(connection.connectionId);
  const plan = planScheduledWindow({
    committedWatermark,
    horizon,
    initialLookbackDays: settings.initialLookbackDays,
    policy,
  });
  const runId = ids();
  const tickId = ids();
  const triggerType =
    settings.mode === "provisional"
      ? `${deps.trigger}_provisional`
      : deps.trigger;

  if (plan.result === "no_new_final_data") {
    await store.insertRun({
      connectionId: connection.connectionId,
      finished: true,
      provider: connection.provider,
      runId,
      status: "no_new_final_data",
      triggerType,
    });
    await store.recordTick({
      connectionId: connection.connectionId,
      horizon,
      id: tickId,
      readMode: settings.mode,
      result: "no_new_final_data",
      runId,
      trigger: deps.trigger,
      windowEnd: null,
      windowStart: null,
    });
    return {
      horizon,
      orphanedRunIds: orphans.runIds,
      readMode: settings.mode,
      result: "no_new_final_data",
      runId,
      tickId,
      watermark: plan.watermark,
    };
  }

  const window: QualifiedRunWindow = {
    id: tickId,
    windowEnd: plan.windowEnd.toISOString(),
    windowStart: plan.windowStart.toISOString(),
  };
  await store.insertRun({
    connectionId: connection.connectionId,
    finished: false,
    provider: connection.provider,
    runId,
    status: "queued",
    triggerType,
  });
  await store.recordTick({
    connectionId: connection.connectionId,
    horizon,
    id: tickId,
    readMode: settings.mode,
    result: "queued",
    runId,
    trigger: deps.trigger,
    windowEnd: plan.windowEnd,
    windowStart: plan.windowStart,
  });

  const record: ScheduledRunRecord = {
    connectionId: connection.connectionId,
    plannedWatermark: committedWatermark?.toISOString() ?? null,
    runId,
    tickId,
    window,
  };
  return {
    execute: () => executeScheduledRun(deps, record),
    horizon,
    orphanedRunIds: orphans.runIds,
    readMode: settings.mode,
    record,
    result: "queued",
    runId,
    tickId,
    window,
  };
}
