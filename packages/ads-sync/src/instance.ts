import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u);
const postgresIdentifierSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z_][a-z0-9_]*$/u);
const planetScaleBranchIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/u);
const cloudflareNamespaceIdSchema = z.string().regex(/^[a-f0-9]{32}$/u);
const adsSyncContainerNamespaceIdsSchema = z.strictObject({
  AIRBYTE_GOOGLE_ADS_SOURCE: cloudflareNamespaceIdSchema,
  AIRBYTE_META_ADS_SOURCE: cloudflareNamespaceIdSchema,
  AIRBYTE_POSTGRES_DESTINATION: cloudflareNamespaceIdSchema,
});
const postgresHostSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u);

const PLACEHOLDER_IDENTITY_VALUES = new Set([
  "client-key",
  "database",
  "host",
  "instance-key",
  "organization",
  "placeholder",
  "role",
  "your-client",
]);
const PLACEHOLDER_HOST_VALUES = new Set(["your-host.pg.psdb.cloud"]);

const isPlaceholderIdentity = (value: string, field: string) => {
  const normalized = value.trim().toLowerCase();
  return (
    PLACEHOLDER_IDENTITY_VALUES.has(normalized) ||
    (field === "host" && PLACEHOLDER_HOST_VALUES.has(normalized))
  );
};

export const adsSyncInstanceModeSchema = z.enum([
  "provisioning",
  "disabled",
  "canary",
  "backfill",
  "scheduled",
]);

export const adsSyncConnectionProfileSchema = z.enum([
  "google_ads_default",
  "meta_ads_performance",
  "meta_ads_metadata",
]);

const qualificationEvidenceSchema = z.strictObject({
  completedAt: z.iso.datetime(),
  evidenceRef: z.string().min(1),
  runId: z.string().min(1),
});

const adsSyncPlacementSchema = z.union([
  z.strictObject({
    region: z.literal("aws:us-west-2"),
  }),
  z.strictObject({
    mode: z.literal("default"),
  }),
]);

const adsSyncInstanceIdentityShape = {
  clientKey: slugSchema,
  connections: z.array(adsSyncConnectionProfileSchema).min(1),
  containerNamespaceIds: adsSyncContainerNamespaceIdsSchema,
  containerNameSuffix: slugSchema.optional(),
  hyperdriveId: z.string().regex(/^[a-f0-9]{32}$/u),
  instanceKey: slugSchema,
  placement: adsSyncPlacementSchema,
  postgres: z.strictObject({
    airbyteRole: postgresIdentifierSchema,
    branch: slugSchema,
    branchId: planetScaleBranchIdSchema,
    database: slugSchema,
    host: postgresHostSchema,
    migrationRole: postgresIdentifierSchema,
    organization: slugSchema,
    port: z.number().int().positive().max(65_535).default(5432),
    postgresDatabase: postgresIdentifierSchema.default("postgres"),
    runtimeRole: postgresIdentifierSchema,
  }),
  resourcePrefix: slugSchema,
} as const;

export const adsSyncInstanceV1SpecSchema = z
  .strictObject({
    ...adsSyncInstanceIdentityShape,
    mode: adsSyncInstanceModeSchema,
    qualification: z
      .strictObject({
        backfill: qualificationEvidenceSchema.optional(),
        canary: qualificationEvidenceSchema.optional(),
        comparison: qualificationEvidenceSchema.optional(),
      })
      .optional(),
    schemaVersion: z.literal(1),
  })
  .superRefine((spec, context) => {
    if (
      spec.qualification?.comparison &&
      !/^ads-sync-comparison:sha256:[a-f0-9]{64}$/u.test(
        spec.qualification.comparison.evidenceRef
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "comparison qualification requires an Ads Sync comparison artifact hash reference.",
        path: ["qualification", "comparison", "evidenceRef"],
      });
    }
    if (
      ["backfill", "scheduled"].includes(spec.mode) &&
      !spec.qualification?.canary
    ) {
      context.addIssue({
        code: "custom",
        message: `${spec.mode} mode requires durable canary evidence.`,
        path: ["qualification", "canary"],
      });
    }
    if (spec.mode === "scheduled") {
      for (const evidence of ["backfill", "comparison"] as const) {
        if (!spec.qualification?.[evidence]) {
          context.addIssue({
            code: "custom",
            message: `scheduled mode requires durable ${evidence} evidence.`,
            path: ["qualification", evidence],
          });
        }
      }
    }
  });

export const adsSyncInstanceV2SpecSchema = z
  .strictObject({
    ...adsSyncInstanceIdentityShape,
    schemaVersion: z.literal(2),
  })
  .superRefine((spec, context) => {
    if (!spec.resourcePrefix.includes(spec.clientKey)) {
      context.addIssue({
        code: "custom",
        message: "resourcePrefix must contain clientKey.",
        path: ["resourcePrefix"],
      });
    }
    if (!spec.resourcePrefix.includes("ads-sync")) {
      context.addIssue({
        code: "custom",
        message: 'resourcePrefix must contain the "ads-sync" namespace.',
        path: ["resourcePrefix"],
      });
    }

    const identityFields = [
      ["clientKey", spec.clientKey],
      ["instanceKey", spec.instanceKey],
      ["resourcePrefix", spec.resourcePrefix],
      ["postgres", "organization", spec.postgres.organization],
      ["postgres", "database", spec.postgres.database],
      ["postgres", "branch", spec.postgres.branch],
      ["postgres", "host", spec.postgres.host],
      ["postgres", "migrationRole", spec.postgres.migrationRole],
      ["postgres", "runtimeRole", spec.postgres.runtimeRole],
      ["postgres", "airbyteRole", spec.postgres.airbyteRole],
    ] as const;
    for (const field of identityFields) {
      const value = field.at(-1);
      if (
        typeof value === "string" &&
        isPlaceholderIdentity(value, field.at(-2) ?? field[0])
      ) {
        context.addIssue({
          code: "custom",
          message: `Placeholder identity is not allowed for ${field
            .slice(0, -1)
            .join(".")}.`,
          path: field.slice(0, -1),
        });
      }
    }
  });

