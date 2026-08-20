import type { ControlSql } from "@patronage/ads-sync/run";
import { describe, expect, it } from "vitest";

import { WatermarkRegressionError } from "./schedule";
import {
  commitWatermark,
  failInterruptedRun,
  failOrphanedRuns,
  listRuns,
  loadRun,
} from "./schedule-store";

interface CapturedQuery {
  params: unknown[];
  text: string;
}

/**
 * A tagged-template double that records each query's text and parameters.
 * The Worker client runs with `fetch_types: false`, so every parameter must
 * be a scalar postgres.js can bind without a type map.
 */
function capturingSql(rowsFor: (text: string) => unknown[]) {
  const queries: CapturedQuery[] = [];
  const sql = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("$");
    queries.push({ params, text });
    return Promise.resolve(rowsFor(text));
  };
  return { queries, sql: sql as unknown as ControlSql };
}

const startedBefore = new Date("2026-08-18T05:40:00.000Z");

describe(failOrphanedRuns, () => {
  it("binds only scalar parameters and releases the leases of each orphan", async () => {
    const { queries, sql } = capturingSql((text) =>
      text.includes("error_type = 'orphaned'")
        ? [{ id: "stuck-run" }]
        : [{ id: "stuck-run", lease_key: "lease" }]
    );

    const result = await failOrphanedRuns(sql, {
      connectionId: "example_connection",
      runId: "stuck-run",
      startedBefore,
    });

    expect(result).toStrictEqual({ runIds: ["stuck-run"] });
    const [sweep, ...releases] = queries;
    expect(sweep?.text).toContain("status IN ('queued', 'running')");
    // Liveness comes from the lease: a run with an unexpired lease is never
    // swept, whatever its age.
    expect(sweep?.text).toMatch(
      /NOT EXISTS \(\s*SELECT 1\s+FROM ads_sync\.sync_stream_leases AS lease\s+WHERE lease\.run_id = r\.id\s+AND lease\.expires_at > now\(\)/u
    );
    expect(sweep?.params).toStrictEqual([
      expect.stringContaining("lost its executor"),
      "example_connection",
      startedBefore,
      "stuck-run",
      "stuck-run",
    ]);
    for (const query of queries) {
      for (const param of query.params) {
        expect(Array.isArray(param)).toBeFalsy();
      }
    }
    // releaseRunLeases: stream runs, run row, leases, all for the orphan.
    expect(releases).toHaveLength(3);
    for (const query of releases) {
      expect(query.params).toStrictEqual(["stuck-run"]);
    }
  });

  it("sweeps every stale run of the connection when no run id is given", async () => {
    const { queries, sql } = capturingSql(() => []);

    const result = await failOrphanedRuns(sql, {
      connectionId: "example_connection",
      startedBefore,
    });

    expect(result).toStrictEqual({ runIds: [] });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.params).toStrictEqual([
      expect.stringContaining("lost its executor"),
      "example_connection",
      startedBefore,
      null,
      null,
    ]);
  });
});

describe(failInterruptedRun, () => {
  it("fails the run and releases only an expired lease", async () => {
    const { queries, sql } = capturingSql((text) => {
      if (text.includes("error_type = 'orphaned'")) {
        return [{ id: "dead-run" }];
      }
      if (text.includes("DELETE FROM ads_sync.sync_stream_leases")) {
        return [{ lease_key: "expired-lease" }];
      }
      return [];
    });

    await expect(
      failInterruptedRun(sql, {
        connectionId: "example_connection",
        runId: "dead-run",
      })
    ).resolves.toStrictEqual({
      failed: true,
      releasedLeases: ["expired-lease"],
    });
    const [update, streams, release] = queries;
    expect(queries).toHaveLength(3);
    expect(update?.text).toContain("status IN ('queued', 'running')");
    expect(update?.params).toStrictEqual([
      expect.stringContaining("interrupted"),
      "example_connection",
      "dead-run",
    ]);
    expect(streams?.text).toContain("UPDATE ads_sync.sync_stream_runs");
    // The attempt's Containers may still be writing: an unexpired lease is
    // never released here, only one whose TTL has ended.
    expect(release?.text).toMatch(
      /DELETE FROM ads_sync\.sync_stream_leases\s+WHERE run_id = \$\s+AND expires_at <= now\(\)/u
    );
    expect(release?.params).toStrictEqual(["dead-run"]);
  });
});

