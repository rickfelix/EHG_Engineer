# Vision: Pre-Development Artifact Checklist & Quality Gates

## Executive Summary
EHG's LEO Protocol enforces 40+ gates across 4 phase transitions, but these gates are scattered across executor directories with no unified "readiness report" before implementation begins. The result: some SDs enter EXEC phase with complete artifact chains (brainstorm → vision → architecture → PRD → EVA registration), while others skip steps depending on developer diligence rather than systematic enforcement. This vision adds a unified Pre-EXEC Readiness Gate that aggregates artifact completeness into a single type-aware check — ensuring every SD has the prerequisite thinking done before code is written, without burdening small fixes with unnecessary ceremony.

The strategic bet: well-structured artifacts are not just quality gates — they are the training data that makes LEO smarter over time. Every validated artifact chain teaches the system what good pre-development thinking looks like. The artifact gate is both a quality floor and an AI performance flywheel.

## Problem Statement
The LEO Protocol's gate system is comprehensive but fragmented. PLAN-TO-EXEC validates PRD existence, architecture verification, vision dimensions, and planning completeness — but these are separate gates with no unified "are we ready?" summary. Additionally, several artifact types are checked downstream (EVA registration at vision-dimension-completeness, PRD exec_checklist at EXEC-TO-PLAN) rather than upstream (before implementation starts). The recently shipped SD-type-aware gates (PR #1890) and progressive preflight provide the right foundation for type-specific artifact requirements — but the artifact requirements themselves haven't been formalized. The gap isn't infrastructure; it's orchestration.

## Personas
- **LEO (AI Orchestrator)**: Runs the LEAD→PLAN→EXEC pipeline. Needs clear signal on whether an SD is ready for EXEC or needs more pre-work. Currently has to evaluate 16+ individual gates at PLAN-TO-EXEC without a summary view.
- **Chairman (Rick)**: Wants predictability. Needs confidence that when an SD enters implementation, the thinking has been done. Values the artifact chain as a decision audit trail — why did we build this, what alternatives were considered, what does success look like.
- **EVA (AI Strategic Advisor)**: Produces vision and architecture artifacts. Needs its outputs to be systematically consumed (registered, scored, traced) rather than optionally referenced.
- **Future Contributors**: Need the artifact chain as onboarding material. A complete brainstorm → vision → architecture → PRD chain tells a contributor everything they need to know about a feature's history and rationale.

## Information Architecture
- **Pre-EXEC Readiness Report**: Single aggregated view showing artifact completeness per SD. Lists: brainstorm (exists/missing), vision (registered/scored/missing), architecture (registered/traced/missing), PRD (exists/approved/has-exec-checklist), EVA registration (complete/partial/missing). Color-coded: green (all present), yellow (optional missing), red (required missing).
- **Type-Aware Artifact Requirements**: Matrix of SD types × artifact requirements. Feature/infrastructure require all 5 artifacts. Fix/bugfix require only PRD. Documentation/enhancement require only PRD and exploration audit. Quick-fixes exempt from all artifact gates.
- **Artifact Quality Scoring**: Beyond existence checks — brainstorm must have team analysis section, vision must have ≥5 dimensions scored, architecture must have implementation phases, PRD must have user stories linked to requirements. Quality thresholds prevent boilerplate artifacts from passing.
- **Existing Infrastructure Extended**: BaseExecutor (gate template), ValidationOrchestrator (gate runner), SD Type Validation (type-aware rules), Progressive Preflight (fast-fail), Database-driven leo_validation_rules (dynamic configuration).

