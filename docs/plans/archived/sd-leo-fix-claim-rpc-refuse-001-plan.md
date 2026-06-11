<!-- Archived from: C:/Users/rickf/.claude/plans/sd-claim-sd-foreign-claim-guard.md -->
<!-- SD Key: SD-LEO-FIX-CLAIM-RPC-REFUSE-001 -->
<!-- Archived at: 2026-06-09T15:01:10.608Z -->

# claim_sd RPC: refuse to overwrite a LIVE foreign claim (RPC-level dedup guard)

## Type
fix

## Priority
medium

## Target Application
EHG_Engineer

## Summary
The `claim_sd` Postgres RPC still overwrites an existing `claiming_session_id` when another live worker already holds the SD, so two idle workers self-claiming the same priority-ranked candidate in the same tick repeatedly STEAL it from each other (observed dce9048d vs 6f1b235c). The check-in-side advisory dedup (`isSdInFlight`, shipped via SD-FDBK-FIX-SELF-CLAIM-DEDUP-001) is racy and fails open, so it does not close the window — two callers can both pass it and both call `claim_sd`. This SD hardens the RPC itself: refuse to overwrite a claim held by a LIVE foreign session (fresh heartbeat). This is the RPC half only; the checkin-side advisory and the terminal-status guard (CLAIM-RPC-TERMINAL-001) already shipped and are explicitly out of scope.

## Scope
A function-only `CREATE OR REPLACE` migration on the `claim_sd` RPC that adds a foreign-live-claim guard: when the SD's `claiming_session_id` is non-null, belongs to a DIFFERENT session, and that session's heartbeat is fresh (live), `claim_sd` returns a `claimed_by_live_peer`-style result instead of stomping the claim. A force/takeover path must remain for legitimately stale claims (mirror the existing auto_stale_takeover threshold, e.g. heartbeat > 900s = takeover allowed). Reuse the existing liveness/heartbeat predicate; preserve all current grants and the existing return-shape contract.

## Key Principles
- Generate the migration programmatically from the authoritative latest defining migration (CRLF-normalize, extract the full CREATE...$function$, exact-string-insert the guard, CREATE OR REPLACE preserves grants) — the recipe used for prior fleet-critical fn edits.
- Confirm LIVE `pg_proc.prosrc` is byte-identical to the migration after deploy, and run the claim_sd regression suite BEFORE and AFTER.
- Preserve stale-takeover: a stale (dead-heartbeat) claim must STILL be claimable, or workers strand on dead peers' claims.
- Fail-safe: never make a same-session re-claim or a no-existing-claim path harder than today.

## Acceptance
- `claim_sd` refuses to overwrite a claim held by a different LIVE (fresh-heartbeat) session
- `claim_sd` STILL allows takeover of a STALE (dead-heartbeat) foreign claim
- Same-session re-claim and first-claim-of-unclaimed paths are unchanged
- Deployed function body byte-matches the migration; full regression suite passes before+after

## Risks
- Liveness false-positive stranding workers on a dead peer's claim (mitigation: gate the refusal on a FRESH heartbeat only; stale -> takeover allowed)
- Breaking the coordinator assignment path which legitimately (re)assigns (mitigation: preserve the force/assignment path; only block silent self-claim overwrite)
- High blast radius (fleet-critical RPC) — require byte-match + before/after regression

## Smoke Test Steps
1. Session A claims SD-X (fresh heartbeat); Session B calls claim_sd(SD-X) -> rejected (claimed_by_live_peer)
2. Session A's heartbeat goes stale (>900s); Session B calls claim_sd(SD-X) -> takeover succeeds
3. Session A calls claim_sd(SD-X) again (own claim) -> succeeds (idempotent re-claim)

## Success Metrics
- Repeated CONFLICT churn from two idle workers stealing one SD: target 0
- Stale-claim takeover still functional: target PASS
- claim_sd regression suite: target 100% before+after
