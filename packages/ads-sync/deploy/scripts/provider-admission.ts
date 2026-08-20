/**
 * Executable provider admission for Ads Sync.
 *
 * One command verifies a Supported Provider end to end against a deployment:
 * package catalog, Dockerfile, wrapper, Wrangler container + binding +
 * migration, Container class, metadata expectation, fixture, and (with
 * `--live`) `/metadata`, `spec`, a real `check`, and a bounded source read
 * against the built image. Every check reports a named reason, so an operator
 * can read the result without the source.
 *
 * The command lives in the reference deployment because every touchpoint it
 * reads (Dockerfiles, `wrangler.jsonc`, Container classes) is a deployment
 * concern, and because a consumer runs it against their own deployment tree.
 * The `patronage` CLI does not depend on `@patronage/ads-sync` and does not
 * know a deployment layout.
 *
 * Usage:
 *   node --experimental-strip-types provider-admission.ts --provider google_ads
 *     [--deployment <dir>] [--wrangler <file>] [--images <dir>]
 *     [--fixtures <dir>] [--expect-wrapper-version <v>]
 *     [--live] [--image <ref>] [--source-config <file>] [--json]
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  enforceTextArtifactLimits,
  isAdsSyncProvider,
  isRecord,
  providerDefinitions,
  providerModule,
  sourceConfigForReporting,
  supportedImageVersions,
  supportedProviderDefinitions,
  supportedProviders,
  validateCatalogForReporting,
} from "@patronage/ads-sync";
import type { AdsSyncProvider } from "@patronage/ads-sync";
import {
  assertContainerImagePin,
  ContainerQualificationError,
  sanitizeConnectorFailureText,
} from "@patronage/ads-sync/run";
import type { ContainerImagePin } from "@patronage/ads-sync/run";

const admissionScriptPath = import.meta.filename;
const scriptsDir = import.meta.dirname;
export const referenceDeploymentRoot = path.resolve(scriptsDir, "..");
export const referenceImagesDir = path.join(referenceDeploymentRoot, "images");
export const packageFixturesDir = path.resolve(
  referenceDeploymentRoot,
  "..",
  "src",
  "test-fixtures",
  "provider-admission"
);

const WRAPPER_FILE = "airbyte-source-server.py";
const WRAPPER_VERSION_PATTERN = /^ads-sync-wrapper-v\d+\.\d+$/u;
const WRAPPER_VERSION_LITERAL =
  /["'](?<version>ads-sync-wrapper-v\d+\.\d+)["']/gu;
/**
 * A CONNECTION_STATUS FAILED whose message is a config-shape rejection. The
 * connector never reached the provider, so the fixture does not prove the
 * config shape (friction #18).
 */
const CONFIG_REJECTION_PATTERN =
  /config validation error|is a required property|additional properties are not allowed|is not valid under any of the given schemas|is not of type/iu;
