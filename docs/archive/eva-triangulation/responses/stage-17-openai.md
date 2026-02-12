# Stage 17 "Pre-Build Checklist" -- OpenAI Response (GPT 5.3)

> Independent response to the Stage 17 triangulation prompt.
> Respondent: OpenAI (GPT 5.3)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| `analysisStep` auto-generation from Stages 13-16 | No (no Stage 17 UI) | No | **5 Critical** | Stage 18 starts with incomplete/subjective readiness | Must add | Keep user override; avoid over-automation |
| Prior-stage seeding (category pre-population) | No | No | **5 Critical** | Readiness disconnected from approved plan | Must add | Allow "Not applicable" to avoid false blockers |
| Go/no-go threshold | No | Computes % only | **5 Critical** | Teams can sprint despite major setup gaps | Must add | Support soft override with explicit risk acceptance |
| Item priority | No | No | **4 High** | Critical setup items buried in noise | Should add | Don't overfit with too many priority levels |
| Item enrichment (deadline, acceptance_criteria, source_stage_ref) | No | No | **4 High** | Weak accountability and audit trail | Should add | Keep enrichment minimal in MVC |
| Blocker severity enum | No | Free text severity | **4 High** | Inconsistent blocker triage; poor gate logic | Must add | Allow optional notes for nuance |
| Financial readiness integration (Stage 16 warnings/gate) | No | No | **5 Critical** | Sprint planning may ignore affordability constraints | Must add | Limit to key viability signals, not full P&L replay |
| Category coverage (security/compliance/data provisioning) | No | 5 fixed categories only | **4 High** | Missing cross-cutting readiness from Stage 14 | Should add | Start with security_readiness; defer compliance |

### 2. AnalysisStep Design

**Inputs**: Stage 13 roadmap, Stage 14 architecture, Stage 15 resources, Stage 16 financials.

**Core behavior**: Generate default checklist items per category from upstream artifacts. Auto-tag with source_stage_ref, priority, acceptance_criteria. Compute readiness by weighted priority. Produce gating verdict + reasons.

**Outputs**: seeded_checklist (editable), readiness_summary (raw %, weighted %, critical-path completion), go_no_go decision object, carry_forward_notes for Stage 18.

### 3. Prior-Stage Seeding

- architecture → Stage 14 layers/constraints/integration points
- team_readiness → Stage 15 staffing, skill gaps, hiring dependencies
- tooling → Stage 14 technologies/dev workflow
- environment → Stage 14 infra/runtime/data environment
- dependencies → Stage 14 integration points + Stage 13 external dependencies
- security_readiness (new) → Stage 14 security cross-cutting
- financial_readiness (new) → Stage 16 viability warnings

### 4. Go/No-Go Threshold

Hybrid gate: No open critical blockers + Stage 16 promotion gate not failed + weighted_readiness_pct >= 80 + critical-priority item completion >= 90%.

Decision states: go, conditional_go (non-critical blockers + accepted risk owner), no_go.

### 5. Item Enrichment

Add: priority (critical/high/medium/low), deadline (ISO date, optional), acceptance_criteria (short DoD), source_stage_ref ({ stage, artifact_id }), is_auto_generated (boolean), requires_owner (true for critical/high).

### 6. Blocker Severity Enum

Stage-15-aligned: critical (blocks Stage 18), high (blocks related sprint scope), medium (monitor with due date), low (backlog candidate).

### 7. Financial Readiness Integration

Check affordability of next sprint against Stage 16 phase budget. Surface unresolved viability warnings. Near-term cash-risk flag. Output: financial_readiness_status (pass/warning/fail) + financial_notes. Gate tie-in: fail → no_go.

### 8. Category Coverage

Keep 5 existing + add security_readiness and financial_readiness = 7 total. Defer compliance_readiness.

### 9. CLI Superiorities

Lightweight, editable checklist model. Clear status progression. Straightforward readiness math. Good baseline for deterministic automation.

### 10. Recommended Schema

TypeScript-defined: ChecklistCategory with 7 keys, ChecklistItem with priority/deadline/acceptance_criteria/source_stage_ref/is_auto_generated, Blocker with severity enum + owner + target_resolution_date, readiness_summary with raw/weighted/critical percentages, go_no_go decision object.

### 11. Minimum Viable Change

1. Add analysisStep with prior-stage seeding from 13-16
2. Add blocker severity enum + critical blocker gate
3. Add go/no-go decision object with 80% weighted threshold
4. Add item priority + source_stage_ref
5. Add security_readiness and financial_readiness categories
6. Add optional deadline and acceptance_criteria

### 12. Cross-Stage Impact

Stage 18: receives ranked, owner-assigned, gate-aware readiness backlog. Stages 19-22: fewer avoidable blockers. Stages 23-25: better traceability back to planning.

### 13. Dependency Conflicts

Current conflicts: Missing analysisStep (breaks Stage 2-16 pattern), free-text severity (conflicts Stage 15 normalization), no security linkage (conflicts Stage 14 security), no financial linkage (conflicts Stage 16 promotion gate intent). No GUI conflict (no GUI exists).

### 14. Contrarian Take

"Add lots of structure now" risks bureaucracy. Too many required fields slow early ventures. Rigid gates block learning-oriented MVPs. Excessive auto-generated noise. Counter-balance: ship MVC gate + seeding first, keep enrichment optional, collect usage data before expanding.
