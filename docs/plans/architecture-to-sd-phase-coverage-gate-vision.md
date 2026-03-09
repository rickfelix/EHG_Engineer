# Vision: Architecture-to-SD Phase Coverage Gate — Go/No-Go Before Execution

## Executive Summary

The LEO Protocol has a governance gap between architecture plan approval and Strategic Directive creation. When an architecture plan defines multiple implementation phases, nothing validates that the SDs created from that plan collectively cover ALL phases. This allows phases — including substantial deliverables like UI components — to be silently dropped without detection.

This vision introduces a mandatory go/no-go checkpoint: the Architecture Phase Coverage Gate. Before any orchestrator SD begins execution (LEAD-TO-PLAN), the gate verifies that every implementation phase in the architecture plan has a corresponding SD — either as a child of the orchestrator or as a linked separate orchestrator. An advisory warning fires at SD creation time; a blocking gate fires at the LEAD-TO-PLAN handoff. The gate operates on structured phase data stored in the existing `sections` column of `eva_architecture_plans`, eliminating reliance on runtime markdown parsing.

The end state is a protocol where architecture plans are active contracts, not passive documents. The Chairman gets a clear go/no-go moment with full visibility into what's being committed to before any code is written.

## Problem Statement

**Who is affected**: The Chairman (strategic oversight) and the LEO Orchestrator (autonomous execution agent).

**Current impact**: The Strategic Roadmap architecture plan defined 3 phases. An orchestrator SD was created with children for Phases 1-2 only. Phase 3 (Chairman UI tab on Vision route, explicitly marked "separate orchestrator") was never created as an SD. The backend shipped complete but the UI deliverable — the feature the Chairman would actually interact with — was silently dropped. Discovery happened only through ad-hoc manual review after all SDs were marked "completed."

**Root cause**: Zero validation exists between architecture plan phases and created SDs. The `create-orchestrator-from-plan.js` script has `--auto-children` but it is optional and advisory-only. The `sections` column on `eva_architecture_plans` exists but is always NULL — phases live in raw markdown with no structured representation. No gate compares "phases defined" against "SDs created."

**Pattern frequency**: First detected instance, but every completed orchestrator SD has this latent risk. The gap has existed since architecture plans were introduced.

## Personas

### Chairman (Rick)
- **Goals**: Ensure every phase committed in an architecture plan is tracked and delivered. See the full commitment before execution begins. Catch scope gaps upfront, not after completion.
- **Mindset**: "If it's in the plan, it needs an SD. If it doesn't need an SD, it shouldn't be in the plan." Strict accountability — no silent drops.
- **Key activities**: Reviews go/no-go coverage report at LEAD-TO-PLAN. Confirms all phases are assigned. Creates additional SDs for missing phases before approving execution.

### LEO Orchestrator (Claude)
- **Goals**: Execute the architecture plan completely and faithfully. Know at LEAD-TO-PLAN whether all phases are covered rather than discovering gaps at orchestrator completion.
- **Mindset**: Process compliance should equal delivery compliance. If the gate passes, the plan is fully tracked.
- **Key activities**: Receives advisory warnings at SD creation. Responds to blocking gate at LEAD-TO-PLAN by creating missing SDs or flagging the gap to the Chairman.

## Information Architecture

### Views
1. **Phase Coverage Report** (Primary): At LEAD-TO-PLAN, displays a coverage matrix — each architecture phase mapped to its corresponding SD (child or external), with status. Unmapped phases are highlighted as blocking.
2. **Advisory Warning** (Secondary): At SD creation time, displays uncovered phases as a non-blocking warning. Prompts for immediate coverage or deferred action.

### Data Sources
- `eva_architecture_plans.sections` — Structured JSONB containing parsed phases with number, title, description, and assigned SD key
- `eva_architecture_plans.content` — Raw markdown content (fallback for phase extraction if sections is unpopulated)
- `strategic_directives_v2` — SD records with parent_sd_id for child relationships and arch_key for plan linkage
- `sd_phase_handoffs` — Handoff records where the blocking gate fires

### Navigation
- Gate fires automatically during `node scripts/unified-handoff-system.js execute LEAD-TO-PLAN <SD-ID>`
- Advisory fires during `node scripts/leo-create-sd.js` when `--arch-key` is provided
- Phase coverage data queryable via `eva_architecture_plans.sections` for dashboard consumption

