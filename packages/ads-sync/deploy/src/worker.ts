/**
 * Ads Sync Reference Deployment Worker.
 *
 * One Cron trigger runs the single configured Sync Connection through the
 * package Qualified Run seam with the watermark discipline. The HTTP surface
 * is the minimum a quickstart needs: health, provider metadata, and `/runs`
 * to trigger a tick now and read run status.
 *
 * Both the Cron tick and `POST /runs` only plan; the `RunDispatcher`
 * Durable Object alarm executes the queued run, so neither entry point
 * depends on its own invocation staying alive.
 *
 * Custody is single-tenant (ADR 0047): secrets are Worker secrets (or local
 * Wrangler dev vars), read through `workerSecretsCustodyAdapter`. The Worker
 * never writes secret material to Postgres, R2, logs, or artifacts.
 */
import { providerDefinitions, supportedProviders } from "@patronage/ads-sync";
import { ADS_SYNC_RUNNER_TOKEN_SECRET_NAME } from "@patronage/ads-sync/run";
import type postgres from "postgres";

import {
  configuredConnection,
  connectionId,
  scheduledTickDependencies,
  sqlClient,
} from "./run-context.js";
import type { ReferenceWorkerEnv } from "./run-context.js";
import { listRuns, loadRun, loadWatermark } from "./schedule-store.js";
import type { RunListRow } from "./schedule-store.js";
import { planScheduledTick } from "./scheduled-run.js";
import type { ScheduleTrigger, ScheduledTickPlan } from "./scheduled-run.js";

export {
  AirbyteGoogleAdsSourceContainer,
  AirbyteGoogleSearchConsoleSourceContainer,
  AirbyteMetaAdsSourceContainer,
  AirbytePostgresDestinationContainer,
} from "./containers.js";
export { RunDispatcher } from "./run-dispatcher.js";
export type { ReferenceWorkerEnv } from "./run-context.js";

const RUN_LIST_LIMIT = 20;
const ROUTES = [
  "GET /",
  "GET /health",
  "GET /runs",
  "GET /runs/:runId",
  "POST /runs",
] as const;

const providerSummaries = supportedProviders.map((provider) => ({
  displayName: providerDefinitions[provider].displayName,
  provider,
}));

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "ads-sync-reference-deployment",
      });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        connection: {
          connectionId: connectionId(),
          provider: configuredConnection.provider,
        },
        providers: providerSummaries,
        routes: ROUTES,
        service: "ads-sync-reference-deployment",
      });
    }
    if (url.pathname === "/runs" || url.pathname.startsWith("/runs/")) {
      const denied = authorize(request, env);
      if (denied) {
        return denied;
      }
      if (request.method === "GET" && url.pathname === "/runs") {
        return handleListRuns(env);
      }
      if (request.method === "POST" && url.pathname === "/runs") {
        return handleTriggerRun(env);
      }
      if (request.method === "GET") {
        const runId = url.pathname.slice("/runs/".length);
        return handleGetRun(env, runId);
      }
    }
    return Response.json(
      { error: "Not found", routes: ROUTES },
      { status: 404 }
    );
  },

  async scheduled(event, env) {
    const plan = await tick(env, "cron", new Date(event.scheduledTime));
    if (plan.result === "already_active") {
      // A queued run whose first enqueue was lost heals here: the enqueue
      // is idempotent per runId, so a normally pending run is untouched.
      if (plan.record) {
        await dispatcher(env).enqueue(plan.record);
      }
      console.log("Ads Sync scheduled tick deferred to an active run", {
        reEnqueued: plan.record !== undefined,
        runId: plan.runId,
        status: plan.status,
      });
      return;
    }
    if (plan.result === "no_new_final_data") {
      console.log("Ads Sync scheduled tick found no new final data", {
        horizon: plan.horizon.toISOString(),
        readMode: plan.readMode,
        runId: plan.runId,
        watermark: plan.watermark?.toISOString() ?? null,
      });
      return;
    }
    // The Cron invocation only plans. The dispatcher alarm executes, so a
    // Cron run has the same durable path as `POST /runs`.
    await dispatcher(env).enqueue(plan.record);
    console.log("Ads Sync scheduled run queued", {
      readMode: plan.readMode,
      runId: plan.runId,
      window: plan.window,
    });
  },
} satisfies ExportedHandler<ReferenceWorkerEnv>;

