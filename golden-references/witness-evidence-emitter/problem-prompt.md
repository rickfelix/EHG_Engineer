# Problem — witness-evidence emitter

**Domain**: an action needs a *witness* — a durable record proving it happened and
what it observed, checkable later by re-reading state. Gates, merges, and sub-agent
runs all depend on witnesses; when a witness lies, a gate goes green on nothing.

**Reuse evidence** (why this domain earned a golden reference):
- **The test-masking / mocked-gate-green class** (`reference_test_masking`): a
  test or gate asserts a success it never observed — the witness is a boolean
  set by the code that wanted to pass, not by reading what happened.
- **The estate's real witness family** shows both the right shape and a pattern
  to NOT copy for gate witnesses:
  - `merge_witness_telemetry` (written by `lib/ship/merge-witness-telemetry.mjs`)
    records CONTENT, not a boolean — a `rungs` array of `{id, status, reason}`
    plus an `overall` enum and `evaluated_at`; it is verified by identity-read
    in `lib/ship/witness-adoption.mjs`. Good: content + verify-by-read.
    But it is **deliberately best-effort** — its writer swallows failures and
    returns `{ok:false}` so a telemetry write can never affect a merge lane.
    That swallow is CORRECT for observe-only telemetry and **WRONG for a
    gate-bearing witness**: a gate whose witness write can silently fail is a
    gate that greens on nothing.
  - `sub_agent_execution_results` records the observed verdict + `metadata.repo_path`
    and is verified by the `SUB_AGENT_REPO_RESOLUTION` gate reading the row —
    again content + verify-by-read.
- **Two witness intents** the reference distills: *observe-only telemetry*
  (best-effort, may swallow) vs *gate-bearing evidence* (must be atomic with the
  action and independently verifiable). This reference teaches the second.

The witness shape here (`{action, observed_result, evidence_hash, verified}`) is a
DISTILLATION of those estate shapes, not a new invention — field names are
illustrative; the doctrines are the point.

**Task shape a delegate will face**: build the witness for a new governed action
(different action, different observed content), preserving every invariant.
