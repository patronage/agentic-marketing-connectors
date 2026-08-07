import { afterEach, describe, expect, it, vi } from "vitest";

describe("connector safety contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads the root export without fetch access or runtime bootstrap", async () => {
    const fetchTrap = vi.fn<typeof fetch>(() => {
      throw new Error("root import must not touch fetch");
    });

    vi.stubGlobal("fetch", fetchTrap);

    vi.resetModules();
    const root = await import("./index.js");

    expect(Object.keys(root).toSorted()).toStrictEqual([
      "DEFAULT_GOOGLE_ADS_API_VERSION",
      "GoogleAdsContractError",
      "GoogleAdsRequestError",
      "createGoogleAdsClient",
      "runGoogleAdsReadCanary",
    ]);
    expect(fetchTrap).not.toHaveBeenCalled();
  });

  it("does not require global fetch until a client is constructed", async () => {
    // oxlint-disable-next-line no-useless-undefined -- explicitly stubbing fetch as undefined to simulate Worker runtime without a global fetch
    vi.stubGlobal("fetch", undefined);

    vi.resetModules();
    const root = await import("./index.js");

    expect(() =>
      root.createGoogleAdsClient({
        auth: { getAccessToken: async () => "token" },
        developerToken: "developer-token",
      })
    ).toThrow("A fetch implementation is required.");
  });

  it("allows callers to inject fetch instead of relying on runtime globals", async () => {
    // oxlint-disable-next-line no-useless-undefined -- explicitly stubbing fetch as undefined to simulate Worker runtime without a global fetch
    vi.stubGlobal("fetch", undefined);

    vi.resetModules();
    const root = await import("./index.js");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ results: [] }));
    const client = root.createGoogleAdsClient({
      auth: { getAccessToken: async () => "token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await client.search({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
