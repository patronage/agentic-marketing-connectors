/**
 * Test doubles for the Qualified Run seam.
 *
 * Every value here is synthetic. The fixtures never carry a real client,
 * account, or organization identifier.
 */
import type { SyncConnectionDefinition } from "../core.js";
import { googleSearchConsoleProvider } from "../google-search-console.js";
import type { QualifiedRunCustodyAdapter } from "../run-custody.js";

export interface StaticCustodyMaterial {
  destinationConfig?: unknown;
  seedState?: unknown;
  sourceConfig?: unknown;
}

/**
 * A custody adapter that returns fixed material. The seam receives resolved
 * values only, so a test double needs no secret names and no environment.
 */
export function staticCustodyAdapter(
  material: StaticCustodyMaterial
): QualifiedRunCustodyAdapter {
  return {
    destinationConfig: () => Promise.resolve(material.destinationConfig),
    seedState: () => Promise.resolve(material.seedState),
    sourceConfig: () => Promise.resolve(material.sourceConfig),
  };
}

/** A complete Google Search Console connection with synthetic values. */
export function syncConnectionFixture(
  overrides: Partial<SyncConnectionDefinition> = {}
): SyncConnectionDefinition {
  return {
    accountId: null,
    airbyteSchema: googleSearchConsoleProvider.defaultAirbyteSchema,
    catalogConfigRef: "ads-sync.config.ts#example_gsc_connection.catalog",
    catalogHash: "0".repeat(64),
    connectionId: "example_gsc_connection",
    displayName: "Example Search Console connection",
    enabled: true,
    provider: "google_search_console",
    reportingEnabled: true,
    scheduleCron: null,
    scheduleEveryMinutes:
      googleSearchConsoleProvider.defaultScheduleEveryMinutes,
    selectedStreams: [googleSearchConsoleProvider.streamName],
    sourceConfigFingerprint: "1".repeat(64),
    sourceConfigRef: googleSearchConsoleProvider.sourceConfigSecret,
    sourceIdentity: { site_url: "sc-domain:example.com" },
    stateConfigRef: googleSearchConsoleProvider.stateSecret,
    streamGroup: googleSearchConsoleProvider.streamName,
    streamName: googleSearchConsoleProvider.streamName,
    ...overrides,
  };
}