const DIGEST_PINNED_IMAGE = /^[^@\s]+@sha256:[0-9a-f]{64}$/u;
/** A quoted digest-pinned image reference inside a `.ts` source file. */
const IMAGE_DIGEST_LITERAL =
  /["'`](?<image>[^"'`\s]+@sha256:[0-9a-f]{64})["'`]/gu;
/** A read of the package image registry, either `.google_ads` or `[provider]`. */
const SUPPORTED_IMAGE_VERSIONS_READ =
  /supportedImageVersions\s*(?:\.\s*(?<key>[A-Za-z_$][\w$]*)|\[)/gu;
const IMAGE_TAG_SUFFIX = /:[^:/]+$/u;
const DOCKERFILE_NAME = /(?:^|[/\\])[Dd]ockerfile(?:\.[\w-]+)?$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".git"]);

/** Bounds for the live source read; smaller than the seam defaults on purpose. */
export const LIVE_READ_LIMITS = {
  maxLines: 50_000,
  maxSourceStdoutBytes: 8 * 1024 * 1024,
} as const;
const LIVE_READ_TIMEOUT_MS = 5 * 60 * 1000;
const LIVE_COMMAND_TIMEOUT_MS = 4 * 60 * 1000;
const LIVE_COLD_START = { maxAttempts: 30, retryDelayMs: 1000 } as const;

export type AdmissionCheckId =
  | "bounded-read"
  | "catalog"
  | "check"
  | "container-class"
  | "dockerfile"
  | "fixture"
  | "image-metadata"
  | "metadata-expectation"
  | "spec"
  | "wrangler-binding"
  | "wrangler-container"
  | "wrangler-migration"
  | "wrapper";

export interface AdmissionCheck {
  detail: string;
  id: AdmissionCheckId;
  status: "failed" | "passed";
}

export interface AdmissionReport {
  checks: AdmissionCheck[];
  passed: boolean;
  provider: string;
}

/** Docker operations the live rung needs; injectable for tests. */
export interface DockerDriver {
  build: (dockerfile: string, contextDir: string, tag: string) => void;
  exec: (
    containerId: string,
    command: string,
    input?: string
  ) => { stdout: string };
  run: (image: string) => { containerId: string; port: number };
  stop: (containerId: string) => void;
}

export interface LiveOptions {
  docker?: DockerDriver;
  /** Prebuilt image reference; when absent the command builds the Dockerfile. */
  image?: string;
  readTimeoutMs?: number;
  /** Real source config; when present `check` must report SUCCEEDED. */
  sourceConfigPath?: string;
}

export interface ProviderAdmissionOptions {
  deploymentRoot: string;
  expectedWrapperVersion?: string;
  fixturesDir: string;
  imagesDir: string;
  live?: LiveOptions;
  provider: string;
  wranglerConfigPath: string;
}

interface StaticContext {
  /** The `containers[]` entry the Wrangler check admitted. */
  container?: WranglerContainer;
  dockerfilePath?: string;
  provider: AdsSyncProvider;
  wrapperVersion?: string;
}

interface CheckOutcome {
  detail: string;
  ok: boolean;
}

const pass = (detail: string): CheckOutcome => ({ detail, ok: true });
const fail = (detail: string): CheckOutcome => ({ detail, ok: false });

export async function admitProvider(
  options: ProviderAdmissionOptions
): Promise<AdmissionReport> {
  const checks: AdmissionCheck[] = [];
  const record = (id: AdmissionCheckId, outcome: CheckOutcome) => {
    checks.push({
      detail: outcome.detail,
      id,
      status: outcome.ok ? "passed" : "failed",
    });
    return outcome.ok;
  };

  const catalog = checkCatalog(options.provider);
  if (!record("catalog", catalog)) {
    return { checks, passed: false, provider: options.provider };
  }
  const context: StaticContext = {
    provider: options.provider as AdsSyncProvider,
  };

  record("dockerfile", checkDockerfile(options, context));
  record("wrapper", checkWrapper(options, context));
  record("wrangler-container", checkWranglerContainer(options, context));
  const wrangler = checkWranglerBindingAndMigration(options, context);
  record("wrangler-binding", wrangler.binding);
  record("wrangler-migration", wrangler.migration);
  record("container-class", checkContainerClass(options, context));
  record("metadata-expectation", checkMetadataExpectation(options, context));
  record("fixture", checkFixture(options, context));

  if (options.live) {
    for (const [id, outcome] of await runLiveChecks(options, context)) {
      record(id, outcome);
    }
  }

  return {
    checks,
    passed: checks.every((check) => check.status === "passed"),
    provider: options.provider,
  };
}

// ---------------------------------------------------------------------------
// static checks

function checkCatalog(provider: string): CheckOutcome {
  if (!isAdsSyncProvider(provider)) {
    return fail(
      `no provider module registered for "${provider}" (supported: ${supportedProviders.join(", ")})`
    );
  }
  const module = providerModule(provider);
  const problems: string[] = [];
  if (module.id !== provider) {
    problems.push(`module id "${module.id}" does not equal "${provider}"`);
  }
  if (!DIGEST_PINNED_IMAGE.test(module.sourceImage)) {
    problems.push(`sourceImage "${module.sourceImage}" is not digest pinned`);
  }
  if (supportedImageVersions[provider] !== module.sourceImage) {
    problems.push("supportedImageVersions does not equal module sourceImage");
  }
  if (
    supportedProviderDefinitions[provider]?.sourceImage !== module.sourceImage
  ) {
    problems.push("supportedProviderDefinitions does not carry the module");
  }
  if (providerDefinitions[provider]?.streamName !== module.streamName) {
    problems.push("providerDefinitions does not carry the module stream");
  }
  const streams = module.reportingStreamRequirements.map((r) => r.streamName);
  if (!streams.includes(module.streamName)) {
    problems.push(
      `streamName "${module.streamName}" has no reporting stream requirement`
    );
  }
  for (const other of supportedProviders) {
    if (other === provider) {
      continue;
    }
    const otherModule = providerModule(other);
    if (otherModule.sourceConfigSecret === module.sourceConfigSecret) {
      problems.push(`sourceConfigSecret collides with ${other}`);
    }
    if (otherModule.stateSecret === module.stateSecret) {
      problems.push(`stateSecret collides with ${other}`);
    }
  }
  if (problems.length > 0) {
    return fail(problems.join("; "));
  }
  return pass(
    `${module.displayName}: registry, definitions, and image pin agree (${module.sourceImage})`
  );
}

function checkDockerfile(
  options: ProviderAdmissionOptions,
  context: StaticContext
): CheckOutcome {
  const module = providerModule(context.provider);
  if (!existsSync(options.imagesDir)) {
    return fail(`images directory ${options.imagesDir} does not exist`);
  }
  const candidates = readdirSync(options.imagesDir).filter((name) =>
    name.startsWith("Dockerfile")
  );
  const matches = candidates.filter((name) => {
    const from = fromImage(
      readFileSync(path.join(options.imagesDir, name), "utf-8")
    );
    return from === module.sourceImage;
  });
  if (matches.length === 0) {
    const pins = candidates
      .map((name) => {
        const from = fromImage(
          readFileSync(path.join(options.imagesDir, name), "utf-8")
        );
        return `${name} FROM ${from ?? "<none>"}`;
      })
      .join("; ");
    return fail(
      `no Dockerfile in ${options.imagesDir} pins FROM ${module.sourceImage} (found: ${pins || "none"})`
    );
  }
  if (matches.length > 1) {
    return fail(`Dockerfiles ${matches.join(", ")} all pin the provider image`);
  }
  const [name] = matches;
  if (!name) {
    return fail("no Dockerfile matched");
  }
  const dockerfilePath = path.join(options.imagesDir, name);
  const text = readFileSync(dockerfilePath, "utf-8");
  const problems: string[] = [];
  const connectorImage =
    /^ENV AIRBYTE_CONNECTOR_IMAGE="(?<image>[^"]+)"/mu.exec(text)?.groups
      ?.image;
  if (connectorImage !== module.sourceImage) {
    problems.push(
      `AIRBYTE_CONNECTOR_IMAGE ${connectorImage ?? "<unset>"} does not equal FROM pin`
    );
  }
  if (!text.includes(`COPY ${WRAPPER_FILE} /app/${WRAPPER_FILE}`)) {
    problems.push(`does not COPY ${WRAPPER_FILE} to /app`);
  }
  if (!/^ENTRYPOINT \[.*airbyte-source-server\.py.*\]/mu.test(text)) {
    problems.push("ENTRYPOINT does not run the wrapper");
  }
  if (!/^ENV AIRBYTE_CONNECTOR_COMMAND=/mu.test(text)) {
    problems.push("AIRBYTE_CONNECTOR_COMMAND is not set");
  }
  const allowlist = dockerignoreAllowlist(options.imagesDir);
  const copies = [...text.matchAll(/^COPY (?<src>\S+) /gmu)]
    .map((match) => match.groups?.src)
    .filter((src): src is string => typeof src === "string");
  for (const src of [name, ...copies]) {
    if (!allowlist.has(src)) {
      problems.push(`.dockerignore does not allowlist ${src}`);
    }
  }
  if (problems.length > 0) {
    return fail(`${name}: ${problems.join("; ")}`);
  }
  context.dockerfilePath = dockerfilePath;
  return pass(
    `${name} pins FROM and AIRBYTE_CONNECTOR_IMAGE to the package image`
  );
}

function checkWrapper(
  options: ProviderAdmissionOptions,
  context: StaticContext
): CheckOutcome {
  const wrapperPath = path.join(options.imagesDir, WRAPPER_FILE);
  if (!existsSync(wrapperPath)) {
    return fail(`${wrapperPath} does not exist`);
  }
  const version = /^WRAPPER_VERSION = "(?<version>[^"]+)"/mu.exec(
    readFileSync(wrapperPath, "utf-8")
  )?.groups?.version;
  if (!version || !WRAPPER_VERSION_PATTERN.test(version)) {
    return fail(
      `${WRAPPER_FILE} WRAPPER_VERSION "${version ?? "<unset>"}" is not ads-sync-wrapper-v<major>.<minor>`
    );
  }
  if (
    options.expectedWrapperVersion &&
    options.expectedWrapperVersion !== version
  ) {
    return fail(
      `${WRAPPER_FILE} WRAPPER_VERSION ${version} does not equal expected ${options.expectedWrapperVersion}`
    );
  }
  context.wrapperVersion = version;
  return pass(`${WRAPPER_FILE} declares ${version}`);
}

/**
 * A `containers[].image` value is either a Dockerfile path the deployment
 * builds, or a reference to an image a registry already holds.
 */
export type WranglerContainerImage =
  | { imagePath: string; kind: "path" }
  | { kind: "registry"; reference: string };

interface WranglerContainer {
  className: string;
  image: WranglerContainerImage;
}

interface WranglerShape {
  bindings: { className: string; name: string }[];
  containers: WranglerContainer[];
  migratedClasses: string[];
}

/**
 * Classifies one `containers[].image` value.
 *
 * The value names a registry image when it carries an `@sha256:` digest, or
 * when its first path segment looks like a registry host. A registry host
 * segment contains a `.` or a `:`, or it equals `localhost`. A value that
 * starts with `./`, `../`, or `/` is always a path. A value that ends with a
 * Dockerfile name is always a path, even under a host-like directory.
 */
export function readContainerImage(
  image: string,
  configDir: string
): WranglerContainerImage {
  const asPath = (): WranglerContainerImage => ({
    imagePath: path.resolve(configDir, image),
    kind: "path",
  });
  if (
    image.startsWith("./") ||
    image.startsWith("../") ||
    image.startsWith("/") ||
    DOCKERFILE_NAME.test(image)
  ) {
    return asPath();
  }
  if (image.includes("@sha256:")) {
    return { kind: "registry", reference: image };
  }
  const firstSegment = image.split("/")[0] ?? "";
  const registryHost =
    firstSegment === "localhost" ||
    firstSegment.includes(".") ||
    firstSegment.includes(":");
  return registryHost ? { kind: "registry", reference: image } : asPath();
}

function readWrangler(configPath: string): WranglerShape {
  const raw = parseJsonc(readFileSync(configPath, "utf-8"));
  if (!isRecord(raw)) {
    throw new Error("wrangler config is not an object");
  }
  const configDir = path.dirname(configPath);
  const containers = Array.isArray(raw.containers)
    ? raw.containers.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.class_name !== "string") {
          return [];
        }
        const image = typeof entry.image === "string" ? entry.image : "";
        return [
          {
            className: entry.class_name,
            image: readContainerImage(image, configDir),
          },
        ];
      })
    : [];
  const durable = isRecord(raw.durable_objects) ? raw.durable_objects : {};
  const bindings = Array.isArray(durable.bindings)
    ? durable.bindings.flatMap((entry) =>
        isRecord(entry) &&
        typeof entry.name === "string" &&
        typeof entry.class_name === "string"
          ? [{ className: entry.class_name, name: entry.name }]
          : []
      )
    : [];
  const migratedClasses = Array.isArray(raw.migrations)
    ? raw.migrations.flatMap((migration) => {
        if (!isRecord(migration)) {
          return [];
        }
        return [migration.new_sqlite_classes, migration.new_classes].flatMap(
          (list) =>
            Array.isArray(list)
              ? list.filter(
                  (value): value is string => typeof value === "string"
                )
              : []
        );
      })
    : [];
  return { bindings, containers, migratedClasses };
}

/**
 * Finds the `containers[]` entry that carries the provider image.
 *
 * A path entry matches when it builds the admitted Dockerfile. A registry
 * entry matches when its image name carries the provider id.
 */
function matchWranglerContainer(
  shape: WranglerShape,
  context: StaticContext
): WranglerContainer | undefined {
  if (context.dockerfilePath) {
    const dockerfile = samePathKey(context.dockerfilePath);
    const built = shape.containers.find(
      (entry) =>
        entry.image.kind === "path" &&
        samePathKey(entry.image.imagePath) === dockerfile
    );
    if (built) {
      return built;
    }
  }
  const registryMatches = shape.containers.filter(
    (entry) =>
      entry.image.kind === "registry" &&
      referenceNamesProvider(entry.image.reference, context.provider)
  );
  return registryMatches.length === 1 ? registryMatches[0] : undefined;
}

/** Reports whether a registry reference names the provider image. */
function referenceNamesProvider(
  reference: string,
  provider: AdsSyncProvider
): boolean {
  const name = imageRepository(reference).split("/").at(-1) ?? "";
  return (
    name.includes(provider) || name.includes(provider.replaceAll("_", "-"))
  );
}

/** Strips the digest and the tag from an image reference. */
function imageRepository(reference: string): string {
  const withoutDigest = reference.split("@")[0] ?? "";
  return withoutDigest.replace(IMAGE_TAG_SUFFIX, "");
}

function checkWranglerContainer(
  options: ProviderAdmissionOptions,
  context: StaticContext
): CheckOutcome {
  if (!existsSync(options.wranglerConfigPath)) {
    return fail(`${options.wranglerConfigPath} does not exist`);
  }
  let shape: WranglerShape;
  try {
    shape = readWrangler(options.wranglerConfigPath);
  } catch (error) {
    return fail(
      `cannot parse ${options.wranglerConfigPath}: ${message(error)}`
    );
  }
  const container = matchWranglerContainer(shape, context);
  if (!container) {
    const wanted = context.dockerfilePath
      ? path.relative(
          path.dirname(options.wranglerConfigPath),
          context.dockerfilePath
        )
      : `an image named for ${context.provider}`;
    return fail(
      `${path.basename(options.wranglerConfigPath)} declares no containers[] entry whose image is ${wanted} (containers: ${shape.containers.map((c) => c.className).join(", ") || "none"})`
    );
  }
  context.container = container;
  if (container.image.kind === "registry") {
    // The consumer image is built from the Dockerfile, so its digest never
    // equals the upstream connector image. The live rung verifies the running
    // image through `/metadata` instead.
    return pass(
      `containers[] runs registry image ${container.image.reference} as ${container.className}; the running image pin is verified by the live rung through /metadata`
    );
  }
  return pass(
    `containers[] builds ${path.basename(container.image.imagePath)} as ${container.className}`
  );
}

function checkContainerClass(
  options: ProviderAdmissionOptions,
  context: StaticContext
): CheckOutcome {
  const container = admittedContainer(context);
  if (!container) {
    return fail("blocked: no admitted Wrangler container entry");
  }
  const { className } = container;
  // A class a test file declares or exports never runs in the deployment.
  const files = pinnedSourceFiles(options.deploymentRoot);
  const declaration = new RegExp(
    `class\\s+${className}\\s+extends\\s+Container\\b`,
    "u"
  );
  const declaringFile = files.find((file) =>
    declaration.test(readFileSync(file, "utf-8"))
  );
  if (!declaringFile) {
    return fail(
      `no .ts file under ${options.deploymentRoot} declares class ${className} extends Container`
    );
  }
  const declaringText = readFileSync(declaringFile, "utf-8");
  const exportedInline = new RegExp(
    `export\\s+class\\s+${className}\\s+extends\\s+Container\\b`,
    "u"
  ).test(declaringText);
  const exportedElsewhere = files.some((file) =>
    new RegExp(`export\\s*\\{[^}]*\\b${className}\\b[^}]*\\}`, "u").test(
      readFileSync(file, "utf-8")
    )
  );
  if (!(exportedInline || exportedElsewhere)) {
    return fail(
      `${path.relative(options.deploymentRoot, declaringFile)} declares ${className} but no module exports it`
    );
  }
  return pass(
    `${className} extends Container in ${path.relative(options.deploymentRoot, declaringFile)}`
  );
}

/** The entry `checkWranglerContainer` admitted; later checks reuse it. */
function admittedContainer(
  context: StaticContext
): WranglerContainer | undefined {
  return context.container;
}

/** Binding and migration are reported through one combined check pair. */
function checkWranglerBindingAndMigration(
  options: ProviderAdmissionOptions,
  context: StaticContext
): { binding: CheckOutcome; migration: CheckOutcome } {
  const container = admittedContainer(context);
  if (!container) {
    const blocked = fail("blocked: no admitted Wrangler container entry");
    return { binding: blocked, migration: blocked };
  }
  const shape = readWrangler(options.wranglerConfigPath);
  const binding = shape.bindings.find(
    (entry) => entry.className === container.className
  );
  const migrated = shape.migratedClasses.includes(container.className);
  return {
    binding: binding
      ? pass(
          `durable_objects.bindings ${binding.name} -> ${container.className}`
        )
      : fail(
          `durable_objects.bindings has no entry with class_name ${container.className}`
        ),
    migration: migrated
      ? pass(`migrations declare ${container.className}`)
      : fail(
          `no migrations[] entry lists ${container.className} in new_sqlite_classes or new_classes`
        ),
  };
}

function checkMetadataExpectation(
  options: ProviderAdmissionOptions,
  context: StaticContext
): CheckOutcome {
  if (!context.wrapperVersion) {
    return fail("blocked: wrapper version unknown");
  }
  const literals = new Map<string, string[]>();
  const pinnedSources = pinnedSourceFiles(options.deploymentRoot);
  for (const file of pinnedSources) {
    for (const match of readFileSync(file, "utf-8").matchAll(
      WRAPPER_VERSION_LITERAL
    )) {
      const version = match.groups?.version;
      if (!version) {
        continue;
      }
      const list = literals.get(version) ?? [];
      list.push(path.relative(options.deploymentRoot, file));
      literals.set(version, list);
    }
  }
  if (literals.size === 0) {
    return fail(
      `no .ts source under ${options.deploymentRoot} pins a wrapper version literal; a Qualified Run needs an exact metadata expectation`
    );
  }
  const mismatched = [...literals.entries()].filter(
    ([version]) => version !== context.wrapperVersion
  );
  if (mismatched.length > 0) {
    return fail(
      mismatched
        .map(
          ([version, files]) =>
            `${files.join(", ")} expects ${version} but ${WRAPPER_FILE} declares ${context.wrapperVersion}`
        )
        .join("; ")
    );
  }
  const files = literals.get(context.wrapperVersion) ?? [];
  const connectorImage = checkConnectorImagePin(
    options,
    context,
    pinnedSources
  );
  if (!connectorImage.ok) {
    return connectorImage;
  }
  return pass(
    `${files.join(", ")} expect ${context.wrapperVersion}; ${connectorImage.detail}`
  );
}

/**
 * Verifies the `connectorImage` half of the pin the deployment declares.
 *
 * A deployment either writes the digest as a literal, or derives it from
 * `supportedImageVersions`. A literal must equal the package image. A derived
 * pin needs no comparison, because the package owns the value.
 */
function checkConnectorImagePin(
  options: ProviderAdmissionOptions,
  context: StaticContext,
  pinnedSources: string[]
): CheckOutcome {
  const expected = providerModule(context.provider).sourceImage;
  const repository = imageRepository(expected);
  const literals = new Map<string, string[]>();
  const derived: string[] = [];
  for (const file of pinnedSources) {
    const text = readFileSync(file, "utf-8");
    const relative = path.relative(options.deploymentRoot, file);
    for (const match of text.matchAll(IMAGE_DIGEST_LITERAL)) {
      const image = match.groups?.image;
      if (!image || imageRepository(image) !== repository) {
        continue;
      }
      literals.set(image, [...(literals.get(image) ?? []), relative]);
    }
    for (const match of text.matchAll(SUPPORTED_IMAGE_VERSIONS_READ)) {
      const key = match.groups?.key;
      if (key === undefined || key === context.provider) {
        derived.push(relative);
      }
    }
  }
  const drifted = [...literals.entries()].filter(
    ([image]) => image !== expected
  );
  if (drifted.length > 0) {
    return fail(
      drifted
        .map(
          ([image, files]) =>
            `${files.join(", ")} pins connectorImage ${image} but the package pins ${expected}`
        )
        .join("; ")
    );
  }
  const matched = literals.get(expected);
  if (matched) {
    return pass(`${matched.join(", ")} pin connectorImage ${expected}`);
  }
  if (derived.length > 0) {
    return pass(
      `${[...new Set(derived)].join(", ")} derive connectorImage from supportedImageVersions, which the catalog check pins to ${expected}`
    );
  }
  return fail(
    `no connectorImage pin found: no .ts source under ${options.deploymentRoot} pins ${expected} or reads supportedImageVersions`
  );
}

function checkFixture(
  options: ProviderAdmissionOptions,
  context: StaticContext
): CheckOutcome {
  const module = providerModule(context.provider);
  const dir = path.join(options.fixturesDir, context.provider);
  const catalogPath = path.join(dir, "catalog.json");
  const configPath = path.join(dir, "source-config.json");
  const problems: string[] = [];
  const catalog = readJsonFile(catalogPath);
  if (catalog.error) {
    problems.push(`catalog.json: ${catalog.error}`);
  } else {
    const streams = catalogStreamNames(catalog.value);
    if (!streams.includes(module.streamName)) {
      problems.push(
        `catalog.json has no stream ${module.streamName} (streams: ${streams.join(", ") || "none"})`
      );
    }
    for (const issue of validateCatalogForReporting(
      context.provider,
      catalog.value
    )) {
      problems.push(`catalog.json ${issue.type}: ${issue.message}`);
    }
  }
  const config = readJsonFile(configPath);
  if (config.error) {
    problems.push(`source-config.json: ${config.error}`);
  } else if (isRecord(config.value)) {
    const identity = module.sourceIdentity(config.value);
    const identified = Object.values(identity).some(
      (value) => value !== null && value !== undefined && String(value) !== ""
    );
    if (!identified) {
      problems.push("source-config.json yields no source identity");
    }
  } else {
    problems.push("source-config.json is not an object");
  }
  if (problems.length > 0) {
    return fail(
      `${path.relative(options.fixturesDir, dir)}: ${problems.join("; ")}`
    );
  }
  return pass(
    `${path.relative(options.fixturesDir, dir)}/catalog.json covers ${module.streamName} with no reporting drift; source-config.json identifies a source`
  );
}

// ---------------------------------------------------------------------------
// live checks

interface AirbyteMessage {
  connectionStatus?: { message?: unknown; status?: unknown };
  type?: unknown;
}

async function runLiveChecks(
  options: ProviderAdmissionOptions,
  context: StaticContext
): Promise<[AdmissionCheckId, CheckOutcome][]> {
  const live = options.live ?? {};
  const docker = live.docker ?? dockerCliDriver;
  const results: [AdmissionCheckId, CheckOutcome][] = [];
  const module = providerModule(context.provider);
  if (!(context.dockerfilePath && context.wrapperVersion)) {
    const blocked = fail("blocked: static Dockerfile or wrapper check failed");
    return [
      ["image-metadata", blocked],
      ["spec", blocked],
      ["check", blocked],
      ["bounded-read", blocked],
    ];
  }
  const expected: ContainerImagePin = {
    connectorImage: module.sourceImage,
    wrapperVersion: context.wrapperVersion,
  };
  let { image } = live;
  if (!image) {
    image = `ads-sync-admission/${context.provider}:${module.sourceImage.slice(-12)}`;
    try {
      docker.build(context.dockerfilePath, options.imagesDir, image);
    } catch (error) {
      const blocked = fail(`image build failed: ${message(error)}`);
      return [
        ["image-metadata", blocked],
        ["spec", blocked],
        ["check", blocked],
        ["bounded-read", blocked],
      ];
    }
  }

  let container: { containerId: string; port: number };
  try {
    container = docker.run(image);
  } catch (error) {
    const blocked = fail(`container start failed: ${message(error)}`);
    return [
      ["image-metadata", blocked],
      ["spec", blocked],
      ["check", blocked],
      ["bounded-read", blocked],
    ];
  }
  const baseUrl = `http://127.0.0.1:${container.port}`;
  const handle = {
    fetch: (request: Request) =>
      fetch(
        new Request(request.url.replace("http://container", baseUrl), request)
      ),
  };
  try {
    const metadata = await checkImageMetadata(
      handle,
      context.provider,
      expected
    );
    results.push(["image-metadata", metadata]);
    if (!metadata.ok) {
      const blocked = fail("blocked: image metadata did not match");
      results.push(
        ["spec", blocked],
        ["check", blocked],
        ["bounded-read", blocked]
      );
      return results;
    }
    const sourceConfigPath =
      live.sourceConfigPath ??
      path.join(options.fixturesDir, context.provider, "source-config.json");
    const sourceConfig = readJsonFile(sourceConfigPath);
    const catalog = readJsonFile(
      path.join(options.fixturesDir, context.provider, "catalog.json")
    );
    const spec = await checkSpec(baseUrl, docker, container.containerId);
    const requireLive = live.sourceConfigPath !== undefined;
    // The dispatcher never sends the raw source config: every Qualified Run
    // applies `sourceConfigForReporting` with the run window (#1598).
    // Admission exercises that exact shape so a provider whose windowed
    // rewrite the connector rejects cannot pass and then fail its first
    // scheduled run.
    const window = admissionReportingWindow();
    const windowedConfig =
      sourceConfig.error || catalog.error
        ? sourceConfig.value
        : sourceConfigForReporting(
            context.provider,
            sourceConfig.value,
            catalog.value,
            window
          );
    const check = sourceConfig.error
      ? fail(`source config: ${boundedText(sourceConfig.error)}`)
      : await checkConnection(
          baseUrl,
          docker,
          container.containerId,
          windowedConfig,
          requireLive
        );
    const fixtureError = sourceConfig.error ?? catalog.error;
    const read = fixtureError
      ? fail(`fixture: ${boundedText(fixtureError)}`)
      : await checkBoundedRead(
          baseUrl,
          { catalog: catalog.value, config: windowedConfig },
          requireLive,
          live.readTimeoutMs ?? LIVE_READ_TIMEOUT_MS
        );
    results.push(["spec", spec], ["check", check], ["bounded-read", read]);
  } finally {
    docker.stop(container.containerId);
  }
  return results;
}

