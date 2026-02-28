---
category: database
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [database, auto-generated]
---
# Lifecycle Gap Migrations Summary



## Table of Contents

- [Metadata](#metadata)
- [Migration Status](#migration-status)
- [1. Stage 20 Compliance Gate (SD-LIFECYCLE-GAP-002)](#1-stage-20-compliance-gate-sd-lifecycle-gap-002)
  - [Status: ✅ ALREADY IMPLEMENTED](#status-already-implemented)
  - [Migration Files:](#migration-files)
  - [Tables Created:](#tables-created)
  - [Gate Logic:](#gate-logic)
  - [UI Integration:](#ui-integration)
  - [Database Functions:](#database-functions)
- [2. Capability Router Protocol (SD-LIFECYCLE-GAP-004)](#2-capability-router-protocol-sd-lifecycle-gap-004)
  - [Status: ✅ ALREADY IMPLEMENTED](#status-already-implemented)
  - [Migration File:](#migration-file)
  - [Tables Extended:](#tables-extended)
  - [Database Functions:](#database-functions)
  - [Views:](#views)
  - [Category Weights (Plane 1):](#category-weights-plane-1)
- [3. Risk Re-calibration Gates (SD-LIFECYCLE-GAP-005)](#3-risk-re-calibration-gates-sd-lifecycle-gap-005)
  - [Status: ✅ NEWLY CREATED](#status-newly-created)
  - [Migration File:](#migration-file)
  - [Tables Created:](#tables-created)
  - [Database Functions:](#database-functions)
  - [Triggers:](#triggers)
  - [Views:](#views)
  - [RLS Policies:](#rls-policies)
  - [Gate Mapping:](#gate-mapping)
  - [Integration with LEO Protocol:](#integration-with-leo-protocol)
- [Next Steps](#next-steps)
  - [1. Risk Re-calibration UI (NEW)](#1-risk-re-calibration-ui-new)
  - [2. Phase Transition Integration (NEW)](#2-phase-transition-integration-new)
  - [3. Risk Metrics & Reporting (NEW)](#3-risk-metrics-reporting-new)
  - [4. Testing](#4-testing)
  - [5. Documentation](#5-documentation)
- [Verification Queries](#verification-queries)
  - [Check Stage 20 Compliance Gate:](#check-stage-20-compliance-gate)
  - [Check Capability Taxonomy:](#check-capability-taxonomy)
  - [Check Risk Re-calibration Forms:](#check-risk-re-calibration-forms)
  - [Check Active Risk Escalations:](#check-active-risk-escalations)
- [File Locations](#file-locations)
  - [Migrations:](#migrations)
  - [Documentation:](#documentation)
  - [Schema Reference:](#schema-reference)

## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-19
- **Tags**: database, api, testing, e2e

**SD**: SD-LIFECYCLE-GAP
**Created**: 2026-01-19
**Purpose**: Database migrations for venture lifecycle gap remediation features

---

## Migration Status

| Feature | Migration File | Status | Tables Created |
|---------|---------------|--------|----------------|
| **Stage 20 Compliance Gate** | `20260118_stage20_compliance_gate.sql` | ✅ **EXISTING** | 6 tables |
| **Capability Router** | `20260108_capability_ledger_v2.sql` | ✅ **EXISTING** | Extended `sd_capabilities` |
| **Risk Re-calibration Gates** | `20260119_risk_recalibration_gates.sql` | ✅ **CREATED** | 3 new tables |

---

## 1. Stage 20 Compliance Gate (SD-LIFECYCLE-GAP-002)

### Status: ✅ ALREADY IMPLEMENTED

### Migration Files:
- `20260118_stage20_compliance_gate.sql` (36.6 KB)
- `20260118_stage20_compliance_gate_integration.sql` (6.9 KB)
- `20260118_stage20_compliance_gate_rls_fix.sql` (4.8 KB)

### Tables Created:
1. **compliance_checklists** (3 rows)
   - Archetype-specific checklists (B2B_ENTERPRISE, B2B_SMB, B2C)
   - Version-controlled templates

2. **compliance_checklist_items** (39 rows)
   - Individual compliance items
   - REQUIRED vs RECOMMENDED tiers
   - Evidence requirements

3. **venture_compliance_progress** (tracking per venture)
   - Status: NOT_STARTED, IN_PROGRESS, COMPLETE
   - Evidence attachments (documents, links, screenshots)

4. **compliance_artifact_templates** (7 rows)
   - Reusable artifact templates for compliance documentation

5. **compliance_gate_events** (audit trail)
   - Gate evaluation history
   - Pass/fail metrics

6. **compliance_evidence_storage** (optional)
   - File storage metadata for evidence uploads

### Gate Logic:
- **PASS**: All REQUIRED items complete with evidence
- **FAIL**: Any REQUIRED item incomplete or missing evidence
- Blocks Stage 20 → Stage 21 transition

### UI Integration:
- Stage 20 page has 3-tab layout:
  1. **Compliance Gate** (checklist UI)
  2. Security Checks
  3. Performance

### Database Functions:
- `evaluate_stage20_compliance_gate(venture_id, user_id)` - Evaluates gate status
- `record_compliance_gate_passed(venture_id, user_id)` - Records passage
- `fn_advance_venture_stage()` - Updated to enforce gate

**Documentation**: `docs/04_features/stage20-compliance-gate.md`

---

## 2. Capability Router Protocol (SD-LIFECYCLE-GAP-004)

### Status: ✅ ALREADY IMPLEMENTED

### Migration File:
- `20260108_capability_ledger_v2.sql` (15.2 KB)

### Tables Extended:
1. **sd_capabilities** (enhanced with taxonomy)
   - **capability_type**: 19 types across 5 categories
     - AI & Automation: agent, crew, tool, skill
     - Infrastructure: database_schema, database_function, rls_policy, migration
     - Application: api_endpoint, component, hook, service, utility
     - Integration: workflow, webhook, external_integration
     - Governance: validation_rule, quality_gate, protocol

   - **Plane 1 Scoring**:
     - `maturity_score` (0-5)
     - `extraction_score` (0-5)
     - `graph_centrality_score` (0-5)
     - `category_weight` (1.0-1.5x multiplier)
     - `plane1_score` (computed total)

   - **Reuse Tracking**:
     - `reuse_count` - Number of times reused
     - `reused_by_sds` - JSONB array of SD references
     - `first_registered_at`, `last_reused_at`
     - `source_files` - File paths where implemented

   - **Dependency Graph**:
     - `depends_on` - Capabilities this depends on
     - `depended_by` - Capabilities depending on this

2. **capability_reuse_log** (junction table)
   - Detailed reuse event tracking
   - Reuse types: direct, extended, forked, referenced

### Database Functions:
- `fn_compute_plane1_score()` - Auto-computes Plane 1 score on INSERT/UPDATE
- `fn_record_capability_reuse(capability_key, sd_id, context, type)` - Records reuse events

### Views:
- `v_capability_ledger` - Dashboard view with scores and metrics
  - Age in days
  - Reuse rate per month
  - Plane 1 rankings

### Category Weights (Plane 1):
| Category | Weight | Example Types |
|----------|--------|---------------|
| AI & Automation | 1.5x | agent, crew, tool, skill |
| Governance | 1.3x | validation_rule, quality_gate, protocol |
| Infrastructure | 1.2x | database_schema, rls_policy, migration |
| Integration | 1.1x | workflow, webhook, external_integration |
| Application | 1.0x | api_endpoint, component, hook, service |

**Documentation**: `docs/04_features/capability-router-protocol.md`

---

## 3. Risk Re-calibration Gates (SD-LIFECYCLE-GAP-005)

### Status: ✅ NEWLY CREATED

### Migration File:
- `20260119_risk_recalibration_gates.sql` (NEW)

### Tables Created:

#### 3.1 risk_recalibration_forms
Per-venture risk assessment forms at phase boundary gates.

**Key Columns**:
- `venture_id` (FK to ventures)
- `gate_number` (3, 4, 5, 6)
- `from_phase`, `to_phase` (IDEATION, VALIDATION, DEVELOPMENT, SCALING, EXIT)
- `previous_assessment_id` (FK to previous form for delta tracking)

**Risk Categories** (4x each):
- Market Risk: `market_risk_previous`, `market_risk_current`, `market_risk_delta`, `market_risk_justification`, `market_risk_mitigations`
- Technical Risk: `technical_risk_*`
- Financial Risk: `financial_risk_*`
- Operational Risk: `operational_risk_*`

**Risk Levels**:
- CRITICAL (requires Chairman + EVA immediate review, <4hrs)
- HIGH (requires Chairman weekly review, <24hrs)
- MEDIUM (phase boundary review)
- LOW (standard monitoring)

**Delta Types**:
- IMPROVED (↓) - Risk level decreased
- STABLE (→) - Risk level unchanged
- DEGRADED (↑) - Risk level increased
- NEW (★) - Risk not previously identified
- RESOLVED (✓) - Risk no longer applies

**Overall Assessment**:
- `risk_trajectory` (IMPROVING, STABLE, DEGRADING)
- `blocking_risks` (auto-computed: TRUE if any CRITICAL)
- `chairman_review_required` (auto-computed: TRUE if CRITICAL or 2+ HIGH)
- `go_decision` (GO, NO_GO, CONDITIONAL)
- `conditions` (JSONB array for CONDITIONAL decisions)

**Approval Workflow**:
- `status` (PENDING, APPROVED, REJECTED, ESCALATED)
- `approved_by`, `approval_date`, `approval_notes`

**Constraints**:
- UNIQUE(venture_id, gate_number) - One form per gate per venture

#### 3.2 risk_escalation_log
Audit trail for risk escalations.

**Escalation Types**:
- CRITICAL_RISK - Any CRITICAL risk identified
- MULTIPLE_HIGH_RISKS - 2+ HIGH risks
- CONSECUTIVE_DEGRADATION - Risk degraded 2+ consecutive reviews
- NEW_CRITICAL_RISK - New CRITICAL risk discovered
- MANUAL_ESCALATION - Chairman/human-initiated

**Response Tracking**:
- `escalated_to` (CHAIRMAN, EVA, CHAIRMAN_AND_EVA)
- `escalated_at`, `response_time_hours`, `resolved_at`
- `resolution_notes`

#### 3.3 risk_gate_passage_log
Tracks gate passage attempts and outcomes.

**Key Columns**:
- `venture_id`, `gate_number`, `risk_form_id`
- `passed` (BOOLEAN)
- `blocked_reason` (TEXT)
- Risk summary: `critical_risks_count`, `high_risks_count`, `medium_risks_count`, `low_risks_count`
- `attempted_at`, `passed_at`

### Database Functions:

#### fn_evaluate_risk_recalibration_gate(venture_id, gate_number)
Returns JSONB with gate evaluation result.

**Logic**:
1. Check if form exists (FAIL if not)
2. Count risk levels across all 4 categories
3. Check blocking conditions:
   - Any CRITICAL without Chairman approval → FAIL
   - 2+ HIGH without Chairman review → FAIL
   - NO_GO decision → FAIL
   - CONDITIONAL without conditions → FAIL
4. Otherwise → PASS

**Returns**:
```json
{
  "outcome": "PASS" | "FAIL",
  "reason": "Blocking reason if FAIL",
  "critical_risks": 0,
  "high_risks": 2,
  "medium_risks": 1,
  "low_risks": 1,
  "form_id": "uuid",
  "go_decision": "GO",
  "risk_trajectory": "STABLE",
  "chairman_approved": true
}
```

#### fn_check_risk_escalation_triggers(risk_form_id)
Checks if risk form triggers escalation requirements.

**Trigger Logic**:
1. **CRITICAL_RISK**: Any CRITICAL → Chairman + EVA, <4hrs
2. **MULTIPLE_HIGH_RISKS**: 2+ HIGH → Chairman, <24hrs
3. **CONSECUTIVE_DEGRADATION**: 2+ categories DEGRADED → Chairman, <24hrs
4. **NEW_CRITICAL_RISK**: New CRITICAL discovered → Chairman + EVA, <4hrs

**Returns**:
```json
{
  "escalations_required": true,
  "escalations": [
    {
      "type": "CRITICAL_RISK",
      "reason": "1 CRITICAL risk(s) identified",
      "requires_review": "CHAIRMAN_AND_EVA",
      "response_time_target": "4 hours"
    }
  ],
  "critical_risks": 1,
  "high_risks": 0
}
```

#### fn_record_risk_gate_passage(venture_id, gate_number, passed, blocked_reason)
Records gate passage attempt in `risk_gate_passage_log`.

**Logic**:
1. Fetch risk form ID
2. Evaluate gate (calls `fn_evaluate_risk_recalibration_gate`)
3. Insert passage log with risk summary
4. Return passage log ID

### Triggers:

#### trg_update_risk_form_chairman_flag
Auto-updates flags on risk form INSERT/UPDATE.

**Auto-computed Fields**:
- `chairman_review_required` = TRUE if (CRITICAL count > 0 OR HIGH count >= 2)
- `blocking_risks` = TRUE if (CRITICAL count > 0)
- `updated_at` = NOW()

### Views:

#### v_risk_gate_dashboard
Dashboard view showing risk gate status for all ventures.

**Columns per Gate**:
- `gate{N}_form_id` - Form ID
- `gate{N}_decision` - GO/NO_GO/CONDITIONAL
- `gate{N}_status` - PENDING/APPROVED/REJECTED/ESCALATED
- `gate{N}_chairman_review` - TRUE if Chairman review required
- `gate{N}_passed` - TRUE if gate passed

**Additional**:
- `active_escalations` - Count of unresolved escalations

### RLS Policies:
- Service role: Full access
- Authenticated: Read access to all tables

### Gate Mapping:

| Gate | Transition | Stages | Purpose |
|------|------------|--------|---------|
| Gate 3 | Ideation → Validation | 5 → 6 | Pre-MVP risk assessment |
| Gate 4 | Validation → Development | 10 → 11 | Technical risk escalation |
| Gate 5 | Development → Scaling | 15 → 16 | Operational risk evaluation |
| Gate 6 | Scaling → Exit | 20 → 21 | Exit readiness risk review |

### Integration with LEO Protocol:

**Phase Transition Validation**:
```javascript
// Example: Gate 4 check before Validation → Development
const riskGate = {
  gate: 4,
  from_phase: 'VALIDATION',
  to_phase: 'DEVELOPMENT',
  blocking_conditions: [
    { condition: 'any_critical_risks', requires: 'chairman_approval' },
    { condition: 'two_or_more_high_risks', requires: 'chairman_review' }
  ]
};
```

**Handoff Integration**:
- PLAN-TO-LEAD checks `risk_recalibration_status`
- BLOCKED if any CRITICAL risks without Chairman approval
- WARNING if HIGH risks increased since last gate
- PASS if all risks documented with deltas

**Documentation**: `docs/04_features/risk-recalibration-protocol.md`

---

## Next Steps

### 1. Risk Re-calibration UI (NEW)
- [ ] Create risk form component for venture management dashboard
- [ ] Implement delta visualization (↓, →, ↑, ★, ✓ symbols)
- [ ] Build Chairman review workflow UI
- [ ] Add gate status indicators to venture overview

### 2. Phase Transition Integration (NEW)
- [ ] Update `fn_advance_venture_stage()` to check risk gates
- [ ] Integrate gate evaluation into stage transition logic
- [ ] Add risk gate validation to LEO Protocol handoffs

### 3. Risk Metrics & Reporting (NEW)
- [ ] Create risk dashboard showing active escalations
- [ ] Build risk trajectory charts (IMPROVING/STABLE/DEGRADING)
- [ ] Track chairman response times vs SLA
- [ ] Generate risk re-calibration compliance reports

### 4. Testing
- [ ] E2E tests for risk gate evaluation
- [ ] Test escalation trigger logic
- [ ] Verify gate blocking at stage transitions
- [ ] Test Chairman approval workflow

### 5. Documentation
- [ ] API documentation for risk functions
- [ ] User guide for completing risk forms
- [ ] Chairman review process documentation
- [ ] Risk metrics interpretation guide

---

## Verification Queries

### Check Stage 20 Compliance Gate:
```sql
SELECT
  archetype,
  COUNT(*) FILTER (WHERE requirement_level = 'REQUIRED') AS required_items,
  COUNT(*) FILTER (WHERE requirement_level = 'RECOMMENDED') AS recommended_items
FROM compliance_checklist_items cci
JOIN compliance_checklists cc ON cci.checklist_id = cc.id
WHERE cc.is_active = TRUE
GROUP BY archetype;
```

### Check Capability Taxonomy:
```sql
SELECT
  category,
  COUNT(*) AS capability_count,
  AVG(plane1_score)::DECIMAL(5,2) AS avg_plane1_score,
  SUM(reuse_count) AS total_reuses
FROM sd_capabilities
WHERE action = 'registered'
GROUP BY category
ORDER BY avg_plane1_score DESC;
```

### Check Risk Re-calibration Forms:
```sql
SELECT
  v.name AS venture_name,
  rrf.gate_number,
  rrf.go_decision,
  rrf.status,
  rrf.chairman_review_required,
  rrf.blocking_risks,
  rgl.passed
FROM ventures v
JOIN risk_recalibration_forms rrf ON v.id = rrf.venture_id
LEFT JOIN risk_gate_passage_log rgl ON v.id = rgl.venture_id AND rrf.gate_number = rgl.gate_number
ORDER BY v.name, rrf.gate_number;
```

### Check Active Risk Escalations:
```sql
SELECT
  v.name AS venture_name,
  rel.escalation_type,
  rel.risk_category,
  rel.risk_level,
  rel.escalated_to,
  rel.escalated_at,
  ROUND(EXTRACT(EPOCH FROM (NOW() - rel.escalated_at)) / 3600, 2) AS hours_open
FROM risk_escalation_log rel
JOIN ventures v ON rel.venture_id = v.id
WHERE rel.resolved_at IS NULL
ORDER BY rel.escalated_at DESC;
```

---

## File Locations

### Migrations:
- `database/migrations/20260118_stage20_compliance_gate.sql`
- `database/migrations/20260118_stage20_compliance_gate_integration.sql`
- `database/migrations/20260118_stage20_compliance_gate_rls_fix.sql`
- `database/migrations/20260108_capability_ledger_v2.sql`
- `database/migrations/20260119_risk_recalibration_gates.sql` (NEW)

### Documentation:
- `docs/04_features/venture-lifecycle-gap-remediation-overview.md`
- `docs/04_features/stage20-compliance-gate.md`
- `docs/04_features/capability-router-protocol.md`
- `docs/04_features/risk-recalibration-protocol.md`
- `docs/database/lifecycle-gap-migrations-summary.md` (THIS FILE)

### Schema Reference:
- `docs/reference/schema/engineer/database-schema-overview.md`
- `docs/reference/schema/engineer/tables/compliance_checklists.md`
- `docs/reference/schema/engineer/tables/compliance_checklist_items.md`
- `docs/reference/schema/engineer/tables/sd_capabilities.md`
- `docs/reference/schema/engineer/tables/ventures.md`

---

**Status**: Risk Re-calibration Gates migration ready for execution.
**Next Action**: Run migration and begin UI implementation.
**Owner**: Database Agent + Design Agent (for UI)
**Last Updated**: 2026-01-19