## Key Decision Points

1. **Structured vs runtime phase extraction**: Populate `sections` column with structured phase data at architecture plan creation/approval time. Do NOT rely on runtime markdown parsing — it is fragile and non-deterministic. The `parsePhases()` function from `create-orchestrator-from-plan.js` is reused for initial extraction, but the structured output is stored and becomes the source of truth.

2. **"Separate orchestrator" linkage**: When a phase specifies "separate orchestrator," the gate requires a linked SD to exist. The linkage is stored in the `sections` JSONB as `covered_by_sd_key` for each phase. This is set either at SD creation time (when the user provides the linkage) or resolved by the gate (prompting for the SD key if missing).

3. **Strict enforcement without deferral**: Every phase must have an SD. There is no "deferred" mechanism. If a phase is in the architecture plan, it gets an SD. If it shouldn't get an SD, it shouldn't be in the architecture plan as a phase. This is a deliberate design choice — simplicity over flexibility.

4. **Grandfathering**: SDs already past LEAD-TO-PLAN at deployment time are not retroactively blocked. The gate fires only for SDs entering LEAD-TO-PLAN after deployment.

## Integration Patterns

### Upstream (Feeds Into Gate)
- Architecture plan creation (`archplan-command.mjs`) — populates `sections` JSONB with parsed phases
- SD creation (`leo-create-sd.js`) — advisory warning on uncovered phases
- Brainstorm pipeline (Step 9.5C) — architecture plans created with structured Implementation Phases section

### Downstream (Gate Feeds Into)
- LEAD-TO-PLAN handoff (`unified-handoff-system.js`) — blocking gate prevents execution without coverage
- Orchestrator completion — all phases having SDs means completion check is more meaningful
- HEAL scoring — phase coverage percentage as a quality dimension

### Existing Systems (No Modification)
- Semantic Validation Gates — separate lifecycle stage (in-execution vs pre-execution)
- CHILD_SCOPE_COVERAGE (Gate 3) — complementary check at different point
- SD execution baselines — unaffected
- AUTO-PROCEED mode — gate fires and blocks regardless of auto-proceed status

## Evolution Plan

### Phase 1: Foundation (This SD)
- Populate `sections` column with structured phase data during architecture plan creation
- Write backfill script for existing architecture plans
- Create `phase-coverage-validator.js` with pure validation logic
- Add advisory warning in `leo-create-sd.js` for uncovered phases
- Add blocking gate in `unified-handoff-system.js` at LEAD-TO-PLAN

### Phase 2: Architecture Delivery Tracking (Future)
- Architecture completion dashboard — percentage of phases with completed SDs
- HEAL scoring at architecture level — aggregate alignment signal
- Baseline rollup from SD-level to architecture-level for burn rate forecasting

## Out of Scope

- Modifying existing semantic validation gates
- Changing the `create-orchestrator-from-plan.js` auto-children behavior (remains opt-in)
- Retroactive scoring of completed orchestrators
- Phase deferral mechanism — every phase in the plan must have an SD
- Architecture plan versioning/locking (future concern, not this SD)
- UI dashboard for phase coverage (future, builds on structured data)

## UI/UX Wireframes

N/A — no UI component. Gate fires during CLI handoff execution. Advisory warnings and blocking messages displayed in terminal output. Structured phase data stored in database for future dashboard consumption.

## Success Criteria

1. **Zero silently dropped phases** — every phase in an architecture plan has a corresponding SD before LEAD-TO-PLAN passes
2. **`sections` column populated** for all architecture plans created after deployment, plus backfill of existing plans
3. **Advisory warning fires at SD creation** when uncovered phases exist — informational, non-blocking
4. **Blocking gate fires at LEAD-TO-PLAN** when any phase lacks an SD — prevents execution until coverage is complete
5. **"Separate orchestrator" phases are tracked** via `covered_by_sd_key` in sections JSONB
6. **No regression** — existing in-progress SDs past LEAD-TO-PLAN are grandfathered
7. **Gate execution time < 5 seconds** — single database query against structured JSONB, no LLM calls
8. **No false positives in first 5 orchestrator SDs** — phase parsing accuracy validated during advisory-only rollout