/**
 * A deterministic seven-day window ending at the last UTC midnight, in the
 * dispatcher's `QualifiedRunWindow` ISO format. Admission only proves the
 * connector accepts the windowed config shape; the exact dates are
 * immaterial.
 */
function admissionReportingWindow() {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { endDate: end.toISOString(), startDate: start.toISOString() };
}

async function checkImageMetadata(
  handle: { fetch: (request: Request) => Promise<Response> },
  provider: AdsSyncProvider,
  expected: ContainerImagePin
): Promise<CheckOutcome> {
  try {
    const { attempts } = await assertContainerImagePin(
      handle,
      provider,
      expected,
      LIVE_COLD_START
    );
    return pass(
      `/metadata reports connectorImage and wrapperVersion ${expected.wrapperVersion} exactly (attempt ${attempts})`
    );
  } catch (error) {
    if (error instanceof ContainerQualificationError) {
      return fail(`${error.reason}: ${boundedText(error.message)}`);
    }
    return fail(message(error));
  }
}

async function checkSpec(
  baseUrl: string,
  docker: DockerDriver,
  containerId: string
): Promise<CheckOutcome> {
  const result = await wrapperJson(`${baseUrl}/spec`, {
    signal: AbortSignal.timeout(LIVE_COMMAND_TIMEOUT_MS),
  });
  if (!result.ok) {
    return fail(`GET /spec: ${boundedText(result.error)}`);
  }
  const { body, response } = result;
  if (!response.ok || body.success !== true) {
    return fail(
      `GET /spec returned ${response.status} exitCode ${String(body.exitCode)}`
    );
  }
  const messages = connectorMessages(docker, containerId, "spec");
  const spec = messages.find((m) => m.type === "SPEC");
  if (!spec) {
    return fail("connector `spec` emitted no SPEC message");
  }
  return pass("GET /spec succeeded and the connector emitted a SPEC message");
}

