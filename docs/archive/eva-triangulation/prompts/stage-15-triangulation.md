# EVA Venture Lifecycle -- Stage 15 "Resource Planning" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 15 of a 25-stage venture lifecycle -- the **third stage of THE BLUEPRINT phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT (Product/Architecture/Resources/Financials) -- kill gate at 13
- **Stages 17-22**: THE BUILD LOOP
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-14)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1-9 | (See prior stage summaries -- Foundation, Engine phases complete) |
| 10 (Naming/Brand) | Add `analysisStep`. Brand genome + name candidates. naming_strategy enum. Decision object with working_title. |
| 11 (Go-To-Market) | Add `analysisStep`. 3 tiers + 8 channels. channel_type enum. persona + pain_points. target_cac. Coherence warnings. |
| 12 (Sales Logic) | Add `analysisStep`. 6-value sales_model enum. Deal/funnel separation. conversion_rate_estimate on funnel_stages. Economy Check in Reality Gate. |
| 13 (Product Roadmap) | Add `analysisStep`. now/next/later priority. Typed deliverables (feature/infrastructure/integration/content). outcomes[]. Enhanced kill gate. |
| 14 (Technical Architecture) | Add `analysisStep`. 4 core layers + additional_layers + security cross-cutting. Schema-Lite data_entities[]. Constraint categories. Deliverable→architecture mapping. |

**Established pattern**: Every stage from 2-14 adds an `analysisStep` that consumes prior stages. Stage 15 will follow this pattern.

## Pipeline Context

**What comes BEFORE Stage 15** -- Stage 14 (Technical Architecture):
- Per consensus: 4 core layers with technology/components/rationale, additional_layers (conditional), security profile (auth, compliance), Schema-Lite data_entities[] with complexity ratings, categorized constraints, scaling_strategy.

**What Stage 15 does** -- Resource Planning:
- Define the team composition, skill requirements, costs, and hiring plan.
- This is the "WHO builds it and at WHAT cost?" stage.

**What comes AFTER Stage 15** -- Stage 16 (Financial Projections):
- Stage 16 needs: team costs, resource allocation, and timeline to build financial projections (revenue vs costs, burn rate, runway).

## CLI Stage 15 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-15.js`

**Input**: team_members[] (min 2: role, skills[], allocation_pct 1-100, cost_monthly), skill_gaps[] (optional: skill, severity, mitigation), hiring_plan[] (optional: role, timeline, priority)

**Derived**: total_headcount, total_monthly_cost, unique_roles (must be ≥ 2), avg_allocation

**Key properties**:
- Clean team structure (role + skills + allocation + cost)
- Skill gap analysis with severity and mitigation
- Hiring plan with timeline and priority
- No analysisStep (all user-provided)
- No connection to Stage 13/14 (team doesn't reflect product/architecture needs)
- No phase-based staffing (flat team, not phased to match roadmap phases)
- No budget constraint validation (no ceiling from Stage 5 economics)
- No architecture → role mapping

## GUI Stage 15 Implementation (Ground Truth)

**Stage mapping divergence**: GUI Stage 15 = "Epic & User Story Breakdown" (completely different scope from CLI's "Resource Planning"). The GUI's user story breakdown does not exist in the CLI lifecycle -- it belongs in THE BUILD LOOP (Stages 17+).

The GUI Stage 15 is not relevant to the CLI's Resource Planning stage. This gap analysis focuses on the CLI template.

## Your Task

Stage 15 sits between architecture (what technologies and how they fit) and financial projections (what does it cost). It must translate architecture complexity into team and cost requirements. The CLI template is disconnected from prior stages.

1. **What should the analysisStep produce?** The LLM has the full architecture (layers, technologies, entity count), product roadmap (milestones, priorities, phases), and sales model. What team structure should it generate?

2. **Architecture → team mapping**: Stage 14 has 4 layers with specific technologies. How should technology choices drive team composition? React frontend → frontend developer. PostgreSQL data → DBA. Each technology implies skill requirements.

3. **Phase-based staffing**: Stage 13 has phases (Foundation → Growth → Scale) with milestones grouped by phase. Should team composition change by phase? Smaller team in Foundation, larger in Scale?

4. **Budget constraint**: Stage 5 has unit economics (CAC, payback period) and Stage 11 has GTM budget. Should Stage 15 validate that total_monthly_cost stays within economic constraints?

5. **Skill gap severity**: CLI has severity as free text. Should this be an enum? How should skill gaps connect to Stage 14 architecture decisions?

6. **Hiring plan timing**: CLI has timeline as free text. Should hiring plan milestones align with Stage 13 phase dates?

7. **Cost validation**: Should there be a coherence check comparing team cost against Stage 5 unit economics or Stage 11 GTM budget?

8. **Team structure for sales model**: Stage 12's sales_model implies team composition. Self-serve → more engineers, fewer sales. Enterprise → large sales team, solutions engineers. How should this be formalized?

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-14).

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
### 3. Architecture → Team Mapping
### 4. Phase-Based Staffing Decision
### 5. Budget Constraint Decision
### 6. Skill Gap Enhancement
### 7. Hiring Plan Alignment
### 8. Sales Model → Team Composition
### 9. CLI Superiorities (preserve these)
### 10. Recommended Stage 15 Schema
### 11. Minimum Viable Change (priority-ordered)
### 12. Cross-Stage Impact
### 13. Dependency Conflicts (with Stages 1-14 decisions)
### 14. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
