/**
 * Shared wiring between the Worker handlers and the run dispatcher: the
 * configured Sync Connection, the custody adapter, the Hyperdrive client,
 * and the schedule tick dependencies built from Worker bindings.
 *
 * Custody is single-tenant (ADR 0047): secrets are Worker secrets (or local
 * Wrangler dev vars), read through `workerSecretsCustodyAdapter`. Nothing
 * here writes secret material to Postgres, R2, logs, or artifacts.
 */
import {
  configuredCatalogForSelectedStreams,
  providerModule,
  syncConnectionDefinitionFromConfig,
} from "@patronage/ads-sync";
import {
  createQualifiedRunAdapter,
  requireManagedJsonSecret,
  workerSecretsCustodyAdapter,
} from "@patronage/ads-sync/run";
import postgres from "postgres";

import { adsSyncConfig } from "../ads-sync.config.js";
import { connectorContainers } from "./containers.js";
import type { ContainerBindings } from "./containers.js";
import type { RunDispatcher } from "./run-dispatcher.js";
import { postgresScheduleStore } from "./schedule-store.js";
import type { ScheduleSettingsInput } from "./schedule.js";
import type {
  ScheduledTickDependencies,
  ScheduleTrigger,
} from "./scheduled-run.js";

export interface ReferenceWorkerEnv
  extends ContainerBindings, ScheduleSettingsInput {
  ADS_SYNC_RAW_BUCKET: R2Bucket;
  ADS_SYNC_RUNNER_TOKEN?: string;
  HYPERDRIVE: Hyperdrive;
  RUN_DISPATCHER: DurableObjectNamespace<RunDispatcher>;
}

const [connectionConfig, ...extraConnections] = adsSyncConfig.connections;
if (!connectionConfig || extraConnections.length > 0) {
  throw new Error(
    "The Reference Deployment runs exactly one Sync Connection; edit ads-sync.config.ts"
  );
}
export const configuredConnection = connectionConfig;

export function connectionId() {
  return (
    configuredConnection.connectionId ??
    `${configuredConnection.provider}_default`
  );
}

/** Secret fields the custody adapter may read: string-valued env fields only. */
function secretFields(
  env: ReferenceWorkerEnv
): Readonly<Record<string, string | undefined>> {
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string") {
      fields[name] = value;
    }
  }
  return fields;
}

export function sqlClient(env: ReferenceWorkerEnv) {
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error("HYPERDRIVE binding is not configured");
  }
  return () =>
    postgres(connectionString, { fetch_types: false, max: 1, prepare: true });
}

/** Tick dependencies for the configured connection, built from bindings. */
export async function scheduledTickDependencies(
  env: ReferenceWorkerEnv,
  trigger: ScheduleTrigger,
  now: Date
): Promise<ScheduledTickDependencies> {
  const secrets = secretFields(env);
  const custody = workerSecretsCustodyAdapter(secrets);
  const sourceConfig = requireManagedJsonSecret(
    secrets,
    configuredConnection.sourceConfigSecret
  );
  const connection = await syncConnectionDefinitionFromConfig(
    configuredConnection,
    sourceConfig
  );
  const sql = sqlClient(env);
  const { provider } = connection;
  return {
    adapter: (hooks) =>
      createQualifiedRunAdapter({
        artifacts: env.ADS_SYNC_RAW_BUCKET,
        connections: {
          configuredCatalog: (definition) =>
            configuredCatalogForSelectedStreams(
              configuredConnection.catalog,
              definition.selectedStreams
            ),
        },
        containers: connectorContainers(env),
        custody,
        onSucceeded: hooks.onSucceeded,
        runWindow: hooks.runWindow,
        sql,
      }),
    connection,
    now: () => now,
    policy: providerModule(provider).backfillPolicy,
    store: postgresScheduleStore(sql),
    trigger,
    vars: env,
  };
}
