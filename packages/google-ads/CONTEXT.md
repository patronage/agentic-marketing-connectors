# Google Ads Connector Context

The Google Ads connector provides Worker-safe Google Ads primitives with selective compatibility for supported Patronage workflows. This glossary is the canonical domain language for Google Ads connector code, specs, issues, and architecture decisions.

## Language

**Worker-Safe Google Ads REST Adapter**: A fetch-based Google Ads implementation that runs in Cloudflare Workers and selectively preserves the `google-ads-api` semantics needed by supported Paitronage tools. _Avoid_: Google Ads API port, full `google-ads-api` mirror

**Selective Compatibility**: Compatibility with the upstream `google-ads-api` package only for the row shapes, enums, request semantics, and tests required by Paitronage-supported Google Ads workflows. _Avoid_: Full parity, complete clone

**Upstream Reuse Boundary**: The rule that MIT-licensed `google-ads-api` code or tests may be reused when it prevents wheel reinvention, but only behind generation, development, or test surfaces that do not pull Node-only dependencies into the Worker-safe package. _Avoid_: Runtime dependency on upstream Node internals

**Migration Guide**: Public documentation that helps users move supported workflows from `google-ads-api` to `@patronage/google-ads` without promising full interface-name parity. _Avoid_: Drop-in replacement claim

**Parity Harness**: Tests and fixtures that compare supported `@patronage/google-ads` behavior with upstream `google-ads-api` semantics. _Avoid_: Full upstream test suite mirror

**Campaign Brief**: A validated campaign intent artifact containing the campaign settings, targeting, creative, and other provider-ready inputs required to plan a deployment. Partially parsed or invalid source content is not a Campaign Brief. _Avoid_: Raw brief file, unchecked campaign JSON, deployment receipt

## Relationships

- The **Worker-Safe Google Ads REST Adapter** implements **Selective Compatibility** rather than mirroring the full upstream library.
- The **Upstream Reuse Boundary** permits upstream semantics and fixtures without admitting Node-only runtime dependencies.
- The **Migration Guide** documents supported workflows, while the **Parity Harness** proves their compatible behavior.
- A **Campaign Brief** is valid before deployment planning begins; deployment receipts record execution evidence rather than campaign intent.