async function checkConnection(
  baseUrl: string,
  docker: DockerDriver,
  containerId: string,
  sourceConfig: unknown,
  requireSucceeded: boolean
): Promise<CheckOutcome> {
  const result = await wrapperJson(`${baseUrl}/check`, {
    body: JSON.stringify(sourceConfig),
    headers: { "content-type": "application/json; charset=utf-8" },
    method: "POST",
    signal: AbortSignal.timeout(LIVE_COMMAND_TIMEOUT_MS),
  });
  if (!result.ok) {
    return fail(`POST /check: ${boundedText(result.error)}`);
  }
  const { body, response } = result;
  if (body.success !== true) {
    return fail(
      `POST /check returned ${response.status} exitCode ${String(body.exitCode)}: the connector rejected the source config before a CONNECTION_STATUS`
    );
  }
  const messages = connectorMessages(
    docker,
    containerId,
    "check",
    sourceConfig
  );
  const status = messages.find((m) => m.type === "CONNECTION_STATUS");
  if (!status) {
    return fail("connector `check` emitted no CONNECTION_STATUS message");
  }
  const value = String(status.connectionStatus?.status);
  const reason = boundedText(String(status.connectionStatus?.message ?? ""));
  if (value !== "SUCCEEDED" && CONFIG_REJECTION_PATTERN.test(reason)) {
    return fail(
      `CONNECTION_STATUS ${value} is a config-shape rejection, so the source config never reached the provider: ${reason}`
    );
  }
  if (requireSucceeded && value !== "SUCCEEDED") {
    return fail(
      `CONNECTION_STATUS ${value} with a real source config: ${reason}`
    );
  }
  if (value === "SUCCEEDED") {
    return pass("CONNECTION_STATUS SUCCEEDED");
  }
  return pass(
    `CONNECTION_STATUS ${value} (synthetic credentials; the connector accepted the config shape and reached the provider): ${reason}`
  );
}

