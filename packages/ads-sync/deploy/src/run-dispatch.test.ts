import { describe, expect, it } from "vitest";

import {
  drainScheduledRuns,
  enqueueScheduledRun,
  loadPendingRuns,
} from "./run-dispatch";
import type { RunDispatchStorage } from "./run-dispatch";
import type { ScheduledRunRecord } from "./scheduled-run";

const now = new Date("2026-08-18T06:00:00.000Z");

function memoryStorage() {
  const values = new Map<string, unknown>();
  const alarms: number[] = [];
  const storage: RunDispatchStorage = {
    delete: (key) => Promise.resolve(values.delete(key)),
    get: <T>(key: string) =>
      Promise.resolve(structuredClone(values.get(key)) as T | undefined),
    list: <T>({ prefix }: { prefix: string }) => {
      const matches = new Map<string, T>();
      for (const [key, value] of values) {
        if (key.startsWith(prefix)) {
          matches.set(key, structuredClone(value) as T);
        }
      }
      return Promise.resolve(matches);
    },
    put: (key, value) => {
      values.set(key, structuredClone(value));
      return Promise.resolve();
    },
    setAlarm: (scheduledTime) => {
      alarms.push(
        typeof scheduledTime === "number"
          ? scheduledTime
          : scheduledTime.getTime()
      );
      return Promise.resolve();
    },
  };
  return { alarms, storage, values };
}

function record(runId: string): ScheduledRunRecord {
  return {
    connectionId: "example_connection",
    plannedWatermark: "2026-08-13T00:00:00.000Z",
    runId,
    tickId: `tick-${runId}`,
    window: {
      id: `tick-${runId}`,
      windowEnd: "2026-08-15T00:00:00.000Z",
      windowStart: "2026-08-13T00:00:00.000Z",
    },
  };
}

describe("run dispatch", () => {
  it("stores the record durably and arms the alarm for now", async () => {
    const { alarms, storage } = memoryStorage();
    await enqueueScheduledRun(storage, record("run-1"), () => now);
    await enqueueScheduledRun(storage, record("run-1"), () => now);
    await enqueueScheduledRun(storage, record("run-2"), () => now);

    expect(alarms).toStrictEqual([now.getTime(), now.getTime(), now.getTime()]);
    await expect(loadPendingRuns(storage)).resolves.toStrictEqual([
      { attempts: 0, record: record("run-1"), sequence: 1 },
      { attempts: 0, record: record("run-2"), sequence: 2 },
    ]);
  });

  it("keeps a run enqueued between the drain's read and its write", async () => {
    // Every pending run has its own key, so a concurrent enqueue that lands
    // right after the drain read storage and before its next write is never
    // overwritten by a stale snapshot.
    const { storage } = memoryStorage();
    await enqueueScheduledRun(storage, record("run-1"), () => now);
    const executed: string[] = [];
    let interleaved = false;
    const interleave = async () => {
      if (interleaved) {
        return;
      }
      interleaved = true;
      await enqueueScheduledRun(storage, record("run-2"), () => now);
    };
    const racing: RunDispatchStorage = {
      ...storage,
      get: async <T>(key: string) => {
        const value = await storage.get<T>(key);
        await interleave();
        return value;
      },
      list: async <T>(options: { prefix: string }) => {
        const value = await storage.list<T>(options);
        await interleave();
        return value;
      },
    };

    const outcome = await drainScheduledRuns(racing, {
      abandon: () => Promise.resolve(),
      execute: (entry) => {
        executed.push(entry.runId);
        return Promise.resolve();
      },
    });

    expect(outcome.executed).toStrictEqual(["run-1", "run-2"]);
    expect(executed).toStrictEqual(["run-1", "run-2"]);
    await expect(loadPendingRuns(storage)).resolves.toStrictEqual([]);
  });

  it("executes every pending record once, in order, and clears the queue", async () => {
    const { storage } = memoryStorage();
    await enqueueScheduledRun(storage, record("run-1"), () => now);
    await enqueueScheduledRun(storage, record("run-2"), () => now);
    const executed: string[] = [];
    const abandoned: string[] = [];

    const outcome = await drainScheduledRuns(storage, {
      abandon: (entry) => {
        abandoned.push(entry.runId);
        return Promise.resolve();
      },
      execute: (entry) => {
        executed.push(entry.runId);
        return entry.runId === "run-1"
          ? Promise.reject(new Error("source read failed"))
          : Promise.resolve();
      },
    });

    expect(outcome).toStrictEqual({
      abandoned: [],
      executed: ["run-1", "run-2"],
    });
    expect(executed).toStrictEqual(["run-1", "run-2"]);
    expect(abandoned).toStrictEqual([]);
    await expect(loadPendingRuns(storage)).resolves.toStrictEqual([]);
  });

  it("marks the attempt durably before the run starts and picks up records enqueued mid-drain", async () => {
    const { storage } = memoryStorage();
    await enqueueScheduledRun(storage, record("run-1"), () => now);
    const executed: string[] = [];

    await drainScheduledRuns(storage, {
      abandon: () => Promise.resolve(),
      execute: async (entry) => {
        executed.push(entry.runId);
        await expect(loadPendingRuns(storage)).resolves.toMatchObject([
          { attempts: 1, record: { runId: entry.runId } },
        ]);
        if (entry.runId === "run-1") {
          await enqueueScheduledRun(storage, record("run-2"), () => now);
        }
      },
    });

    expect(executed).toStrictEqual(["run-1", "run-2"]);
    await expect(loadPendingRuns(storage)).resolves.toStrictEqual([]);
  });

  it("redacts and bounds the seam error before it logs a failed run", async () => {
    const { storage } = memoryStorage();
    await enqueueScheduledRun(storage, record("run-1"), () => now);
    const logged: Record<string, unknown>[] = [];

    const outcome = await drainScheduledRuns(storage, {
      abandon: () => Promise.resolve(),
      execute: () =>
        Promise.reject(
          new Error(
            `connect failed for postgres://writer:SECRET-VALUE@db.example.invalid/app ${"x".repeat(100_000)}`
          )
        ),
      log: (_message, fields) => {
        logged.push(fields);
      },
    });

    expect(outcome).toStrictEqual({ abandoned: [], executed: ["run-1"] });
    const [fields] = logged;
    const error = String(fields?.error);
    expect(error).not.toContain("SECRET-VALUE");
    expect(error).toContain("postgres://writer:<redacted>@");
    expect(error).toContain("[truncated");
    expect(error.length).toBeLessThan(100_000);
  });

  it("fails closed instead of re-running a record whose earlier attempt was interrupted", async () => {
    const { storage } = memoryStorage();
    // An alarm that died mid-run (eviction, CPU-time ceiling) leaves the
    // attempted entry in storage; Cloudflare then retries the alarm.
    await storage.put("pending-run:run-1", {
      attempts: 1,
      record: record("run-1"),
      sequence: 0,
    });
    await enqueueScheduledRun(storage, record("run-2"), () => now);

    const executed: string[] = [];
    const abandoned: string[] = [];
    const outcome = await drainScheduledRuns(storage, {
      abandon: (entry) => {
        abandoned.push(entry.runId);
        return Promise.resolve();
      },
      execute: (entry) => {
        executed.push(entry.runId);
        return Promise.resolve();
      },
    });

    expect(outcome).toStrictEqual({
      abandoned: ["run-1"],
      executed: ["run-2"],
    });
    expect(executed).toStrictEqual(["run-2"]);
    expect(abandoned).toStrictEqual(["run-1"]);
    await expect(loadPendingRuns(storage)).resolves.toStrictEqual([]);
  });
});
