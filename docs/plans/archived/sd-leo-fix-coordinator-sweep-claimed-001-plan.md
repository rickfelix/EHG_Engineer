<!-- Archived from: C:/Users/rickf/.claude/plans/coordinator-dispatch-guards-plan.md -->
<!-- SD Key: SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001 -->
<!-- Archived at: 2026-06-09T12:05:36.762Z -->

# Plan: Coordinator/sweep claimed_assignment dispatch — add orchestrator-parent + dep-blocked + terminal-status guards (writer-consumer-asymmetry with self_claim)

## Goal

Close a PAT-WRITER-CONSUMER-ASYMMETRY gap: the self_claim path already refuses to dispatch orchestrator-parent SDs (shipped via SD-FDBK-FIX-WORKER-SELF-CLAIM-001), but the coordinator/sweep `claimed_assignment` / CLAIM_FIX dispatch path in `scripts/stale-session-sweep.cjs` lacks the same guard. As a result, coordinator-push routed the orchestrator PARENT `SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001` to a worker, which is not worker-buildable. Extend the existing self_claim guard family (orchestrator-parent + dep-blocked + terminal-status) to the coordinator/sweep dispatch path, reusing the existing predicates rather than re-implementing them, so the asymmetry does not recur.

This SD is BUGFIX / high priority. The deliverable for THIS task is the DRAFT SD only — no code files are modified. The functional requirements below define the eventual fix scope for the worker who later builds it.

## Summary

Worker Echo (session 683daeb8) signalled HARNESS-BUG (medium) at 11:59: the coordinator/sweep `claimed_assignment` dispatch (coordinator-push, the CLAIM_FIX path in `scripts/stale-session-sweep.cjs`) routed the orchestrator PARENT `SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001` (sd_type=orchestrator) to it. Parents are NOT worker-buildable — they auto-complete when children finish (children A/B/D completed, child -C in_progress under a live peer, so the parent can only WAIT at PLAN-TO-LEAD). The worker had to detect this and self-release.

ROOT CAUSE: self_claim step-6 already has the orchestrator-parent guard (shipped via SD-FDBK-FIX-WORKER-SELF-CLAIM-001) but the coordinator claimed_assignment / sweep CLAIM_FIX path LACKS it — classic PAT-WRITER-CONSUMER-ASYMMETRY (a guard added to one path but not its sibling).

Live code confirmed present: `scripts/stale-session-sweep.cjs` (1917 lines) contains the CLAIM_FIX dispatch path (lines ~1239-1383) which loads BOTH orchestrator children AND all pending standalone SDs and sets `claiming_session_id` / `is_working_on` on the chosen target. A terminal-status guard exists at line ~1347 for *clearing* stale sd_key on completed/cancelled SDs, but there is no orchestrator-PARENT / dep-blocked / terminal eligibility guard on the *dispatch target selection* itself.

## Functional Requirements (Scope)

- FR-1: The coordinator/sweep claimed_assignment + CLAIM_FIX dispatch path (`scripts/stale-session-sweep.cjs` and any lib it calls) must NEVER assign an SD with `sd_type='orchestrator'` (parent) to a worker. Mirror the self_claim step-6 orchestrator-parent guard from SD-FDBK-FIX-WORKER-SELF-CLAIM-001 (reuse the same helper/predicate — do not re-implement).
- FR-2: The same path must also skip dep-BLOCKED SDs (unmet dependencies) and TERMINAL-status SDs (completed/cancelled/deferred) when choosing a dispatch target — mirror the existing self_claim guards (`draftDepsSatisfied`) and the terminal-status guard being added by SD-LEO-FIX-CLAIM-RPC-TERMINAL-001. Reuse, don't duplicate logic.
- FR-3: When adding any one of these guards, apply to ALL sibling dispatch tiers (self_claim tiers 5/6/6.25/6.5 AND the coordinator claimed_assignment / CLAIM_FIX path) so the asymmetry does not recur — extract a shared eligibility predicate if one does not already exist.
- FR-4: Tests — claimed_assignment / CLAIM_FIX never targets an orchestrator parent, a dep-blocked SD, or a terminal SD; a normal leaf/child draft is still dispatchable.

## Scope