async function checkBoundedRead(
  baseUrl: string,
  payload: { catalog: unknown; config: unknown },
  requireRecords: boolean,
  timeoutMs: number
): Promise<CheckOutcome> {
  const started = Date.now();
  const result = await wrapperJson(`${baseUrl}/read-artifact`, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json; charset=utf-8" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!result.ok) {
    return fail(
      `POST /read-artifact did not complete within ${timeoutMs}ms: ${boundedText(result.error)}`
    );
  }
  const elapsed = Date.now() - started;
  const { body, response } = result;
  if (typeof body.stdout !== "string" || typeof body.stderr !== "string") {
    return fail(
      `POST /read-artifact returned ${response.status} without stdout/stderr strings`
    );
  }
  try {
    enforceTextArtifactLimits("Source stdout", body.stdout, LIVE_READ_LIMITS);
    enforceTextArtifactLimits("Source stderr", body.stderr, LIVE_READ_LIMITS);
  } catch (error) {
    return fail(message(error));
  }
  const counts = messageCounts(body.stdout);
  if (
    requireRecords &&
    (body.exitCode !== 0 || counts.RECORD + counts.STATE === 0)
  ) {
    return fail(
      `read exited ${String(body.exitCode)} with ${counts.RECORD} RECORD and ${counts.STATE} STATE messages`
    );
  }
  return pass(
    `read exited ${String(body.exitCode)} in ${elapsed}ms with ${counts.RECORD} RECORD, ${counts.STATE} STATE, ${counts.LOG} LOG, ${counts.TRACE} TRACE messages within ${LIVE_READ_LIMITS.maxSourceStdoutBytes} bytes / ${LIVE_READ_LIMITS.maxLines} lines`
  );
}

