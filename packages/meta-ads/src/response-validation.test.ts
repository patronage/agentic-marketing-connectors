import { describe, expect, it, vi } from "vitest";

import { createMetaAdsClient } from "./index.js";

describe("Meta response validation", () => {
  it.each([
    ["missing data", { paging: {} }],
    ["non-array data", { data: {}, paging: {} }],
    ["invalid next cursor", { data: [], paging: { next: 42 } }],
  ])(
    "rejects a malformed successful insights envelope: %s",
    async (_name, body) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(body, {
          headers: { "x-fb-trace-id": "trace-safe" },
        })
      );
      const client = createMetaAdsClient({
        accessToken: "secret-token",
        adAccountId: "act_123",
        apiVersion: "v99.0",
        fetch: fetchMock,
      });

      await expect(
        client.getInsights({
          level: "campaign",
          since: "2026-07-01",
          until: "2026-07-02",
        })
      ).rejects.toMatchObject({
        message:
          "Meta Graph API returned an invalid response for /act_123/insights.",
        name: "MetaAdsContractDriftError",
        operation: "/act_123/insights",
        providerRequestId: "trace-safe",
        providerVersion: "v99.0",
      });
    }
  );

  it("rejects a malformed lead form item", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { data: [{ id: 42, name: "Newsletter" }] },
          { headers: { "x-fb-trace-id": "trace-form" } }
        )
      );
    const client = createMetaAdsClient({
      accessToken: "page-token",
      adAccountId: "act_unused",
      apiVersion: "v25.0",
      fetch: fetchMock,
    });

    await expect(
      client.listLeadForms({ pageId: "123_1" })
    ).rejects.toMatchObject({
      name: "MetaAdsContractDriftError",
      operation: "/123_1/leadgen_forms",
      providerRequestId: "trace-form",
      providerVersion: "v25.0",
    });
  });

  it("rejects malformed targeting sentence lines", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          data: [
            {
              id: "line-1",
              params: { geo_locations: { countries: ["US"] } },
              targetingsentencelines: "not-a-list",
            },
          ],
        },
        { headers: { "x-fb-trace-id": "trace-targeting" } }
      )
    );
    const client = createMetaAdsClient({
      accessToken: "ad-token",
      adAccountId: "act_unused",
      apiVersion: "v25.0",
      fetch: fetchMock,
    });

    await expect(
      client.listAdTargetingSentenceLines({ adId: "123_1" })
    ).rejects.toMatchObject({
      name: "MetaAdsContractDriftError",
      operation: "/123_1/targetingsentencelines",
      providerRequestId: "trace-targeting",
      providerVersion: "v25.0",
    });
  });

  it("rejects malformed lead field data", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          data: [
            {
              created_time: "2026-07-31T19:00:00+0000",
              field_data: [{ name: "email", values: "not-an-array" }],
              form_id: "form-1",
              id: "lead-1",
            },
          ],
        },
        { headers: { "x-fb-trace-id": "trace-lead" } }
      )
    );
    const client = createMetaAdsClient({
      accessToken: "lead-token",
      adAccountId: "act_unused",
      apiVersion: "v25.0",
      fetch: fetchMock,
    });

    await expect(client.getLeads({ formId: "123_2" })).rejects.toMatchObject({
      name: "MetaAdsContractDriftError",
      operation: "/123_2/leads",
      providerRequestId: "trace-lead",
      providerVersion: "v25.0",
    });
  });

  const validAdAccountResponse = {
    account_id: "123",
    account_status: 1,
    amount_spent: "12345",
    balance: "234",
    currency: "USD",
    funding_source: "payment-1",
    id: "act_123",
    name: "Patronage",
    spend_cap: "50000",
    timezone_id: 1,
    timezone_name: "America/Los_Angeles",
    timezone_offset_hours_utc: -7,
  };

  it.each([
    ["missing account_id", "account_id", undefined],
    ["unknown account_status", "account_status", 999],
    ["string timezone offset", "timezone_offset_hours_utc", "-7"],
    ["numeric funding source", "funding_source", 42],
  ] as const)(
    "rejects a malformed successful ad account response: %s",
    async (_name, field, invalidValue) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { ...validAdAccountResponse, [field]: invalidValue },
            { headers: { "x-fb-trace-id": "trace-account" } }
          )
        );
      const client = createMetaAdsClient({
        accessToken: "account-token",
        adAccountId: "act_123",
        apiVersion: "v25.0",
        fetch: fetchMock,
      });

      await expect(client.getAdAccount()).rejects.toMatchObject({
        name: "MetaAdsContractDriftError",
        operation: "/act_123",
        providerRequestId: "trace-account",
        providerVersion: "v25.0",
      });
    }
  );

  it("accepts an ad account response without conditional monetary fields", async () => {
    const {
      amount_spent: _amountSpent,
      balance: _balance,
      spend_cap: _spendCap,
      ...accountWithoutConditionalFields
    } = validAdAccountResponse;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(accountWithoutConditionalFields, {
        headers: { "x-fb-trace-id": "trace-account" },
      })
    );
    const client = createMetaAdsClient({
      accessToken: "account-token",
      adAccountId: "act_123",
      apiVersion: "v25.0",
      fetch: fetchMock,
    });

    await expect(client.getAdAccount()).resolves.toStrictEqual(
      accountWithoutConditionalFields
    );
  });

  it("rejects a malformed successful conversion response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { events_received: "1" },
          { headers: { "x-fb-trace-id": "trace-conversion" } }
        )
      );
    const client = createMetaAdsClient({
      accessToken: "pixel-token",
      adAccountId: "act_unused",
      apiVersion: "v25.0",
      fetch: fetchMock,
    });

    await expect(
      client.sendConversionEvents({
        events: {
          events: [
            {
              action_source: "email",
              event_name: "Lead",
              event_time: 1_779_553_200,
              user_data: { em: "a".repeat(64) },
            },
          ],
        },
        pixelId: "123_1",
      })
    ).rejects.toMatchObject({
      method: "POST",
      name: "MetaAdsAmbiguousWriteError",
      path: "/v25.0/123_1/events",
      providerRequestId: "trace-conversion",
    });
  });

  it("rejects malformed custom-audience sharing responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { data: [{ id: 456 }] },
          { headers: { "x-fb-trace-id": "trace-share-read" } }
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          { sharing_data: [{ ad_acct_id: "456" }], success: true },
          { headers: { "x-fb-trace-id": "trace-share-write" } }
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          { success: "true" },
          { headers: { "x-fb-trace-id": "trace-unshare-write" } }
        )
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      apiVersion: "v25.0",
      fetch: fetchMock,
    });

    await expect(
      client.listCustomAudienceAdAccounts({ audienceId: "123_1" })
    ).rejects.toMatchObject({
      name: "MetaAdsContractDriftError",
      operation: "/123_1/adaccounts",
      providerRequestId: "trace-share-read",
    });
    await expect(
      client.shareCustomAudience({
        adAccountIds: ["456"],
        audienceId: "123_1",
      })
    ).rejects.toMatchObject({
      method: "POST",
      name: "MetaAdsAmbiguousWriteError",
      path: "/v25.0/123_1/ad_accounts",
      providerRequestId: "trace-share-write",
    });
    await expect(
      client.unshareCustomAudience({
        adAccountIds: ["456"],
        audienceId: "123_1",
      })
    ).rejects.toMatchObject({
      method: "DELETE",
      name: "MetaAdsAmbiguousWriteError",
      path: "/v25.0/123_1/ad_accounts",
      providerRequestId: "trace-unshare-write",
    });
  });
});
