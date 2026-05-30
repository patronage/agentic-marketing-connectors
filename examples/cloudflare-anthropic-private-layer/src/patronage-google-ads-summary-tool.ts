import {
  microsToCurrency,
  normalizeCustomerId,
} from "@patronage/google-ads/core";
import { z } from "zod";

export interface CustomToolRunContext {
  env: unknown;
}

export interface CustomToolDefinition<InputSchema extends z.ZodTypeAny> {
  description: string;
  inputSchema: InputSchema;
  name: string;
  run(
    input: z.output<InputSchema>,
    context: CustomToolRunContext
  ): Promise<string> | string;
}

export function patronageGoogleAdsSummaryTool<Tool>(
  defineTool: <InputSchema extends z.ZodTypeAny>(
    tool: CustomToolDefinition<InputSchema>
  ) => Tool
): Tool {
  return defineTool({
    name: "patronage_google_ads_summary",
    description:
      "Summarize a synthetic Google Ads campaign row with Patronage connector helpers.",
    inputSchema: z.object({
      campaignName: z
        .string()
        .min(1)
        .default("Example Search Campaign")
        .describe("Campaign name to include in the synthetic summary."),
      costMicros: z
        .string()
        .regex(/^\d+$/)
        .default("2500000")
        .describe("Spend in micros, represented as a base-10 integer string."),
      customerId: z
        .string()
        .min(1)
        .default("123-456-7890")
        .describe("Google Ads customer id with or without dashes."),
    }),
    run: ({ campaignName, costMicros, customerId }) =>
      JSON.stringify(
        {
          campaignName,
          customerId: normalizeCustomerId(customerId),
          spend: microsToCurrency(costMicros),
        },
        null,
        2
      ),
  });
}