function connectorMessages(
  docker: DockerDriver,
  containerId: string,
  command: "check" | "spec",
  config?: unknown
): AirbyteMessage[] {
  // The source config travels over stdin, never through argv or the report.
  const shell =
    command === "spec"
      ? "$AIRBYTE_CONNECTOR_COMMAND spec"
      : "cat > /tmp/admission-config.json && $AIRBYTE_CONNECTOR_COMMAND check --config /tmp/admission-config.json; rm -f /tmp/admission-config.json";
  const { stdout } = docker.exec(
    containerId,
    shell,
    command === "check" ? JSON.stringify(config) : undefined
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return isRecord(parsed) ? [parsed as AirbyteMessage] : [];
      } catch {
        return [];
      }
    });
}

/** One wrapper call; transport and JSON failures become a named reason. */
async function wrapperJson(
  url: string,
  init: RequestInit
): Promise<
  | { body: Record<string, unknown>; ok: true; response: Response }
  | { error: string; ok: false }
> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    return { error: `wrapper did not respond: ${message(error)}`, ok: false };
  }
  try {
    const body: unknown = await response.json();
    if (!isRecord(body)) {
      return {
        error: `wrapper returned ${response.status} without a JSON object`,
        ok: false,
      };
    }
    return { body, ok: true, response };
  } catch (error) {
    return {
      error: `wrapper returned ${response.status} with a non-JSON body: ${message(error)}`,
      ok: false,
    };
  }
}

