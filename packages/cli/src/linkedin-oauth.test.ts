import { describe, expect, it, vi } from "vitest";

import {
  buildLinkedInAuthorizationUrl,
  exchangeLinkedInAuthorizationCode,
} from "./linkedin-oauth.js";

describe("LinkedIn local OAuth", () => {
  it("builds an authorization URL with callback state and ads scopes", () => {
    const url = new URL(
      buildLinkedInAuthorizationUrl({
        clientId: "client",
        redirectUri: "http://localhost:3001/oauth/callback",
        state: "state",
      })
    );
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toContain("rw_ads");
  });

  it("exchanges a callback code without exposing OAuth in the connector package", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ access_token: "token", expires_in: 3600 })
      );
    await expect(
      exchangeLinkedInAuthorizationCode({
        clientId: "client",
        clientSecret: "secret",
        code: "code",
        fetch: fetchMock,
        redirectUri: "http://localhost/callback",
      })
    ).resolves.toMatchObject({ access_token: "token" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
