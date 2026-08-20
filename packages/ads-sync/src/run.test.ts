import type postgres from "postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { googleSearchConsoleProvider } from "./google-search-console.js";
import type {
  ArtifactBucket,
  ContainerImagePin,
  QualifiedRunDependencies,
} from "./run.js";
import {
  createQualifiedRunAdapter,
  MAX_FAILURE_TEXT_BYTES,
  RunLifecycleError,
} from "./run.js";
import {
  staticCustodyAdapter,
  syncConnectionFixture,
} from "./test-fixtures/qualified-run-doubles.js";

const CONNECTION_ID = "example_gsc_connection";
const RUN_ID = "example-run-id";
const STREAM_NAME = googleSearchConsoleProvider.streamName;

const SOURCE_PIN: ContainerImagePin = {
  connectorImage: "example/source-google-search-console:1.0.0@sha256:aaa",
  wrapperVersion: "3",
};
const DESTINATION_PIN: ContainerImagePin = {
  connectorImage: "example/destination-postgres:1.0.0@sha256:bbb",
  wrapperVersion: "3",
};

const CONFIGURED_CATALOG = {
  streams: [
    {
      destination_sync_mode: "append_dedup",
      stream: { name: STREAM_NAME },
      sync_mode: "incremental",
    },
  ],
};

const SOURCE_STDOUT = [
  JSON.stringify({
    record: { data: { clicks: 1 }, emitted_at: 1, stream: STREAM_NAME },
    type: "RECORD",
  }),
  JSON.stringify({
    state: {
      stream: {
        stream_descriptor: { name: STREAM_NAME },
        stream_state: { date: "2026-01-01" },
      },
      type: "STREAM",
    },
    type: "STATE",
  }),
].join("\n");

const CONNECTION_ROW = {
  account_id: null,
  airbyte_schema: googleSearchConsoleProvider.defaultAirbyteSchema,
  configured_catalog_hash: "0".repeat(64),
  configured_catalog_ref: "ads-sync.config.ts#example.catalog",
  display_name: "Example Search Console connection",
  id: CONNECTION_ID,
  next_run_at: null,
  provider: "google_search_console",
  reporting_enabled: true,
  schedule_cron: null,
  schedule_every_minutes: 1440,
  selected_streams: [STREAM_NAME],
  source_config_fingerprint: "1".repeat(64),
  source_config_ref: "GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON",
  source_identity: { site_url: "sc-domain:example.com" },
  state_config_ref: "GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON",
  status: "enabled",
  stream_group: STREAM_NAME,
  stream_name: STREAM_NAME,
};

interface RecordedStatement {
  text: string;
  values: unknown[];
}

interface FakeControlStore {
  events: string[];
  lifecycle: Record<string, unknown>;
  sql: () => postgres.Sql;
  statements: RecordedStatement[];
}

function fakeControlStore(events: string[]): FakeControlStore {
  const statements: RecordedStatement[] = [];
  const lifecycle: Record<string, unknown> = {
    connection_status: "enabled",
    lease_run_id: RUN_ID,
    run_status: "running",
    stream_status: "running",
  };

  const query = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    statements.push({ text, values });
    if (text.includes("INSERT INTO ads_sync.sync_state_commits")) {
      events.push("state_commit");
    }
    if (
      text.includes("FROM ads_sync.sync_connections") &&
      text.includes("status = 'enabled'")
    ) {
      return Promise.resolve([CONNECTION_ROW]);
    }
    if (
      text.includes("UPDATE ads_sync.sync_runs") &&
      text.includes("SET status = 'running'")
    ) {
      return Promise.resolve(
        lifecycle.run_status === "queued" || lifecycle.run_status === "running"
          ? [{ id: RUN_ID }]
          : []
      );
    }
    if (text.includes("INSERT INTO ads_sync.sync_stream_leases")) {
      return Promise.resolve([{ lease_key: `lease-${CONNECTION_ID}` }]);
    }
    if (text.includes("UPDATE ads_sync.sync_stream_leases")) {
      return Promise.resolve([{ lease_key: `lease-${CONNECTION_ID}` }]);
    }
    if (text.includes("SELECT state_commits.state_json")) {
      return Promise.resolve([]);
    }
    if (text.includes("AS connection_status")) {
      return Promise.resolve([lifecycle]);
    }
    return Promise.resolve([]);
  };

  const client = Object.assign(vi.fn(query), {
    begin: (handler: (transaction: unknown) => Promise<unknown>) =>
      handler(client),
    end: () => Promise.resolve(),
    json: (value: unknown) => value,
  }) as unknown as postgres.Sql;

  return { events, lifecycle, sql: () => client, statements };
}

