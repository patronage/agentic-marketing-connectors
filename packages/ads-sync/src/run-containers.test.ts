import { describe, expect, it, vi } from "vitest";

import type { ConnectorContainerHandle } from "./run-containers.js";
import {
  assertContainerImagePin,
  boundedFailureText,
  ContainerQualificationError,
  MAX_FAILURE_TEXT_BYTES,
  readSourceArtifact,
  sanitizeConnectorFailureText,
  writeDestination,
} from "./run-containers.js";

const PIN = {
  connectorImage: "example/source-connector:1.0.0@sha256:abc",
  wrapperVersion: "3",
};

function containerStub(handler: (request: Request) => Promise<Response>) {
  return {
    fetch: vi.fn<(request: Request) => Promise<Response>>(handler),
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  } satisfies ConnectorContainerHandle;
}

const sleepSpy = () =>
  vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status });

const caughtError = (value: unknown): Error => value as Error;

describe(assertContainerImagePin, () => {
  it("passes on the first attempt when the pin matches exactly", async () => {
    const container = containerStub(() => Promise.resolve(jsonResponse(PIN)));

    await expect(
      assertContainerImagePin(container, "google_search_console", PIN, {
        maxAttempts: 5,
        retryDelayMs: 0,
        sleep: () => Promise.resolve(),
      })
    ).resolves.toStrictEqual({ attempts: 1 });
    expect(container.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { field: "connectorImage", metadata: { ...PIN, connectorImage: "other" } },
    { field: "wrapperVersion", metadata: { ...PIN, wrapperVersion: "2" } },
  ])(
    "fails at once on a responding image with a mismatched $field",
    async ({ metadata }) => {
      const container = containerStub(() =>
        Promise.resolve(jsonResponse(metadata))
      );
      const sleep = sleepSpy();

      const failure = await assertContainerImagePin(
        container,
        "google_search_console",
        PIN,
        { maxAttempts: 5, retryDelayMs: 10, sleep }
      ).catch<Error>(caughtError);

      expect(failure).toBeInstanceOf(ContainerQualificationError);
      expect(failure).toMatchObject({ reason: "metadata_mismatch" });
      expect(container.fetch).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    }
  );

  it("retries an unavailable container and reports the winning attempt", async () => {
    let attempt = 0;
    const container = containerStub(() => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.reject(new Error("connection refused"));
      }
      if (attempt === 2) {
        return Promise.resolve(jsonResponse({ status: "starting" }, 503));
      }
      return Promise.resolve(jsonResponse(PIN));
    });
    const sleep = sleepSpy();

    await expect(
      assertContainerImagePin(container, "google_search_console", PIN, {
        maxAttempts: 5,
        retryDelayMs: 250,
        sleep,
      })
    ).resolves.toStrictEqual({ attempts: 3 });
    expect(container.fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(sleep).toHaveBeenNthCalledWith(2, 250);
  });

  it("bounds the retry budget for a container that never responds", async () => {
    const container = containerStub(() =>
      Promise.resolve(jsonResponse({ status: "boom" }, 500))
    );
    const sleep = sleepSpy();

    const failure = await assertContainerImagePin(
      container,
      "destination",
      PIN,
      { maxAttempts: 4, retryDelayMs: 5, sleep }
    ).catch<Error>(caughtError);

    expect(failure).toBeInstanceOf(ContainerQualificationError);
    expect(failure).toMatchObject({ reason: "unavailable" });
    expect(container.fetch).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("fails immediately on a non-5xx error status", async () => {
    const container = containerStub(() =>
      Promise.resolve(jsonResponse({ status: "not found" }, 404))
    );
    const sleep = sleepSpy();

    await expect(
      assertContainerImagePin(container, "google_search_console", PIN, {
        maxAttempts: 5,
        retryDelayMs: 5,
        sleep,
      })
    ).rejects.toThrow(/status 404/u);
    expect(container.fetch).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe(sanitizeConnectorFailureText, () => {
  it.each([
    {
      form: "JSON pair",
      key: "refresh_token",
      secret: "json-secret-value",
      text: '{"refresh_token":"json-secret-value"}',
    },
    {
      form: "escaped JSON pair",
      key: "client_secret",
      secret: "escaped-secret-value",
      text: String.raw`{\"client_secret\":\"escaped-secret-value\"}`,
    },
    {
      form: "Python repr pair",
      key: "refresh_token",
      secret: "python-secret-value",
      text: "{'refresh_token': 'python-secret-value'}",
    },
    {
      form: "mixed quote pair",
      key: "access_token",
      secret: "mixed-secret-value",
      text: `{'access_token': "mixed-secret-value"}`,
    },
    {
      form: "bare assignment",
      key: "developer_token",
      secret: "abc123",
      text: "developer_token=abc123 remains after",
    },
    {
      form: "Python kwargs repr with a quoted value",
      key: "refresh_token",
      secret: "kwargs-secret-value",
      text: "SourceConfig(site_url='https://example.org/', refresh_token='kwargs-secret-value')",
    },
    {
      form: "Python kwargs repr with a double-quoted value",
      key: "client_secret",
      secret: "kwargs-dq-secret",
      text: 'Config(client_secret="kwargs-dq-secret", x=1)',
    },
    {
      form: "unquoted kwargs value until the delimiter",
      key: "password",
      secret: "unquoted-secret",
      text: "Config(password=unquoted-secret)",
    },
    {
      form: "Authorization Bearer header",
      key: "Authorization",
      secret: "bearer-secret-value",
      text: "request headers: Authorization: Bearer bearer-secret-value\nAccept: */*",
    },
    {
      form: "escaped Authorization JSON pair",
      key: "authorization",
      secret: "escaped-bearer-secret",
      text: String.raw`{\"authorization\":\"Bearer escaped-bearer-secret\"}`,
    },
    {
      form: "URI userinfo",
      key: "postgres://writer",
      secret: "uri-secret-value",
      text: "could not connect to postgres://writer:uri-secret-value@db.example.invalid:5432/app",
    },
    {
      form: "bare token key",
      key: "token",
      secret: "bare-token-secret",
      text: '{"token": "bare-token-secret"}',
    },
    {
      form: "apikey key",
      key: "apikey",
      secret: "apikey-secret",
      text: "apikey=apikey-secret",
    },
    {
      form: "Authorization header with an equals sign",
      key: "Authorization",
      secret: "eyJSECRETVAL",
      text: "Authorization=Bearer eyJSECRETVAL",
    },
    {
      form: "lower-case Basic authorization with an equals sign",
      key: "authorization",
      secret: "U0VDUkVUVkFM",
      text: "authorization=Basic U0VDUkVUVkFM",
    },
    {
      form: "unquoted colon log line",
      key: "refresh_token",
      secret: "SECRETVAL",
      text: "refresh_token: SECRETVAL",
    },
    {
      form: "indented YAML line",
      key: "password",
      secret: "SECRETVAL",
      text: "  password: SECRETVAL\n  host: db",
    },
    {
      form: "unquoted JSON-ish value",
      key: "token",
      secret: "SECRETVAL",
      text: '{"token": SECRETVAL}',
    },
    {
      form: "double-quoted YAML value",
      key: "password",
      secret: "hunter2",
      text: 'password: "hunter2"\nhost: db',
    },
    {
      form: "single-quoted YAML value",
      key: "password",
      secret: "hunter2",
      text: "password: 'hunter2'",
    },
    {
      form: "escape-quoted YAML value",
      key: "password",
      secret: "hunter2",
      text: String.raw`password: \"hunter2\"`,
    },
    {
      form: "angle-wrapped colon value",
      key: "token",
      secret: "SECRETVAL",
      text: "token: <SECRETVAL>",
    },
    {
      form: "JSON numeric scalar",
      key: "client_id",
      secret: "1234567",
      text: '{"client_id": 1234567}',
    },
  ])("redacts the $form form", ({ key, secret, text }) => {
    const sanitized = sanitizeConnectorFailureText(text);

    expect(sanitized).not.toContain(secret);
    expect(sanitized).toContain(key);
    expect(sanitized).toContain("<redacted>");
  });

  it("keeps a redacted JSON scalar parseable", () => {
    const sanitized = sanitizeConnectorFailureText(
      '{"client_id": 1234567, "stream": "ads"}'
    );

    expect(JSON.parse(sanitized)).toStrictEqual({
      client_id: "<redacted>",
      stream: "ads",
    });
  });

  it("emits no marker next to an intact escape-quoted secret", () => {
    const sanitized = sanitizeConnectorFailureText(
      String.raw`state: {\"password\": ok} password: \"hunter2\" tail`
    );

    expect(sanitized).not.toContain("hunter2");
    expect(sanitized).toContain(String.raw`password: \"<redacted>\"`);
  });

  it("is idempotent over already-redacted output", () => {
    const once = sanitizeConnectorFailureText(
      'token: <SECRETVAL> password: "hunter2" {"client_id": 42}'
    );

    expect(sanitizeConnectorFailureText(once)).toBe(once);
  });

  it("redacts an escaped-JSON pair without exponential backtracking", () => {
    const hostile = `\\"access_token\\":\\"${"\\".repeat(80)}END`;
    const startedAt = performance.now();
    const output = sanitizeConnectorFailureText(hostile);
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(output).toContain("access_token");
  });

  it("keeps the delimiter after an unquoted kwargs value", () => {
    expect(
      sanitizeConnectorFailureText("Config(password=unquoted-secret) tail")
    ).toBe("Config(password=<redacted>) tail");
  });

  it("keeps the scheme word when the header uses an equals sign", () => {
    expect(sanitizeConnectorFailureText("Authorization=Bearer eyJSECRET")).toBe(
      "Authorization: Bearer <redacted>"
    );
  });

  it("keeps the delimiter after an unquoted colon value", () => {
    expect(sanitizeConnectorFailureText('{"token": SECRETVAL} tail')).toBe(
      '{"token": <redacted>} tail'
    );
  });

  it("keeps the URI scheme, user, and host", () => {
    expect(
      sanitizeConnectorFailureText(
        "postgres://writer:s3cret@db.example.invalid/app"
      )
    ).toBe("postgres://writer:<redacted>@db.example.invalid/app");
  });

  it("redacts every new form without exponential backtracking", () => {
    const hostile = [
      `refresh_token='${"\\".repeat(80)}END`,
      `Authorization: Bearer ${"\\".repeat(80)}`,
      `postgres://user:${"\\".repeat(80)}@host`,
      `password=${"a".repeat(80)}`,
    ].join(" ");
    const startedAt = performance.now();
    sanitizeConnectorFailureText(hostile);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  it("scans a long unbroken token run in linear time", () => {
    const text = `postgres://writer:s3cret@host ${"x".repeat(200_000)} ${"a-".repeat(100_000)}`;
    const startedAt = performance.now();
    const output = sanitizeConnectorFailureText(text);
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(output).toContain("postgres://writer:<redacted>@host");
  });

  it("leaves non-sensitive keys untouched", () => {
    const text = '{"customer_id":"123","site_url":"sc-domain:example.com"}';

    expect(sanitizeConnectorFailureText(text)).toBe(text);
  });

  it("leaves a URL without userinfo and a bare timestamp untouched", () => {
    const text =
      "GET https://api.example.invalid:443/v1/reports at 2026-01-01T00:00:00Z";

    expect(sanitizeConnectorFailureText(text)).toBe(text);
  });
});

describe(boundedFailureText, () => {
  it("cuts oversized text and marks the truncated byte count", () => {
    const bounded = boundedFailureText("x".repeat(MAX_FAILURE_TEXT_BYTES * 2));

    expect(bounded).toMatch(/\[truncated \d+ bytes\]$/u);
    expect(new TextEncoder().encode(bounded).length).toBeLessThanOrEqual(
      MAX_FAILURE_TEXT_BYTES
    );
  });

  it("redacts before truncating so an oversized body cannot leak a secret", () => {
    const bounded = boundedFailureText(
      `{'refresh_token': 'SECRET-VALUE-123'} ${"x".repeat(MAX_FAILURE_TEXT_BYTES * 2)}`
    );

    expect(bounded).not.toContain("SECRET-VALUE-123");
    expect(bounded).toContain("<redacted>");
    expect(bounded).toMatch(/\[truncated \d+ bytes\]$/u);
    expect(new TextEncoder().encode(bounded).length).toBeLessThanOrEqual(
      MAX_FAILURE_TEXT_BYTES
    );
  });
});

describe(readSourceArtifact, () => {
  const readSource = (container: ConnectorContainerHandle) =>
    readSourceArtifact(container, {
      coldStart: { maxAttempts: 1, retryDelayMs: 0 },
      expected: PIN,
      payload: { catalog: {}, config: {} },
      provider: "google_search_console",
    });

  it("redacts the failure body and stops the container", async () => {
    const container = containerStub((request) =>
      Promise.resolve(
        request.url.endsWith("/metadata")
          ? jsonResponse(PIN)
          : new Response('{"refresh_token":"SECRET-VALUE-123"}', {
              status: 500,
            })
      )
    );

    const failure = await readSource(container).then(caughtError, caughtError);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain("<redacted>");
    expect(failure.message).not.toContain("SECRET-VALUE-123");
    expect(container.stop).toHaveBeenCalledOnce();
  });

  it("stops the container when the pin probe itself throws", async () => {
    const container = containerStub(() =>
      Promise.resolve(jsonResponse({ ...PIN, wrapperVersion: "0" }))
    );

    await expect(readSource(container)).rejects.toThrow(/metadata mismatch/u);
    expect(container.stop).toHaveBeenCalledOnce();
  });

  it("returns the artifact pair on success", async () => {
    const container = containerStub((request) =>
      Promise.resolve(
        request.url.endsWith("/metadata")
          ? jsonResponse(PIN)
          : jsonResponse({
              exitCode: 0,
              stderr: "",
              stdout: "line",
              success: true,
            })
      )
    );

    await expect(readSource(container)).resolves.toMatchObject({
      stderr: "",
      stdout: "line",
    });
    expect(container.stop).toHaveBeenCalledOnce();
  });
});

describe(writeDestination, () => {
  const destinationStub = (body: unknown) =>
    containerStub((request) =>
      Promise.resolve(
        request.url.endsWith("/metadata")
          ? jsonResponse(PIN)
          : jsonResponse(body)
      )
    );

  const write = (container: ConnectorContainerHandle) =>
    writeDestination(container, {
      coldStart: { maxAttempts: 1, retryDelayMs: 0 },
      expected: PIN,
      payload: { catalog: {}, config: {}, messages: "" },
    });

  it("rejects when the wrapper does not report success", async () => {
    const container = destinationStub({
      exitCode: 0,
      stderr: "destination refused the batch",
      stdout: "",
      success: false,
    });

    await expect(write(container)).rejects.toThrow(/Destination write failed/u);
    expect(container.stop).toHaveBeenCalledOnce();
  });

  it("rejects when the wrapper exits non-zero", async () => {
    const container = destinationStub({
      exitCode: 3,
      stderr: "boom",
      stdout: "",
      success: true,
    });

    await expect(write(container)).rejects.toThrow(
      /Destination write exited with code 3/u
    );
    expect(container.stop).toHaveBeenCalledOnce();
  });

  it("redacts a non-ok failure body", async () => {
    const container = containerStub((request) =>
      Promise.resolve(
        request.url.endsWith("/metadata")
          ? jsonResponse(PIN)
          : new Response("{'refresh_token': 'SECRET-VALUE-123'}", {
              status: 502,
            })
      )
    );

    const failure = await write(container).then(caughtError, caughtError);

    expect(failure.message).toContain("<redacted>");
    expect(failure.message).not.toContain("SECRET-VALUE-123");
    expect(container.stop).toHaveBeenCalledOnce();
  });
});
