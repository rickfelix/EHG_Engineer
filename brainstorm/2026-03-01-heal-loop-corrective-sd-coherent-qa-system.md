# Brainstorm: Coherent Quality Assurance System — Heal Loop + Corrective SD Generation + Completion Gates

## Metadata
- **Date**: 2026-03-01
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives — Challenger, Visionary, Pragmatist)
- **Related Ventures**: None (protocol infrastructure)

---

## Problem Statement

Two parallel sessions (SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-02 and -03) independently discovered that the heal loop, corrective SD generation, and completion gates are not calibrated to the same quality standard. The corrective-sd-generator uses THRESHOLDS.ACCEPT (GRADE.A = 93) as the target, but the heal gate uses leo_config.heal_gate_threshold with a default of 80 (GRADE.B_MINUS). A temp script bypassed the generator entirely and hardcoded 80 as the target for all 3 children of the orchestrator. No validation gate caught this because orchestrator-type SDs skip all content validation gates.

The core design question: How should the heal loop, corrective SD generation, and completion gates form a coherent quality assurance system?

## Discovery Summary

### Evidence from Both Sessions

| Finding | Session -02 (V08 Scope & Auth) | Session -03 (V10 Timeline) |
|---------|-------------------------------|---------------------------|
| Target score wrong | 80 instead of 93 (RCA: temp script bypassed generator) | Used 80 as gate threshold (FR-004) |
| Chicken-and-egg | `/heal sd` won't score non-completed SDs | Same — had to persist scores via direct DB insert |
| Heal added value? | Yes — vision heal revealed correct 93 threshold | Yes — caught schema bug, forced score persistence |
| Gate gaps | Orchestrator type skips all content validation | `scored_at` vs `created_at` column mismatch |

### RCA Finding (Session -02)

- **Root cause**: A Claude session wrote `.claude/tmp-create-children-gap007.cjs` with hardcoded `target: 80` for all three children
- **Why 80?**: Session chose GRADE.B_MINUS (80) as "achievable" instead of system ACCEPT threshold GRADE.A (93)
- **Why not caught?**: Raw Supabase inserts bypassed createSD pipeline. Orchestrator type skips all L:* content validation gates (NON_APPLICABLE_SD_TYPE)
- **Proof**: Parent SD `scope` field still says "above 93" (original generator value), but `success_metrics.target` was overwritten to "80"

### Session -03: FR-004 Heal-Before-Complete Gate

Built a gate requiring SD heal score >= 80 before PLAN-TO-LEAD. Productive:
1. Caught a real schema bug (`created_at` vs `scored_at`)
2. Forced score persistence (database audit trail)
3. Vision heal advisory surfaced 75/100 portfolio score

Friction:
1. Chicken-and-egg: `/heal sd` filters on `status='completed'` but gate runs pre-completion
2. Column name mismatch discovered only at runtime
3. `total_score` is integer — 80.4 rounded to 80, barely passing threshold

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Threshold enforcement | Both (immutable at creation + gate validation) | Belt-and-suspenders — prevents bypass at both creation and completion |
| Heal timing | Pre-completion gate (blocking) | Both sessions proved pre-completion scoring catches real bugs |
| Backward compatibility | Orchestrator flexibility | Orchestrators can set child targets but never below THRESHOLDS.ACCEPT for corrective SDs |
| Gate threshold source | Always use THRESHOLDS.ACCEPT (93) from grade-scale constant | Authoritative single source — ignores mutable SD success_metrics for corrective SDs |

## Analysis

### Arguments For

1. **Closes a proven gap** — Two independent sessions hit the same 80-vs-93 problem. This isn't theoretical; it already caused an SD to be declared "complete" 10 points below the real threshold.
2. **Belt-and-suspenders with grade-scale constant** — Reading THRESHOLDS.ACCEPT directly eliminates the class of bugs where intermediate scripts override the target. Source of truth becomes code, not mutable JSONB.
3. **Pre-completion heal gate caught real bugs** — Session -03 found a schema bug immediately because the gate ran on the same SD that built it.
4. **Small implementation footprint** — 2 file changes (~65 lines), not a new SD. The corrective-sd-generator already writes the right values.

### Arguments Against

1. **Challenger's worst case is plausible** — If corrective SDs spawn children (EXEC decomposition), they become orchestrators in the gate's view and auto-pass. The very SDs needing strongest enforcement could escape it.
2. **Score staleness is unaddressed** — A heal score from 30 days ago passes the gate identically to one from 5 minutes ago.
3. **Gate complexity increases** — Branching on `sd_type === 'corrective'` inside a gate that runs for ALL SDs adds conditional logic to a hot path.
4. **Pre-completion heal has a side effect** — Scoring with `effectiveMinOccurrences = 1` could trigger corrective SD generation for a still-live SD, polluting the queue.

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Details |
|-----------|-------|---------|
| Friction Reduction | 9/10 | Current friction: 5/5 (two sessions hit same bug). Breadth: 4/5 (every corrective SD lifecycle affected). |
| Value Addition | 9/10 | Direct: 5/5 (prevents under-threshold completion). Compound: 4/5 (enables trending, invariant testing). |
| Risk Profile | 4/10 | Breaking change: 2/5 (must branch on SD type). Regression: 2/5 (orchestrator blind spot, staleness). |
| **Decision** | **IMPLEMENT** | **(9 + 9) = 18 > (4 * 2) = 8** — strong implement signal |

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Gate threshold (80 in `leo_config`) and generator threshold (93 in `THRESHOLDS.ACCEPT`) are calibrated to different numbers — the enforcement layers are not aligned
  2. The chicken-and-egg is only half-solved — the gate queries `eva_vision_scores` by `sd_key` (no status filter), but the heal *command* still requires `status='completed'`
  3. The orchestrator exemption (lines 55-71 in `heal-before-complete.js`) auto-passes at 100/100 for any SD with children — corrective SDs that spawn children escape enforcement entirely
