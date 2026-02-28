---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 15 "Resource Planning" -- AntiGravity Response (Google Gemini)

> Independent response to the Stage 15 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Architecture Mapping | Implicit linking to tech stack | None (free-text roles) | **5 Critical** | Financials (Stage 16) are wild guesses without tech-driven staffing. | Must Close | Can we infer roles from layers in Stage 14 without explicit mapping? Yes, but it's brittle. |
| Phased Staffing | Time-based resource allocation | Flat team structure (snapshot) | **5 Critical** | Impossible to calculate burn rate over time. Runway assumes constant cost. | Must Close | Maybe just 3 snapshots (Year 1, 2, 3) instead of monthly? |
| Sales Model Logic | Sales headcount ratios | None | **4 High** | Misaligns GTM strategy with execution capability. | Must Close | Simple heuristics (1 sales rep per $X revenue) might suffice. |
| Budget Constraints | Warnings on burn rate | None | **3 Medium** | User can build a "dream team" that bankrupts the startup in month 2. | Should Close | Stage 16 (Financials) will catch this, but Stage 15 should warn. |
| Skill Gap Analysis | Automated suggestions | Manual input | **2 Low** | Minimal analytical impact, mostly UX. | Nice to Have | Let the user define gaps; AI just prompts them. |
| Hiring Roadmap | Linked to milestones | Free-text timeline | **4 High** | Delays product delivery if hiring lags behind roadmap needs. | Must Close | Hiring dates must precede milestone start dates. |

### 2. AnalysisStep Design

**Inputs**: Stage 14 (layer technologies), Stage 13 (phases/milestones), Stage 12 (sales_model), Stage 11 (GTM channels)

**Outputs**: suggested_team (roles with quantities, mapped to source), phased_headcount (by phase), critical_hires (roles before specific milestones)

### 3. Architecture → Team Mapping

Deterministic mapping from Technology → Role. Frontend tech → Frontend Engineer, Backend tech → Backend Engineer, Data tech → DBA/Backend, Infra tech → DevOps, Mobile (additional) → Mobile Developer.

### 4. Phase-Based Staffing Decision

Keep team_members as current/initial team. Enhance hiring_plan with phase_id or milestone_id links. Foundation: Core engineers (CTO, 2 Devs). Growth: Add Sales/Marketing. Scale: Add Specialists.

### 5. Budget Constraint Decision

Rule: (total_monthly_cost * runway_months) <= initialInvestment. Warning if exceeded.

### 6. Skill Gap Enhancement

Enum severity: critical/high/medium/low. Auto-Detection: If Stage 14 lists "Kubernetes" but no team member has "DevOps" skill → Critical Gap.

### 7. Hiring Plan Alignment

Replace free-text timeline with trigger_milestone (matches Stage 13 Milestone). Hire Date must be < Milestone Start Date - onboarding time.

### 8. Sales Model → Team Composition

Self-Serve: High Engineering, High Marketing, Low/No Sales. Inside Sales: SDRs + AEs (1:2 ratio). Enterprise: Field Sales, Solutions Engineers.

### 9. CLI Superiorities

Simplicity (flat list easy to edit), Cost Clarity (explicit cost_monthly per person).

### 10. Recommended Schema

team_members with phase_start, hiring_plan with trigger_milestone + estimated_cost, burn_rate_validation (derived: monthly_burn, runway_months, is_sustainable).

### 11. Minimum Viable Change

1. Add analysisStep
2. Add phase_start to Team/Hiring
3. Link Hiring to Milestones

### 12. Cross-Stage Impact

Stage 16: Massive -- needs phased staffing for P&L. Stage 13: Reciprocal -- if can't afford team, timeline extends.

### 13. Dependency Conflicts

Stage 5 vs 15: team may exceed initialInvestment. Stage 12 vs 15: Enterprise sales model but no sales staff.

### 14. Contrarian Take

"Don't couple Architecture to Team too tightly." Just because we use React doesn't mean we hire a "React Developer." We might hire a "Full Stack Dev." Over-specifying roles creates bloated headcount. Early stage startups thrive on generalists. Default to Generalist Roles (Product Engineer) unless complexity demands specialists.
