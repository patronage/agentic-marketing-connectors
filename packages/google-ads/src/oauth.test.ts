import { describe, expect, it, vi } from "vitest";

import {
  createGoogleOAuthRefreshAdapter,
  GoogleOAuthRefreshError,
} from "./oauth.js";

const credentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};

describe(createGoogleOAuthRefreshAdapter, () => {
  it("coalesces concurrent refreshes and caches outside expiry skew", async () => {
    let now = 1000;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ access_token: "access-token", expires_in: 120 })
      );
    const adapter = createGoogleOAuthRefreshAdapter({
      credentials,
      fetch: fetchMock,
      now: () => now,
    });

    await expect(
      Promise.all([adapter.getAccessToken(), adapter.getAccessToken()])
    ).resolves.toStrictEqual(["access-token", "access-token"]);
    now += 59_000;
    await expect(adapter.getAccessToken()).resolves.toBe("access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refreshes deterministically inside expiry skew", async () => {
    let now = 1000;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "first", expires_in: 120 })
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: "second", expires_in: 120 })
      );
    const adapter = createGoogleOAuthRefreshAdapter({
      credentials,
      fetch: fetchMock,
      now: () => now,
    });

    await adapter.getAccessToken();
    now += 60_000;
    await expect(adapter.getAccessToken()).resolves.toBe("second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns sanitized typed provider failures", async () => {
    const adapter = createGoogleOAuthRefreshAdapter({
      credentials,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: "invalid_grant",
            error_description: credentials.refreshToken,
          },
          { headers: { "x-request-id": "request-1" }, status: 400 }
        )
      ),
    });

    let captured: unknown;
    try {
      await adapter.getAccessToken();
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(GoogleOAuthRefreshError);
    expect(captured).toMatchObject({
      code: "invalid_grant",
      kind: "provider",
      providerRequestId: "request-1",
      status: 400,
    });
    expect(String(captured)).not.toContain(credentials.clientSecret);
    expect(String(captured)).not.toContain(credentials.refreshToken);
    expect((captured as Error).message).toBe(
      "Google OAuth token refresh was rejected."
    );
    expect((captured as Error).cause).toBeUndefined();
    expect(JSON.stringify(captured)).not.toContain(credentials.clientSecret);
    expect(JSON.stringify(captured)).not.toContain(credentials.refreshToken);
  });

  it.each([null, [], { access_token: 123, expires_in: "3600" }])(
    "maps malformed JSON %j to a typed invalid-response error",
    async (body) => {
      const adapter = createGoogleOAuthRefreshAdapter({
        credentials,
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(Response.json(body, { status: 400 })),
      });

      await expect(adapter.getAccessToken()).rejects.toMatchObject({
        kind: "invalid-response",
        name: "GoogleOAuthRefreshError",
        status: 400,
      });
    }
  );

  it("drops a provider error code that contains credential material", async () => {
    const adapter = createGoogleOAuthRefreshAdapter({
      credentials,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ error: credentials.refreshToken }, { status: 400 })
        ),
    });

    let captured: unknown;
    try {
      await adapter.getAccessToken();
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({ code: undefined, kind: "provider" });
    expect(String(captured)).not.toContain(credentials.refreshToken);
    expect((captured as Error).message).not.toContain(credentials.refreshToken);
    expect((captured as Error).cause).toBeUndefined();
    expect(JSON.stringify(captured)).not.toContain(credentials.refreshToken);
  });

  it("sanitizes transport failures and allows a later refresh", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error(`failed ${credentials.clientSecret}`))
      .mockResolvedValueOnce(
        Response.json({ access_token: "recovered", expires_in: 120 })
      );
    const adapter = createGoogleOAuthRefreshAdapter({
      credentials,
      fetch: fetchMock,
    });

    const first = adapter.getAccessToken();
    await expect(first).rejects.toMatchObject({ kind: "transport" });
    await expect(adapter.getAccessToken()).resolves.toBe("recovered");
    await expect(first.catch(String)).resolves.not.toContain(
      credentials.clientSecret
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