function messageCounts(stdout: string) {
  const counts = { LOG: 0, RECORD: 0, STATE: 0, TRACE: 0 };
  for (const line of stdout.split("\n")) {
    const type = /^\s*\{\s*"type"\s*:\s*"(?<type>[A-Z_]+)"/u.exec(line)?.groups
      ?.type;
    if (type && type in counts) {
      counts[type as keyof typeof counts] += 1;
    }
  }
  return counts;
}

export const dockerCliDriver: DockerDriver = {
  build(dockerfile, contextDir, tag) {
    dockerCommand(
      [
        "buildx",
        "build",
        "--platform",
        "linux/amd64",
        "--file",
        dockerfile,
        "--tag",
        tag,
        "--load",
        contextDir,
      ],
      { inherit: true }
    );
  },
  exec(containerId, command, input) {
    return {
      stdout: dockerCommand(
        ["exec", "--interactive", containerId, "sh", "-c", command],
        { allowFailure: true, input }
      ),
    };
  },
  run(image) {
    const containerId = dockerCommand([
      "run",
      "--detach",
      "--rm",
      "--platform",
      "linux/amd64",
      "--publish",
      "127.0.0.1:0:8080",
      image,
    ]).trim();
    const mapping = dockerCommand(["port", containerId, "8080"]).trim();
    const port = Number(mapping.split("\n")[0]?.split(":").at(-1));
    if (!Number.isInteger(port) || port <= 0) {
      dockerCliDriver.stop(containerId);
      throw new Error(`docker port returned "${mapping}"`);
    }
    return { containerId, port };
  },
  stop(containerId) {
    dockerCommand(["stop", "--time", "5", containerId], { allowFailure: true });
  },
};

function dockerCommand(
  args: string[],
  options: { allowFailure?: boolean; inherit?: boolean; input?: string } = {}
) {
  const result = spawnSync("docker", args, {
    encoding: "utf-8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.inherit ? ["ignore", "inherit", "inherit"] : "pipe",
    timeout: 30 * 60 * 1000,
  });
  if (result.error) {
    throw new Error(`docker ${args[0]}: ${result.error.message}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `docker ${args.slice(0, 2).join(" ")} exited ${String(result.status)}: ${boundedText(result.stderr ?? "")}`
    );
  }
  return result.stdout ?? "";
}

// ---------------------------------------------------------------------------
// helpers

function fromImage(dockerfile: string) {
  return /^FROM (?<image>\S+)/mu.exec(dockerfile)?.groups?.image;
}

function dockerignoreAllowlist(imagesDir: string) {
  const file = path.join(imagesDir, ".dockerignore");
  if (!existsSync(file)) {
    return new Set<string>();
  }
  return new Set(
    readFileSync(file, "utf-8")
      .split("\n")
      .filter((line) => line.startsWith("!"))
      .map((line) => line.slice(1).trim())
  );
}

function catalogStreamNames(catalog: unknown): string[] {
  if (!isRecord(catalog) || !Array.isArray(catalog.streams)) {
    return [];
  }
  return catalog.streams.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.stream)) {
      return [];
    }
    return typeof entry.stream.name === "string" ? [entry.stream.name] : [];
  });
}

function readJsonFile(
  file: string
):
  | { error: string; value?: undefined }
  | { error?: undefined; value: unknown } {
  if (!existsSync(file)) {
    return { error: `${file} does not exist` };
  }
  try {
    return { value: JSON.parse(readFileSync(file, "utf-8")) };
  } catch (error) {
    return { error: `${file} is not JSON: ${message(error)}` };
  }
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIPPED_DIRECTORIES.has(entry)) {
        continue;
      }
      const file = path.join(dir, entry);
      if (statSync(file).isDirectory()) {
        walk(file);
      } else if (/\.[cm]?ts$/u.test(entry)) {
        files.push(file);
      }
    }
  };
  if (existsSync(root)) {
    walk(root);
  }
  return files;
}

/**
 * Source files a deployment ships. Test files never pin a running image, and
 * this command reads pins for every provider, so neither one is a pin.
 */
function pinnedSourceFiles(root: string): string[] {
  const self = samePathKey(admissionScriptPath);
  return sourceFiles(root).filter(
    (candidate) =>
      !/\.test\.[cm]?ts$/u.test(candidate) && samePathKey(candidate) !== self
  );
}

function samePathKey(file: string) {
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

/** Parses JSON with `//` and block comments and trailing commas (wrangler.jsonc). */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next;
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      out += "\n";
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replaceAll(/,(?<tail>\s*[}\]])/gu, "$<tail>"));
}

