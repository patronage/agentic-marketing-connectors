import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

import { supportedImageVersions } from "@patronage/ads-sync";
import { afterAll, describe, expect, it } from "vitest";

const imagesDir = import.meta.dirname;
const readImageFile = (name: string) =>
  readFileSync(path.join(imagesDir, name), "utf-8");

const dockerfiles = {
  destination: "Dockerfile.postgres",
  google_ads: "Dockerfile",
  google_search_console: "Dockerfile.gsc",
  meta_ads: "Dockerfile.meta",
} as const;

const wrapperSource = readImageFile("airbyte-source-server.py");
const wrapperVersion = /WRAPPER_VERSION = "(?<version>[^"]+)"/u.exec(
  wrapperSource
)?.groups?.version;

const runPython = (script: string, args: string[]) =>
  spawnSync("python3", [path.join(imagesDir, script), ...args], {
    encoding: "utf-8",
  });

const CLASS_MAGIC = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
const CLASS_NAME =
  "io/airbyte/integrations/destination/postgres/sql/PostgresDirectLoadSqlGenerator.class";
// The pinned constant embeds a 0x01 placeholder byte between "EXISTS " and ";".
const CREATE_SCHEMA_NEEDLE = Buffer.concat([
  Buffer.from("CREATE SCHEMA IF NOT EXISTS "),
  Buffer.from([0x01]),
  Buffer.from(";"),
]);

const jvmConstant = (bytes: Buffer) => {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
};

describe("connector Dockerfiles", () => {
  it("pins every FROM and AIRBYTE_CONNECTOR_IMAGE to the package digest", () => {
    for (const [key, file] of Object.entries(dockerfiles)) {
      const image =
        supportedImageVersions[key as keyof typeof supportedImageVersions];
      const dockerfile = readImageFile(file);
      expect(image).toMatch(/@sha256:[0-9a-f]{64}$/u);
      expect(dockerfile).toContain(`FROM ${image}\n`);
      expect(dockerfile).toContain(`AIRBYTE_CONNECTOR_IMAGE="${image}"`);
      expect(dockerfile).toContain(
        "COPY airbyte-source-server.py /app/airbyte-source-server.py"
      );
    }
  });

  it("allowlists every COPY input in .dockerignore", () => {
    const allowlist = readImageFile(".dockerignore")
      .split("\n")
      .filter((line) => line.startsWith("!"))
      .map((line) => line.slice(1));
    expect(allowlist).toContain(".dockerignore");
    for (const file of Object.values(dockerfiles)) {
      expect(allowlist).toContain(file);
      const copies = [...readImageFile(file).matchAll(/^COPY (?<src>\S+) /gmu)]
        .map((match) => match.groups?.src)
        .filter((src): src is string => typeof src === "string");
      expect(copies.length).toBeGreaterThan(0);
      for (const src of copies) {
        expect(allowlist).toContain(src);
      }
    }
  });

  it("applies exact-match patches only behind explicit build modes", () => {
    const gsc = readImageFile("Dockerfile.gsc");
    expect(gsc).toContain("ARG GSC_AUTH_MODE=refresh_token");
    expect(gsc).toContain(
      "access_token) python /app/patch-gsc-manifest-auth.py"
    );
    const postgres = readImageFile("Dockerfile.postgres");
    expect(postgres).toContain("ARG POSTGRES_SCHEMA_MODE=airbyte_owned");
    expect(postgres).toContain(
      "preprovisioned) python3 /app/patch-postgres-preprovisioned-schema.py"
    );
    expect(postgres).toContain("RUN sh /app/pin-postgres-java-cacerts.sh");
    expect(postgres).toContain("-Djavax.net.ssl.trustStore=/app/java-cacerts");
    expect(postgres).not.toMatch(/sslmode=(?:require|prefer|disable)/u);
  });

  it("documents one build command that targets the consumer registry", () => {
    const script = readImageFile("build-images.sh");
    expect(script).toContain("IMAGE_REGISTRY:?");
    expect(script).toContain("--push");
    expect(script).toContain("docker buildx build");
    for (const file of Object.values(dockerfiles)) {
      expect(script).toContain(`"${file}"`);
    }
  });
});

