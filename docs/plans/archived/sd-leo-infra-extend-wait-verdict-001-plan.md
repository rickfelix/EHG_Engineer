<!-- Archived from: .claude/plans/2026-05-27-extend-wait-verdict.md -->
<!-- SD Key: SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001 -->
<!-- Archived at: 2026-05-27T23:42:22.411Z -->

# Plan: Extend WAIT verdict — preserve retry budget on race-window blocks

## Priority
high

## Type
infrastructure

## Goal

Apply the WAIT-verdict pattern shipped in SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 (PR #4021) — where `PREREQUISITE_HANDOFF_CHECK` at parent PLAN-TO-LEAD returns `wait=true` instead of `passed=false` when children are incomplete — to three additional gate categories where the same race-window-vs-real-failure ambiguity costs retry budget and triggers spurious RCA.

**Gate 1 — TESTING.** `test timeout` and `test failure` are currently both FAIL. A timeout reflects environmental flakiness (CI ran out of time, infra hiccup, parallel test contention) and the right next step is "rerun, don't reanalyze the code." A test failure is a real assertion failure that needs RCA. Conflating them burns the retry budget on flakes and wastes the rca-agent on noise.

**Gate 2 — SUB_AGENT_EVIDENCE.** When the handoff pipeline invokes a sub-agent via the Task tool but checks `sub_agent_execution_results` before the row has been written (race window of seconds), the gate FAILs with `SUBAGENT_EVIDENCE_MISSING`. This is the same race-window block as PREREQUISITE_HANDOFF_CHECK on incomplete children — the answer is "wait, the work is in flight, don't fail."

**Gate 3 — MIGRATION verification.** When a migration has been applied (DDL ran successfully) but verification queries (cross-table parity, CHECK validation, idempotency assertion) haven't been run yet, the gate FAILs with "migration unverified." This is a wait-state, not a failure — the migration didn't break, it's pending verification.

All three follow the same shape as PR #4021's `prerequisite-check.js`: return `{ passed: false, wait: true, ... }` instead of `{ passed: false, wait: false (default) }`. The `ValidationOrchestrator` (already updated in PR #4021 to track `waitVerdict`) routes wait results through `recorder.recordWait()` writing `status='blocked' + metadata.wait=true` rather than incrementing retry_count and triggering RCA.

## Steps

- [ ] LEAD: 8-question strategic gate; confirm scope (3 gates, mirrors PR #4021 precedent)
- [ ] LEAD: invoke validation-agent, risk-agent (false-negative impact: misclassifying a real failure as wait would let bad code through), design-agent (WAIT vs FAIL discriminator rules per gate)
- [ ] LEAD-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN: write PRD; FR-1 TESTING gate wait branch (timeout detection), FR-2 SUB_AGENT_EVIDENCE wait branch (recently-invoked detection), FR-3 MIGRATION verification wait branch (applied-not-verified detection)
- [ ] PLAN: invoke design-agent (timeout-vs-failure detection rules; recently-invoked threshold seconds; applied-not-verified rules), testing-agent
- [ ] PLAN-TO-EXEC: handoff via handoff.js execute
- [ ] EXEC FR-1: extend TESTING gate (search for the test-results parser); detect timeout signature (exit code 124, "Test timeout" string, vitest --testTimeout exceeded) → wait=true; real failure → passed=false
- [ ] EXEC FR-2: extend sub-agent evidence gate; if sd_phase_handoffs.invoked_at within last N seconds (default 30) AND no row in sub_agent_execution_results → wait=true; if invocation older than N seconds OR no invocation record → passed=false
- [ ] EXEC FR-3: extend migration verification gate; detect "migration applied but verification step not run" (migration row exists with applied_at but no verified_at) → wait=true; migration failed → passed=false
- [ ] EXEC: tests in tests/unit/wait-verdict-testing/, /sub-agent-evidence/, /migration-verification/
- [ ] EXEC: smoke — trigger each wait branch in a controlled scenario; assert retry_count unchanged and no RCA triggered
- [ ] EXEC-TO-PLAN: handoff via handoff.js execute
- [ ] PLAN-TO-LEAD: handoff via handoff.js execute
- [ ] LEAD-FINAL-APPROVAL: handoff via handoff.js execute
- [ ] PR: create + auto-merge

## Acceptance

- Each of 3 gates has a documented WAIT-vs-FAIL discriminator (decision table in PRD)
- Each gate returns `{ passed: false, wait: true }` when discriminator matches; existing FAIL paths unchanged
- `ValidationOrchestrator.waitVerdict` correctly propagates from each gate's wait result
- `HandoffRecorder.recordWait()` writes `status='blocked' + metadata.wait=true` for each gate (no retry_count increment, no RCA trigger)
- ≥3 unit tests per gate covering: wait branch, fail branch, pass branch
- Smoke: re-run a previously-FAIL TESTING handoff that was actually a timeout; assert WAIT verdict and unchanged retry_count

## Scope

~ scripts/modules/handoff/gates/testing-gate.js (or similar — locate exact path during PLAN) — add timeout detection + wait branch
~ scripts/modules/handoff/gates/sub-agent-evidence-gate.js (locate path during PLAN) — add recently-invoked detection + wait branch
~ scripts/modules/handoff/gates/migration-verification-gate.js (locate path during PLAN) — add applied-not-verified detection + wait branch
+ tests/unit/wait-verdict-testing/testing-gate-wait.test.js
+ tests/unit/sub-agent-evidence/sub-agent-evidence-wait.test.js
+ tests/unit/migration-verification/migration-verification-wait.test.js

## Risks

- False-positive WAIT misclassifies a real failure as flake, letting bad code through. Mitigation: discriminator rules require explicit signals (exit code 124, error string match, timestamp comparison) — no inference; if uncertain, default to FAIL.
- WAIT verdicts must not loop indefinitely. Mitigation: ValidationOrchestrator already has a wait-loop guard from PR #4021 (review the implementation, extend if needed).
- Gate paths may not be where the PRD assumes. Mitigation: PLAN phase locates exact paths via grep before EXEC starts.

## Target Application
EHG_Engineer

## Origin
- Pattern proven by SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 (PR #4021): `lib/handoff/parent-detection.js` + `ValidationOrchestrator.waitVerdict` + `HandoffRecorder.recordWait()` are the canonical implementation references.
- Pilot journal `project_crongenius_first_venture_pilot_2026_05_27.md` finding F8 (orch-parent lifecycle mismatch) named the WAIT-vs-FAIL discriminator concept; this SD extends it beyond the parent-orchestrator case.
- Campaign brief from chairman 2026-05-27.
