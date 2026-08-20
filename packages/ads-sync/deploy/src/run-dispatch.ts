/**
 * Durable dispatch of queued runs.
 *
 * `POST /runs` and the Cron tick plan inside their own invocation and hand
 * the queued `ScheduledRunRecord` to a Durable Object. The object stores the
 * record, sets an alarm for now, and the alarm handler executes the run.
 * The planning invocation ends at once; the run no longer depends on the
 * request or the Cron invocation staying alive.
 *
 * This module is the storage and retry logic. `run-dispatcher.ts` is the
 * thin Durable Object class around it.
 *
 * Each pending run lives under its own storage key (`pending-run:<runId>`),
 * so an enqueue that interleaves with the drain at an await point can never
 * overwrite another entry. Order comes from the enqueue sequence stored in
 * the entry.
 *
 * At-least-once alarms: an alarm that dies mid-run (eviction, CPU-time
 * ceiling) is retried. The retry does not run the record again; it fails
 * the run closed through `abandon`, so a half-written run never restarts on
 * containers whose state is unknown.
 */
import { boundedFailureText } from "@patronage/ads-sync/run";

import type { ScheduledRunRecord } from "./scheduled-run.js";

const PENDING_RUN_PREFIX = "pending-run:";
const SEQUENCE_KEY = "pending-run-sequence";

export interface PendingScheduledRun {
  attempts: number;
  record: ScheduledRunRecord;
  /** Enqueue order; lower runs first. */
  sequence: number;
}

/** The subset of `DurableObjectStorage` the dispatcher uses. */
export interface RunDispatchStorage {
  delete: (key: string) => Promise<boolean>;
  get: <T>(key: string) => Promise<T | undefined>;
  list: <T>(options: { prefix: string }) => Promise<Map<string, T>>;
  put: <T>(key: string, value: T) => Promise<void>;
  setAlarm: (scheduledTime: number | Date) => Promise<void>;
}

export interface RunDispatchHandlers {
  /** Fails the run closed after an interrupted attempt. */
  abandon: (record: ScheduledRunRecord) => Promise<void>;
  /** Executes the run. A rejection is final; the seam already finalized. */
  execute: (record: ScheduledRunRecord) => Promise<unknown>;
  log?: (message: string, fields: Record<string, unknown>) => void;
  now?: () => Date;
}

function pendingKey(runId: string) {
  return `${PENDING_RUN_PREFIX}${runId}`;
}

/** Pending runs in enqueue order. */
export async function loadPendingRuns(
  storage: RunDispatchStorage
): Promise<PendingScheduledRun[]> {
  const entries = await storage.list<PendingScheduledRun>({
    prefix: PENDING_RUN_PREFIX,
  });
  return [...entries.values()].toSorted((a, b) => a.sequence - b.sequence);
}

/** Stores the record under its own key and arms the alarm for now. */
export async function enqueueScheduledRun(
  storage: RunDispatchStorage,
  record: ScheduledRunRecord,
  now: () => Date = () => new Date()
): Promise<void> {
  const key = pendingKey(record.runId);
  const existing = await storage.get<PendingScheduledRun>(key);
  if (!existing) {
    const sequence = ((await storage.get<number>(SEQUENCE_KEY)) ?? 0) + 1;
    await storage.put(SEQUENCE_KEY, sequence);
    await storage.put<PendingScheduledRun>(key, {
      attempts: 0,
      record,
      sequence,
    });
  }
  await storage.setAlarm(now().getTime());
}

/**
 * Alarm body: runs every pending record in order and removes each one when
 * it is done. Records enqueued while a run executes are picked up in the
 * same drain.
 */
export async function drainScheduledRuns(
  storage: RunDispatchStorage,
  handlers: RunDispatchHandlers
): Promise<{ abandoned: string[]; executed: string[] }> {
  const log = handlers.log ?? noopLog;
  const abandoned: string[] = [];
  const executed: string[] = [];
  // Runs execute one at a time; storage is re-read per run so concurrent
  // enqueues are seen.
  // oxlint-disable no-await-in-loop, react-doctor/async-await-in-loop
  for (;;) {
    const pending = await loadPendingRuns(storage);
    const [next] = pending;
    if (!next) {
      return { abandoned, executed };
    }
    const { record } = next;
    if (next.attempts > 0) {
      log("Ads Sync run attempt was interrupted; failing closed", {
        attempts: next.attempts,
        runId: record.runId,
      });
      await handlers.abandon(record);
      abandoned.push(record.runId);
    } else {
      await storage.put<PendingScheduledRun>(pendingKey(record.runId), {
        ...next,
        attempts: next.attempts + 1,
      });
      try {
        await handlers.execute(record);
      } catch (error) {
        // The seam already marked the run failed and released the lease. The
        // seam rethrows the raw error, so the log copy is redacted and
        // bounded here like every other persisted failure text.
        log("Ads Sync run failed", {
          error: boundedFailureText(
            error instanceof Error ? error.message : String(error)
          ),
          runId: record.runId,
        });
      }
      executed.push(record.runId);
    }
    await storage.delete(pendingKey(record.runId));
  }
  // oxlint-enable no-await-in-loop, react-doctor/async-await-in-loop
}

function noopLog(_message: string, _fields: Record<string, unknown>) {
  // The dispatcher is silent unless the caller supplies a log sink.
}