export const adsSyncInstanceSpecSchema = z.discriminatedUnion("schemaVersion", [
  adsSyncInstanceV1SpecSchema,
  adsSyncInstanceV2SpecSchema,
]);

export type AdsSyncConnectionProfile = z.infer<
  typeof adsSyncConnectionProfileSchema
>;
export type AdsSyncInstanceMode = z.infer<typeof adsSyncInstanceModeSchema>;
export type AdsSyncInstanceV1Spec = z.infer<typeof adsSyncInstanceV1SpecSchema>;
export type AdsSyncInstanceV2Spec = z.infer<typeof adsSyncInstanceV2SpecSchema>;
export type AdsSyncInstanceSpec = z.infer<typeof adsSyncInstanceSpecSchema>;
export type AdsSyncInstanceSpecInput = z.input<
  typeof adsSyncInstanceSpecSchema
>;

const profileProvider = {
  google_ads_default: "google_ads",
  meta_ads_metadata: "meta_ads",
  meta_ads_performance: "meta_ads",
} as const;

const providerSecrets = {
  google_ads: {
    required: ["GOOGLE_ADS_SOURCE_CONFIG_JSON"],
    optional: ["GOOGLE_ADS_SOURCE_STATE_JSON"],
  },
  meta_ads: {
    required: ["META_ADS_SOURCE_CONFIG_JSON"],
    optional: ["META_ADS_SOURCE_STATE_JSON"],
  },
} as const;

export const defineAdsSyncInstance = (input: unknown): AdsSyncInstanceSpec => {
  const spec = adsSyncInstanceSpecSchema.parse(input);
  if (new Set(spec.connections).size !== spec.connections.length) {
    throw new Error("Ads Sync instance connection profiles must be unique.");
  }
  return spec;
};

export const resolveAdsSyncInstanceDeployment = (
  input: AdsSyncInstanceSpecInput
) => {
  const spec = defineAdsSyncInstance(input);
  const providers = [
    ...new Set(spec.connections.map((profile) => profileProvider[profile])),
  ].toSorted();
  const common = {
    clientKey: spec.clientKey,
    connectionProfiles: spec.connections,
    containerNamespaceIds: spec.containerNamespaceIds,
    ...(spec.containerNameSuffix
      ? { containerNameSuffix: spec.containerNameSuffix }
      : {}),
    hyperdriveId: spec.hyperdriveId,
    instanceKey: spec.instanceKey,
    optionalSecretNames: providers.flatMap(
      (provider) => providerSecrets[provider].optional
    ),
    placement: spec.placement,
    postgres: spec.postgres,
    providers,
    r2Name: `${spec.resourcePrefix}-raw`,
    requiredSecretNames: [
      "ADS_SYNC_RUNNER_TOKEN",
      "POSTGRES_DESTINATION_CONFIG_JSON",
      ...providers.flatMap((provider) => providerSecrets[provider].required),
    ],
    workerName: `${spec.resourcePrefix}-container-runner`,
    workflowName: `${spec.resourcePrefix}-workflow`,
  } as const;
  if (spec.schemaVersion === 2) {
    return {
      ...common,
      crons: ["*/15 * * * *"],
      disabled: false,
      schemaVersion: 2,
    } as const;
  }
  const active = ["canary", "backfill", "scheduled"].includes(spec.mode);
  return {
    ...common,
    crons: spec.mode === "scheduled" ? ["*/15 * * * *"] : [],
    disabled: !active,
    mode: spec.mode,
    schemaVersion: 1,
  } as const;
};

export interface AdsSyncModeTransitionEvidence {
  backfillComplete?: boolean;
  canaryPassed?: boolean;
  comparisonPassed?: boolean;
}

export const planAdsSyncModeTransition = ({
  evidence = {},
  from,
  to,
}: {
  evidence?: AdsSyncModeTransitionEvidence;
  from: AdsSyncInstanceMode;
  to: AdsSyncInstanceMode;
}) => {
  if (from === to) {
    return { changed: false, from, requiredEvidence: [], to } as const;
  }
  if (to === "disabled") {
    return { changed: true, from, requiredEvidence: [], to } as const;
  }
  const allowed =
    (from === "disabled" && to === "canary") ||
    (from === "canary" && to === "backfill") ||
    (from === "canary" && to === "scheduled") ||
    (from === "backfill" && to === "scheduled");
  if (!allowed) {
    throw new Error(`Unsupported Ads Sync mode transition: ${from} -> ${to}`);
  }
  let requiredEvidence: (keyof AdsSyncModeTransitionEvidence)[] = [];
  if (to === "backfill") {
    requiredEvidence = ["canaryPassed"];
  } else if (to === "scheduled") {
    requiredEvidence = ["canaryPassed", "backfillComplete", "comparisonPassed"];
  }
  const missing = requiredEvidence.filter((key) => evidence[key] !== true);
  if (missing.length > 0) {
    throw new Error(
      `Ads Sync transition ${from} -> ${to} is missing evidence: ${missing.join(", ")}`
    );
  }
  return { changed: true, from, requiredEvidence, to } as const;
};
