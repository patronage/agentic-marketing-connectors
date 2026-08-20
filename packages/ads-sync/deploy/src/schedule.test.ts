import { describe, expect, it } from "vitest";

import {
  advanceWatermark,
  DEFAULT_FINAL_DATA_LAG_DAYS,
  finalDataHorizon,
  planScheduledWindow,
  scheduleSchemaSql,
  scheduleSettings,
  WatermarkRegressionError,
} from "./schedule";

const now = new Date("2026-08-18T10:37:12.000Z");
const gscPolicy = { maxWindowsPerRun: 4, windowStepDays: 30 };

describe(finalDataHorizon, () => {
  it("is UTC midnight lagDays before now's date in final mode", () => {
    expect(
      finalDataHorizon({ lagDays: 3, mode: "final", now }).toISOString()
    ).toBe("2026-08-15T00:00:00.000Z");
    expect(
      finalDataHorizon({ lagDays: 0, mode: "final", now }).toISOString()
    ).toBe("2026-08-18T00:00:00.000Z");
  });

  it("ignores the lag in provisional mode and stops at today's midnight", () => {
    expect(
      finalDataHorizon({ lagDays: 3, mode: "provisional", now }).toISOString()
    ).toBe("2026-08-18T00:00:00.000Z");
  });

  it("uses the UTC date, not the local one, near midnight", () => {
    const lateEvening = new Date("2026-08-18T23:59:59.999Z");
    expect(
      finalDataHorizon({
        lagDays: 1,
        mode: "final",
        now: lateEvening,
      }).toISOString()
    ).toBe("2026-08-17T00:00:00.000Z");
  });

  it("rejects a negative or fractional lag", () => {
    expect(() => finalDataHorizon({ lagDays: -1, mode: "final", now })).toThrow(
      RangeError
    );
    expect(() =>
      finalDataHorizon({ lagDays: 1.5, mode: "final", now })
    ).toThrow(RangeError);
  });

  it("has a lag for every Supported Provider", () => {
    expect(Object.keys(DEFAULT_FINAL_DATA_LAG_DAYS).toSorted()).toStrictEqual([
      "google_ads",
      "google_search_console",
      "meta_ads",
    ]);
  });
});

describe(planScheduledWindow, () => {
  const horizon = new Date("2026-08-15T00:00:00.000Z");

  it("reads from the committed watermark to the horizon", () => {
    expect(
      planScheduledWindow({
        committedWatermark: new Date("2026-08-13T00:00:00.000Z"),
        horizon,
        initialLookbackDays: 30,
        policy: gscPolicy,
      })
    ).toStrictEqual({
      result: "window",
      windowEnd: horizon,
      windowStart: new Date("2026-08-13T00:00:00.000Z"),
    });
  });

  it("returns no_new_final_data when the horizon has not moved past the watermark", () => {
    expect(
      planScheduledWindow({
        committedWatermark: horizon,
        horizon,
        initialLookbackDays: 30,
        policy: gscPolicy,
      })
    ).toStrictEqual({ result: "no_new_final_data", watermark: horizon });
    expect(
      planScheduledWindow({
        committedWatermark: new Date("2026-08-16T00:00:00.000Z"),
        horizon,
        initialLookbackDays: 30,
        policy: gscPolicy,
      }).result
    ).toBe("no_new_final_data");
  });

  it("looks back initialLookbackDays before the first commit", () => {
    expect(
      planScheduledWindow({
        committedWatermark: null,
        horizon,
        initialLookbackDays: 7,
        policy: gscPolicy,
      })
    ).toStrictEqual({
      result: "window",
      windowEnd: horizon,
      windowStart: new Date("2026-08-08T00:00:00.000Z"),
    });
  });

  it("caps the window at windowStepDays * maxWindowsPerRun so catch-up is bounded", () => {
    const stale = new Date("2025-01-01T00:00:00.000Z");
    const plan = planScheduledWindow({
      committedWatermark: stale,
      horizon,
      initialLookbackDays: 30,
      policy: { maxWindowsPerRun: 2, windowStepDays: 10 },
    });
    expect(plan).toStrictEqual({
      result: "window",
      windowEnd: new Date("2025-01-21T00:00:00.000Z"),
      windowStart: stale,
    });
  });

  it("rejects an unusable lookback or policy", () => {
    expect(() =>
      planScheduledWindow({
        committedWatermark: null,
        horizon,
        initialLookbackDays: 0,
        policy: gscPolicy,
      })
    ).toThrow(RangeError);
    expect(() =>
      planScheduledWindow({
        committedWatermark: null,
        horizon,
        initialLookbackDays: 1,
        policy: { maxWindowsPerRun: 0, windowStepDays: 1 },
      })
    ).toThrow(RangeError);
  });
});

describe(advanceWatermark, () => {
  const committed = new Date("2026-08-15T00:00:00.000Z");

  it("accepts the first commit", () => {
    expect(advanceWatermark(null, committed)).toStrictEqual({
      changed: true,
      watermark: committed,
    });
  });

  it("moves forward and treats an equal re-commit as a no-op", () => {
    const later = new Date("2026-08-16T00:00:00.000Z");
    expect(advanceWatermark(committed, later)).toStrictEqual({
      changed: true,
      watermark: later,
    });
    expect(advanceWatermark(committed, new Date(committed))).toStrictEqual({
      changed: false,
      watermark: committed,
    });
  });

  it("fails closed on a regression", () => {
    expect(() =>
      advanceWatermark(committed, new Date("2026-08-14T23:59:59.999Z"))
    ).toThrow(WatermarkRegressionError);
    expect(() => advanceWatermark(committed, new Date("not a date"))).toThrow(
      WatermarkRegressionError
    );
  });
});

describe(scheduleSettings, () => {
  it("defaults to final-data reads with provider lag and policy lookback", () => {
    expect(
      scheduleSettings("google_search_console", gscPolicy, {})
    ).toStrictEqual({ initialLookbackDays: 30, lagDays: 3, mode: "final" });
  });

  it("enables provisional reads only for the literal true", () => {
    expect(
      scheduleSettings("google_ads", gscPolicy, {
        SCHEDULE_PROVISIONAL_READS: "true",
      }).mode
    ).toBe("provisional");
    for (const value of ["TRUE", "1", "yes", "", undefined]) {
      expect(
        scheduleSettings("google_ads", gscPolicy, {
          SCHEDULE_PROVISIONAL_READS: value,
        }).mode
      ).toBe("final");
    }
  });

  it("reads integer overrides and rejects garbage", () => {
    expect(
      scheduleSettings("meta_ads", gscPolicy, {
        SCHEDULE_FINAL_DATA_LAG_DAYS: "7",
        SCHEDULE_INITIAL_LOOKBACK_DAYS: "14",
      })
    ).toStrictEqual({ initialLookbackDays: 14, lagDays: 7, mode: "final" });
    expect(() =>
      scheduleSettings("meta_ads", gscPolicy, {
        SCHEDULE_FINAL_DATA_LAG_DAYS: "soon",
      })
    ).toThrow(RangeError);
  });
});

describe(scheduleSchemaSql, () => {
  it("creates the watermark and tick tables beside the control schema", () => {
    expect(scheduleSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ads_sync.sync_watermarks"
    );
    expect(scheduleSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ads_sync.sync_schedule_ticks"
    );
    expect(scheduleSchemaSql).not.toMatch(/secret|token|password/iu);
  });
});
