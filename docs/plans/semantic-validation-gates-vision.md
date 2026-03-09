# Vision: Semantic Validation Gates — From Ceremony to Substance

## Executive Summary

The LEO Protocol currently validates that process steps were performed (structural gates) but not that the right outcomes were delivered (semantic gates). This creates a systemic blind spot where SDs can complete all handoffs, pass all gates, and ship code — while missing core deliverables that the vision promised.

This vision introduces 10 semantic validation gates distributed across the SD lifecycle. Each gate verifies a specific aspect of intent-to-implementation fidelity: scope alignment, deliverable completeness, vision coverage, user story satisfaction, and cross-SD coherence. Gates are always blocking but SD-type-aware — enforcement intensity adapts to the SD's type, with feature and security SDs getting the strictest validation while documentation SDs get the lightest.

The end state is a protocol that can answer "did we build what we said we would?" with quantified confidence, enabling the Chairman to shift from manual review of every SD to review-by-exception for anomalies flagged by semantic gates.

## Problem Statement

**Who is affected**: The Chairman (human orchestrator) and all AI agents executing SDs through the LEO Protocol.

**Current impact**: An orchestrator SD (003) completed with all 4 children done, but the core user-facing feature was never assigned to any child. The vision was designed, foundation code was built, but no gate asked "do the children actually deliver the full vision?" This cost discovery time and required a follow-on SD.

**Root cause**: The protocol has 23 structural gates (field existence, format, counts) and zero semantic gates (scope fidelity, deliverable completeness, vision alignment). Auto-completion triggers check `status=completed` for all children but not whether children collectively satisfy the parent's scope.

**Pattern frequency**: Unknown — this is the first detected instance, but the gap has existed since the protocol's inception. Every completed orchestrator SD may have this latent risk.

## Personas

### Chairman (Rick)
- **Goals**: Ensure AI agents deliver what was promised without requiring line-by-line review of every SD
- **Mindset**: Trust but verify — wants gates that catch semantic drift automatically
- **Key activities**: Reviews gate failure reports, approves scope at LEAD, validates final delivery

### LEO Orchestrator (Claude)
- **Goals**: Execute SDs through LEAD→PLAN→EXEC with confidence that process compliance = delivery compliance
- **Mindset**: Follow the protocol exactly — if gates pass, the work is done
- **Key activities**: Runs handoffs, invokes sub-agents, responds to gate failures

### Sub-Agent (Testing, Design, Database, etc.)
- **Goals**: Validate their domain within the SD scope
- **Mindset**: Specialized — focused on their validation area, trusts other gates for other concerns
- **Key activities**: Run domain-specific checks, report pass/fail with evidence

## Information Architecture

### Gate Lifecycle Flow

```
SD Creation → LEAD Approval → PLAN → EXEC → Verification → Final Approval
     │              │           │       │          │              │
     │         Q6: SCOPE_RED   │   G2: DELIVER   G1: SCOPE     G3: CHILD
     │         Q9: SD_TYPE     │   G5: SMOKE     G8: STORIES   G4: VISION
     │         Q10: OVERLAP    │   G8: STORIES
     │                         │
     │                    G4: VISION
     │                    G7: ARCH_TRACE
```

### Data Sources Per Gate

| Gate | Primary Data Source | Query Pattern |
|------|-------------------|---------------|
| SCOPE_AUDIT | sd_scope_deliverables + PRD scope field | Compare sets |
| DELIVERABLES_COMPLETENESS | sd_scope_deliverables.completion_status | Count complete vs total |
| CHILD_SCOPE_COVERAGE | Parent deliverables vs union of child deliverables | Set coverage |
| VISION_DIMENSION_COMPLETENESS | eva_vision_scores + dimension weights | Weighted threshold |
| SMOKE_TEST_VALIDATION | product_requirements_v2.smoke_test_steps | File/command existence |
| SCOPE_REDUCTION_VERIFICATION | sd_phase_handoffs scope snapshots | Delta calculation |
| ARCHITECTURE_REQUIREMENT_TRACEABILITY | eva_architecture_plans dimensions vs PRD | Dimension mapping |
| USER_STORY_COVERAGE | product_requirements_v2.user_stories[].validation_status | Status rollup |
| SD_TYPE_COMPATIBILITY | strategic_directives_v2.sd_type parent vs children | Type matrix lookup |
| OVERLAPPING_SCOPE_DETECTION | All in-progress SD scopes | Keyword intersection |

### Navigation Structure

- Gate results flow through existing `sd_phase_handoffs` records
- Gate policy controlled via `validation_gate_registry` table (runtime configuration)
- Gate applicability per SD type via `sd-type-applicability-policy.js`
- Gate failure signals feed into `gate-failure-predictor.js` for predictive quality routing

