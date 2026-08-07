import { describe, expect, it, vi } from "vitest";

import type { BrowserSpawner } from "./google-oauth.js";
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  openGoogleAuthorizationUrl,
} from "./google-oauth.js";

describe("Google local OAuth", () => {
  it("builds a loopback authorization URL with state and offline access", () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({
        clientId: "client",
        redirectUri: "http://localhost:3000/oauth/callback",
        state: "state",
      })
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/oauth/callback"
    );
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
  it("exchanges a callback code", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        access_token: "token",
        expires_in: 3600,
        refresh_token: "refresh",
      })
    );
    await expect(
      exchangeGoogleAuthorizationCode({
        clientId: "client",
        clientSecret: "secret",
        code: "code",
        fetch: fetchMock,
        redirectUri: "http://localhost:3000/oauth/callback",
      })
    ).resolves.toMatchObject({ refresh_token: "refresh" });
  });
  it("keeps OAuth alive when the browser opener is unavailable", () => {
    let errorListener: ((error: Error) => void) | undefined;
    const unref = vi.fn<() => void>();
    const child = {
      once: vi.fn<(event: "error", listener: (error: Error) => void) => void>(
        (_event, listener) => {
          errorListener = listener;
        }
      ),
      unref,
    };
    const spawnProcess = vi.fn<BrowserSpawner>(() => child);
    const log = vi.fn<(message: string) => void>();

    openGoogleAuthorizationUrl(
      "https://accounts.google.com/auth",
      spawnProcess,
      log
    );
    errorListener?.(new Error("spawn open ENOENT"));

    expect(unref).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "Could not open a browser. Open the printed URL manually."
    );
  });
});