## Key Decision Points
- **Advisory First, Blocking Later**: Pre-EXEC Readiness Gate starts as advisory for 30 days to gather baseline data on current artifact coverage. After calibration, graduates to blocking for feature/infrastructure SDs. This addresses the Challenger's concern about adding blocking gates without evidence.
- **Type-Aware from Day 1**: No artifact burden on quick fixes, bugfixes, or documentation SDs. The type-aware gate system (PR #1890) already provides the foundation. Artifact requirements scale with SD complexity, not applied uniformly.
- **Quality Checks, Not Just Existence Checks**: The retrospective quality gate pattern (MEMORY.md) shows that existence alone doesn't ensure value. Brainstorm docs must contain team analysis. Vision docs must have scored dimensions. Architecture docs must have implementation phases. PRDs must have exec_checklist populated.
- **EVA Registration Advisory Until Intake Redesign Ships**: EVA registration check starts advisory because the EVA intake redesign is still being built. Graduates to blocking once EVA intake is production-ready. This avoids coupling to a system under construction.
- **Recency Not Enforced Initially**: Artifact staleness is a real risk but adds complexity. Defer recency checks to Phase 2 after measuring whether stale artifacts actually cause problems (evidence-based gating).

## Integration Patterns
- **PLAN-TO-EXEC Gate**: The primary enforcement point. Pre-EXEC Readiness Gate runs as part of the existing PLAN-TO-EXEC handoff, alongside the 16+ existing gates. Uses the same BaseExecutor template and ValidationOrchestrator infrastructure.
- **Progressive Preflight**: Artifact completeness as a fast-fail preflight check. Before full PLAN-TO-EXEC evaluation, preflight verifies required artifacts exist. Saves token budget on full gate evaluation when prerequisites are clearly missing.
- **Learn Command**: After 50+ SDs pass through artifact gates, learn can correlate artifact quality with implementation outcomes. "SDs with comprehensive architecture docs had 40% fewer mid-implementation changes." Evidence feeds back into gate calibration.
- **Heal Command**: Extended to verify implementation against the full artifact chain, not just the PRD. Architecture promises, vision commitments, and success criteria from brainstorm docs all become verifiable against the actual codebase.
- **sd:next Display**: Queue display shows artifact readiness status per SD. "SD-X: 4/5 artifacts ready (missing: architecture doc)" helps the chairman and LEO prioritize pre-work before implementation.

## Evolution Plan
- **Phase 1** (2 weeks): Unified Pre-EXEC Readiness Gate — Single gate aggregating artifact checks. Type-aware requirements matrix. Advisory mode for 30 days. Integrated into PLAN-TO-EXEC handoff. Dashboard output in sd:next.
- **Phase 2** (1 week): Quality Elevation — Promote readiness gate to blocking for feature/infrastructure SDs. Add artifact quality scoring (not just existence). EVA registration gate (advisory). Exploration audit elevated to blocking.
- **Phase 3** (1 week): Orchestrator Coherence — PLAN-TO-EXEC orchestrator coherence validation. PRD exec_checklist validation. Phase coverage validator wired in. Learn command correlation analysis.

## Out of Scope
- Auto-generating artifacts (future — LEO drafts artifacts based on brainstorm input)
- Artifact versioning and change tracking (future — diff between vision v1 and v2)
- Artifact recency enforcement (deferred to Phase 2 pending evidence)
- Cross-SD artifact dependency resolution (future — SD-Y depends on SD-X's architecture)
- External reviewer workflow (future — human review of artifact quality)
- Genesis customer-facing artifact pipeline (handled by Genesis SD)

## UI/UX Wireframes
N/A — this surfaces through existing interfaces: sd:next queue display (artifact readiness badges), handoff system output (gate pass/fail with missing artifacts), and progressive preflight output (fast-fail on missing prerequisites).

## Success Criteria
- Unified Pre-EXEC Readiness Gate operational for all SD types
- Type-aware artifact requirements: feature/infrastructure require 5 artifacts, fix/bugfix require 1, quick-fix exempt
- Zero blocking-gate false positives on Tier 1/2 work items (quick fixes pass without ceremony)
- Artifact quality checks prevent boilerplate from passing (brainstorm has team analysis, vision has scored dimensions)
- After 30-day advisory period: baseline data on current artifact coverage collected
- After blocking promotion: <10% of feature/infrastructure SDs fail readiness gate (indicating upstream pipeline produces artifacts consistently)
- Learn command correlation: measurable relationship between artifact quality and implementation outcomes (positive or null — data decides)
- No measurable velocity decrease for Tier 1/2 work items (quick fixes unaffected)
