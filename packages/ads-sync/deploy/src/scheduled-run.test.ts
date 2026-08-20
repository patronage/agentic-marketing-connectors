import type { SyncConnectionDefinition } from "@patronage/ads-sync";
import type {
  ControlSql,
  PreparedQualifiedRun,
  QualifiedRunSummary,
} from "@patronage/ads-sync/run";
import { describe, expect, it } from "vitest";

import { WatermarkRegressionError } from "./schedule";
import {
  executeScheduledRun,
  ORPHANED_RUN_AFTER_MS,
  planScheduledTick,
} from "./scheduled-run";
import type {
  ScheduledRunHooks,
  ScheduleStore,
  ScheduleTickRecord,
  ScheduledRunRow,
} from "./scheduled-run";

const now = new Date("2026-08-18T06:00:00.000Z");
const policy = { maxWindowsPerRun: 4, windowStepDays: 30 };
const connection: SyncConnectionDefinition = {
  accountId: null,
  airbyteSchema: "airbyte_google_search_console",
  catalogConfigRef: "ads-sync.config.ts#example_connection.catalog",
  catalogHash: "0".repeat(64),
  connectionId: "example_connection",
  displayName: "Example connection",
  enabled: true,
  provider: "google_search_console",
  reportingEnabled: true,
  scheduleCron: null,
  scheduleEveryMinutes: 24 * 60,
  selectedStreams: ["search_analytics_query_page"],
  sourceConfigFingerprint: "1".repeat(64),
  sourceConfigRef: "GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON",
  sourceIdentity: { site_url: "sc-domain:example.com" },
  stateConfigRef: "GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON",
  streamGroup: "organic",
  streamName: "search_analytics_query_page",
};

interface MemoryStore extends ScheduleStore {
  /** The run `findActiveRun` reports. */
  active: { runId: string; status: "queued" | "running" } | null;
  /** The plan `findQueuedRunPlan` reports. */
  queuedPlan: {
    runId: string;
    tickId: string;
    windowEnd: Date | string;
    windowStart: Date | string;
  } | null;
  connections: SyncConnectionDefinition[];
  orphanSweeps: { connectionId: string; startedBefore: Date }[];
  /** Run ids the next sweep reports as orphaned. */
  orphans: string[];
  runs: ScheduledRunRow[];
  staleRuns: string[];
  ticks: ScheduleTickRecord[];
  watermark: Date | null;
}

function memoryStore(initialWatermark: Date | null): MemoryStore {
  const store: MemoryStore = {
    commitWatermark: (_sql, input) => {
      if (
        store.watermark !== null &&
        input.watermarkEnd.getTime() < store.watermark.getTime()
      ) {
        return Promise.reject(new WatermarkRegressionError("regression"));
      }
      const changed =
        store.watermark === null ||
        input.watermarkEnd.getTime() > store.watermark.getTime();
      store.watermark = input.watermarkEnd;
      return Promise.resolve({ changed });
    },
    active: null,
    connections: [],
    ensureConnection: (definition) => {
      store.connections.push(definition);
      return Promise.resolve();
    },
    failInterruptedRun: () =>
      Promise.resolve({ failed: true, releasedLeases: [] }),
    failOrphanedRuns: (input) => {
      store.orphanSweeps.push(input);
      const runIds = store.orphans;
      store.orphans = [];
      return Promise.resolve({ runIds });
    },
    findActiveRun: () => Promise.resolve(store.active),
    findQueuedRunPlan: () => Promise.resolve(store.queuedPlan),
    insertRun: (row) => {
      store.runs.push(row);
      return Promise.resolve();
    },
    loadWatermark: () => Promise.resolve(store.watermark),
    markRunStale: (runId) => {
      store.staleRuns.push(runId);
      return Promise.resolve();
    },
    orphanSweeps: [],
    orphans: [],
    queuedPlan: null,
    recordTick: (tick) => {
      store.ticks.push(tick);
      return Promise.resolve();
    },
    runs: [],
    staleRuns: [],
    ticks: [],
    watermark: initialWatermark,
  };
  return store;
}

const fakeSql = {} as ControlSql;
const summary = { stateCommit: { committed: true } } as QualifiedRunSummary;

/** A seam double that runs the hooks the way the real adapter does. */
function fakeAdapter(options: { fail?: Error } = {}) {
  const calls: { hooks: ScheduledRunHooks; runId: string }[] = [];
  const adapter = (hooks: ScheduledRunHooks) => ({
    run: async (params: { connectionId: string; runId: string }) => {
      calls.push({ hooks, runId: params.runId });
      const window = await hooks.runWindow(fakeSql, params.runId);
      if (!window) {
        throw new Error("run window missing");
      }
      if (options.fail) {
        throw options.fail;
      }
      await hooks.onSucceeded(fakeSql, {
        runId: params.runId,
      } as PreparedQualifiedRun);
      return summary;
    },
  });
  return { adapter, calls };
}

