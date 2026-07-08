# Dispatch-Authorization Audit: AUTHORIZATION vs LIVENESS Boundary

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: Claude (EXEC, SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001)
**Last Updated**: 2026-07-08
**Tags**: dispatch-authorization, claim-eligibility, kind-a, kind-b, fail-open, fail-closed

## Purpose

Every predicate in the dispatch/claim-eligibility path that answers "should this SD
NOT be dispatched right now?" falls into one of two kinds, per Solomon's typed
boundary distinction:

- **Kind-A (AUTHORIZATION)**: an intrinsic-gate STATE question — "is this SD
  *authorized* to run?" Should eventually be **fail-CLOSED** (absent ⇒ deny), because
  the default answer to "has anyone approved this?" when no one has said anything is
  *no*, not *yes*.
- **Kind-B (LIVENESS)**: a relational/uncertainty question — "is this worker/SD
  *currently able* to proceed?" Correctly **fail-OPEN** (uncertain ⇒ proceed), because
  treating every transient unknown as a hard block would wedge the fleet on noise.

This audit enumerates every `metadata.<flag> === true → block` (or equivalent)
predicate found in the two canonical dispatch files plus the worker self-claim and
sweep entry points, classifies each, and flags any Kind-A predicate found **outside**
the direct dispatch path as a named finding requiring separate follow-up.

**This audit classifies. It does not enforce.** Promoting any predicate to
fail-closed behavior beyond what SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001's
FR-1 mirror-kill already covers is explicitly out of scope — see that SD's TR-1.

## Files audited

1. `lib/fleet/claim-eligibility.cjs` — `classifyDispatchIneligibility()`, the shared
   SSOT for the self-claim + stale-session-sweep dispatch paths.
2. `lib/coordinator/dispatch.cjs` — `assertSdDispatchable()`, the directed-assign path
   (as of FR-1, now routes through the same classifier for every axis below except
   terminal/deferred, which it checks explicitly and earlier).
3. `scripts/worker-checkin.cjs` — self-claim entry point.
4. `scripts/stale-session-sweep.cjs` — sweep entry point (no additional
   `metadata.<flag> === true → block` predicates found beyond what already routes
   through `classifyDispatchIneligibility`).

## Classification table

| Predicate | File | Kind | Current polarity | Notes |
|---|---|---|---|---|
| `metadata.needs_coordinator_review === true` | claim-eligibility.cjs | **A** | fail-open | Coordinator's clearing the flag *is* the authorization (SD-LEO-INFRA-NEEDS-COORDINATOR-REVIEW-HOLD-001). Mirror-killed into dispatch.cjs by FR-1. |
| `metadata.co_author_pending === true` | claim-eligibility.cjs | **A** | fail-open | Guards against a worker writing a PRD before co-author convergence lands. Mirror-killed into dispatch.cjs by FR-1. |
| `metadata.requires_human_action` (truthy) | claim-eligibility.cjs | **A** | fail-open | Generic human-action hold. Mirror-killed into dispatch.cjs by FR-1. |
| `metadata.door_class_note === 'one_way'` | claim-eligibility.cjs | **A** | fail-open | Requires Fable-tier supervision. Deliberately still directed-assignable (coordinator can hand it to a specific Fable session) — FR-1 does NOT change this predicate's *meaning*, only that dispatch.cjs now sees it via the shared classifier instead of missing it entirely. |
| `metadata.dispatch_auth_required === true` (NEW, FR-2) | claim-eligibility.cjs (`isDispatchAuthorized`) | **A** | **fail-closed, opt-in only** | The one Kind-A predicate this SD makes genuinely fail-closed — but only for SDs that explicitly opt in. Not wired into the synchronous classifier (async, DB-backed). |
| `row.sd_type === 'orchestrator'` | claim-eligibility.cjs | B | fail-open (excluded) | Structural — an orchestrator parent is never itself dispatchable; not an authorization question. |
| `TEST_FIXTURE_KEY_RE` match | claim-eligibility.cjs | B | fail-open (excluded) | Reserved test-fixture namespace, structural. |
| `metadata.not_before` future timestamp | claim-eligibility.cjs | B | fail-open (time-gated) | Auto-clears once the timestamp passes — a liveness/timing axis, not an approval axis. |
| `metadata.test_clone_build_tree === true` | claim-eligibility.cjs | B | fail-open (excluded) | Structural marker stamped once at venture-clone creation. |
| unactionable venture remediation (`SD-LEO-FIX-REMEDIATION-*` + non-EHG_Engineer target) | claim-eligibility.cjs | B | fail-open (excluded) | Actionability, not approval. |
| `status === 'deferred'` / `'completed'` / `'cancelled'` | claim-eligibility.cjs | B | fail-open (excluded) | Lifecycle state, not authorization. |
| tier axes (`min_tier_rank`, `worker_tier_rank`, lower-tier-backlog) | claim-eligibility.cjs | B | fail-open when `ctx` absent | Capability/fit, not approval; explicitly no-op when `ctx` is undefined (directed-assign's FR-1 call always passes `ctx=undefined`). |
| `metadata.fleet_critical === true` | worker-checkin.cjs | B (promotion) | n/a | Lifts an SD *into* the visible pool; still routes back through the classifier afterward (a fleet_critical + review-pending SD is correctly excluded — "the hold wins"). |
| `metadata.self_claim === false`, `metadata.availability === 'idle_only'`, `metadata.coordinator_stand_down === true` | worker-checkin.cjs (self-claim gate predicate) | **out of scope** | fail-toward-active | **Worker-session** availability — a different axis entirely from SD-dispatch approval (governs whether a *worker* self-claims, not whether an *SD* is authorized). Documented here for completeness; not part of this audit's Kind-A/B scope. |

## Findings

**No Kind-A predicate was found outside the direct dispatch path** (i.e., outside
`claim-eligibility.cjs` reachable via self-claim/sweep, and — as of FR-1 —
`dispatch.cjs`'s directed-assign path). The worker-availability axis in
`worker-checkin.cjs` is a structurally different question (worker fitness, not SD
authorization) and is explicitly excluded above rather than silently folded in.

## What this audit does NOT do

- It does not promote any Kind-A predicate beyond `needs_coordinator_review`,
  `co_author_pending`, `requires_human_action`, or `door_class_note==='one_way'` to a
  *new* fail-closed default. Those four remain fail-open by default; FR-1 only closes
  the gap where *one* dispatch path (directed-assign) saw fewer of them than the
  other (self-claim/sweep) — both paths now see the same set, with the same fail-open
  polarity as before.
- It does not implement the global born-DENIED-by-default flip described in this
  SD's parent scope document. That remains a separately-scoped, coordinated cutover
  requiring a backfill/grant mechanism so the live worker belt does not freeze.

## Related

- SD: `SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001`
- Primitive: `lib/decision-binding/disposition.js` (SD-1,
  `SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001`)
- Tests: `tests/unit/needs-coordinator-review-hold.test.js`,
  `tests/unit/dispatch-auth-opt-in.test.js`
