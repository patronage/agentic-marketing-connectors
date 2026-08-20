import { once } from "node:events";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  supportedImageVersions,
  supportedProviders,
} from "@patronage/ads-sync";
import { afterEach, describe, expect, it } from "vitest";

import {
  admitProvider,
  formatReport,
  optionsFromCliArgs,
  packageFixturesDir,
  parseCliArgs,
  parseJsonc,
  referenceImagesDir,
} from "./provider-admission.js";
import type {
  AdmissionReport,
  DockerDriver,
  ProviderAdmissionOptions,
} from "./provider-admission.js";

const tempDirs: string[] = [];
const tempCleanup: (() => void)[] = [];

const messagesFor = (command: string) => {
  if (command.includes(" spec")) {
    return '{"type":"SPEC","spec":{}}\n';
  }
  return '{"type":"LOG","log":{}}\n{"type":"CONNECTION_STATUS","connectionStatus":{"status":"FAILED","message":"401"}}\n';
};

const failedIds = (report: AdmissionReport) =>
  report.checks.filter((c) => c.status === "failed").map((c) => c.id);
const detail = (report: AdmissionReport, id: string) =>
  report.checks.find((c) => c.id === id)?.detail ?? "";

describe("provider admission", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
    for (const close of tempCleanup.splice(0)) {
      close();
    }
  });

  /**
   * A synthetic container-runner deployment with every static touchpoint:
   * copied reference images, a wrangler config that builds them, a Container
   * subclass per provider, and a wrapper-version pin.
   */
  function syntheticDeployment() {
    const root = mkdtempSync(path.join(tmpdir(), "ads-sync-admission-"));
    tempDirs.push(root);
    const imagesDir = path.join(root, "images");
    cpSync(referenceImagesDir, imagesDir, { recursive: true });
    const fixturesDir = path.join(root, "fixtures");
    cpSync(packageFixturesDir, fixturesDir, { recursive: true });
    const classNames = {
      google_ads: "GoogleAdsSourceContainer",
      google_search_console: "SearchConsoleSourceContainer",
      meta_ads: "MetaAdsSourceContainer",
    } as const;
    const dockerfiles = {
      google_ads: "Dockerfile",
      google_search_console: "Dockerfile.gsc",
      meta_ads: "Dockerfile.meta",
    } as const;
    mkdirSync(path.join(root, "src"));
    for (const provider of supportedProviders) {
      writeFileSync(
        path.join(root, "src", `${provider}-container.ts`),
        `import { Container } from "@cloudflare/containers";\nexport class ${classNames[provider]} extends Container {\n  override defaultPort = 8080;\n}\n`
      );
    }
    writeFileSync(
      path.join(root, "src", "runtime.ts"),
      'export const WRAPPER_VERSION = "ads-sync-wrapper-v0.3";\n'
    );
    // The pins file derives every connectorImage from the package registry,
    // exactly as the reference deployment does.
    writeFileSync(
      path.join(root, "src", "container-pins.ts"),
      'import { supportedImageVersions } from "@patronage/ads-sync";\n' +
        `export const connectorImages = {\n${supportedProviders
          .map(
            (provider) => `  ${provider}: supportedImageVersions.${provider},`
          )
          .join("\n")}\n};\n`
    );
    const wrangler = {
      containers: supportedProviders.map((provider) => ({
        class_name: classNames[provider],
        image: `./images/${dockerfiles[provider]}`,
      })),
      durable_objects: {
        bindings: supportedProviders.map((provider) => ({
          class_name: classNames[provider],
          name: `${provider.toUpperCase()}_SOURCE`,
        })),
      },
      migrations: [
        {
          new_sqlite_classes: supportedProviders.map((p) => classNames[p]),
          tag: "v1",
        },
      ],
      name: "synthetic",
    };
    writeFileSync(
      path.join(root, "wrangler.jsonc"),
      `// synthetic\n${JSON.stringify(wrangler, null, 2)}`
    );
    const options = (provider: string): ProviderAdmissionOptions => ({
      deploymentRoot: root,
      fixturesDir,
      imagesDir,
      provider,
      wranglerConfigPath: path.join(root, "wrangler.jsonc"),
    });
    return { classNames, dockerfiles, fixturesDir, imagesDir, options, root };
  }

  describe("provider admission static rung", () => {
    it("passes every Supported Provider against a wired deployment", async () => {
      const deployment = syntheticDeployment();
      const reports = await Promise.all(
        supportedProviders.map((provider) =>
          admitProvider(deployment.options(provider))
        )
      );
      for (const report of reports) {
        expect(failedIds(report)).toStrictEqual([]);
        expect(report.checks.map((c) => c.id)).toStrictEqual([
          "catalog",
          "dockerfile",
          "wrapper",
          "wrangler-container",
          "wrangler-binding",
          "wrangler-migration",
          "container-class",
          "metadata-expectation",
          "fixture",
        ]);
      }
    });

    it("fails a provider with no catalog entry, with the reason named", async () => {
      const deployment = syntheticDeployment();
      const report = await admitProvider(deployment.options("linkedin_ads"));
      expect(report.passed).toBeFalsy();
      expect(failedIds(report)).toStrictEqual(["catalog"]);
      expect(detail(report, "catalog")).toContain(
        'no provider module registered for "linkedin_ads"'
      );
      expect(formatReport(report)).toContain(
        "RESULT FAIL linkedin_ads: catalog"
      );
    });

    it("fails a fixture whose catalog is missing the provider stream", async () => {
      const deployment = syntheticDeployment();
      const catalogPath = path.join(
        deployment.fixturesDir,
        "google_ads",
        "catalog.json"
      );
      writeFileSync(catalogPath, JSON.stringify({ streams: [] }));
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toStrictEqual(["fixture"]);
      expect(detail(report, "fixture")).toContain(
        "catalog.json has no stream campaign_daily_performance"
      );
    });

    it("fails a Dockerfile whose image pin drifts from the package", async () => {
      const deployment = syntheticDeployment();
      const dockerfile = path.join(deployment.imagesDir, "Dockerfile.meta");
      const drifted = readFileSync(dockerfile, "utf-8").replace(
        /^FROM (?<image>\S+)@sha256:[0-9a-f]{64}$/mu,
        `FROM $<image>@sha256:${"f".repeat(64)}`
      );
      writeFileSync(dockerfile, drifted);
      const report = await admitProvider(deployment.options("meta_ads"));
      expect(failedIds(report)).toStrictEqual([
        "dockerfile",
        "wrangler-container",
        "wrangler-binding",
        "wrangler-migration",
        "container-class",
      ]);
      expect(detail(report, "dockerfile")).toContain("no Dockerfile in");
      expect(detail(report, "dockerfile")).toContain(
        `Dockerfile.meta FROM airbyte/source-facebook-marketing:5.2.11@sha256:${"f".repeat(64)}`
      );
    });

    it("fails an AIRBYTE_CONNECTOR_IMAGE that disagrees with FROM", async () => {
      const deployment = syntheticDeployment();
      const dockerfile = path.join(deployment.imagesDir, "Dockerfile");
      writeFileSync(
        dockerfile,
        readFileSync(dockerfile, "utf-8").replace(
          /^ENV AIRBYTE_CONNECTOR_IMAGE=.*$/mu,
          'ENV AIRBYTE_CONNECTOR_IMAGE="airbyte/source-google-ads:6.0.0"'
        )
      );
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toContain("dockerfile");
      expect(detail(report, "dockerfile")).toContain(
        "AIRBYTE_CONNECTOR_IMAGE airbyte/source-google-ads:6.0.0 does not equal FROM pin"
      );
    });

    it("fails a deployment whose wrapper pin does not match the wrapper", async () => {
      const deployment = syntheticDeployment();
      writeFileSync(
        path.join(deployment.root, "src", "runtime.ts"),
        'export const WRAPPER_VERSION = "ads-sync-wrapper-v0.2";\n'
      );
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toStrictEqual(["metadata-expectation"]);
      expect(detail(report, "metadata-expectation")).toBe(
        "src/runtime.ts expects ads-sync-wrapper-v0.2 but airbyte-source-server.py declares ads-sync-wrapper-v0.3"
      );
    });

    it("fails a wrapper whose version does not equal the expected pin", async () => {
      const deployment = syntheticDeployment();
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        expectedWrapperVersion: "ads-sync-wrapper-v0.4",
      });
      expect(failedIds(report)).toStrictEqual([
        "wrapper",
        "metadata-expectation",
      ]);
      expect(detail(report, "wrapper")).toContain(
        "ads-sync-wrapper-v0.3 does not equal expected ads-sync-wrapper-v0.4"
      );
    });

    it("fails a provider the wrangler config does not wire", async () => {
      const deployment = syntheticDeployment();
      const wranglerPath = path.join(deployment.root, "wrangler.jsonc");
      const config = parseJsonc(readFileSync(wranglerPath, "utf-8")) as {
        containers: { class_name: string }[];
        durable_objects: { bindings: { class_name: string }[] };
        migrations: { new_sqlite_classes: string[] }[];
      };
      config.durable_objects.bindings = config.durable_objects.bindings.filter(
        (b) => b.class_name !== deployment.classNames.google_ads
      );
      config.migrations = [{ new_sqlite_classes: [] }];
      writeFileSync(wranglerPath, JSON.stringify(config));
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toStrictEqual([
        "wrangler-binding",
        "wrangler-migration",
      ]);
      expect(detail(report, "wrangler-binding")).toContain(
        "durable_objects.bindings has no entry with class_name GoogleAdsSourceContainer"
      );
      expect(detail(report, "wrangler-migration")).toContain(
        "no migrations[] entry lists GoogleAdsSourceContainer"
      );
    });

    it("fails a container class that is not declared or not exported", async () => {
      const deployment = syntheticDeployment();
      const file = path.join(deployment.root, "src", "meta_ads-container.ts");
      writeFileSync(
        file,
        readFileSync(file, "utf-8").replace("export class", "class")
      );
      const unexported = await admitProvider(deployment.options("meta_ads"));
      expect(failedIds(unexported)).toStrictEqual(["container-class"]);
      expect(detail(unexported, "container-class")).toContain(
        "declares MetaAdsSourceContainer but no module exports it"
      );
      rmSync(file);
      const undeclared = await admitProvider(deployment.options("meta_ads"));
      expect(detail(undeclared, "container-class")).toContain(
        "declares class MetaAdsSourceContainer extends Container"
      );
    });

    it("does not admit a Container class that only a test file exports", async () => {
      const deployment = syntheticDeployment();
      const source = path.join(deployment.root, "src", "meta_ads-container.ts");
      const testFile = path.join(
        deployment.root,
        "src",
        "meta_ads-container.test.ts"
      );
      writeFileSync(testFile, readFileSync(source, "utf-8"));
      rmSync(source);
      const report = await admitProvider(deployment.options("meta_ads"));
      expect(failedIds(report)).toStrictEqual(["container-class"]);
      expect(detail(report, "container-class")).toContain(
        "declares class MetaAdsSourceContainer extends Container"
      );
    });

    it("names the source that derives connectorImage from the package", async () => {
      const deployment = syntheticDeployment();
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toStrictEqual([]);
      expect(detail(report, "metadata-expectation")).toContain(
        "src/container-pins.ts derive connectorImage from supportedImageVersions"
      );
      expect(detail(report, "metadata-expectation")).toContain(
        supportedImageVersions.google_ads
      );
    });

    it("fails a connectorImage literal that drifts from the package image", async () => {
      const deployment = syntheticDeployment();
      const drifted = `${supportedImageVersions.google_ads.split("@")[0]}@sha256:${"a".repeat(64)}`;
      writeFileSync(
        path.join(deployment.root, "src", "container-pins.ts"),
        `export const connectorImages = { google_ads: "${drifted}" };\n`
      );
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toStrictEqual(["metadata-expectation"]);
      expect(detail(report, "metadata-expectation")).toBe(
        `src/container-pins.ts pins connectorImage ${drifted} but the package pins ${supportedImageVersions.google_ads}`
      );
    });

    it("fails a deployment that declares no connectorImage pin", async () => {
      const deployment = syntheticDeployment();
      rmSync(path.join(deployment.root, "src", "container-pins.ts"));
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toStrictEqual(["metadata-expectation"]);
      expect(detail(report, "metadata-expectation")).toContain(
        "no connectorImage pin found"
      );
    });

    it("admits a deployment whose containers run registry images", async () => {
      const deployment = syntheticDeployment();
      const wranglerPath = path.join(deployment.root, "wrangler.jsonc");
      const config = parseJsonc(readFileSync(wranglerPath, "utf-8")) as {
        containers: { class_name: string; image: string }[];
      };
      for (const entry of config.containers) {
        const provider = supportedProviders.find(
          (candidate) => deployment.classNames[candidate] === entry.class_name
        );
        entry.image = `registry.example.com/ads-sync/ads-sync-${String(provider).replaceAll("_", "-")}:0.3.0`;
      }
      writeFileSync(wranglerPath, `// registry\n${JSON.stringify(config)}`);
      const report = await admitProvider(deployment.options("google_ads"));
      expect(failedIds(report)).toStrictEqual([]);
      expect(report.checks).toHaveLength(9);
      expect(detail(report, "wrangler-container")).toBe(
        "containers[] runs registry image registry.example.com/ads-sync/ads-sync-google-ads:0.3.0 as GoogleAdsSourceContainer; the running image pin is verified by the live rung through /metadata"
      );
      expect(detail(report, "wrangler-binding")).toContain(
        "GOOGLE_ADS_SOURCE -> GoogleAdsSourceContainer"
      );
      expect(detail(report, "wrangler-migration")).toContain(
        "migrations declare GoogleAdsSourceContainer"
      );
      expect(detail(report, "container-class")).toContain(
        "GoogleAdsSourceContainer extends Container"
      );
    });
  });

  describe("provider admission live rung", () => {
    function fakeWrapper(overrides: {
      metadata?: Record<string, unknown>;
      readStdout?: string;
      specBody?: string;
    }) {
      const module = {
        google_ads:
          "airbyte/source-google-ads:6.1.0@sha256:dea39deedba0a095f60159d808dfb47fa778e304846396d2ab2f04c951b480ed",
      };
      const metadata = overrides.metadata ?? {
        connectorImage: module.google_ads,
        wrapperVersion: "ads-sync-wrapper-v0.3",
      };
      return startFakeWrapper(async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/metadata") {
          return Response.json(metadata);
        }
        if (url.pathname === "/spec") {
          return overrides.specBody === undefined
            ? Response.json({ exitCode: 0, success: true })
            : new Response(overrides.specBody, { status: 500 });
        }
        if (url.pathname === "/check") {
          return Response.json({ exitCode: 0, success: true });
        }
        if (url.pathname === "/read-artifact") {
          return Response.json(
            {
              exitCode: 1,
              stderr: "",
              stdout:
                overrides.readStdout ??
                '{"type":"LOG","log":{}}\n{"type":"TRACE","trace":{}}\n',
              success: false,
            },
            { status: 502 }
          );
        }
        return Response.json({ error: "Not found" }, { status: 404 });
      });
    }

    it("runs metadata, spec, check, and a bounded read against the wrapper", async () => {
      const deployment = syntheticDeployment();
      const wrapper = await fakeWrapper({});
      tempCleanup.push(wrapper.close);
      const calls: string[] = [];
      const docker: DockerDriver = {
        build: (dockerfile, _context, tag) => {
          calls.push(`build ${path.basename(dockerfile)} ${tag}`);
        },
        exec: (_id, command, input) => {
          if (command.includes(" check")) {
            calls.push(
              `exec check stdin=${String(input?.includes("customer_id"))} argv=${String(command.includes("customer_id"))}`
            );
          }
          return { stdout: messagesFor(command) };
        },
        run: () => {
          calls.push("run");
          return { containerId: "c1", port: wrapper.port };
        },
        stop: (id) => {
          calls.push(`stop ${id}`);
        },
      };
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        live: { docker },
      });
      expect(failedIds(report)).toStrictEqual([]);
      expect(calls).toStrictEqual([
        "build Dockerfile ads-sync-admission/google_ads:04c951b480ed",
        "run",
        "exec check stdin=true argv=false",
        "stop c1",
      ]);
      expect(detail(report, "check")).toContain(
        "CONNECTION_STATUS FAILED (synthetic credentials"
      );
      expect(detail(report, "bounded-read")).toContain("1 TRACE");
    });

    it("fails an image whose /metadata pin does not match, and still stops it", async () => {
      const deployment = syntheticDeployment();
      const wrapper = await fakeWrapper({
        metadata: {
          connectorImage: "airbyte/source-google-ads:6.0.0",
          wrapperVersion: "ads-sync-wrapper-v0.2",
        },
      });
      tempCleanup.push(wrapper.close);
      const stopped: string[] = [];
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        live: {
          docker: {
            build: () => {},
            exec: () => ({ stdout: "" }),
            run: () => ({ containerId: "c2", port: wrapper.port }),
            stop: (id) => {
              stopped.push(id);
            },
          },
          image: "prebuilt:tag",
        },
      });
      expect(failedIds(report)).toStrictEqual([
        "image-metadata",
        "spec",
        "check",
        "bounded-read",
      ]);
      expect(detail(report, "image-metadata")).toContain("metadata_mismatch");
      expect(stopped).toStrictEqual(["c2"]);
    });

    it("requires SUCCEEDED and records when a real source config is supplied", async () => {
      const deployment = syntheticDeployment();
      const wrapper = await fakeWrapper({});
      tempCleanup.push(wrapper.close);
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        live: {
          docker: {
            build: () => {},
            exec: (_id, command) => ({ stdout: messagesFor(command) }),
            run: () => ({ containerId: "c3", port: wrapper.port }),
            stop: () => {},
          },
          image: "prebuilt:tag",
          sourceConfigPath: path.join(
            deployment.fixturesDir,
            "google_ads",
            "source-config.json"
          ),
        },
      });
      expect(failedIds(report)).toStrictEqual(["check", "bounded-read"]);
      expect(detail(report, "check")).toContain(
        "CONNECTION_STATUS FAILED with a real source config"
      );
      expect(detail(report, "bounded-read")).toContain(
        "read exited 1 with 0 RECORD and 0 STATE messages"
      );
    });

    it("fails a check whose CONNECTION_STATUS is a config-shape rejection", async () => {
      const deployment = syntheticDeployment();
      const wrapper = await fakeWrapper({});
      tempCleanup.push(wrapper.close);
      const rejected =
        '{"type":"CONNECTION_STATUS","connectionStatus":{"status":"FAILED","message":"Config validation error: 1 is less than the minimum of 2"}}\n';
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        live: {
          docker: {
            build: () => {},
            exec: (_id, command) => ({
              stdout: command.includes(" spec")
                ? messagesFor(command)
                : rejected,
            }),
            run: () => ({ containerId: "c5", port: wrapper.port }),
            stop: () => {},
          },
          image: "prebuilt:tag",
        },
      });
      expect(failedIds(report)).toStrictEqual(["check"]);
      expect(detail(report, "check")).toContain(
        "config-shape rejection, so the source config never reached the provider"
      );
    });

    it("keeps a connector secret out of the report and its JSON", async () => {
      const deployment = syntheticDeployment();
      const wrapper = await fakeWrapper({});
      tempCleanup.push(wrapper.close);
      const secret = "SECRET-VALUE-123";
      const leaking = `${JSON.stringify({
        connectionStatus: {
          message: `connector failed with {"refresh_token": "${secret}"}`,
          status: "FAILED",
        },
        type: "CONNECTION_STATUS",
      })}\n`;
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        live: {
          docker: {
            build: () => {},
            exec: (_id, command) => ({
              stdout: command.includes(" spec")
                ? messagesFor(command)
                : leaking,
            }),
            run: () => ({ containerId: "c7", port: wrapper.port }),
            stop: () => {},
          },
          image: "prebuilt:tag",
        },
      });
      expect(formatReport(report)).not.toContain(secret);
      expect(JSON.stringify(report)).not.toContain(secret);
      expect(detail(report, "check")).toContain(
        '"refresh_token": "<redacted>"'
      );
    });

    it("names a wrapper that returns a non-JSON body instead of crashing", async () => {
      const deployment = syntheticDeployment();
      const wrapper = await fakeWrapper({ specBody: "<html>gateway</html>" });
      tempCleanup.push(wrapper.close);
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        live: {
          docker: {
            build: () => {},
            exec: (_id, command) => ({ stdout: messagesFor(command) }),
            run: () => ({ containerId: "c6", port: wrapper.port }),
            stop: () => {},
          },
          image: "prebuilt:tag",
        },
      });
      expect(failedIds(report)).toStrictEqual(["spec"]);
      expect(detail(report, "spec")).toContain(
        "GET /spec: wrapper returned 500 with a non-JSON body"
      );
    });

    it("fails a read whose artifact exceeds the bound", async () => {
      const deployment = syntheticDeployment();
      const wrapper = await fakeWrapper({
        readStdout: `${'{"type":"LOG"}\n'.repeat(50_001)}`,
      });
      tempCleanup.push(wrapper.close);
      const report = await admitProvider({
        ...deployment.options("google_ads"),
        live: {
          docker: {
            build: () => {},
            exec: (_id, command) => ({ stdout: messagesFor(command) }),
            run: () => ({ containerId: "c4", port: wrapper.port }),
            stop: () => {},
          },
          image: "prebuilt:tag",
        },
      });
      expect(failedIds(report)).toStrictEqual(["bounded-read"]);
      expect(detail(report, "bounded-read")).toContain("above limit 50000");
    });
  });

  describe("provider admission CLI", () => {
    it("parses arguments and resolves deployment defaults", () => {
      const args = parseCliArgs([
        "--",
        "--provider",
        "meta_ads",
        "--deployment",
        "/tmp/deploy",
        "--image",
        "reg/ads-sync-meta:0.3.0",
        "--json",
      ]);
      expect(args).toStrictEqual({
        deployment: "/tmp/deploy",
        image: "reg/ads-sync-meta:0.3.0",
        json: true,
        live: true,
        provider: "meta_ads",
      });
      const options = optionsFromCliArgs(args, "/");
      expect(options.deploymentRoot).toBe("/tmp/deploy");
      expect(options.wranglerConfigPath).toBe("/tmp/deploy/wrangler.jsonc");
      expect(options.imagesDir).toBe(referenceImagesDir);
      expect(options.fixturesDir).toBe(packageFixturesDir);
      expect(options.live).toStrictEqual({
        image: "reg/ads-sync-meta:0.3.0",
        sourceConfigPath: undefined,
      });
    });

    it("rejects a missing provider and unknown flags", () => {
      expect(() => parseCliArgs([])).toThrow("--provider <id> is required");
      expect(() => parseCliArgs(["--provider", "x", "--nope"])).toThrow(
        "unknown argument --nope"
      );
      expect(() => parseCliArgs(["--provider"])).toThrow(
        "--provider needs a value"
      );
    });

    it("parses wrangler jsonc with comments and trailing commas", () => {
      expect(
        parseJsonc('{\n // c\n "a": [1, 2,], /* b */ "s": "x//y", }')
      ).toStrictEqual({ a: [1, 2], s: "x//y" });
    });
  });
});

// ---------------------------------------------------------------------------
// tiny HTTP server for the fake wrapper

async function startFakeWrapper(
  handler: (request: Request) => Promise<Response>
): Promise<{ close: () => void; port: number }> {
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1${req.url ?? "/"}`, {
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      headers: { "content-type": "application/json" },
      method: req.method,
    });
    const response = await handler(request);
    res.statusCode = response.status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    close: () => {
      server.close();
    },
    port,
  };
}
