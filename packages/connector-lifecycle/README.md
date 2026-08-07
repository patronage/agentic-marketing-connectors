# @patronage/connector-lifecycle

Provider-neutral contracts for guarded connector mutations. The package owns JSON-safe receipt shapes, deterministic plan fingerprints, resume checks, and conformance assertions. Provider packages own planning, provider validation, execution, reconciliation, and provider-specific evidence.

Receipts are caller-persisted operation evidence. They are not Loop Run Records and this package does not own persistence, campaign models, credentials, or an execution engine.

The package is a declared deep module under the reusable #687 convention. Its single root interface and safety tests protect the provider-neutral seam; private implementation and dependency cycles are checked by `pnpm check:boundaries`.

## Runnable tutorial

[`examples/guarded-mutation-receipt.ts`](examples/guarded-mutation-receipt.ts) shows the complete plan, provider-validation, and execution receipt sequence with synthetic provider evidence.
