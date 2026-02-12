# EVA Venture Lifecycle -- Stage 17 "Pre-Build Checklist" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 17 of a 25-stage venture lifecycle -- the **first stage of THE BUILD LOOP phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT (Product/Architecture/Resources/Financials) -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP (Pre-Build/Sprint/Build/QA/Review/Deploy)
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-16)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1-9 | (See prior stage summaries -- Foundation, Engine phases complete) |
| 10 (Naming/Brand) | Add `analysisStep`. Brand genome + name candidates. naming_strategy enum. |
| 11 (Go-To-Market) | Add `analysisStep`. 3 tiers + 8 channels. channel_type enum. persona + pain_points. target_cac. |
| 12 (Sales Logic) | Add `analysisStep`. 6-value sales_model enum. Deal/funnel separation. conversion_rate_estimate on funnel_stages. |
| 13 (Product Roadmap) | Add `analysisStep`. now/next/later priority. Typed deliverables. outcomes[]. Enhanced kill gate. |
| 14 (Technical Architecture) | Add `analysisStep`. 4 core layers + additional_layers + security cross-cutting. Schema-Lite data_entities[]. Constraint categories. |
| 15 (Resource Planning) | Add `analysisStep`. Phase-aware role bundling. phase_ref on team_members + hiring_plan. severity/priority enums. budget_coherence. |
| 16 (Financial Projections) | Add `analysisStep`. "Startup Standard" P&L (Revenue/COGS/OpEx R&D-S&M-G&A/Net Income). Phase-variable costs from Stage 15. Driver-based revenue model. cash_balance_end per month. min_cash_low_point. coherence_checks[]. key_assumptions[]. Viability warnings in promotion gate. Sensitivity-derived ranges. |

**Established pattern**: Every stage from 2-16 adds an `analysisStep` that consumes prior stages. Stage 17 will follow this pattern.

**Key upstream data available to Stage 17's analysisStep**:
- **Stage 13**: Product roadmap phases, milestones, deliverables (what to build)
- **Stage 14**: Architecture layers with technologies, integration points, constraints, data entities (how to build it)
- **Stage 15**: Team members with skills and phase_ref, skill gaps, hiring plan (who builds it)
- **Stage 16**: Financial projections, cost_by_phase, promotion gate results, coherence checks, key assumptions (can we afford it)

## Pipeline Context

**What comes BEFORE Stage 17** -- Stage 16 (Financial Projections) + Promotion Gate:
- Per consensus: "Startup Standard" P&L with phase-variable costs, driver-based revenue, coherence checks, viability warnings. The promotion gate validates Blueprint completeness.

**What Stage 17 does** -- Pre-Build Checklist:
- Verify that everything planned in THE BLUEPRINT (Stages 13-16) is actually ready for execution.
- This is the "HAVE WE SET UP EVERYTHING WE SAID WE WOULD?" stage.
- **This is the bridge between PLANNING and BUILDING.** It translates plans into actionable readiness items.

**What comes AFTER Stage 17** -- Stage 18 (Sprint Planning):
- Stage 18 needs to know: what's ready, what's blocked, what needs to be set up before sprinting.

## CLI Stage 17 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-17.js`

**Input**: checklist object with 5 categories (architecture, team_readiness, tooling, environment, dependencies), each containing items with name/status/owner/notes. blockers[] with description/severity/mitigation.

**Derived**: total_items, completed_items, readiness_pct, all_categories_present, blocker_count

**Key properties**:
- 5 predefined categories (architecture, team_readiness, tooling, environment, dependencies)
- Item statuses: not_started, in_progress, complete, blocked
- Readiness percentage (completed / total × 100)
- No analysisStep (all items user-provided)
- No connection to Stages 13-16 (items don't reference prior stage outputs)
- No go/no-go decision gate (readiness_pct calculated but no threshold)
- No priority on checklist items
- No deadline/timeline on items
- Blocker severity is free text (not enum)
- No acceptance criteria per item

## GUI Stage 17 Implementation (Ground Truth)

No GUI Stage 17 exists. No pre-build checklist or readiness assessment components in the frontend.

## Your Task

Stage 17 bridges BLUEPRINT and BUILD. It should verify that the plan from Stages 13-16 is executable. The current CLI template is a generic checklist disconnected from every prior stage.

1. **What should the analysisStep generate?** The LLM has the full BLUEPRINT (roadmap, architecture, team, financials). What checklist items should it auto-generate per category? Architecture items from Stage 14 technology decisions, team items from Stage 15 composition, tooling from technology stack, etc.

2. **Prior-stage seeding**: Should each category be pre-populated from BLUEPRINT outputs? architecture items from Stage 14 layers, team items from Stage 15 members/skills/hiring, tooling from Stage 14 technologies, environment from Stage 14 infra layer, dependencies from Stage 14 integration points.

3. **Go/no-go threshold**: readiness_pct is calculated but has no threshold. Should there be a minimum readiness (e.g., 80%) before proceeding to Stage 18? Should "no blockers with severity critical" be a hard requirement?

4. **Item priority**: Should checklist items have priority (critical/high/medium/low)? Some items block everything (CI/CD pipeline), others are nice-to-have (code style guide).

5. **Item enrichment**: Should items have: deadline (target date), acceptance criteria (definition of done), source_stage_ref (which prior stage this came from)?

6. **Blocker severity**: Should this be an enum (critical/high/medium/low) per the pattern established in Stage 15?

7. **Financial readiness integration**: Should the checklist include Stage 16 promotion gate results and financial viability warnings?

8. **Category coverage**: Are the 5 categories sufficient? Missing: security readiness (from Stage 14 security profile), compliance readiness, data/infrastructure provisioning?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-16).

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

### 2. AnalysisStep Design (inputs, prior stage mapping, outputs)
### 3. Prior-Stage Seeding (category → stage mapping)
### 4. Go/No-Go Threshold Decision
### 5. Item Enrichment (priority, deadline, acceptance criteria)
### 6. Blocker Severity Enum
### 7. Financial Readiness Integration
### 8. Category Coverage Decision
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 17 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-16 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
