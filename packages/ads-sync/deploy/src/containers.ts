/**
 * Cloudflare Container classes and the seam's container dependency for the
 * Reference Deployment.
 *
 * Each Supported Provider has one Container class bound by name in
 * `wrangler.jsonc`. The image pins come from the package; the wrapper
 * version pin is the reference deployment's exact-match expectation.
 */
import { getContainer } from "@cloudflare/containers";
import type { Container } from "@cloudflare/containers";
import type {
  ConnectorContainerHandle,
  QualifiedRunDependencies,
} from "@patronage/ads-sync/run";

import type { AirbyteGoogleAdsSourceContainer } from "./airbyte-google-ads-source-container.js";
import type { AirbyteGoogleSearchConsoleSourceContainer } from "./airbyte-google-search-console-source-container.js";
import type { AirbyteMetaAdsSourceContainer } from "./airbyte-meta-ads-source-container.js";
import type { AirbytePostgresDestinationContainer } from "./airbyte-postgres-destination-container.js";
import { CONTAINER_BINDINGS, containerImagePins } from "./container-pins.js";

export { AirbyteGoogleAdsSourceContainer } from "./airbyte-google-ads-source-container.js";
export { AirbyteGoogleSearchConsoleSourceContainer } from "./airbyte-google-search-console-source-container.js";
export { AirbyteMetaAdsSourceContainer } from "./airbyte-meta-ads-source-container.js";
export { AirbytePostgresDestinationContainer } from "./airbyte-postgres-destination-container.js";

export interface ContainerBindings {
  AIRBYTE_GOOGLE_ADS_SOURCE?: DurableObjectNamespace<AirbyteGoogleAdsSourceContainer>;
  AIRBYTE_GOOGLE_SEARCH_CONSOLE_SOURCE?: DurableObjectNamespace<AirbyteGoogleSearchConsoleSourceContainer>;
  AIRBYTE_META_ADS_SOURCE?: DurableObjectNamespace<AirbyteMetaAdsSourceContainer>;
  AIRBYTE_POSTGRES_DESTINATION?: DurableObjectNamespace<AirbytePostgresDestinationContainer>;
}

/** Container dependency for `createQualifiedRunAdapter`. */
export function connectorContainers(
  env: ContainerBindings
): QualifiedRunDependencies["containers"] {
  return {
    destination: (containerId) =>
      containerHandle(env, CONTAINER_BINDINGS.destination, containerId),
    pins: containerImagePins,
    source: (provider, containerId) =>
      containerHandle(env, CONTAINER_BINDINGS[provider], containerId),
  };
}

function containerHandle(
  env: ContainerBindings,
  bindingName: string,
  containerId: string
): ConnectorContainerHandle {
  const namespace = (
    env as Partial<Record<string, DurableObjectNamespace<Container>>>
  )[bindingName];
  if (!namespace) {
    throw new Error(`Missing container binding ${bindingName}`);
  }
  return getContainer(namespace, containerId);
}