function authorize(request: Request, env: ReferenceWorkerEnv) {
  const token = env.ADS_SYNC_RUNNER_TOKEN?.trim();
  if (!token) {
    return Response.json(
      {
        error: `${ADS_SYNC_RUNNER_TOKEN_SECRET_NAME} secret is not configured`,
      },
      { status: 503 }
    );
  }
  const header = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(header, `Bearer ${token}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Compares two strings without an early exit on the first differing byte. */
export function constantTimeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  return crypto.subtle.timingSafeEqual(left, right);
}

function dispatcher(env: ReferenceWorkerEnv) {
  return env.RUN_DISPATCHER.get(env.RUN_DISPATCHER.idFromName(connectionId()));
}

function tick(
  env: ReferenceWorkerEnv,
  trigger: ScheduleTrigger,
  now: Date
): Promise<ScheduledTickPlan> {
  return scheduledTickDependencies(env, trigger, now).then(planScheduledTick);
}

async function withSql<T>(
  env: ReferenceWorkerEnv,
  operation: (sql: postgres.Sql) => Promise<T>
) {
  const sql = sqlClient(env)();
  try {
    return await operation(sql);
  } finally {
    await sql.end();
  }
}

function runView(row: RunListRow) {
  return {
    connectionId: row.connection_id,
    error: row.error_message,
    finishedAt: isoOrNull(row.finished_at),
    readMode: row.read_mode,
    runId: row.id,
    startedAt: isoOrNull(row.started_at),
    status: row.status,
    triggerType: row.trigger_type,
    window:
      row.window_start && row.window_end
        ? {
            windowEnd: isoOrNull(row.window_end),
            windowStart: isoOrNull(row.window_start),
          }
        : null,
  };
}

function isoOrNull(value: Date | string | null) {
  return value === null ? null : new Date(value).toISOString();
}

function handleListRuns(env: ReferenceWorkerEnv) {
  return withSql(env, async (sql) => {
    const [rows, watermark] = await Promise.all([
      listRuns(sql, RUN_LIST_LIMIT),
      loadWatermark(sql, connectionId()),
    ]);
    return Response.json({
      connectionId: connectionId(),
      runs: rows.map(runView),
      watermark: watermark?.toISOString() ?? null,
    });
  });
}

function handleGetRun(env: ReferenceWorkerEnv, runId: string) {
  return withSql(env, async (sql) => {
    const row = await loadRun(sql, runId);
    if (!row) {
      return Response.json({ error: "Run not found" }, { status: 404 });
    }
    return Response.json(runView(row));
  });
}

/**
 * Plans the tick in the request and hands a queued run to the dispatcher
 * Durable Object, whose alarm executes it. The response never waits for
 * containers, and the run does not depend on the request context staying
 * alive.
 */
async function handleTriggerRun(env: ReferenceWorkerEnv) {
  const plan = await tick(env, "manual", new Date());
  if (plan.result === "already_active") {
    // A queued run whose first enqueue was lost heals here: the enqueue is
    // idempotent per runId, so a normally pending run is untouched.
    if (plan.record) {
      await dispatcher(env).enqueue(plan.record);
    }
    // Idempotent: the run in flight is the answer, not a duplicate.
    return Response.json({
      horizon: plan.horizon.toISOString(),
      orphanedRunIds: plan.orphanedRunIds,
      readMode: plan.readMode,
      result: plan.result,
      runId: plan.runId,
      status: plan.status,
    });
  }
  if (plan.result === "no_new_final_data") {
    return Response.json({
      horizon: plan.horizon.toISOString(),
      orphanedRunIds: plan.orphanedRunIds,
      readMode: plan.readMode,
      result: plan.result,
      runId: plan.runId,
      watermark: plan.watermark?.toISOString() ?? null,
    });
  }
  await dispatcher(env).enqueue(plan.record);
  return Response.json(
    {
      execution: "durable_object_alarm",
      horizon: plan.horizon.toISOString(),
      orphanedRunIds: plan.orphanedRunIds,
      readMode: plan.readMode,
      result: "queued",
      runId: plan.runId,
      window: plan.window,
    },
    { status: 202 }
  );
}
