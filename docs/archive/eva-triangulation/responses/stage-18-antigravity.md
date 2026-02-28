---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 18 "Sprint Planning" -- AntiGravity Response (Google Gemini)

> Independent response to the Stage 18 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Upstream Integration | Implicit flow from backlog | Manual entry only | **5 Critical** | Disconnects Build from Blueprint. Roadmap items (Stage 13) may be ignored. | Close Gap | CLI could rely on user discipline, but that undermines the "System" value. |
| Readiness Gate | Checking pre-requisites | None | **5 Critical** | Risk of starting builds with critical blockers (Stage 17) unresolved. | Close Gap | Essential for the "Build Loop" integrity. |
| Capacity Planning | Velocity & Capacity tracking | Sum of Story Points only | **4 High** | Risk of overcommitment. Disregards Team limits (Stage 15). | Close Gap | Simple capacity math is sufficient; complex velocity tracking is for GUI/Stage 19. |
| Item Status | Backlog → Done flow | Static "Planned" list | **2 Low** | Minimal. Stage 18 is Planning. Status tracking belongs in Stage 19 (Execution). | Keep CLI | CLI is for generating the plan. Execution happens in the LEO Protocol/IDE. |
| User Stories | Structured "As a/I want/So that" | Title/Description | **3 Medium** | SD Bridge payloads might lack context for the Agent. | Mitigate | Enforce better description or scope in SD Bridge rather than forcing strict UI fields. |
| SD Bridge | None | Core Feature | **N/A** | CLI Superiority. | Preserve | This is the CLI's "Killer Feature". Enhance it. |
| Budget Tracking | Likely implied via resources | None | **3 Medium** | Financial drift from Stage 16 projections. | Add Basic | Warn if sprint cost > budget, but don't block. |

### 2. AnalysisStep Design

Inputs: Stage 13 (milestones, deliverables, priorities), Stage 14 (layers, tech stack), Stage 15 (team, roles, allocation), Stage 16 (phase budgets), Stage 17 (blockers, readiness).

Logic: Readiness check → backlog derivation from current milestone "now/next" deliverables → capacity analysis → strategic context aggregation.

Outputs: readiness_assessment, candidate_items (suggested, not forced), capacity_forecast, strategic_context.

### 3. Roadmap-to-Sprint Derivation

Stage 13 deliverables populate candidate_items in analysisStep output but NOT automatically forced into items array. User must select/confirm. Mapping: feature→feature, infrastructure→infra, integration→feature, content→enhancement. Sprint goal defaults to active milestone name.

### 4. Capacity Planning

Capacity Warning system. Calculate available_dev_days from Stage 15 allocation × sprint duration. If story_points > capacity (normalized), add warning. Use Developer Days as reference metric.

### 5. Stage 17 Readiness Gate

Strict gate: If Stage 17 critical blockers > 0 → block. If readiness_pct < 100% but no critical blockers → warn ("Proceed with Caution").

### 6. Phase Alignment

Add milestone_ref (or phase_ref) to sprint schema. Links sprint back to Blueprint for tracking milestone completion.

### 7. Budget Tracking

Lightweight: sprint_burn = (Stage 15 monthly cost / 4) × sprint weeks. Compare to Stage 16 burn rate. Warn if exceeds.

### 8. SD Bridge Enhancement

"Smart Context Injector": Inject Stage 14 architecture context based on target_application. Inject integration protocol details. Pre-pend Stage 13 outcome goals to success_criteria. Ensures coding agent knows HOW it fits the system, not just WHAT to build.

### 9. CLI Superiorities

SD Bridge (unique to CLI), pure planning focus (no kanban distractions), speed (rapid sprint definition).

### 10. Recommended Schema

Add milestone_ref, assigned_to (Stage 15 role), context_layer (frontend/backend/data/infra), sd_bridge_enabled per item, capacity_utilization derived.

### 11. Minimum Viable Change

1. Implement analysisStep connecting Stages 13/14/15/17 with candidate_items and readiness_check
2. Add milestone_ref linking sprint to roadmap
3. Enhance sd_bridge_payloads with Stage 14 tech stack context
4. Add readiness gate (block on critical blockers)

### 12. Cross-Stage Impact

Stage 19: Higher quality SD payloads reduce wrong tech stack errors. Stage 22: Can compare planned items vs roadmap deliverables for progress tracking.

### 13. Dependency Conflicts

Stage 13 granularity: If deliverables are too vague, analysisStep struggles to decompose. Resolution: accept suggestions, user breaks down manually. Stage 15 roles: generic "Developer" vs specific "Rick" mismatch. Resolution: keep assignments flexible.

### 14. Contrarian Take

Don't couple Stage 13 to Stage 18. Startups change direction fast. Roadmap may be stale. Over-coupling Strategy (13-16) to Tactics (17-22) creates friction. Compromise: Make connection Advisory Only. analysisStep suggests items, schema doesn't require milestone_ref validation.
