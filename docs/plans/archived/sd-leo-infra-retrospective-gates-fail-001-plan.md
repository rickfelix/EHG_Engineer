<!-- Archived from: docs/plans/retrospective-gates-hard-fail-plan.md -->
<!-- SD Key: SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001 -->
<!-- Archived at: 2026-04-24T12:50:22.126Z -->

# RETROSPECTIVE gates: fail hard on zero rows and require retro_type=SD_COMPLETION with post-LEAD timestamp

## Summary

Two real bugs in the LEO handoff-gate pipeline make "retrospective exists for this SD" checks false-pass against stub or wrong-type retrospectives. The cancelled predecessor SD-LEO-INFRA-RETROSPECTIVE-EXISTS-GATE-001 (cancelled 2026-04-24 12:13 UTC) inspected the wrong gate file (`scripts/modules/handoff/executors/lead-final-approval/gates.js`) and correctly found its zero-rows path returns `passed: false`. A parallel validation-agent run (evidence row `sub_agent_execution_results.id=e6cf78c4-427b-4c94-9fb9-b9b030604871`) found the bug IS real at a DIFFERENT gate file — `scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js` — and that both gates share a second bug: neither filters by `retro_type` or by retro creation time.

This SD is the precise, evidence-backed re-frame of the cancelled SD. Scope is tightened to specific files and tied to concrete line ranges.

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (LEO handoff pipeline)

## Success Criteria

- **AC1**: Given an SD with zero rows in `retrospectives` for its `sd_id`, `RETROSPECTIVE_QUALITY_GATE` in `plan-to-lead/gates/retrospective-quality.js` returns `{passed: false}` with a clear remediation message ("no retrospective found for this SD") — never calls `validateSDCompletionReadiness(sd, null)` at all.
- **AC2**: Given an SD with only handoff-time retrospectives (those created `<= LEAD-TO-PLAN acceptance timestamp`), the gate returns `{passed: false}` and requests a proper SD-completion retrospective.
- **AC3**: Given an SD with a retrospective where `retro_type <> 'SD_COMPLETION'`, the gate returns `{passed: false}`. (Today handoff-time retros are written with `retro_type='SD_COMPLETION'` — AC2 handles the timestamp filter; this AC future-proofs against other retro types being introduced.)
- **AC4**: Given an SD with a proper SD-completion retrospective (`retro_type='SD_COMPLETION'`, `status='PUBLISHED'`, `created_at > LEAD-TO-PLAN timestamp`), the gate auto-passes for infrastructure/database/bugfix/enhancement/corrective/orchestrator fast-paths at existing thresholds.
- **AC5**: Same three filters apply to `RETROSPECTIVE_EXISTS` in `lead-final-approval/gates.js`. Today its `.single()` swallows PGRST116 and does the right thing on zero rows, but it should also apply the `retro_type` + timestamp filter so the two gates behave consistently.
- **AC6**: Unit tests cover all three failure modes (zero rows, wrong retro_type, only-handoff-retros-exist) plus the happy path. Current test file at `plan-to-lead/gates/retrospective-quality.test.js` has no `retrospective: null` test case — that gap is the proximate reason the bug was never caught.
- **AC7**: No regression on the 6 auto-pass fast paths (orchestrator, database, bugfix, corrective, enhancement, infrastructure/process/documentation) for SDs that DO have proper SD-completion retros.

## Scope

### FR1 — Zero-rows hard-fail in PLAN-TO-LEAD gate

In `scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js` around lines 49–75:
- After the `.maybeSingle()` at line 57, explicitly branch: if `!retrospective`, return `{passed: false, score: 0, max_score: 100, issues: ['No retrospective found for SD <sd_key>'], remediation: 'Run scripts/generate-retrospective.js <SD_UUID> to create an SD-completion retrospective'}` without falling through to `checkAutoPassConditions` or `validateSDCompletionReadiness`.
- Preserve the existing error-tolerance for `retroError.code === 'PGRST116'` (that's the "zero rows" code from `.single()` in the sibling gate).

### FR2 — retro_type and timestamp filtering (both gates)

Update the `retrospectives` query in BOTH files:
- `scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js:51-57`
- `scripts/modules/handoff/executors/lead-final-approval/gates.js` (the `createRetrospectiveExistsGate()` function at ~lines 275-370 per validation-agent)

Change the query from:
```js
.from('retrospectives').select('*').eq('sd_id', sdUuid).order('created_at', { ascending: false }).limit(1).maybeSingle()
```
to:
```js
.from('retrospectives').select('*')
  .eq('sd_id', sdUuid)
  .eq('retro_type', 'SD_COMPLETION')
  .eq('status', 'PUBLISHED')
  .gt('created_at', leadToPlanAcceptedAt)   // queried once per gate call
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```

`leadToPlanAcceptedAt` comes from a prior SELECT on `sd_phase_handoffs` where `sd_id=<uuid>`, `from_phase='LEAD'`, `to_phase='PLAN'`, `status='accepted'`, ordering by `accepted_at DESC LIMIT 1`. If no such handoff exists, fall back to the SD's `created_at` (so early-phase gates don't under-fail).

### FR3 — Test coverage

In `scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.test.js`:
- Add a test: `retrospective: null` (zero rows) → `passed: false` with the expected remediation string.
- Add a test: retrospective exists but `retro_type` is not `SD_COMPLETION` → `passed: false`.
- Add a test: retrospective's `created_at <= leadToPlanAcceptedAt` → `passed: false`.
- Add a test: retrospective is a proper SD-completion retro (all filters pass) → auto-pass fast path hits for `sd_type='infrastructure'`.
- Mirror equivalent cases in the lead-final-approval gate's test file.

