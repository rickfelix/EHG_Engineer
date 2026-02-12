# Stage 18 "Sprint Planning" -- OpenAI Response (GPT 5.3)

> Independent response to the Stage 18 triangulation prompt.
> Respondent: OpenAI (GPT 5.3)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| `analysisStep` missing | Rich planning context in UI loop | None (manual items only) | **5 Critical** | Stage 19 gets disconnected sprint items with weak traceability | Add analysisStep | If teams prefer pure manual sprinting, keep manual override path |
| Roadmap linkage (Stage 13 → 18) | Implicit via GUI workflow | No derivation from deliverables | **5 Critical** | Build loop can drift from roadmap priorities | Derive default items from "now" deliverables | Over-automation risk; keep suggested items editable |
| Milestone → sprint goal mapping | GUI has broader loop context | Free-text sprint goal only | **4 High** | Weak objective consistency | Validate goal against active milestone/phase | Too strict validation may block legit tactical goals |
| Capacity planning (Stage 15 data) | Velocity/capacity concepts | Story points summed only | **4 High** | Overcommitted sprint reduces Stage 19 predictability | Add capacity estimate + warning gate | Story points are noisy; soft warning, not hard fail |
| Stage 17 readiness gate | GUI process implies readiness | No check for go/conditional_go/no_go | **5 Critical** | Could start sprint despite unresolved critical blockers | Require readiness check | Emergency bugfix may need bypass with explicit flag |
| Item status workflow | Backlog→in_progress→review→done | Planned items only | **2 Low** | Limited impact in planning stage | Do not add status lifecycle in Stage 18 | If reused as execution board, this changes |
| Phase alignment (phase_ref) | Broader context via loop | No phase reference | **4 High** | Breaks cross-stage continuity | Add phase_ref | Single-phase startups may see as overhead |
| Budget awareness (Stage 16) | Broader tracking possible | No sprint cost/budget signal | **3 Medium** | Hidden spend drift appears late | Add budget estimate + warning | Avoid false precision; coarse estimate |
| SD Bridge enrichment | GUI lacks SD Bridge | SD payload mostly field copy | **4 High** | Missed chance to pre-bake context for LEO quality | Enrich with architecture + team hints | Don't overstuff payload |

### 2. AnalysisStep Design

**Inputs**: Stage 13 deliverables (type, priority, phase, outcomes), Stage 14 (layers, integration points, entities), Stage 15 (team skills, allocation, phase_ref), Stage 16 (cost_by_phase), Stage 17 (build_readiness, blockers), Stage 18 user inputs (sprint window, manual items).

**Deliverable type → SD type mapping**: feature→feature, infrastructure→infra (or refactor), integration→enhancement (or feature), content→enhancement (or feature).

**Outputs**: derived_items[], traceability[], capacity_estimate/warning, budget_estimate/warning, readiness_check_result.

### 3. Roadmap-to-Sprint Derivation

Auto-generate suggested items from Stage 13 "now" deliverables in active phase. Milestones seed sprint goal candidates. Keep manual add/edit/remove. Require each item to declare source_deliverable_ref OR manual_justification.

### 4. Capacity Planning

Analysis-only: effective_capacity_points = team_capacity_factor × sprint_duration_days. Warning severity: high if >120%, medium if 100-120%. Do not hard-block; hand warning to Stage 19 risk context.

### 5. Stage 17 Readiness Gate

Require build_readiness in {go, conditional_go}. no_go blocks Stage 18 completion. conditional_go requires carried blocker mitigation notes.

### 6. Phase Alignment

Required phase_ref on sprint. Validate items primarily map to deliverables in that phase. Soft warning if sprint goal weak overlap with phase outcomes.

### 7. Budget Tracking

Coarse sprint budget estimate from Stage 15 allocations over sprint duration. Compare to Stage 16 phase remaining. Warning tiers, no hard gate.

### 8. SD Bridge Enhancement

Enrich payloads with: source_stage_refs, architecture_context (layer, entities, integration points), recommended_roles (Stage 15 skill match), risk_flags (from blockers/capacity/budget warnings). Keep core fields unchanged for compatibility.

### 9. CLI Superiorities

Native SD Bridge generation. Lean schema-first pipeline. Priority/type enums aligned with execution. Fast single-sprint flow.

### 10. Recommended Schema

Add phase_ref (required), analysisStep with derived_items/traceability/capacity/budget/readiness, source_deliverable_ref and manual_justification on items, enriched sd_bridge_payloads.

### 11. Minimum Viable Change

1. Add Stage 17 readiness gate
2. Add phase_ref and Stage 13 "now" deliverable derivation
3. Add analysisStep with traceability
4. Add SD Bridge enrichment with architecture/team context
5. Add soft capacity warning
6. Add soft budget warning

### 12. Cross-Stage Impact

Stage 19: better-scoped, traceable, risk-aware SD inputs. Stage 20: clearer acceptance criteria lineage. Stage 21/22: improved auditability. Protocol-level: stronger deterministic handoff from EVA to LEO.

### 13. Dependency Conflicts

No conflict with established pattern. Enforcing Stage 17 readiness aligns with purpose. phase_ref reinforces Stage 13/15/16 decisions. Risk: over-strict automation reduces flexibility; solved via "suggested not forced."

### 14. Contrarian Take

"Add everything from GUI richness" risks over-engineering Stage 18 and leaking Stage 19 concerns backward. Status workflows duplicate Stage 19 ownership. False precision in capacity/budget misleads early. Lean alternative: implement gating + traceability + derivation + SD enrichment first. Keep execution telemetry in Stage 19.