function memoryArtifacts(): ArtifactBucket & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    get: (key: string) => {
      const body = store.get(key);
      return Promise.resolve(
        body === undefined ? null : { text: () => Promise.resolve(body) }
      );
    },
    put: (key: string, body: string) => {
      store.set(key, body);
      return Promise.resolve();
    },
    store,
  };
}

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status });

const caughtError = (value: unknown) => value;

interface HarnessOptions {
  destinationMetadata?: unknown;
  destinationOutput?: { stderr?: string; stdout?: string };
  destinationWrite?: () => Response;
  sourceMetadata?: () => Response;
  sourceOutput?: { stderr?: string; stdout?: string };
}

function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const control = fakeControlStore(events);
  const artifacts = memoryArtifacts();
  const sourceMetadataFetch = vi.fn<() => Response>(
    options.sourceMetadata ?? (() => jsonResponse(SOURCE_PIN))
  );

  const sourceContainer = {
    fetch: vi.fn<(request: Request) => Promise<Response>>((request) =>
      Promise.resolve(
        request.url.endsWith("/metadata")
          ? sourceMetadataFetch()
          : jsonResponse({
              exitCode: 0,
              stderr: options.sourceOutput?.stderr ?? "",
              stdout: options.sourceOutput?.stdout ?? SOURCE_STDOUT,
              success: true,
            })
      )
    ),
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };

  const destinationContainer = {
    fetch: vi.fn<(request: Request) => Promise<Response>>((request) => {
      if (request.url.endsWith("/metadata")) {
        return Promise.resolve(
          jsonResponse(options.destinationMetadata ?? DESTINATION_PIN)
        );
      }
      events.push("destination_write");
      return Promise.resolve(
        options.destinationWrite?.() ??
          jsonResponse({
            exitCode: 0,
            stderr: options.destinationOutput?.stderr ?? "",
            stdout: options.destinationOutput?.stdout ?? SOURCE_STDOUT,
            success: true,
          })
      );
    }),
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };

  const custody = {
    destinationConfig: vi.fn<() => Promise<unknown>>(() =>
      Promise.resolve({ host: "db.example.invalid" })
    ),
    seedState: vi.fn<() => Promise<unknown>>(() => Promise.resolve()),
    sourceConfig: vi.fn<() => Promise<unknown>>(() =>
      Promise.resolve({ site_urls: ["sc-domain:example.com"] })
    ),
  };

  const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

  const dependencies: QualifiedRunDependencies = {
    artifacts,
    coldStart: { maxAttempts: 1, retryDelayMs: 0, sleep },
    connections: { configuredCatalog: () => CONFIGURED_CATALOG },
    containers: {
      destination: () => destinationContainer,
      pins: {
        destination: DESTINATION_PIN,
        google_ads: SOURCE_PIN,
        google_search_console: SOURCE_PIN,
        meta_ads: SOURCE_PIN,
      },
      source: () => sourceContainer,
    },
    custody,
    sql: control.sql,
  };

  return {
    artifacts,
    control,
    custody,
    dependencies,
    destinationContainer,
    events,
    sleep,
    sourceContainer,
    sourceMetadataFetch,
  };
}

const params = { connectionId: CONNECTION_ID, runId: RUN_ID };