/**
 * Redacts secrets, then flattens and bounds text for a check detail.
 *
 * Redaction runs on the full text first, so a bound can never split a secret
 * and leave a readable prefix in the report.
 */
function boundedText(value: string, max = 400) {
  const flat = sanitizeConnectorFailureText(value)
    .replaceAll(/\s+/gu, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * One error becomes report text. Every error can carry connector output, so
 * the text passes through redaction and a bound before a detail holds it.
 */
function message(error: unknown) {
  return boundedText(error instanceof Error ? error.message : String(error));
}

// ---------------------------------------------------------------------------
// CLI

export function formatReport(report: AdmissionReport): string {
  const lines = [`provider admission: ${report.provider}`];
  for (const check of report.checks) {
    lines.push(
      `  ${check.status === "passed" ? "PASS" : "FAIL"} ${check.id.padEnd(21)} ${check.detail}`
    );
  }
  const failed = report.checks.filter((check) => check.status === "failed");
  lines.push(
    report.passed
      ? `RESULT PASS ${report.provider}: ${report.checks.length} check(s) passed`
      : `RESULT FAIL ${report.provider}: ${failed.map((check) => check.id).join(", ")}`
  );
  return lines.join("\n");
}

export interface CliArgs {
  deployment?: string;
  expectWrapperVersion?: string;
  fixtures?: string;
  image?: string;
  images?: string;
  json: boolean;
  live: boolean;
  provider?: string;
  sourceConfig?: string;
  wrangler?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false, live: false };
  const valued: Record<string, keyof CliArgs> = {
    "--deployment": "deployment",
    "--expect-wrapper-version": "expectWrapperVersion",
    "--fixtures": "fixtures",
    "--image": "image",
    "--images": "images",
    "--provider": "provider",
    "--source-config": "sourceConfig",
    "--wrangler": "wrangler",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] ?? "";
    if (flag === "--") {
      continue;
    }
    if (flag === "--json") {
      args.json = true;
    } else if (flag === "--live") {
      args.live = true;
    } else if (flag in valued) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${flag} needs a value`);
      }
      const key = valued[flag] as Exclude<keyof CliArgs, "json" | "live">;
      args[key] = value;
      i += 1;
    } else {
      throw new Error(`unknown argument ${flag}`);
    }
  }
  if (!args.provider) {
    throw new Error("--provider <id> is required");
  }
  if (args.image || args.sourceConfig) {
    args.live = true;
  }
  return args;
}

export function optionsFromCliArgs(
  args: CliArgs,
  cwd = process.cwd()
): ProviderAdmissionOptions {
  const deploymentRoot = path.resolve(
    cwd,
    args.deployment ?? referenceDeploymentRoot
  );
  const wranglerConfigPath = args.wrangler
    ? path.resolve(cwd, args.wrangler)
    : ([
        path.join(deploymentRoot, "wrangler.jsonc"),
        path.join(deploymentRoot, "worker", "wrangler.jsonc"),
      ].find((candidate) => existsSync(candidate)) ??
      path.join(deploymentRoot, "wrangler.jsonc"));
  const deploymentImages = path.join(deploymentRoot, "images");
  let imagesDir = referenceImagesDir;
  if (args.images) {
    imagesDir = path.resolve(cwd, args.images);
  } else if (existsSync(deploymentImages)) {
    imagesDir = deploymentImages;
  }
  return {
    deploymentRoot,
    expectedWrapperVersion: args.expectWrapperVersion,
    fixturesDir: path.resolve(cwd, args.fixtures ?? packageFixturesDir),
    imagesDir,
    live: args.live
      ? {
          image: args.image,
          sourceConfigPath: args.sourceConfig
            ? path.resolve(cwd, args.sourceConfig)
            : undefined,
        }
      : undefined,
    provider: args.provider ?? "",
    wranglerConfigPath,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = parseCliArgs(process.argv.slice(2));
  const report = await admitProvider(optionsFromCliArgs(args));
  console.log(
    args.json ? JSON.stringify(report, null, 2) : formatReport(report)
  );
  process.exit(report.passed ? 0 : 1);
}