let counter = 0;
const ids = () => {
  counter += 1;
  return `id-${counter}`;
};

describe(planScheduledTick, () => {
  it("records no_new_final_data as a first-class run and starts nothing", async () => {
    const store = memoryStore(new Date("2026-08-15T00:00:00.000Z"));
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "cron",
      vars: {},
    });

    expect(plan.result).toBe("no_new_final_data");
    expect(store.connections).toHaveLength(1);
    expect(store.runs).toStrictEqual([
      {
        connectionId: "example_connection",
        finished: true,
        provider: "google_search_console",
        runId: plan.runId,
        status: "no_new_final_data",
        triggerType: "cron",
      },
    ]);
    expect(store.ticks[0]).toMatchObject({
      horizon: new Date("2026-08-15T00:00:00.000Z"),
      readMode: "final",
      result: "no_new_final_data",
      runId: plan.runId,
      trigger: "cron",
      windowEnd: null,
      windowStart: null,
    });
    expect(seam.calls).toHaveLength(0);
    expect(store.watermark?.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("queues a bounded window from the watermark to the horizon and commits the watermark on success", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "cron",
      vars: {},
    });

    expect(plan.result).toBe("queued");
    if (plan.result !== "queued") {
      throw new Error("expected a queued plan");
    }
    expect(plan.window).toStrictEqual({
      id: plan.tickId,
      windowEnd: "2026-08-15T00:00:00.000Z",
      windowStart: "2026-08-13T00:00:00.000Z",
    });
    expect(store.runs[0]).toMatchObject({
      finished: false,
      status: "queued",
      triggerType: "cron",
    });
    expect(store.ticks[0]).toMatchObject({
      result: "queued",
      windowEnd: new Date("2026-08-15T00:00:00.000Z"),
      windowStart: new Date("2026-08-13T00:00:00.000Z"),
    });
    // The seam is not started until the caller executes.
    expect(seam.calls).toHaveLength(0);
    expect(store.watermark?.toISOString()).toBe("2026-08-13T00:00:00.000Z");

    await expect(plan.execute()).resolves.toStrictEqual({
      outcome: "executed",
      runId: plan.runId,
      summary,
    });
    expect(seam.calls.map((call) => call.runId)).toStrictEqual([plan.runId]);
    expect(store.watermark?.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("returns the active run instead of planning a duplicate", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    store.active = { runId: "in-flight", status: "running" };
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: {},
    });

    expect(plan).toMatchObject({
      result: "already_active",
      runId: "in-flight",
      status: "running",
    });
    expect(store.runs).toStrictEqual([]);
    expect(store.ticks).toStrictEqual([
      expect.objectContaining({
        connectionId: "example_connection",
        result: "already_active",
        runId: "in-flight",
        trigger: "manual",
        windowEnd: null,
        windowStart: null,
      }),
    ]);
    expect(seam.calls).toHaveLength(0);
  });

  it("rebuilds the record of a stranded queued run so the caller can re-enqueue", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    store.active = { runId: "stranded", status: "queued" };
    store.queuedPlan = {
      runId: "stranded",
      tickId: "tick-stranded",
      windowEnd: new Date("2026-08-15T00:00:00.000Z"),
      windowStart: new Date("2026-08-13T00:00:00.000Z"),
    };
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: {},
    });

    expect(plan).toMatchObject({
      record: {
        connectionId: "example_connection",
        plannedWatermark: "2026-08-13T00:00:00.000Z",
        runId: "stranded",
        tickId: "tick-stranded",
        window: {
          id: "tick-stranded",
          windowEnd: "2026-08-15T00:00:00.000Z",
          windowStart: "2026-08-13T00:00:00.000Z",
        },
      },
      result: "already_active",
      runId: "stranded",
      status: "queued",
    });
    expect(store.runs).toStrictEqual([]);
    expect(seam.calls).toHaveLength(0);
  });

  it("returns no record for a running run or a mismatched queued plan", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    store.active = { runId: "in-flight", status: "running" };
    store.queuedPlan = {
      runId: "in-flight",
      tickId: "tick-live",
      windowEnd: new Date("2026-08-15T00:00:00.000Z"),
      windowStart: new Date("2026-08-13T00:00:00.000Z"),
    };
    const seam = fakeAdapter();
    const running = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: {},
    });
    expect(running.result).toBe("already_active");
    expect("record" in running && running.record).toBeFalsy();

    store.active = { runId: "newer-run", status: "queued" };
    const mismatched = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: {},
    });
    expect(mismatched.result).toBe("already_active");
    expect("record" in mismatched && mismatched.record).toBeFalsy();
  });

  it("returns no record when the watermark moved since the plan", async () => {
    // A sibling run committed after this run was planned: rebuilding with
    // the live watermark would defeat the stale-window check.
    const store = memoryStore(new Date("2026-08-14T00:00:00.000Z"));
    store.active = { runId: "stranded", status: "queued" };
    store.queuedPlan = {
      runId: "stranded",
      tickId: "tick-stranded",
      windowEnd: new Date("2026-08-15T00:00:00.000Z"),
      windowStart: new Date("2026-08-13T00:00:00.000Z"),
    };
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: {},
    });

    expect(plan.result).toBe("already_active");
    expect("record" in plan && plan.record).toBeFalsy();
  });

  it("skips a stale window when the watermark moved after the plan", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: {},
    });
    if (plan.result !== "queued") {
      throw new Error("expected a queued plan");
    }
    // Another run committed the same window before this one executed.
    store.watermark = new Date("2026-08-15T00:00:00.000Z");

    await expect(plan.execute()).resolves.toStrictEqual({
      committedWatermark: new Date("2026-08-15T00:00:00.000Z"),
      outcome: "stale_window",
      plannedWatermark: new Date("2026-08-13T00:00:00.000Z"),
      runId: plan.runId,
    });
    expect(seam.calls).toHaveLength(0);
    expect(store.staleRuns).toStrictEqual([plan.runId]);
  });

  it("hands the seam a window only for its own run id", async () => {
    const store = memoryStore(null);
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: { SCHEDULE_INITIAL_LOOKBACK_DAYS: "7" },
    });
    if (plan.result !== "queued") {
      throw new Error("expected a queued plan");
    }
    await plan.execute();
    const hooks = seam.calls[0]?.hooks;
    if (!hooks) {
      throw new Error("expected one seam call");
    }
    await expect(
      hooks.runWindow(fakeSql, "someone-else")
    ).resolves.toBeUndefined();
    await expect(
      hooks.onSucceeded(fakeSql, {
        runId: "someone-else",
      } as PreparedQualifiedRun)
    ).rejects.toThrow(/expected/u);
    expect(plan.window.windowStart).toBe("2026-08-08T00:00:00.000Z");
  });

  it("leaves the watermark alone when the run fails", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    const seam = fakeAdapter({ fail: new Error("source read failed") });
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "cron",
      vars: {},
    });
    if (plan.result !== "queued") {
      throw new Error("expected a queued plan");
    }
    await expect(plan.execute()).rejects.toThrow("source read failed");
    expect(store.watermark?.toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("audits provisional reads in the trigger type and tick ledger", async () => {
    const store = memoryStore(new Date("2026-08-15T00:00:00.000Z"));
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "cron",
      vars: { SCHEDULE_PROVISIONAL_READS: "true" },
    });
    expect(plan.result).toBe("queued");
    expect(plan.readMode).toBe("provisional");
    expect(plan.horizon.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(store.runs[0]?.triggerType).toBe("cron_provisional");
    expect(store.ticks[0]?.readMode).toBe("provisional");
  });

  it("sweeps unleased runs older than the orphan bound before planning", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    store.orphans = ["stuck-run"];
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "cron",
      vars: {},
    });

    expect(plan.orphanedRunIds).toStrictEqual(["stuck-run"]);
    expect(store.orphanSweeps).toStrictEqual([
      {
        connectionId: "example_connection",
        startedBefore: new Date(now.getTime() - ORPHANED_RUN_AFTER_MS),
      },
    ]);
    // The bound only applies to runs without a live lease; the sweep SQL
    // decides liveness from `sync_stream_leases.expires_at`.
    expect(ORPHANED_RUN_AFTER_MS).toBe(20 * 60 * 1000);
  });

  it("executes a queued plan from its serializable record and commits the watermark", async () => {
    const store = memoryStore(new Date("2026-08-13T00:00:00.000Z"));
    const seam = fakeAdapter();
    const plan = await planScheduledTick({
      adapter: seam.adapter,
      connection,
      ids,
      now: () => now,
      policy,
      store,
      trigger: "manual",
      vars: {},
    });
    if (plan.result !== "queued") {
      throw new Error("expected a queued plan");
    }
    const record = structuredClone(plan.record);
    expect(record).toStrictEqual({
      connectionId: "example_connection",
      plannedWatermark: "2026-08-13T00:00:00.000Z",
      runId: plan.runId,
      tickId: plan.tickId,
      window: plan.window,
    });

    await expect(
      executeScheduledRun({ adapter: seam.adapter, connection, store }, record)
    ).resolves.toMatchObject({ outcome: "executed", summary });
    expect(seam.calls.map((call) => call.runId)).toStrictEqual([plan.runId]);
    expect(store.watermark?.toISOString()).toBe("2026-08-15T00:00:00.000Z");

    await expect(
      executeScheduledRun(
        { adapter: seam.adapter, connection, store },
        { ...record, connectionId: "another_connection" }
      )
    ).rejects.toThrow(/belongs to connection/u);
  });
});