const PLANNING_TICK_JOIN =
  /LEFT JOIN ads_sync\.sync_schedule_ticks t\s+ON t\.run_id = r\.id AND t\.result <> 'already_active'/u;

describe(listRuns, () => {
  it("joins each run to its planning tick only, so a deferred tick never duplicates a run", async () => {
    const { queries, sql } = capturingSql(() => []);

    await listRuns(sql, 20);

    const [query] = queries;
    // An `already_active` tick carries the in-flight run's id and no window;
    // joining it would list the run twice and push a real run out of the
    // limit.
    expect(query?.text).toMatch(PLANNING_TICK_JOIN);
    expect(query?.text).toContain("ORDER BY r.started_at DESC");
    expect(query?.params).toStrictEqual([20]);
  });
});

describe(loadRun, () => {
  it("answers with the run's own planning tick after an already_active poll", async () => {
    const { queries, sql } = capturingSql(() => [
      { id: "run-1", window_start: "2026-08-13T00:00:00.000Z" },
    ]);

    const row = await loadRun(sql, "run-1");

    expect(row).toStrictEqual({
      id: "run-1",
      window_start: "2026-08-13T00:00:00.000Z",
    });
    const [query] = queries;
    expect(query?.text).toMatch(PLANNING_TICK_JOIN);
    // Deterministic when a run somehow has several ticks: the first one wins.
    expect(query?.text).toMatch(
      /ORDER BY t\.created_at ASC NULLS LAST\s+LIMIT 1/u
    );
    expect(query?.params).toStrictEqual(["run-1"]);
  });

  it("returns null for an unknown run", async () => {
    const { sql } = capturingSql(() => []);

    await expect(loadRun(sql, "missing")).resolves.toBeNull();
  });
});

describe(commitWatermark, () => {
  const input = {
    connectionId: "example_connection",
    runId: "run-1",
    watermarkEnd: new Date("2026-08-15T00:00:00.000Z"),
  };

  it("guards the upsert so a concurrent first commit cannot move the watermark back", async () => {
    // FOR UPDATE locks nothing before the first row exists, so the guard on
    // the upsert is the only thing that serializes two first-ever commits.
    const { queries, sql } = capturingSql((text) =>
      text.includes("INSERT INTO")
        ? [{ watermark_end: input.watermarkEnd }]
        : []
    );

    await expect(commitWatermark(sql, input)).resolves.toStrictEqual({
      changed: true,
    });
    const upsert = queries.find((query) => query.text.includes("INSERT INTO"));
    expect(upsert?.text).toContain(
      "WHERE EXCLUDED.watermark_end > ads_sync.sync_watermarks.watermark_end"
    );
    expect(upsert?.text).toContain("RETURNING watermark_end");
  });

  it("treats a rejected upsert against a higher concurrent commit as a regression", async () => {
    let reads = 0;
    const { sql } = capturingSql((text) => {
      if (text.includes("INSERT INTO")) {
        return [];
      }
      reads += 1;
      // First read: no row yet. Second read: a concurrent commit landed
      // with a later watermark.
      return reads === 1
        ? []
        : [{ watermark_end: new Date("2026-08-16T00:00:00.000Z") }];
    });

    await expect(commitWatermark(sql, input)).rejects.toBeInstanceOf(
      WatermarkRegressionError
    );
  });

  it("reports no change when the concurrent commit reached the same watermark", async () => {
    let reads = 0;
    const { sql } = capturingSql((text) => {
      if (text.includes("INSERT INTO")) {
        return [];
      }
      reads += 1;
      return reads === 1 ? [] : [{ watermark_end: input.watermarkEnd }];
    });

    await expect(commitWatermark(sql, input)).resolves.toStrictEqual({
      changed: false,
    });
  });
});
