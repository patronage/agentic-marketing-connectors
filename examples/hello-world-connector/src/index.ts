import { fetchCampaignSnapshot } from "./campaign-snapshot.js";
import { createDemoClient, demoCustomerId } from "./create-demo-client.js";

const snapshot = await fetchCampaignSnapshot(
  createDemoClient(),
  demoCustomerId
);

console.log(
  JSON.stringify(
    {
      mode: "demo",
      ...snapshot,
    },
    null,
    2
  )
);