| path | ACTION |
| ---- | ------ |
| scripts/stale-session-sweep.cjs | EDIT (add orchestrator-parent + dep-blocked + terminal-status guards to the CLAIM_FIX dispatch-target selection) |
| worker-checkin.cjs / self_claim tiers (lib it shares) | REUSE / refactor toward a shared eligibility predicate (FR-3) |
| tests | ADD (CLAIM_FIX never targets orchestrator/dep-blocked/terminal; leaf draft still dispatchable) |

IN SCOPE: the coordinator/sweep dispatch-target eligibility guards (orchestrator-parent, dep-blocked, terminal-status) and a shared predicate extracted from the existing self_claim guards.

OUT OF SCOPE: redesigning the self_claim tiers themselves; changing the terminal-clear logic at line ~1347 (that path is correct); the `claim_sd` RPC terminal guard (covered separately by SD-LEO-FIX-CLAIM-RPC-TERMINAL-001); any change to orchestrator parent lifecycle / PLAN-TO-LEAD WAIT semantics.

## Strategic Objectives

- Eliminate the writer-consumer-asymmetry where self_claim refuses orchestrator parents / dep-blocked / terminal SDs but the coordinator/sweep dispatch path does not.
- Prevent wasted worker cycles spent claiming, detecting, and self-releasing un-buildable parents (the cost paid by Worker Echo on SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001).
- Establish a single shared eligibility predicate so future guard additions cannot drift between sibling dispatch tiers.

## Success Criteria

- [ ] CLAIM_FIX / claimed_assignment dispatch never selects an SD with sd_type='orchestrator' as a worker target.
- [ ] CLAIM_FIX / claimed_assignment dispatch never selects a dep-blocked SD (unmet dependencies).
- [ ] CLAIM_FIX / claimed_assignment dispatch never selects a terminal-status SD (completed/cancelled/deferred).
- [ ] A normal leaf/child draft SD remains dispatchable (no false-negative regression).
- [ ] The orchestrator-parent / dep-blocked / terminal guards are sourced from a single shared predicate reused by both self_claim tiers and the coordinator/sweep path (no duplicated logic).
- [ ] Tests cover all four conditions (FR-4) and pass.

## Risks

- Risk: Over-broad guard accidentally filters out legitimate leaf/child drafts, starving the dispatch queue. Mitigation: positive test that a normal leaf/child draft stays dispatchable (FR-4); guard keys on sd_type='orchestrator' and explicit terminal-status set, not on a heuristic.
- Risk: Re-implementing the predicate instead of reusing the self_claim helper reintroduces the asymmetry in a third location. Mitigation: FR-3 mandates extracting / reusing a single shared eligibility predicate.
- Risk: dep-blocked detection via the broken `v_sd_next_candidates.deps_satisfied` view (object-shaped deps text-compare bug) could yield false eligibility. Mitigation: reuse `draftDepsSatisfied` against `strategic_directives_v2` (the same correct path the self_claim guard already uses), not the view column.
- Risk: high blast radius — the sweep runs on a schedule and touches claim ownership for all sessions. Mitigation: guards are additive (refuse-only), fail-open-safe on lookup error, and covered by regression tests before merge.

## Dedup (confirmed — do NOT duplicate)

- SD-FDBK-FIX-WORKER-SELF-CLAIM-001 (COMPLETED) — added the orchestrator-parent guard to self_claim step-6 ONLY. This SD extends the SAME guard family to the coordinator/sweep dispatch path.
- SD-LEO-FIX-CLAIM-RPC-TERMINAL-001 (in_progress) — terminal guard on the claim_sd RPC. Different path (RPC, not the sweep CLAIM_FIX dispatch path). FR-2 reuses its terminal predicate.
- SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001 (COMPLETED) — coordinator dispatch target guard for full-UUID + live-session before session_coordination insert. Different concern (target-session identity/liveness), NOT SD-eligibility (orchestrator-parent / dep-blocked / terminal). No overlap.

A dedup query over strategic_directives_v2 (sd_key/title ILIKE claim/dispatch/self-claim/assignment/sweep/orchestrator-parent) returned 52 rows; none cover the coordinator/sweep CLAIM_FIX dispatch-path eligibility-guard family. No OPEN duplicate exists.

## Notes

- target_application: EHG_Engineer (backend LEO tooling; single-repo).
- No auth/RLS/payments/migration/schema keywords → no --security-reviewed / --migration-reviewed needed.
- Set metadata.not_claimable_until_reviewed=true (advisory review-hold) if supported.