- **Assumptions at Risk**:
  1. `rubric_snapshot.mode === 'sd-heal'` is advisory-only — a vision-mode score with non-null `sd_id` could satisfy the gate
  2. Score age is never used to block — a 30-day-old score passes identically to a fresh one
  3. `generated_sd_ids` idempotency check fails open when referenced SDs are deleted
- **Worst Case**: Corrective SDs become orchestrators → escape gate → complete at 80 → trigger more correctives → infinite loop of under-calibrated completions consuming all dev capacity

### Visionary
- **Opportunities**:
  1. **Continuous Quality Ratchet**: The gate has the score, gaps, and threshold at the exact moment the author is context-loaded. Generate corrective SDs inline at the gate rather than requiring a separate `generate` step
  2. **Protocol Invariant Test Suite**: Build contract tests for grade-scale thresholds — every scoring module proves `classifyScore(92) !== 'accept'` and `classifyScore(93) === 'accept'`
  3. **Vision Score Trending**: Track per-dimension score deltas per completed corrective SD. Detect which interventions actually move the needle.
- **Synergies**:
  1. Corrective priority calculator + heal gate = triage-at-gate (P0 escalation gaps surface in queue immediately)
  2. Vision score trending + sd:burnrate = protocol velocity signal (detect stalled dimensions)
  3. Orchestrator aggregate heal check = weighted average of child heal scores (advisory rollup)
- **Upside Scenario**: LEO becomes a protocol that provably improves itself over time with measurable evidence. 90 days out: a report showing "Vision score moved from 74 to X. Corrective SDs created: N. Completed: M. Average score delta per completed corrective: D." Self-tuning: gaps with high historical remediation effectiveness get prioritized.

### Pragmatist
- **Feasibility**: 4/10 (design is sound but implementation has 3 non-trivial problems)
- **Resource Requirements**:
  | File | Change | Est. Lines |
  |------|--------|-----------|
  | `heal-before-complete.js` | Add corrective SD detection; load GRADE.A for corrective type | ~40 |
  | `heal-command.mjs` | Add `--in-progress` flag; make status filter conditional | ~25 |
  | Total | 2 files, targeted changes | ~65 |
- **Constraints**:
  1. Gate applies to ALL SD types — must branch on `sd_type === 'corrective'` or non-corrective SDs get blocked at 93
  2. `status='completed'` filter is load-bearing for batch SD heal flow — `--in-progress` must suppress corrective generation
  3. `leo_config.heal_gate_threshold` is already in production — add `heal_gate_threshold_corrective = 93` rather than removing the general mechanism
- **Recommended Path**:
  - Phase 1 (immediate): Fix threshold mismatch in `heal-before-complete.js` — type-branched, 30-40 lines
  - Phase 2 (next session): Fix chicken-and-egg in `heal-command.mjs` — `--in-progress` flag with generation suppression
  - Phase 3 (deferred): Target immutability guard — gate-level consistency check (warn if target changed from GRADE.A)
  - **Do not build** DB trigger — inconsistent with codebase patterns of application-layer enforcement

### Synthesis
- **Consensus Points**: Threshold mismatch is the critical bug (all 3). Chicken-and-egg fix is scoped to heal command (all 3). Implementation is ~65 lines across 2 files (Pragmatist + Visionary).
- **Tension Points**: DB trigger vs app-layer enforcement (Challenger wants it, Pragmatist says no). Orchestrator exemption scope (Challenger sees worst case, Pragmatist says existing logic is correct). Inline corrective generation (Visionary wants it, Pragmatist defers it).
- **Composite Risk**: Medium — design is sound with 3 specific implementation pitfalls (type branching, generation suppression, orchestrator blind spot)

## Open Questions

1. Should the orchestrator exemption be modified for corrective SDs? (Challenger's worst case vs Pragmatist's "already correct")
2. Should score freshness be enforced? (e.g., score must be < 24h old to pass gate)
3. Should corrective SDs inline-generate at the gate? (Visionary's Opportunity 1 — deferred by Pragmatist)
4. Should the protocol invariant test suite be built? (Visionary's Opportunity 2 — cross-cutting concern)

## Suggested Next Steps

1. **Create SD** for Phase 1+2 (fix threshold mismatch + chicken-and-egg) — ~65 lines, 2 files
2. The Challenger's orchestrator blind spot and score staleness are separate concerns — track as future enhancements
3. The Visionary's trending infrastructure and inline corrective generation are strategic opportunities for a follow-up SD
4. Clean up `.claude/tmp-create-children-gap007.cjs` and `.claude/tmp-create-orchestrator-prd.cjs` (the smoking gun scripts)
