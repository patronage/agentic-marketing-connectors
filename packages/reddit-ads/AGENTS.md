# Reddit Ads package

This package has never been executed against the live Reddit Ads API. Tests use injected `fetch` and hand-authored fixtures; documentation is the only verification source for endpoint paths, request shapes, response envelopes, and enum values.

Credentials are not currently held. Before any real client use, perform a live read-only verification against a real account and replace invented fixtures with captured provider responses. A mocked fixture can encode an author's assumption rather than the API's actual contract.

Follow the repository-level `AGENTS.md` and package conventions in [`../README.md`](../README.md) for all other guidance.

## Self-cleanup after live verification

Once this package has been verified against live Reddit Ads API responses, DELETE this `AGENTS.md` and remove the corresponding live-verification section from the package README. These files exist only to carry a temporary caveat; leaving them in place after verification makes them stale and misleading.