const statementIndex = (
  statements: RecordedStatement[],
  ...needles: string[]
) =>
  statements.findIndex((entry) => needles.every((n) => entry.text.includes(n)));

describe(createQualifiedRunAdapter, () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {
      // Best-effort seam warnings are not under test.
    });
  });

  it("commits state only after the destination write succeeds", async () => {
    const context = harness();
    const adapter = createQualifiedRunAdapter(context.dependencies);

    const summary = await adapter.run(params);

    expect(summary.stateCommit).toMatchObject({ committed: true });
    expect(context.events.indexOf("destination_write")).toBeGreaterThanOrEqual(
      0
    );
    expect(context.events.indexOf("state_commit")).toBeGreaterThan(
      context.events.indexOf("destination_write")
    );
    expect(
      statementIndex(
        context.control.statements,
        "INSERT INTO ads_sync.sync_state_commits"
      )
    ).toBeGreaterThan(
      statementIndex(
        context.control.statements,
        "INSERT INTO ads_sync.sync_stream_runs"
      )
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("never commits state when the destination write reports failure", async () => {
    const context = harness({
      destinationWrite: () =>
        jsonResponse({
          exitCode: 1,
          stderr: "destination refused the batch",
          stdout: "",
          success: false,
        }),
    });
    const adapter = createQualifiedRunAdapter(context.dependencies);

    await expect(adapter.run(params)).rejects.toThrow(
      /Destination write failed/u
    );

    expect(context.events).not.toContain("state_commit");
    expect(
      statementIndex(
        context.control.statements,
        "INSERT INTO ads_sync.sync_state_commits"
      )
    ).toBe(-1);
    expect(
      statementIndex(
        context.control.statements,
        "UPDATE ads_sync.sync_runs",
        "status = 'failed'"
      )
    ).toBeGreaterThan(-1);
  });

  it("does not resurrect a run the sweep already failed closed", async () => {
    const context = harness();
    context.control.lifecycle.run_status = "failed";
    const adapter = createQualifiedRunAdapter(context.dependencies);

    await expect(adapter.run(params)).rejects.toThrow(/not queued or running/u);

    expect(context.events).not.toContain("destination_write");
    expect(context.sourceContainer.fetch).not.toHaveBeenCalled();
    expect(
      statementIndex(
        context.control.statements,
        "INSERT INTO ads_sync.sync_stream_runs"
      )
    ).toBe(-1);
    expect(
      statementIndex(
        context.control.statements,
        "INSERT INTO ads_sync.sync_stream_leases"
      )
    ).toBe(-1);
    const failedUpdate = context.control.statements.find(
      (entry) =>
        entry.text.includes("UPDATE ads_sync.sync_runs") &&
        entry.text.includes("status = 'failed'")
    );
    expect(failedUpdate?.text).toContain("AND status IN ('queued', 'running')");
  });

  it("refuses the state commit when the fresh lifecycle check fails", async () => {
    const context = harness();
    context.control.lifecycle.connection_status = "disabled";
    const adapter = createQualifiedRunAdapter(context.dependencies);

    const prepared = await adapter.prepare(params);
    await adapter.acquireLease(prepared);
    await adapter.readSource(prepared);
    await adapter.compileDestinationInput(prepared);

    await expect(adapter.writeDestination(prepared)).rejects.toBeInstanceOf(
      RunLifecycleError
    );
    expect(
      statementIndex(
        context.control.statements,
        "INSERT INTO ads_sync.sync_state_commits"
      )
    ).toBe(-1);
  });

  it("fails the run when the source image pin mismatches, without retry", async () => {
    const context = harness({
      sourceMetadata: () =>
        jsonResponse({ ...SOURCE_PIN, wrapperVersion: "0" }),
    });
    context.dependencies.coldStart = {
      maxAttempts: 4,
      retryDelayMs: 1,
      sleep: context.sleep,
    };
    const adapter = createQualifiedRunAdapter(context.dependencies);

    await expect(adapter.run(params)).rejects.toThrow(/metadata mismatch/u);

    expect(context.sourceMetadataFetch).toHaveBeenCalledOnce();
    expect(context.sleep).not.toHaveBeenCalled();
  });

  it("retries an unavailable source container a bounded number of times", async () => {
    const context = harness({
      sourceMetadata: () => jsonResponse({ status: "starting" }, 500),
    });
    context.dependencies.coldStart = {
      maxAttempts: 3,
      retryDelayMs: 1,
      sleep: context.sleep,
    };
    const adapter = createQualifiedRunAdapter(context.dependencies);

    const failure = await adapter.run(params).catch(caughtError);

    expect(failure).toMatchObject({ reason: "unavailable" });
    expect(context.sourceMetadataFetch).toHaveBeenCalledTimes(3);
    expect(context.sleep).toHaveBeenCalledTimes(2);
  });

  it("bounds and redacts failure text written to control rows", async () => {
    const context = harness({
      destinationWrite: () =>
        new Response(
          `{'refresh_token': 'SECRET-VALUE-123'} ${"x".repeat(MAX_FAILURE_TEXT_BYTES * 3)}`,
          { status: 500 }
        ),
    });
    const adapter = createQualifiedRunAdapter(context.dependencies);

    await expect(adapter.run(params)).rejects.toThrow(
      /Destination write failed/u
    );

    const failureMessages = context.control.statements
      .filter(
        (entry) =>
          (entry.text.includes("UPDATE ads_sync.sync_runs") &&
            entry.text.includes("status = 'failed'")) ||
          entry.text.includes("INSERT INTO ads_sync.sync_errors")
      )
      .flatMap((entry) => entry.values.filter((v) => typeof v === "string"));

    const boundedMessages = failureMessages.filter((value) =>
      value.includes("Destination write failed")
    );
    expect(boundedMessages.length).toBeGreaterThanOrEqual(2);
    for (const message of boundedMessages) {
      expect(message).not.toContain("SECRET-VALUE-123");
      expect(message).toContain("<redacted>");
      expect(new TextEncoder().encode(message).length).toBeLessThanOrEqual(
        MAX_FAILURE_TEXT_BYTES
      );
    }
  });

  it("reads every secret through the custody adapter and never an environment", async () => {
    const context = harness();
    const adapter = createQualifiedRunAdapter(context.dependencies);

    await adapter.run(params);

    const connection = expect.objectContaining({
      connectionId: CONNECTION_ID,
      provider: "google_search_console",
    }) as unknown;
    expect(context.custody.sourceConfig).toHaveBeenCalledWith(connection);
    expect(context.custody.seedState).toHaveBeenCalledWith(connection);
    expect(context.custody.destinationConfig).toHaveBeenCalledWith(connection);

    // Compiles only while `env` is absent from the dependency contract.
    const forbidden: Exclude<"env", keyof QualifiedRunDependencies> = "env";
    expect(forbidden).toBe("env");
  });

  it("enforces artifact bounds on source stdout", async () => {
    const context = harness();
    context.dependencies.limits = {
      maxDestinationInputBytes: 10,
      maxLines: 1000,
      maxSourceStdoutBytes: 10,
    };
    const adapter = createQualifiedRunAdapter(context.dependencies);

    const prepared = await adapter.prepare(params);
    await adapter.acquireLease(prepared);

    await expect(adapter.readSource(prepared)).rejects.toThrow(/above limit/u);
  });

  it("redacts secrets in every persisted artifact body", async () => {
    const secretLog = JSON.stringify({
      log: {
        level: "ERROR",
        message: "Config(refresh_token='SOURCE-STDOUT-SECRET') failed",
      },
      type: "LOG",
    });
    const context = harness({
      destinationOutput: {
        stderr:
          "psycopg2 error for postgres://writer:DEST-STDERR-SECRET@db.example.invalid:5432/app",
        stdout: `${SOURCE_STDOUT}\n{"type":"LOG","log":{"message":"password=DEST-STDOUT-SECRET"}}`,
      },
      sourceOutput: {
        stderr:
          "Traceback (most recent call last):\n  File x\nValueError: {'refresh_token': 'SOURCE-STDERR-SECRET'}",
        stdout: `${SOURCE_STDOUT}\n${secretLog}`,
      },
    });
    const adapter = createQualifiedRunAdapter(context.dependencies);
    await adapter.run(params);

    const bodies = [...context.artifacts.store.entries()];
    expect(bodies.length).toBeGreaterThanOrEqual(5);
    for (const [, body] of bodies) {
      expect(body).not.toContain("SOURCE-STDOUT-SECRET");
      expect(body).not.toContain("SOURCE-STDERR-SECRET");
      expect(body).not.toContain("DEST-STDOUT-SECRET");
      expect(body).not.toContain("DEST-STDERR-SECRET");
    }
    const sourceStdout = [...context.artifacts.store.entries()].find(([key]) =>
      key.includes("source")
    );
    // Data lines are byte-identical; only diagnostic lines are redacted.
    expect(sourceStdout?.[1]).toContain(SOURCE_STDOUT);
    const redactedBodies = bodies.filter(([, body]) =>
      body.includes("<redacted>")
    );
    expect(redactedBodies.length).toBeGreaterThanOrEqual(4);
  });

  it("truncates oversized destination and source stderr artifacts per limits", async () => {
    const stderr = `${"e".repeat(500)}\n`.repeat(20);
    const context = harness({
      destinationOutput: { stderr },
      sourceOutput: { stderr },
    });
    context.dependencies.limits = {
      maxDestinationInputBytes: 25 * 1024 * 1024,
      maxLines: 1000,
      maxSourceStdoutBytes: 2048,
    };
    const adapter = createQualifiedRunAdapter(context.dependencies);
    await adapter.run(params);

    const stderrBodies = [...context.artifacts.store.entries()].filter(
      ([key]) => key.includes("stderr")
    );
    expect(stderrBodies).toHaveLength(2);
    for (const [, body] of stderrBodies) {
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(2048);
      expect(body).toContain("[truncated");
    }
  });

  it("redacts and bounds the lease release warning", async () => {
    const context = harness();
    const client = context.control.sql();
    const original = client as unknown as (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<unknown[]>;
    const failing = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) =>
        strings.join("?").includes("DELETE FROM ads_sync.sync_stream_leases")
          ? Promise.reject(
              new Error(
                `connection to postgres://writer:LEASE-SECRET@db.example.invalid/app failed ${"x".repeat(MAX_FAILURE_TEXT_BYTES * 2)}`
              )
            )
          : original(strings, ...values),
      { begin: client.begin, end: client.end, json: client.json }
    );
    context.dependencies.sql = () => failing as unknown as postgres.Sql;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const adapter = createQualifiedRunAdapter(context.dependencies);
      const prepared = await adapter.prepare(params);
      const released = await adapter.releaseLease(prepared);
      expect(released.released).toBeFalsy();
      expect(released.error).not.toContain("LEASE-SECRET");
      expect(released.error).toContain("<redacted>");
      expect(
        new TextEncoder().encode(released.error ?? "").length
      ).toBeLessThanOrEqual(MAX_FAILURE_TEXT_BYTES);
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain("LEASE-SECRET");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("uses the fixture connection shape the seam loads from the control store", async () => {
    expect(syncConnectionFixture()).toMatchObject({
      connectionId: CONNECTION_ID,
      sourceConfigRef: "GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON",
      stateConfigRef: "GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON",
      streamName: STREAM_NAME,
    });
    await expect(
      staticCustodyAdapter({ sourceConfig: { a: 1 } }).sourceConfig(
        syncConnectionFixture()
      )
    ).resolves.toStrictEqual({ a: 1 });
  });
});