describe("patch-gsc-manifest-auth.py", () => {
  const upstreamManifest = `spec:
  connection_specification:
    properties:
      authorization:
        oneOf:
          - required:
          - client_id
          - client_secret
          - refresh_token
definitions:
  oauth_authenticator:
    type: OAuthAuthenticator
    client_id: "{{ config.get('authorization', {}).get('client_id') }}"
    client_secret: "{{ config.get('authorization', {}).get('client_secret') }}"
    refresh_token: "{{ config.get('authorization', {}).get('refresh_token') }}"
    token_refresh_endpoint: "https://oauth2.googleapis.com/token"
  other: value
`;
  const dir = mkdtempSync(path.join(tmpdir(), "ads-sync-gsc-patch-"));

  afterAll(() => rmSync(dir, { force: true, recursive: true }));

  const patch = (manifest: string) => {
    const file = path.join(dir, `manifest-${Math.random()}.yaml`);
    writeFileSync(file, manifest);
    const result = runPython("patch-gsc-manifest-auth.py", [file]);
    return { file, result, text: readFileSync(file, "utf-8") };
  };

  it("rewrites the pinned authenticator to a bearer token", () => {
    const { result, text } = patch(upstreamManifest);
    expect(result.status).toBe(0);
    expect(text).toContain("type: BearerAuthenticator");
    expect(text).toContain(
      "api_token: \"{{ config.get('authorization', {}).get('access_token') }}\""
    );
    expect(text).toContain("          - access_token\n");
    expect(text).not.toContain("refresh_token");
    expect(text).toContain("other: value");
  });

  it("fails when the authenticator block drifted", () => {
    const drifted = upstreamManifest.replace(
      "token_refresh_endpoint",
      "token_endpoint"
    );
    const { result, text } = patch(drifted);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("authenticator block");
    expect(text).toBe(drifted);
  });

  it("fails when the required-fields block drifted", () => {
    const drifted = upstreamManifest.replace("- client_secret\n", "");
    const { result } = patch(drifted);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("required-fields block");
  });

  it("fails when the block appears more than once", () => {
    const { result } = patch(`${upstreamManifest}${upstreamManifest}`);
    expect(result.status).not.toBe(0);
  });
});

