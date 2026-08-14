import { defineTool, type CustomTool } from "./custom-tools-runtime";
import { patronageGoogleAdsOptimizationTool } from "./patronage-google-ads-optimization-tool";

export const CUSTOM_TOOLS: CustomTool[] = [
  patronageGoogleAdsOptimizationTool(defineTool),
];
