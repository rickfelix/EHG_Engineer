# Brainstorm: User Story Requirements Undiscoverable

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Legacy (3/3 personas)
- **Related Ventures**: None (internal protocol improvement)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement
The LEO protocol's user story quality gate (`userStoryQualityValidation`) enforces strict requirements — `implementation_context` NOT NULL, `given_when_then` arrays, `testing_scenarios`, 400+ character benefits, specific pass/fail acceptance criteria — but none of these requirements are documented or discoverable before the gate fails. The PRD creation script (`add-prd-to-database.js`) doesn't mention them, `CLAUDE_PLAN.md` doesn't list them, and the scoring rubric only appears in the gate's error message after a failed handoff attempt. This results in 2-3 failed handoff cycles per SD, burning 30-90 minutes of rework each time.

## Discovery Summary

### The Discoverability Problem
- `userStoryQualityValidation` scored board governance stories at 31% (threshold: 55%)
- `acceptance_criteria_clarity_testability`: 1-3/10 — "vague, untestable"
- `story_independence_implementability`: 2-4/10 — "lack sufficient detail"
- `benefit_articulation`: 3-4/10 — "generic and not user-centric"
- `implementation_context` column has NOT NULL check constraint — first INSERT fails
- `given_when_then` and `testing_scenarios` arrays expected but never documented
- Benefits should be 400+ characters, persona-specific
- Acceptance criteria must be specific pass/fail assertions

### Root Cause (Challenger Discovery)
The problem is **two-fold**, not just documentation:
1. **Discoverability gap**: Requirements exist across 6+ locations (check constraints, AI rubric prompts, heuristic validators, SD-type thresholds, trigger logic, improvement guidance) with no unified reference
2. **Pipeline data-mapping bug**: The story generator in `auto-trigger-stories.mjs` already embeds the full rubric criteria in its LLM prompt, but the INSERT mapping drops `given_when_then`, `testing_scenarios`, and `architecture_references` columns. The generator knows what to produce; the pipeline loses it on the floor.

### Design Decisions
1. **Both approaches**: Template command (`npm run story:template [SD-KEY]`) for quick reference AND PRD script generates skeleton stories with correct structure
2. **Hardcoded curated summary**: Template reads from a curated requirements summary, not dynamically extracted from LLM prompt strings (AI rubric criteria aren't machine-parseable)
3. **Pipeline fix included**: Fix INSERT mapping in `auto-trigger-stories.mjs` to populate `given_when_then`, `testing_scenarios`, `architecture_references`
4. **Populate gate_requirements_templates**: Use the existing (empty) database table for user story requirements — pattern reusable for other gates
5. **Forward-only**: No migration for existing stories

## Analysis

### Arguments For
1. **Immediate friction relief** — any agent writing stories gets requirements upfront instead of after 2-3 failed handoff attempts (30-90 min saved per SD)
2. **Existing infrastructure** — `gate_requirements_templates` table exists but is empty, `ValidatorRegistry` is extensible, rubric code is modular
3. **Cross-gate pattern** — same discoverability problem exists for retrospective, PRD, and SD creation gates. Solving for stories creates a reusable pattern
4. **Low cost** — 2 days total, ~100 LOC for Part A (template), targeted fixes for Part B (pipeline)

### Arguments Against
1. **Treats symptom AND cause simultaneously** — risk of scope creep if pipeline fix is harder than expected
2. **Dynamic derivation is fragile** — AI rubric criteria are LLM prompts, not parseable rules. Template will be hardcoded and may drift over time
3. **False confidence risk** — skeleton stories that pass CHECK constraints but score low on AI rubric are worse than no skeleton

### Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 8/10 | 3+ failed handoff attempts per SD (30-90 min wasted). Affects every SD with user stories |
| Value Addition | 9/10 | Direct: eliminates rework. Compound: gate contracts pattern applies to ALL gates |
| Risk Profile | 3/10 | Low breaking change risk (additive). Low regression (read-only template + targeted pipeline fix) |
| **Decision** | | **(8+9) > 3×2 = 17 > 6 → Implement** |

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. The rubric is AI-scored, not rule-based — a template cannot guarantee a passing score (semantic quality > structural completeness)
  2. The `given_when_then` column is never populated by the generation pipeline — INSERT mapping drops it
  3. SD-type-aware thresholds (50% to 70%) create a moving target a single template can't address
- **Assumptions at Risk**:
  1. "Discoverability is the bottleneck" — the generator already embeds the rubric. The bottleneck is data-mapping.
  2. "A skeleton structure will pass the gate" — 50%-weighted criterion is semantic quality, not structure
  3. "Dynamic derivation keeps template current" — LLM prompts aren't machine-parseable
- **Worst Case**: False confidence loop where skeleton passes CHECK constraints but fails AI rubric at 25-35%, creating 3+ retry cycles with worse stories than from-scratch writing

### Visionary
- **Opportunities**:
  1. **Gate Requirements Contract System** — unified, machine-readable requirements for ALL gates via `gate_requirements_templates` table (already exists, unpopulated)
  2. **Generative Scaffolding** — PRD script consumes gate contracts to produce gate-ready artifacts on first attempt
  3. **Progressive Disclosure Dashboard** — requirements at 3 levels: pre-creation checklist, during-creation hints, post-creation diagnostics
- **Synergies**: Connects to Gate Evaluation Architecture brainstorm, stories-agent v2.0, retrospective quality gate pattern, SD-type threshold calibration
- **Upside Scenario**: Zero-failure handoffs become the norm. At 50 SDs/year × 2-4 hours rework/SD = 100-200 hours recovered annually

### Pragmatist
- **Feasibility**: 4/10 (Low-Medium Difficulty)
- **Resource Requirements**: 2 days, single developer, no new dependencies, no DB migrations, zero cost
- **Constraints**:
  1. Dynamic derivation fragile — hardcode curated summary instead
  2. SD-type thresholds need template to accept SD-KEY argument
  3. Skeleton quality bar is non-deterministic (LLM-scored) — target strictest thresholds
- **Recommended Path**: Part A (template command) first → 1 day. Part B (pipeline fix) second → 1 day. Part A serves as acceptance criteria spec for Part B.

### Synthesis
- **Consensus**: Template command is valuable, feasible, and urgent. Use `gate_requirements_templates` table.
- **Tension**: Template alone is insufficient — pipeline data-mapping bug is the root cause. Both must ship together.
- **Composite Risk**: Medium (template low-risk, but without pipeline fix creates false resolution)

## Out of Scope
- Fixing other gates' discoverability (retrospective, PRD, SD creation) — pattern established here, separate SDs
- AI rubric redesign or threshold recalibration — existing scoring logic is kept as-is
- Retrospective migration of existing stories to new format

## Open Questions
- Should the template command also show an example story that would score 80%+? (Pragmatist recommends yes)
- Should `gate_requirements_templates` be populated via migration or seed script?
- How to detect template-gate drift over time? (Potential future: hash-based staleness check)

## Suggested Next Steps
1. Create SD from this brainstorm with vision/architecture docs
2. Implement Part A: `scripts/story-requirements-template.js` + `npm run story:template [SD-KEY]`
3. Implement Part B: Fix INSERT mapping in `auto-trigger-stories.mjs` for dropped columns
4. Populate `gate_requirements_templates` for PLAN_TO_EXEC user story validators
5. Update CLAUDE_PLAN.md generation to include story requirements reference