## Key Decision Points

1. **Semantic judgment mechanism**: Use structured data (deliverables tables, vision scores, story statuses) for 7 gates. Reserve LLM-based semantic comparison for the 3 gates lacking structured backing (SCOPE_AUDIT prose comparison, OVERLAPPING_SCOPE_DETECTION similarity, SMOKE_TEST executability). LLM calls must be bounded by 30-second timeout.

2. **Auto-fix guardian interaction**: Semantic gates MUST detect auto-generated artifacts and score them lower. A deliverable marked "completed" by the auto-fix guardian without corresponding code changes scores 0 for that deliverable. This prevents the circumvention pattern identified by the Challenger.

3. **Gate ordering**: Semantic gates should use `validateGatesAll()` (batch mode) not `validateGates()` (short-circuit). All 10 semantic issues should surface at once rather than requiring 10 handoff attempts.

4. **False positive mitigation**: Each gate includes a `confidence` field (0.0-1.0) in its result. Gates with confidence < 0.7 produce warnings instead of blocks, even in always-blocking mode. This handles edge cases where structured data is incomplete.

## Integration Patterns

### Existing System Integration

- **ValidationOrchestrator.js**: New gates register as standard gate modules. Zero architecture changes needed.
- **sd-type-applicability-policy.js**: 10 new validator categories added to the policy matrix.
- **gate-policy-resolver.js**: Database-driven enable/disable for runtime tuning.
- **gate-failure-predictor.js**: Semantic gate signals feed historical models automatically.
- **EVA event bus**: `gate-evaluated` events carry semantic gate results cross-system.
- **vision-completion-score.js**: Promoted from advisory to blocking (configurable threshold).

### New Integration Points

- **OrchestratorCompletionGuardian**: CHILD_SCOPE_COVERAGE gate runs before auto-completion trigger.
- **leo-create-sd.js**: OVERLAPPING_SCOPE_DETECTION runs at SD creation time.
- **Chairman dashboard**: Semantic Fidelity Score displayed alongside structural gate scores.

## Evolution Plan

### Phase 1: High Reuse (4 gates, ~1 week)
- DELIVERABLES_COMPLETENESS (reuses extract-deliverables-from-prd.js)
- USER_STORY_COVERAGE (reuses story-auto-validation.js)
- VISION_DIMENSION_COMPLETENESS (promotes vision-completion-score.js to blocking)
- SD_TYPE_COMPATIBILITY (reuses orchestrator-preflight.js)

### Phase 2: Moderate Complexity (3 gates, ~1 week)
- SCOPE_AUDIT (git diff comparison against approved scope)
- CHILD_SCOPE_COVERAGE (cross-child deliverable union analysis)
- ARCHITECTURE_REQUIREMENT_TRACEABILITY (architecture dimensions → PRD mapping)

### Phase 3: New Infrastructure (3 gates, ~2 weeks)
- SMOKE_TEST_VALIDATION (command/file existence checker)
- SCOPE_REDUCTION_VERIFICATION (scope snapshot audit trail)
- OVERLAPPING_SCOPE_DETECTION (keyword-based scope similarity)

## Out of Scope

- Rewriting the 23 existing structural gates
- Changing ValidationOrchestrator architecture
- LLM-as-judge for all 10 gates (structured data first)
- Retroactive scoring of completed SDs
- New database tables for gate results (existing tables suffice for 7 gates)

## UI/UX Wireframes

N/A — no UI component. Gates run in CLI during handoff execution. Results displayed in terminal output and stored in database for dashboard consumption.

## Success Criteria

1. **Zero "ceremony-complete but deliverable-missing" orchestrator completions** — CHILD_SCOPE_COVERAGE catches scope gaps before auto-completion
2. **Semantic Fidelity Score >= 85% average** across feature SDs within 30 days of deployment
3. **False positive rate < 5%** — fewer than 1 in 20 gate failures is a false alarm
4. **Gate execution time < 30 seconds each** — no single gate exceeds the timeout
5. **Bypass usage < 1 per SD average** — gates are accurate enough that bypasses are rare
6. **Policy matrix correctly configured** — zero incidents of wrong gate applied to wrong SD type
7. **All 10 gates deployed** within 4 weeks across 3 phases
8. **Gate failure predictor accuracy improves** — semantic signals improve prediction quality measurably
9. **Chairman review time decreases** — semantic gates enable review-by-exception rather than review-everything
10. **No velocity regression** — SD completion rate remains stable or improves despite new gates
