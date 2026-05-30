import type { z } from "zod";

import {
  type CustomToolDefinition,
  patronageGoogleAdsSummaryTool,
} from "./patronage-google-ads-summary-tool.js";

const definePreviewTool = <InputSchema extends z.ZodTypeAny>(
  tool: CustomToolDefinition<InputSchema>
): CustomToolDefinition<InputSchema> => tool;

const tool = patronageGoogleAdsSummaryTool(definePreviewTool);
const input = tool.inputSchema.parse({});
const output = await tool.run(input, { env: {} });

console.log(output);
