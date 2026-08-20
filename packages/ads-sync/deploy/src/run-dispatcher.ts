/**
 * Durable Object that executes queued runs from an alarm.
 *
 * One object per Sync Connection (`idFromName(connectionId)`). `enqueue`
 * stores the queued record and arms the alarm; `alarm` runs the record.
 * Both `POST /runs` and the Cron tick enqueue here, so the two entry points
 * share one durable execution path. The logic lives in `run-dispatch.ts`.
 */
import { DurableObject } from "cloudflare:workers";

import { scheduledTickDependencies, sqlClient } from "./run-context.js";
import type { ReferenceWorkerEnv } from "./run-context.js";
import { drainScheduledRuns, enqueueScheduledRun } from "./run-dispatch.js";
import { postgresScheduleStore } from "./schedule-store.js";
import { executeScheduledRun } from "./scheduled-run.js";
import type { ScheduledRunRecord } from "./scheduled-run.js";

export class RunDispatcher extends DurableObject<ReferenceWorkerEnv> {
  async enqueue(record: ScheduledRunRecord): Promise<{ queued: true }> {
    await enqueueScheduledRun(this.ctx.storage, record);
    return { queued: true };
  }

  override async alarm(): Promise<void> {
    const outcome = await drainScheduledRuns(this.ctx.storage, {
      // Needs the control store only, so a missing provider secret cannot
      // block the fail-closed path. An alarm retry proves the earlier
      // attempt's JavaScript is gone; its Containers may still be writing,
      // so the store keeps an unexpired lease until its TTL ends.
      abandon: async (record) => {
        const store = postgresScheduleStore(sqlClient(this.env));
        await store.failInterruptedRun({
          connectionId: record.connectionId,
          runId: record.runId,
        });
      },
      execute: async (record) => {
        const deps = await scheduledTickDependencies(
          this.env,
          "manual",
          new Date()
        );
        const result = await executeScheduledRun(deps, record);
        if (result.outcome === "stale_window") {
          console.log("Ads Sync run skipped a stale window", {
            committedWatermark:
              result.committedWatermark?.toISOString() ?? null,
            plannedWatermark: result.plannedWatermark?.toISOString() ?? null,
            runId: record.runId,
          });
          return;
        }
        console.log("Ads Sync run succeeded", {
          records: result.summary.source.records,
          runId: record.runId,
          stateCommit: result.summary.stateCommit,
        });
      },
      log: (message, fields) => console.error(message, fields),
    });
    console.log("Ads Sync run dispatcher drained", outcome);
  }
}
