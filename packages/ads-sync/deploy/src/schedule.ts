/**
 * Watermark discipline for the Reference Deployment's scheduled Qualified
 * Runs.
 *
 * A scheduled run reads one bounded window: from the committed watermark to
 * the provider's Final-Data Horizon. The watermark only moves forward. When
 * the horizon has not moved past the watermark, the tick records
 * `no_new_final_data` and starts no containers.
 *
 * Provisional reads (horizon at the current day) are an explicit, audited
 * mode. They are off by default.
 *
 * Every function here is pure. `schedule-store.ts` owns the SQL.
 */
import type {
  AdsSyncProvider,
  ProviderBackfillPolicy,
} from "@patronage/ads-sync";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Conservative days between "now" and the most recent final day, per
 * Supported Provider. Search Console finalizes rows after two to three days.
 * Ads providers restate recent days; the defaults wait for the common
 * attribution settle time. Operators override with
 * `SCHEDULE_FINAL_DATA_LAG_DAYS`.
 */
export const DEFAULT_FINAL_DATA_LAG_DAYS: Readonly<
  Record<AdsSyncProvider, number>
> = {
  google_ads: 2,
  google_search_console: 3,
  meta_ads: 3,
};

export type ScheduleReadMode = "final" | "provisional";

export interface FinalDataHorizonInput {
  /** Days between `now` and the horizon. Ignored in provisional mode. */
  lagDays: number;
  mode: ScheduleReadMode;
  now: Date;
}

/**
 * The exclusive upper bound of final data: UTC midnight `lagDays` days before
 * `now`'s UTC date. Rows dated before the horizon are final. In provisional
 * mode the horizon is UTC midnight of `now`'s date, so the run reads every
 * completed day and none of today.
 */
export function finalDataHorizon(input: FinalDataHorizonInput): Date {
  if (!Number.isInteger(input.lagDays) || input.lagDays < 0) {
    throw new RangeError(
      `Final-data lag must be a non-negative integer, got ${input.lagDays}`
    );
  }
  const lag = input.mode === "provisional" ? 0 : input.lagDays;
  const dayStart = Date.UTC(
    input.now.getUTCFullYear(),
    input.now.getUTCMonth(),
    input.now.getUTCDate()
  );
  return new Date(dayStart - lag * DAY_MS);
}

export interface ScheduledWindowInput {
  /** Exclusive end of the last committed window, or `null` before the first commit. */
  committedWatermark: Date | null;
  horizon: Date;
  /** Days read before the horizon when no watermark exists. */
  initialLookbackDays: number;
  /** Bounds the window length so a stale watermark catches up over several ticks. */
  policy: ProviderBackfillPolicy;
}

export type ScheduledWindowPlan =
  | { result: "no_new_final_data"; watermark: Date | null }
  | { result: "window"; windowEnd: Date; windowStart: Date };

/**
 * Plans the next scheduled window. Returns `no_new_final_data` when the
 * horizon is not after the watermark. The window never ends after the horizon
 * and never spans more than `windowStepDays * maxWindowsPerRun` days.
 */
export function planScheduledWindow(
  input: ScheduledWindowInput
): ScheduledWindowPlan {
  if (
    !Number.isInteger(input.initialLookbackDays) ||
    input.initialLookbackDays < 1
  ) {
    throw new RangeError(
      `Initial lookback must be a positive integer of days, got ${input.initialLookbackDays}`
    );
  }
  const maxWindowMs =
    input.policy.windowStepDays * input.policy.maxWindowsPerRun * DAY_MS;
  if (!(maxWindowMs > 0)) {
    throw new RangeError("Backfill policy must allow a positive window length");
  }
  const windowStart =
    input.committedWatermark ??
    new Date(input.horizon.getTime() - input.initialLookbackDays * DAY_MS);
  if (windowStart.getTime() >= input.horizon.getTime()) {
    return { result: "no_new_final_data", watermark: input.committedWatermark };
  }
  const windowEnd = new Date(
    Math.min(input.horizon.getTime(), windowStart.getTime() + maxWindowMs)
  );
  return { result: "window", windowEnd, windowStart };
}

export class WatermarkRegressionError extends Error {
  override name = "WatermarkRegressionError";
}

/**
 * Monotonic commit rule. Returns the watermark to store. A candidate before
 * the committed value is a regression and fails closed; an equal candidate is
 * a no-op re-commit.
 */
export function advanceWatermark(
  committed: Date | null,
  candidate: Date
): { changed: boolean; watermark: Date } {
  if (Number.isNaN(candidate.getTime())) {
    throw new WatermarkRegressionError("Watermark candidate is not a date");
  }
  if (committed === null) {
    return { changed: true, watermark: candidate };
  }
  if (candidate.getTime() < committed.getTime()) {
    throw new WatermarkRegressionError(
      `Watermark ${candidate.toISOString()} is before the committed watermark ${committed.toISOString()}`
    );
  }
  return {
    changed: candidate.getTime() > committed.getTime(),
    watermark: candidate,
  };
}

export interface ScheduleSettingsInput {
  SCHEDULE_FINAL_DATA_LAG_DAYS?: string;
  SCHEDULE_INITIAL_LOOKBACK_DAYS?: string;
  SCHEDULE_PROVISIONAL_READS?: string;
}

export interface ScheduleSettings {
  initialLookbackDays: number;
  lagDays: number;
  mode: ScheduleReadMode;
}

/**
 * Reads the schedule settings from deployment vars. Provisional reads need
 * the literal `"true"`; every other value keeps the final-data default.
 */
export function scheduleSettings(
  provider: AdsSyncProvider,
  policy: ProviderBackfillPolicy,
  vars: ScheduleSettingsInput
): ScheduleSettings {
  return {
    initialLookbackDays: integerVar(
      "SCHEDULE_INITIAL_LOOKBACK_DAYS",
      vars.SCHEDULE_INITIAL_LOOKBACK_DAYS,
      policy.windowStepDays
    ),
    lagDays: integerVar(
      "SCHEDULE_FINAL_DATA_LAG_DAYS",
      vars.SCHEDULE_FINAL_DATA_LAG_DAYS,
      DEFAULT_FINAL_DATA_LAG_DAYS[provider]
    ),
    mode: vars.SCHEDULE_PROVISIONAL_READS === "true" ? "provisional" : "final",
  };
}

function integerVar(name: string, value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RangeError(
      `${name} must be a non-negative integer, got ${value}`
    );
  }
  return parsed;
}

/**
 * Deployment-owned schedule tables. They live beside the package control
 * schema in `ads_sync` and are applied after `controlSchemaSql`. Scheduling
 * stays outside the Qualified Run seam, so the seam's schema does not carry
 * them.
 */
export const scheduleSchemaSql = `
CREATE TABLE IF NOT EXISTS ads_sync.sync_watermarks (
  connection_id text PRIMARY KEY REFERENCES ads_sync.sync_connections(id),
  watermark_end timestamptz NOT NULL,
  run_id text,
  committed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_sync.sync_schedule_ticks (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES ads_sync.sync_connections(id),
  run_id text,
  trigger text NOT NULL,
  read_mode text NOT NULL,
  horizon timestamptz NOT NULL,
  window_start timestamptz,
  window_end timestamptz,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_schedule_ticks_connection_created_idx
  ON ads_sync.sync_schedule_ticks (connection_id, created_at DESC);
`.trim();