### FR4 — Documentation

Add a `gate_retrospective_invariants` section to CLAUDE_CORE.md describing the three filters (existence, type, freshness-vs-LEAD-phase) so future sessions and reviewers understand the invariants. Use the same DB-migration pattern I used in SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 (insert `leo_protocol_sections` row, register in `section-file-mapping.json`, regenerate CLAUDE files, revert unrelated cross-file churn).

## Non-Goals

- NOT changing the 6 auto-pass fast-paths or their threshold values. Those decisions are out of scope.
- NOT modifying `validateSDCompletionReadiness` internals — this SD only changes its *inputs* by blocking the null-retro call path.
- NOT auto-generating a retrospective when none exists — retrospective creation is an agent/operator responsibility; this SD only fixes the gate.
- NOT retroactively re-scoring SDs that previously passed under the buggy gate. Status quo for completed SDs.

## Key Technical Decisions

**Why hard-fail instead of fallback**: the existing behavior of calling `validateSDCompletionReadiness(sd, null)` produces a score derived from SD quality alone (per validation-agent: `sd-quality-validation.js:353-358`, result.score = sdQuality.score when SD.status != completed/active). That silently passes the gate for any SD with decent metadata, which is indistinguishable from a true retrospective-backed pass. Hard-fail is the only way to make the bug loud.

**Why timestamp-vs-LEAD-phase**: handoff-time retros (LEAD_TO_PLAN, PLAN_TO_EXEC) are created as `retro_type='SD_COMPLETION'` (see `lead-to-plan/retrospective.js:283`). Filtering on type alone doesn't distinguish them from genuine SD-completion retros. The one axis that reliably separates them is creation time: SD-completion retros are authored after the SD actually ships. `leadToPlanAcceptedAt` is the earliest plausible cutoff — anything before it was definitionally pre-SD-work.

**Why both gates in one SD**: they share the same bug pattern, same fix pattern, and same test pattern. Splitting would double the handoff overhead without any isolation benefit.

## Supporting Evidence

- **Primary incident**: In SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 (completed 2026-04-24 11:37 UTC), `generate-retrospective.js` reported `{success: true, existed: true, retrospective_id: 7f02308e-...}` even though the existing retro was a `LEAD_TO_PLAN Handoff Retrospective`, not an SD-completion one. I authored a proper SD-completion retro manually (id `e07e0189-796b-4faf-94d7-cc53af85f60d`). Had the gate fired at the right time with the right filter, the script would have correctly reported no qualifying retro.
- **Validation-agent evidence row**: `sub_agent_execution_results.id = e6cf78c4-427b-4c94-9fb9-b9b030604871`, verdict=FAIL (confidence 88), phase=LEAD, recommendation option (c) BROADEN. Cites `scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js:49-75`, `scripts/modules/sd-quality-validation.js:353-363` (NOTE: actual path is at repo root `scripts/modules/sd-quality-validation.js`, NOT `scripts/modules/handoff/sd-quality-validation.js` — grep confirmed 2026-04-24), `scripts/modules/handoff/executors/lead-final-approval/gates.js:275-370`.
- **Nearby shipped fix (not a duplicate)**: `SD-LEARN-FIX-ADDRESS-PAT-AUTO-047` (completed 2026-03-01, PR #1701, commit `1dadc58b17`) added SD-type auto-pass paths to `createRetrospectiveExistsGate()` but assumes a retrospective exists — does not address zero-rows or retro_type filtering.
- **Cancelled predecessor**: `SD-LEO-INFRA-RETROSPECTIVE-EXISTS-GATE-001` (cancelled 2026-04-24 12:13 UTC) with reason "code inspection disproves bug claim. gates.js:275-369 already handles zero rows correctly via .single() + !retrospective check." That reasoning applies to the LEAD-FINAL-APPROVAL gate only, not the PLAN-TO-LEAD gate — and even at LEAD-FINAL the retro_type filter is missing.

## Vision Alignment

Supports O-GOV-2 (LEO Intelligence Integration) and O-GOV-1 (Foundation Cleanup). The gate pipeline is the primary integrity surface of the handoff system; false-passes at the retrospective layer directly undermine the audit trail that every other gate depends on. Tightening this invariant is a prerequisite for reliable retrospective-driven continuous improvement.

## Risks

- **Risk**: Existing SDs in-flight between PLAN-TO-LEAD and LEAD-FINAL-APPROVAL could re-fail on deploy. **Mitigation**: the fix adds a new filter, not a new schema requirement — any SD that already has a valid SD-completion retro continues to pass. SDs relying on the handoff-time retro false-pass are exactly the ones we want to catch. Deploy during a low-fleet-activity window and flag any newly-blocked handoffs for manual retro creation.
- **Risk**: `leadToPlanAcceptedAt` lookup adds one extra DB round-trip per gate invocation. **Mitigation**: single lookup, indexed (`sd_phase_handoffs` has an SD+phase composite), amortized across a minute-scale gate. Negligible latency impact.
- **Risk**: If the LEAD-TO-PLAN handoff row doesn't exist (Phase-0 / unusual SDs), fallback to SD `created_at` is permissive. **Mitigation**: accepted — these SDs are already in a corner case and we'd rather false-pass than false-fail them.

## Estimated Scope

~200-300 LOC across both gate files, the shared query helper if we extract one, the two test files, the CLAUDE_CORE.md migration + regeneration. Tier 3 per CLAUDE.md Work Item Routing → full SD workflow (infrastructure type: 4 handoffs, skip EXEC-TO-PLAN, 80% gate threshold). DOCMON required for the CLAUDE_CORE.md section.