describe("patch-postgres-preprovisioned-schema.py", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ads-sync-postgres-patch-"));

  afterAll(() => rmSync(dir, { force: true, recursive: true }));

  const buildJar = (classBytes: Buffer) => {
    const classFile = path.join(dir, `class-${Math.random()}.bin`);
    writeFileSync(classFile, classBytes);
    const jar = path.join(dir, `connector-${Math.random()}.jar`);
    const zip = spawnSync(
      "python3",
      [
        "-c",
        [
          "import sys, zipfile",
          "jar, cls, src = sys.argv[1:4]",
          "z = zipfile.ZipFile(jar, 'w')",
          "z.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0')",
          "z.write(src, cls)",
          "z.close()",
        ].join("; "),
        jar,
        CLASS_NAME,
        classFile,
      ],
      { encoding: "utf-8" }
    );
    expect(zip.status).toBe(0);
    return jar;
  };

  const readClass = (jar: string) => {
    const read = spawnSync(
      "python3",
      [
        "-c",
        "import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))",
        jar,
        CLASS_NAME,
      ],
      { encoding: "buffer" }
    );
    return read.stdout;
  };

  it("rewrites the pinned CREATE SCHEMA constant to a no-op", () => {
    const jar = buildJar(
      Buffer.concat([
        CLASS_MAGIC,
        jvmConstant(CREATE_SCHEMA_NEEDLE),
        jvmConstant(Buffer.from("CREATE TABLE IF NOT EXISTS ")),
      ])
    );
    const result = runPython("patch-postgres-preprovisioned-schema.py", [jar]);
    expect(result.status).toBe(0);
    const patched = readClass(jar);
    expect(patched.indexOf(CREATE_SCHEMA_NEEDLE)).toBe(-1);
    expect(patched.indexOf("SELECT 1 /* preprovisioned")).not.toBe(-1);
    expect(patched.indexOf("CREATE TABLE IF NOT EXISTS")).not.toBe(-1);
  });

  it("fails when the constant is missing", () => {
    const jar = buildJar(
      Buffer.concat([CLASS_MAGIC, jvmConstant(Buffer.from("CREATE SCHEMA ;"))])
    );
    const original = readClass(jar);
    const result = runPython("patch-postgres-preprovisioned-schema.py", [jar]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("did not match exactly once");
    expect(readClass(jar).equals(original)).toBeTruthy();
  });

  it("fails when the constant appears twice", () => {
    const jar = buildJar(
      Buffer.concat([
        CLASS_MAGIC,
        jvmConstant(CREATE_SCHEMA_NEEDLE),
        jvmConstant(CREATE_SCHEMA_NEEDLE),
      ])
    );
    const result = runPython("patch-postgres-preprovisioned-schema.py", [jar]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("did not match exactly once");
  });

  it("fails when the constant length prefix drifted", () => {
    const jar = buildJar(
      Buffer.concat([CLASS_MAGIC, Buffer.from([0, 7]), CREATE_SCHEMA_NEEDLE])
    );
    const result = runPython("patch-postgres-preprovisioned-schema.py", [jar]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("length mismatch");
  });

  it("fails when the class is missing from the jar", () => {
    const jar = path.join(dir, "empty.jar");
    spawnSync("python3", [
      "-c",
      "import sys, zipfile; zipfile.ZipFile(sys.argv[1], 'w').close()",
      jar,
    ]);
    const result = runPython("patch-postgres-preprovisioned-schema.py", [jar]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing from jar");
  });
});

describe("pin-postgres-java-cacerts.sh", () => {
  it("fails when the source trust store is missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ads-sync-cacerts-"));
    const result = spawnSync(
      "sh",
      [
        path.join(imagesDir, "pin-postgres-java-cacerts.sh"),
        path.join(dir, "missing-cacerts"),
        path.join(dir, "java-cacerts"),
      ],
      { encoding: "utf-8" }
    );
    rmSync(dir, { force: true, recursive: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing");
  });
});

const listenOnFreePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { close: () => server.close(), port };
};

const waitForHealth = async (base: string, attempt = 0): Promise<void> => {
  try {
    await fetch(`${base}/health`);
  } catch (error) {
    if (attempt >= 50) {
      throw error;
    }
    await setTimeout(100);
    await waitForHealth(base, attempt + 1);
  }
};

describe("airbyte-source-server.py HTTP contract", () => {
  const startWrapper = async (env: Record<string, string>) => {
    const probe = await listenOnFreePort();
    const { port } = probe;
    probe.close();
    const child = spawn(
      "python3",
      [path.join(imagesDir, "airbyte-source-server.py")],
      {
        env: {
          AIRBYTE_CONNECTOR_COMMAND: "true",
          AIRBYTE_CONNECTOR_IMAGE: "example/source-synthetic:0.0.1@sha256:0",
          AIRBYTE_CONNECTOR_SERVICE: "synthetic-source",
          AIRBYTE_WRAPPER_PORT: String(port),
          PATH: process.env.PATH ?? "",
          ...env,
        },
        stdio: "ignore",
      }
    );
    const base = `http://127.0.0.1:${port}`;
    await waitForHealth(base);
    return { base, stop: () => child.kill() };
  };

  it("reports connectorImage, wrapperVersion, and buildOptions on /metadata", async () => {
    const wrapper = await startWrapper({
      AIRBYTE_IMAGE_BUILD_OPTIONS: "gsc_auth_mode=refresh_token",
    });
    try {
      const response = await fetch(`${wrapper.base}/metadata`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual({
        buildOptions: "gsc_auth_mode=refresh_token",
        connectorImage: "example/source-synthetic:0.0.1@sha256:0",
        service: "synthetic-source",
        status: "ok",
        wrapperVersion,
      });
      const missing = await fetch(`${wrapper.base}/unknown`);
      expect(missing.status).toBe(404);
    } finally {
      wrapper.stop();
    }
  });

  it("probes only allowlisted ports on /network-check", async () => {
    const target = await listenOnFreePort();
    const wrapper = await startWrapper({
      AIRBYTE_NETWORK_CHECK_PORTS: String(target.port),
    });
    try {
      const ok = await fetch(`${wrapper.base}/network-check`, {
        body: JSON.stringify({ host: "127.0.0.1", port: target.port }),
        method: "POST",
      });
      expect(ok.status).toBe(200);
      await expect(ok.json()).resolves.toStrictEqual({
        connected: true,
        trustStore: null,
      });

      const denied = await fetch(`${wrapper.base}/network-check`, {
        body: JSON.stringify({ host: "127.0.0.1", port: 5432 }),
        method: "POST",
      });
      expect(denied.status).toBe(400);

      const badHost = await fetch(`${wrapper.base}/network-check`, {
        body: JSON.stringify({ host: "", port: target.port }),
        method: "POST",
      });
      expect(badHost.status).toBe(400);

      target.close();
      const refused = await fetch(`${wrapper.base}/network-check`, {
        body: JSON.stringify({ host: "127.0.0.1", port: target.port }),
        method: "POST",
      });
      expect(refused.status).toBe(502);
      await expect(refused.json()).resolves.toMatchObject({ connected: false });
    } finally {
      wrapper.stop();
      target.close();
    }
  });

  it("requires config and catalog objects on /read-artifact and /write", async () => {
    const wrapper = await startWrapper({});
    try {
      const responses = await Promise.all(
        ["/read-artifact", "/write"].map((route) =>
          fetch(`${wrapper.base}${route}`, {
            body: JSON.stringify({ config: {} }),
            method: "POST",
          })
        )
      );
      for (const response of responses) {
        expect(response.status).toBe(400);
      }
      const noBody = await fetch(`${wrapper.base}/check`, { method: "POST" });
      expect(noBody.status).toBe(400);
    } finally {
      wrapper.stop();
    }
  });

  it.each(["run_read", "run_write"])(
    "unlinks the config file when a later temp-file write fails in %s",
    (route) => {
      // Drives the handler in-process: the second write_json raises after the
      // config file exists, and the config file must not survive.
      const script = [
        "import os, sys, importlib.util",
        "os.environ.setdefault('AIRBYTE_CONNECTOR_COMMAND', 'true')",
        "os.environ.setdefault('AIRBYTE_CONNECTOR_IMAGE', 'example/x:0@sha256:0')",
        "os.environ.setdefault('AIRBYTE_CONNECTOR_SERVICE', 'x')",
        "spec = importlib.util.spec_from_file_location('wrapper', sys.argv[1])",
        "wrapper = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(wrapper)",
        "handler = wrapper.Handler.__new__(wrapper.Handler)",
        "written = []",
        "original = wrapper.Handler.write_json",
        "def failing_write(self, value):",
        "    if written:",
        "        raise OSError('disk full')",
        "    path = original(self, value)",
        "    written.append(path)",
        "    return path",
        "handler.write_json = failing_write.__get__(handler)",
        "handler.read_json_object = lambda: {'config': {'refresh_token': 'secret'}, 'catalog': {}, 'messages': ''}",
        "handler.run_airbyte = lambda *a, **k: (_ for _ in ()).throw(AssertionError('connector must not run'))",
        "try:",
        "    getattr(handler, sys.argv[2])(*([True] if sys.argv[2] == 'run_read' else []))",
        "except OSError as error:",
        "    assert str(error) == 'disk full', error",
        "else:",
        "    raise SystemExit('expected the failed write to raise')",
        "assert len(written) == 1, written",
        "assert not os.path.exists(written[0]), 'config file survived: ' + written[0]",
        "print('cleaned')",
      ].join("\n");
      const result = spawnSync(
        "python3",
        ["-c", script, path.join(imagesDir, "airbyte-source-server.py"), route],
        { encoding: "utf-8" }
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("cleaned");
    }
  );

  it("reports a too-small connector timeout budget instead of running an opaque timeout", async () => {
    const wrapper = await startWrapper({
      AIRBYTE_READ_TIMEOUT_SECONDS: "45",
      AIRBYTE_WRITE_TIMEOUT_SECONDS: "60",
    });
    try {
      const read = await fetch(`${wrapper.base}/read-artifact`, {
        body: JSON.stringify({ catalog: {}, config: {} }),
        method: "POST",
      });
      expect(read.status).toBe(500);
      await expect(read.json()).resolves.toStrictEqual({
        args: ["read", "--config", "<config>", "--catalog", "<config>"],
        error: "Connector timeout budget is too small",
        minimumTimeoutSeconds: 60,
        timeoutSeconds: 45,
      });

      const write = await fetch(`${wrapper.base}/write`, {
        body: JSON.stringify({ catalog: {}, config: {}, messages: "" }),
        method: "POST",
      });
      expect(write.status).toBe(500);
      await expect(write.json()).resolves.toMatchObject({
        error: "Connector timeout budget is too small",
        minimumTimeoutSeconds: 90,
        timeoutSeconds: 60,
      });
    } finally {
      wrapper.stop();
    }
  });
});
