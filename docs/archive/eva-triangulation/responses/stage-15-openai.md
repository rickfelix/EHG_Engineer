---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 15 "Resource Planning" -- OpenAI Response (GPT 5.3)

> Independent response to the Stage 15 triangulation prompt.
> Respondent: OpenAI (GPT 5.3)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Stage purpose alignment | GUI is different scope (epics/stories) | Resource planning only | **3 Medium** | Confusion in cross-tool comparisons | Keep CLI scope; ignore GUI parity | Don't port GUI blindly |
| `analysisStep` generation | N/A for this scope | Missing | **5 Critical** | Stage 16 gets weak/hand-entered assumptions | Add analysisStep | If user-provided teams are trusted, analysis may be optional override |
| Architecture → role mapping | N/A | Missing | **5 Critical** | Under/over-staffing, missing key competencies | Add deterministic mapping from Stage 14 | Avoid hard-coding too tightly to specific frameworks |
| Roadmap phase staffing | N/A | Flat team only | **4 High** | Timeline/cost burn not phase-realistic | Add phase staffing profile | Could overcomplicate if roadmap phases are fuzzy |
| Budget/economics coherence | N/A | Missing | **5 Critical** | Financial projections invalid from day 1 | Add warnings against Stage 5 + 11 | Warnings first, not hard fails |
| Skill gap severity normalization | N/A | Free text severity | **4 High** | Poor comparability and weak automation | Use enum severity + source linkage | Don't remove free-text notes entirely |
| Hiring timeline alignment | N/A | Free text timeline | **4 High** | Hiring plan drifts from roadmap | Tie triggers to Stage 13 phase/milestone IDs | Keep optional manual dates |
| Sales model → team composition | N/A | Missing | **4 High** | GTM/sales execution mismatch | Add model-based team ratio heuristics | Keep as recommendation band, not rigid formula |

### 2. AnalysisStep Design

**Inputs**: Stage 13 (phases, milestones, priorities), Stage 14 (layers, technologies, data_entities complexity, constraints, security), Stage 12 (sales_model), Stage 11 (GTM channels + budget), Stage 5 (unit economics)

**Outputs**: recommended_team_structure[], staffing_by_phase[], skill_gaps[] with enum severity, hiring_plan[] with triggers, coherence_checks[], confidence + assumptions[]

### 3. Architecture → Team Mapping

Two-pass mapper: 1) Layer/tech → capability (Frontend→FE Engineer, Data→DBA, Security→Security Engineer, Infra→DevOps/SRE). 2) Capability → role package based on venture size: Lean (full-stack + fractional specialists), Growth (dedicated FE/BE/DevOps), Scale (add DBA/security/QA/analytics).

### 4. Phase-Based Staffing

Foundation: minimum viable team, broad generalists. Growth: split FE/BE, add QA + DevOps. Scale: add specialization (SRE, DBA, security, analytics, support). Use Stage 13 phase boundaries as controlling timeline.

### 5. Budget Constraint Decision

Graded coherence checks: A) monthly burn vs Stage 5 envelope, B) cost trajectory vs Stage 11 GTM spend, C) payback sensitivity warning. Return warning/risk/critical (not immediate hard fail).

### 6. Skill Gap Enhancement

Replace severity with enum: low/medium/high/critical. Add: source_stage, source_reference, mitigation_type (hire/contract/upskill/de-scope/partner), target_phase.

### 7. Hiring Plan Alignment

Milestone-linked triggers: trigger_type (phase_start/milestone_due/risk_threshold), trigger_ref (Stage 13 ID), optional latest_start_date, priority enum computed from critical path.

### 8. Sales Model → Team Composition

Self-serve: high product/engineering ratio, low direct sales. Product-led + assisted: add solutions/support. Enterprise-led: add AE/SE/CSM early. Represent as FTE ratio bands.

### 9. CLI Superiorities

Clean explicit team member schema, direct cost fields, existing skill gap + hiring plan primitives.

### 10. Recommended Schema

Add: analysisStep object, staffing_by_phase[], coherence_checks[], enum normalization, structured hiring triggers, role_source_mapping[].

### 11. Minimum Viable Change

1. Add analysisStep from Stages 13/14/12
2. Add architecture→role mapping + phase staffing
3. Add budget/economics coherence checks
4. Normalize skill gap severity + source linkage
5. Add milestone/phase-aligned hiring triggers

### 12. Cross-Stage Impact

Stage 16: Improves cost realism, burn/runway modeling. Upstream: Forces better Stage 13 milestone IDs and Stage 14 tech metadata. Quality: Reduces manual guesswork.

### 13. Dependency Conflicts

No hard conflicts. Soft: If Stage 13 lacks stable phase IDs, hiring alignment degrades. If Stage 14 tech detail is shallow, role mapping confidence drops.

### 14. Contrarian Take

Over-engineering into pseudo workforce planner before Stage 13/14 metadata is consistently high quality. Safer: Ship thin analysisStep first (recommendations + warnings), keep user override primary, collect outcomes, then tighten.
