---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 18 "Sprint Planning" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 18 of a 25-stage venture lifecycle -- the **second stage of THE BUILD LOOP phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT (Product/Architecture/Resources/Financials) -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-17)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1-12 | (See prior stage summaries -- Foundation, Engine, Identity phases complete) |
| 13 (Product Roadmap) | Add `analysisStep`. now/next/later priority. Typed deliverables (feature/infrastructure/integration/content). outcomes[]. Enhanced kill gate. |
| 14 (Technical Architecture) | Add `analysisStep`. 4 core layers + additional_layers + security cross-cutting. Schema-Lite data_entities[]. Constraint categories. |
| 15 (Resource Planning) | Add `analysisStep`. Phase-aware role bundling. phase_ref on team_members + hiring_plan. severity/priority enums. budget_coherence. |
| 16 (Financial Projections) | Add `analysisStep`. "Startup Standard" P&L. Phase-variable costs. Driver-based revenue. cash_balance_end. coherence_checks[]. key_assumptions[]. Viability warnings in promotion gate. |
| 17 (Pre-Build Checklist) | Add `analysisStep`. Seed items from Stages 13-16 by category. priority (critical/high/medium/low). source_stage_ref. build_readiness decision (go/conditional_go/no_go). Blocker severity enum. |

**Established pattern**: Every stage from 2-17 adds an `analysisStep` that consumes prior stages. Stage 18 will follow this pattern.

**Key upstream data available to Stage 18's analysisStep**:
- **Stage 13**: Phases with milestones, deliverables (typed: feature/infrastructure/integration/content), now/next/later priority, outcomes
- **Stage 14**: Architecture layers with technologies, data entities, integration points
- **Stage 15**: Team members with skills, allocation_pct, phase_ref, cost_monthly
- **Stage 16**: Cost_by_phase, financial projections
- **Stage 17**: Build readiness decision (go/conditional_go/no_go), completed checklist items, remaining blockers

## Pipeline Context

**What comes BEFORE Stage 18** -- Stage 17 (Pre-Build Checklist):
- Per consensus: Generated checklist from Blueprint stages, build_readiness decision, critical items tracking.

**What Stage 18 does** -- Sprint Planning:
- Plan the first sprint of actual building. Translate roadmap deliverables into sprint items.
- **This is where PLANNING becomes EXECUTION.** Deliverables from Stage 13 become sprint items that generate SD bridge payloads.

**What comes AFTER Stage 18** -- Stage 19 (Build Execution):
- Stage 19 needs: prioritized sprint items with clear scope, success criteria, and SD payloads for the LEO Protocol.

**CLI's unique feature**: The **SD Bridge** -- each sprint item generates a Strategic Directive draft payload. This connects the EVA venture lifecycle to the LEO Protocol execution system.

## CLI Stage 18 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-18.js`

**Input**: sprint_name, sprint_duration_days (1-30), sprint_goal (min 10 chars), items[] (title, description, priority, type, scope, success_criteria, dependencies[], risks[], target_application, story_points)

**Derived**: total_items, total_story_points, sd_bridge_payloads[]

**Key properties**:
- SD Bridge: Each item → SD draft payload (title, description, priority, type, scope, success_criteria, dependencies, risks, target_application)
- SD_TYPES: feature, bugfix, enhancement, refactor, infra
- PRIORITY_VALUES: critical, high, medium, low
- No analysisStep (all sprint items user-provided)
- No roadmap connection (items not derived from Stage 13 deliverables)
- No capacity planning (story_points summed but not compared to team capacity)
- No Stage 17 readiness check
- No phase_ref on sprint
- Single sprint per invocation

## GUI Stage 18 Implementation (Ground Truth)

**GUI Stage 18 = "MVP Development Loop"** -- broader scope than CLI's "Sprint Planning."

Components: Stage18MvpDevelopmentLoop.tsx, Stage18MVPDevelopment.tsx, Stage18Viewer.tsx

**GUI features beyond CLI**: Sprint management with dates (not just duration), user stories (As a/I want/So that), item status tracking (backlog→in_progress→review→done), velocity/capacity, MoSCoW prioritization, technical debt tracking, progress visualization, feedback/sentiment.

## Your Task

Stage 18 is where BUILD LOOP begins. It must translate the BLUEPRINT into actionable sprint items. The CLI has the excellent SD Bridge innovation but disconnects from all prior stages. The GUI has richer sprint management but lacks the SD Bridge.

1. **What should the analysisStep generate?** Stage 13 has typed deliverables with now/next/later priority. The analysisStep should derive sprint items from "now" priority deliverables for the current phase. How should deliverable types (feature/infrastructure/integration/content) map to SD types?

2. **Roadmap-to-sprint derivation**: Should Stage 13 deliverables automatically become sprint items? Should milestones map to sprint goals?

3. **Capacity planning**: Stage 15 has team members with allocation_pct and skills. Should the analysisStep calculate sprint capacity and warn if total_story_points exceeds capacity?

4. **Stage 17 readiness gate**: Should Stage 18 require build_readiness = 'go' or 'conditional_go' from Stage 17?

5. **Item status**: CLI items are static (planned). GUI tracks backlog→in_progress→review→done. Is item status needed at the PLANNING stage, or is that Stage 19's job?

6. **Phase alignment**: Should the sprint reference which Stage 13 phase it belongs to? Should sprint_goal validate against phase goals?

7. **Budget tracking**: Stage 16 has cost_by_phase. Should the sprint track estimated cost against the phase budget?

8. **SD Bridge enhancement**: The SD Bridge is powerful but currently just copies fields. Should it enrich payloads with architecture context (Stage 14) or team assignment recommendations (Stage 15)?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-17).

## Gap Importance Rubric

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect downstream decisions |
| 4 | **High** | Significantly degrades downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure already address it differently?

## Output Format

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |

### 2. AnalysisStep Design (inputs, deliverable-to-item mapping, outputs)
### 3. Roadmap-to-Sprint Derivation
### 4. Capacity Planning Decision
### 5. Stage 17 Readiness Gate
### 6. Phase Alignment
### 7. Budget Tracking Decision
### 8. SD Bridge Enhancement
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 18 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-17 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
