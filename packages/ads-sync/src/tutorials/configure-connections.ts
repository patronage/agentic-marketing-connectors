import {
  defineAdsSyncConfig,
  syncConnectionDefinitionFromConfig,
  validateDestinationSchemaIsolation,
} from "@patronage/ads-sync";

const googleCatalog = {
  streams: [
    {
      stream: {
        name: "campaign_daily_performance",
      },
    },
  ],
};

const metaCatalog = {
  streams: [
    {
      stream: {
        name: "customcampaign_daily_performance",
      },
    },
    {
      stream: {
        name: "ads",
      },
    },
  ],
};

export const tutorialConfig = defineAdsSyncConfig({
  connections: [
    {
      catalog: googleCatalog,
      connectionId: "google_ads_performance",
      destinationSchema: "airbyte_google_ads_performance",
      provider: "google_ads",
      selectedStreams: ["campaign_daily_performance"],
      sourceConfigSecret: "GOOGLE_ADS_SOURCE_CONFIG_JSON",
      stateSecret: "GOOGLE_ADS_SOURCE_STATE_JSON",
      streamGroup: "performance",
    },
    {
      catalog: metaCatalog,
      connectionId: "meta_ads_performance",
      destinationSchema: "airbyte_meta_ads_performance",
      provider: "meta_ads",
      selectedStreams: ["customcampaign_daily_performance"],
      sourceConfigSecret: "META_ADS_SOURCE_CONFIG_JSON",
      stateSecret: "META_ADS_SOURCE_STATE_JSON",
      streamGroup: "performance",
    },
    {
      catalog: metaCatalog,
      connectionId: "meta_ads_metadata",
      destinationSchema: "airbyte_meta_ads_metadata",
      provider: "meta_ads",
      reportingEnabled: false,
      scheduleEveryMinutes: 24 * 60,
      selectedStreams: ["ads"],
      sourceConfigSecret: "META_ADS_SOURCE_CONFIG_JSON",
      stateSecret: "META_ADS_SOURCE_STATE_JSON",
      streamGroup: "metadata",
    },
  ],
});

const tutorialSourceConfigs = {
  google_ads: {
    customer_id: "0000000000",
    login_customer_id: "1111111111",
  },
  google_search_console: {
    site_urls: ["https://example.org/"],
  },
  meta_ads: {
    account_ids: ["act_0000000000"],
  },
} as const;

export async function buildTutorialConnections() {
  const connections = await Promise.all(
    tutorialConfig.connections.map((connection) =>
      syncConnectionDefinitionFromConfig(
        connection,
        tutorialSourceConfigs[connection.provider]
      )
    )
  );

  validateDestinationSchemaIsolation(connections);
  return connections;
}

const connections = await buildTutorialConnections();
console.log(
  JSON.stringify(
    connections.map((connection) => ({
      connectionId: connection.connectionId,
      destinationSchema: connection.airbyteSchema,
      provider: connection.provider,
      scheduleEveryMinutes: connection.scheduleEveryMinutes,
      selectedStreams: connection.selectedStreams,
    })),
    null,
    2
  )
);
