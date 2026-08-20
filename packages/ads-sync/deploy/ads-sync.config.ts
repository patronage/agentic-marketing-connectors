/**
 * The Reference Deployment's single Sync Connection.
 *
 * Keep the catalog in the repository. Keep credentials in Worker secrets (or
 * the local Wrangler dev vars file); this file stores secret names only. To sync another
 * Supported Provider, replace the one connection below with the same shape,
 * a provider catalog, and that provider's secret names.
 */
import { defineAdsSyncConfig } from "@patronage/ads-sync";

import searchConsoleCatalog from "./config/google-search-console-catalog.json";

export const adsSyncConfig = defineAdsSyncConfig({
  connections: [
    {
      catalog: searchConsoleCatalog,
      connectionId: "google_search_console_default",
      destinationSchema: "airbyte_google_search_console",
      displayName: "Google Search Console default",
      provider: "google_search_console",
      reportingEnabled: true,
      scheduleEveryMinutes: 24 * 60,
      selectedStreams: ["search_analytics_query_page"],
      sourceConfigSecret: "GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON",
      stateSecret: "GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON",
      streamGroup: "organic",
      streamName: "search_analytics_query_page",
    },
  ],
});
