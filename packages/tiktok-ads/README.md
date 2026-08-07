# @patronage/tiktok-ads

Worker-safe TikTok Ads primitives for Patronage Core. Credentials and `fetch` are injected by the caller.

## Live-verification status

No operation in this package has been executed against the live TikTok API. All coverage is unit-level and uses an injected `fetch` implementation. Endpoint paths, request shapes, response envelopes, and enum values are verified against documentation only, not observed provider behavior.

Before using this package for real client work, run a live read-only verification pass against a real account and replace the hand-authored test fixtures with captured real responses. A mocked fixture can encode the author's assumption rather than the API's actual contract. Credentials are not currently held, so this verification cannot be performed today.

## Documentation access constraint

TikTok's official documentation portal at `business-api.tiktok.com/portal/docs` is login-gated. Unauthenticated fetches return HTTP 200 with a JavaScript application shell and no article content, so those URLs cannot be verification evidence for a reviewer, agent, or CI. An independent audit found 29 of this package's 36 citations in that state.

Use the official [`tiktok/tiktok-business-api-sdk`](https://github.com/tiktok/tiktok-business-api-sdk) repository at a pinned commit SHA through `raw.githubusercontent.com` instead. Do not add portal URLs as citations when extending this package. When the SDK does not model a surface—Events API 2.0 is the known case—state that limitation explicitly rather than citing the portal.
