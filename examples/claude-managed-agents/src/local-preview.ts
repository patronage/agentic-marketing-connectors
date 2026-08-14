import { patronageGoogleAdsOptimizationTool } from "./tools/patronage-google-ads-optimization-tool";

const tool = patronageGoogleAdsOptimizationTool((definition) => definition);
const result = await tool.run(
  {
    campaignId: "111222333",
    customerId: "123-456-7890",
    dateRange: "LAST_7_DAYS",
    maxRecommendations: 3,
  },
  { env: {} }
);

console.log(result);
