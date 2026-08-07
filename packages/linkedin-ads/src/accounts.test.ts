import { describe, expect, it, vi } from "vitest";

import {
  createLinkedInAccountsClient,
  LINKEDIN_AD_ACCOUNT_ROLES,
} from "./accounts.js";

describe(createLinkedInAccountsClient, () => {
  it("lists users for the configured ad account", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [
          {
            account: "urn:li:sponsoredAccount:12345",
            changeAuditStamps: { created: { time: 1_500_331_577_000 } },
            role: "CAMPAIGN_MANAGER",
            user: "urn:li:person:abc",
          },
        ],
        paging: { total: 1 },
      })
    );
    const client = createLinkedInAccountsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.listAdAccountUsers()).resolves.toMatchObject({
      total: 1,
      users: [{ role: "CAMPAIGN_MANAGER" }],
    });
    expect(LINKEDIN_AD_ACCOUNT_ROLES).toContain("ACCOUNT_BILLING_ADMIN");
    const rawUrl = String(fetchMock.mock.calls[0]?.[0]);
    const url = new URL(rawUrl);
    expect(url.pathname).toBe("/rest/adAccountUsers");
    expect(url.searchParams.get("q")).toBe("accounts");
    expect(rawUrl).toContain(
      "accounts=List(urn%3Ali%3AsponsoredAccount%3A12345)"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "LinkedIn-Version": "202606",
      "X-Restli-Protocol-Version": "2.0.0",
    });
  });

  it("reports undocumented account roles without discarding the collection", async () => {
    const client = createLinkedInAccountsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          elements: [
            {
              account: "urn:li:sponsoredAccount:12345",
              role: "OWNER",
              user: "urn:li:person:abc",
            },
          ],
        })
      ),
    });

    await expect(client.listAdAccountUsers()).resolves.toMatchObject({
      rejected: {
        count: 1,
        reasons: [expect.stringContaining("role is unsupported")],
      },
      users: [],
    });
  });

  it("reports an account with an unknown serving status without losing valid accounts", async () => {
    const client = createLinkedInAccountsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          elements: [
            {
              currency: "USD",
              id: 1,
              name: "Valid",
              status: "ACTIVE",
              test: false,
              type: "BUSINESS",
            },
            {
              currency: "USD",
              id: 2,
              name: "Future hold",
              servingStatuses: ["FUTURE_HOLD"],
              status: "ACTIVE",
              test: false,
              type: "BUSINESS",
            },
          ],
        })
      ),
    });

    await expect(client.searchAdAccounts()).resolves.toMatchObject({
      accounts: [{ id: "1" }],
      rejected: {
        count: 1,
        reasons: [
          expect.stringContaining("servingStatuses contains unsupported"),
        ],
      },
    });
  });

  it("searches accessible accounts with cursor pagination", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [
          {
            currency: "USD",
            id: 507_404_993,
            name: "Dunder Mifflin Account",
            servingStatuses: ["BILLING_HOLD"],
            status: "ACTIVE",
            test: false,
            type: "BUSINESS",
          },
        ],
        metadata: { nextPageToken: "next_token" },
      })
    );
    const client = createLinkedInAccountsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.searchAdAccounts({
        pageSize: 50,
        sortOrder: "DESCENDING",
        statuses: ["ACTIVE", "CANCELED"],
        test: false,
        types: ["BUSINESS"],
      })
    ).resolves.toMatchObject({
      accounts: [{ id: "507404993", servingStatuses: ["BILLING_HOLD"] }],
      nextPageToken: "next_token",
    });
    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("/rest/adAccounts?");
    expect(requestUrl).toContain("q=search");
    expect(requestUrl).toContain(
      "search=(type:(values:List(BUSINESS)),status:(values:List(ACTIVE,CANCELED)),test:false)"
    );
    expect(requestUrl).toContain("pageSize=50");
  });

  it("finds account access for the authenticated user", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [
          {
            account: "urn:li:sponsoredAccount:12345",
            role: "VIEWER",
            user: "urn:li:person:abc",
          },
        ],
        paging: { total: 1 },
      })
    );
    const client = createLinkedInAccountsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.listAuthenticatedUserAdAccountAccess()
    ).resolves.toMatchObject({ total: 1, users: [{ role: "VIEWER" }] });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/rest/adAccountUsers");
    expect(url.searchParams.get("q")).toBe("authenticatedUser");
    expect(url.searchParams.has("accounts")).toBeFalsy();
  });

  it("reads one account user by its composite key", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        account: "urn:li:sponsoredAccount:516986977",
        role: "CAMPAIGN_MANAGER",
        user: "urn:li:person:_mVMF2Kp8p",
      })
    );
    const client = createLinkedInAccountsClient({
      accessToken: "token",
      adAccountId: "516986977",
      fetch: fetchMock,
    });

    await expect(
      client.getAdAccountUser("urn:li:person:_mVMF2Kp8p")
    ).resolves.toMatchObject({ role: "CAMPAIGN_MANAGER" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/rest/adAccountUsers/(account:urn%3Ali%3AsponsoredAccount%3A516986977,user:urn%3Ali%3Aperson%3A_mVMF2Kp8p)"
    );
  });
});
