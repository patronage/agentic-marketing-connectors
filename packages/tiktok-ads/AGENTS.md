# TikTok Ads package

Read [README.md](README.md) before changing this package. It records the required live read-only verification pass before any real client use: no package operation has yet been executed against the live TikTok API because credentials are not currently held.

The TikTok documentation portal is login-gated; use pinned raw files from the official `tiktok/tiktok-business-api-sdk` repository as citation evidence, and state SDK gaps explicitly rather than citing a portal URL.

Follow the repository-level `AGENTS.md` and [../README.md](../README.md) for deep-module, connector-safety, import-boundary, and verification conventions.

## Remove this file once live verification is complete

This file and the "Live Verification Required" section of [README.md](README.md) exist only to carry a temporary caveat. Once this package has been verified against live TikTok API responses — and the hand-authored test fixtures have been replaced with captured real responses — DELETE this `AGENTS.md` and remove that README section. Leaving them in place after verification makes them stale and misleading.
