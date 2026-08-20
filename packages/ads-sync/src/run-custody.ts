/**
 * Custody adapter boundary for Qualified Runs (ADR 0047).
 *
 * The run seam never reads deployment secrets itself. A caller-supplied
 * custody adapter resolves secret material for exactly one Sync Connection.
 * The seam accepts the resolved material and nothing else: no routing, no
 * secret names, no environment object.
 *
 * This module ships the single-tenant adapter (Worker secrets, or the local
 * Wrangler dev vars file) and the managed-secret contract that fences it.
 */
import type { SyncConnectionDefinition } from "./core.js";
import { providerModules } from "./providers.js";

export const ADS_SYNC_RUNNER_TOKEN_SECRET_NAME = "ADS_SYNC_RUNNER_TOKEN";
export const POSTGRES_DESTINATION_CONFIG_SECRET_NAME =
  "POSTGRES_DESTINATION_CONFIG_JSON";

/**
 * Every deployment secret name the single-tenant custody mode manages.
 *
 * The set is derived from the Supported Provider modules, so a provider that
 * joins the package joins the fence at the same time. Bootstrap and
 * lifecycle tooling use this set to detect undeclared or stale managed
 * secrets.
 */
export const ADS_SYNC_MANAGED_SECRET_NAMES: ReadonlySet<string> = new Set([
  ADS_SYNC_RUNNER_TOKEN_SECRET_NAME,
  POSTGRES_DESTINATION_CONFIG_SECRET_NAME,
  ...Object.values(providerModules).flatMap((module) => [
    module.sourceConfigSecret,
    module.stateSecret,
  ]),
]);

/**
 * Resolves secret material for one Sync Connection.
 *
 * Implementations own where secrets live. The seam only receives the parsed
 * JSON values. Every method receives the connection so an adapter can bind
 * material to the exact connection version it serves.
 */
export interface QualifiedRunCustodyAdapter {
  /** Destination connector config JSON for this connection's write. */
  destinationConfig: (connection: SyncConnectionDefinition) => Promise<unknown>;
  /**
   * Seed state used when the control store has no committed state for the
   * connection. Return `undefined` when no seed exists.
   */
  seedState: (connection: SyncConnectionDefinition) => Promise<unknown>;
  /** Source connector config JSON, including provider OAuth material. */
  sourceConfig: (connection: SyncConnectionDefinition) => Promise<unknown>;
}

export class CustodyFenceError extends Error {
  override name = "CustodyFenceError";
}

/**
 * Single-tenant custody: secrets are string fields on the deployment
 * environment (Cloudflare Worker secrets, or the local Wrangler dev vars file).
 *
 * The adapter reads only names inside `ADS_SYNC_MANAGED_SECRET_NAMES`, and
 * only the names the connection itself references. Any other name fails
 * closed with `CustodyFenceError`, so a connection row cannot route the seam
 * to an arbitrary environment field.
 */
export function workerSecretsCustodyAdapter(
  secrets: Readonly<Record<string, string | undefined>>
): QualifiedRunCustodyAdapter {
  // A fence violation rejects instead of throwing synchronously, so callers
  // see one failure shape.
  return {
    destinationConfig: () =>
      settle(() =>
        requireManagedJsonSecret(
          secrets,
          POSTGRES_DESTINATION_CONFIG_SECRET_NAME
        )
      ),
    seedState: (connection) =>
      settle(() =>
        optionalManagedJsonSecret(secrets, connection.stateConfigRef)
      ),
    sourceConfig: (connection) =>
      settle(() =>
        requireManagedJsonSecret(secrets, connection.sourceConfigRef)
      ),
  };
}

function settle<T>(read: () => T): Promise<T> {
  try {
    return Promise.resolve(read());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

export function assertManagedSecretName(name: string) {
  if (!ADS_SYNC_MANAGED_SECRET_NAMES.has(name)) {
    throw new CustodyFenceError(
      `${name} is not an Ads Sync managed secret name; the run seam refuses to resolve it`
    );
  }
}

export function requireManagedJsonSecret(
  secrets: Readonly<Record<string, string | undefined>>,
  name: string
) {
  assertManagedSecretName(name);
  const value = secrets[name]?.trim();
  if (!value) {
    throw new Error(`${name} secret is not configured`);
  }
  return parseJsonSecret(name, value);
}

export function optionalManagedJsonSecret(
  secrets: Readonly<Record<string, string | undefined>>,
  name: string
) {
  assertManagedSecretName(name);
  const value = secrets[name]?.trim();
  if (!value) {
    return;
  }
  return parseJsonSecret(name, value);
}

function parseJsonSecret(name: string, value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
}
