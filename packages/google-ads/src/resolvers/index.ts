import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsClient } from "../rest/index.js";

export interface NamedResource {
  id: string;
  name: string;
  resourceName: string;
}

export function resolveCampaign(
  client: GoogleAdsClient,
  input: { customerId: string; value: string }
): Promise<NamedResource> {
  return resolveNamedResource(client, {
    ...input,
    idField: "campaign.id",
    nameField: "campaign.name",
    resource: "campaign",
    resourceNameField: "campaign.resource_name",
  });
}

export function resolveAdGroup(
  client: GoogleAdsClient,
  input: { customerId: string; value: string }
): Promise<NamedResource> {
  return resolveNamedResource(client, {
    ...input,
    idField: "ad_group.id",
    nameField: "ad_group.name",
    resource: "ad_group",
    resourceNameField: "ad_group.resource_name",
  });
}

export async function resolveGeoTarget(
  client: GoogleAdsClient,
  input: { customerId: string; value: string }
): Promise<NamedResource> {
  const aliases: Record<string, string> = {
    america: "United States",
    us: "United States",
    usa: "United States",
    "united states of america": "United States",
  };
  const rawValue = input.value.trim();
  const value = aliases[rawValue.toLowerCase()] ?? rawValue;
  if (/^\d+$/u.test(value)) {
    return {
      id: value,
      name: value,
      resourceName: `geoTargetConstants/${value}`,
    };
  }
  const escaped = escapeGaql(value);
  const result = await client.search({
    customerId: input.customerId,
    query: `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.resource_name FROM geo_target_constant WHERE geo_target_constant.name = '${escaped}' LIMIT 2`,
  });
  return uniqueRow(result.rows, "geoTargetConstant", value);
}

export function languageResource(language: string): string {
  const normalized = language.trim().toLowerCase();
  const id = (
    {
      chinese: "1017",
      de: "1001",
      en: "1000",
      english: "1000",
      es: "1003",
      fr: "1002",
      french: "1002",
      german: "1001",
      ja: "1005",
      japanese: "1005",
      ko: "1012",
      korean: "1012",
      portuguese: "1014",
      pt: "1014",
      spanish: "1003",
      zh: "1017",
    } as Record<string, string>
  )[normalized];
  if (!id && !/^\d+$/u.test(normalized)) {
    throw new Error(
      `Unknown language: ${language}. Use a language constant ID.`
    );
  }
  return `languageConstants/${id ?? normalized}`;
}

async function resolveNamedResource(
  client: GoogleAdsClient,
  input: {
    customerId: string;
    idField: string;
    nameField: string;
    resource: "ad_group" | "campaign";
    resourceNameField: string;
    value: string;
  }
): Promise<NamedResource> {
  const value = input.value.trim();
  const condition = /^\d+$/u.test(value)
    ? `${input.idField} = ${value}`
    : `${input.nameField} = '${escapeGaql(value)}'`;
  const result = await client.search({
    customerId: normalizeCustomerId(input.customerId),
    query: `SELECT ${input.idField}, ${input.nameField}, ${input.resourceNameField} FROM ${input.resource} WHERE ${condition} LIMIT 2`,
  });
  return uniqueRow(result.rows, camel(input.resource), value);
}

function uniqueRow(
  rows: Record<string, unknown>[],
  key: string,
  value: string
): NamedResource {
  if (rows.length !== 1) {
    throw new Error(
      rows.length === 0
        ? `No resource matched ${value}.`
        : `Resource name ${value} is ambiguous.`
    );
  }
  const resource = record(rows[0]?.[key] ?? rows[0]?.[snake(key)]);
  const id = String(resource.id ?? "");
  const name = String(resource.name ?? value);
  const resourceName = String(
    resource.resourceName ?? resource.resource_name ?? ""
  );
  if (!(id && resourceName)) {
    throw new Error(`Google Ads returned an incomplete resource for ${value}.`);
  }
  return { id, name, resourceName };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeGaql(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}
function camel(value: string): string {
  return value.replaceAll(/_(?<letter>[a-z])/gu, (_, letter: string) =>
    letter.toUpperCase()
  );
}
function snake(value: string): string {
  return value.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
