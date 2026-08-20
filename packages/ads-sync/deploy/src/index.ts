/**
 * Reference Deployment entry point for tests and tooling. The Worker itself
 * is `worker.ts`.
 */
import { providerDefinitions, supportedProviders } from "@patronage/ads-sync";

export { supportedImageVersions as referenceDeploymentSupportedImageVersions } from "@patronage/ads-sync";
export {
  CONTAINER_BINDINGS,
  containerImagePins,
  WRAPPER_VERSION,
} from "./container-pins.js";
export {
  advanceWatermark,
  DEFAULT_FINAL_DATA_LAG_DAYS,
  finalDataHorizon,
  planScheduledWindow,
  scheduleSchemaSql,
  scheduleSettings,
  WatermarkRegressionError,
} from "./schedule.js";
export type {
  ScheduledWindowPlan,
  ScheduleReadMode,
  ScheduleSettings,
} from "./schedule.js";
export {
  executeScheduledRun,
  ORPHANED_RUN_AFTER_MS,
  planScheduledTick,
} from "./scheduled-run.js";
export type {
  ScheduledRunOutcome,
  ScheduledRunRecord,
  ScheduledTickPlan,
  ScheduleStore,
  ScheduleTickRecord,
  ScheduleTrigger,
} from "./scheduled-run.js";

export const referenceDeploymentProviders = supportedProviders.map(
  (provider) => ({
    displayName: providerDefinitions[provider].displayName,
    provider,
  })
);
