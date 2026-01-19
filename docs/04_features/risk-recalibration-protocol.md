# Risk Re-calibration Protocol

**SD**: SD-LIFECYCLE-GAP-005 - Strategic Risk Forecasting (Phase Boundary Gates)
**Created**: 2026-01-19
**Status**: Active
**Part of**: Venture Lifecycle Gap Remediation (SD-LIFECYCLE-GAP-000)

---

## Overview

The Risk Re-calibration Protocol defines how ventures assess and re-assess risk at critical phase boundaries in the 25-stage venture lifecycle. This protocol addresses the gap identified in the 40-stage to 25-stage consolidation where strategic risk forecasting (Stage 37 in the 40-stage model) became implicit rather than explicit.

**Key Principle**: Risk is not static. A risk assessment from Phase 2 becomes obsolete by Phase 4.

## Risk Re-calibration Gates

Risk re-calibration gates are **mandatory checkpoints** at each phase boundary. A venture cannot transition to a new phase without completing risk re-assessment.

### Gate Locations

| Gate | Transition | Stages | Purpose |
|------|------------|--------|---------|
| Gate 3 | Ideation → Validation | 5 → 6 | Pre-MVP risk assessment |
| Gate 4 | Validation → Development | 10 → 11 | Technical risk escalation |
| Gate 5 | Development → Scaling | 15 → 16 | Operational risk evaluation |
| Gate 6 | Scaling → Exit | 20 → 21 | Exit readiness risk review |

### Gate Requirements

Each gate requires:
1. **Risk Re-assessment Form** - Updated risk matrix with delta from previous phase
2. **Chairman Review** - For CRITICAL or HIGH risks (tiered escalation)
3. **Mitigation Plan Update** - Revised mitigations based on new context
4. **Go/No-Go Decision** - Explicit approval to proceed

---

## Risk Categories

### 1. Market Risk
Factors affecting market viability and competitive position.

| Level | Threshold | Examples | Escalation |
|-------|-----------|----------|------------|
| CRITICAL | Impact >70% | Major competitor entry, Market collapse | Chairman immediate review |
| HIGH | Impact 40-70% | Significant competitor move, Market shift | Chairman weekly review |
| MEDIUM | Impact 15-40% | Minor competitive changes | Phase boundary review |
| LOW | Impact <15% | Normal market fluctuations | Standard monitoring |

### 2. Technical Risk
Factors affecting technical delivery and platform stability.

| Level | Threshold | Examples | Escalation |
|-------|-----------|----------|------------|
| CRITICAL | Platform impact | Security breach, Data loss | Chairman immediate review |
| HIGH | Feature impact | Integration failures, Performance degradation | Chairman weekly review |
| MEDIUM | Sprint impact | Technical debt, Minor bugs | Phase boundary review |
| LOW | Task impact | Code quality issues | Standard monitoring |

### 3. Financial Risk
Factors affecting venture economics and runway.

| Level | Threshold | Examples | Escalation |
|-------|-----------|----------|------------|
| CRITICAL | Runway <3 months | Cash crisis, Revenue collapse | Chairman immediate review |
| HIGH | Runway 3-6 months | Significant cost overrun, Revenue miss | Chairman weekly review |
| MEDIUM | Runway 6-12 months | Budget variance, Unit economics drift | Phase boundary review |
| LOW | Runway >12 months | Minor variances | Standard monitoring |

### 4. Operational Risk
Factors affecting team and process execution.

| Level | Threshold | Examples | Escalation |
|-------|-----------|----------|------------|
| CRITICAL | Team crisis | Key person departure, Complete team breakdown | Chairman immediate review |
| HIGH | Team strain | Burnout signals, Multiple departures | Chairman weekly review |
| MEDIUM | Process strain | Delivery delays, Quality issues | Phase boundary review |
| LOW | Normal variation | Minor process improvements needed | Standard monitoring |

---

## Delta Requirement

Every risk re-calibration must document the **delta** from the previous assessment:

### Delta Categories

| Category | Symbol | Definition |
|----------|--------|------------|
| Improved | ↓ | Risk level decreased since last review |
| Stable | → | Risk level unchanged |
| Degraded | ↑ | Risk level increased since last review |
| New | ★ | Risk not previously identified |
| Resolved | ✓ | Risk no longer applies |

### Delta Example

```
┌─────────────────────────────────────────────────────────────┐
│ RISK RE-CALIBRATION: Gate 4 (Validation → Development)     │
│ Venture: TruthEngine                                        │
│ Previous Assessment: Gate 3 (2026-01-01)                   │
├─────────────────────────────────────────────────────────────┤
│ Category       │ Previous │ Current │ Delta │ Notes         │
├────────────────┼──────────┼─────────┼───────┼───────────────┤
│ Market         │ MEDIUM   │ LOW     │   ↓   │ Validation    │
│ Technical      │ HIGH     │ MEDIUM  │   ↓   │ PoC complete  │
│ Financial      │ LOW      │ LOW     │   →   │ Runway stable │
│ Operational    │ MEDIUM   │ HIGH    │   ↑   │ Team scaling  │
├────────────────┼──────────┼─────────┼───────┼───────────────┤
│ AI Dependency  │ -        │ MEDIUM  │   ★   │ New risk      │
│ MVP Scope      │ HIGH     │ -       │   ✓   │ Resolved      │
└─────────────────────────────────────────────────────────────┘
```

---

## Escalation Protocol

### Tiered Escalation

| Risk Level | Review Cadence | Reviewer | Response Time |
|------------|----------------|----------|---------------|
| CRITICAL | Immediate | Chairman + EVA | <4 hours |
| HIGH | Weekly | Chairman | <24 hours |
| MEDIUM | Phase boundary | LEO Protocol | At gate |
| LOW | Quarterly | Standard review | Normal cycle |

### Escalation Triggers

Automatic escalation occurs when:
1. **Any risk moves to CRITICAL** - Immediate notification
2. **Two+ risks move to HIGH** - Same-day review required
3. **Risk delta shows ↑ for 2+ consecutive reviews** - Pattern review required
4. **New CRITICAL risk identified** - Gate blocks until reviewed

---

## Integration with LEO Protocol

### Phase Boundary Validation

The Risk Re-calibration Protocol integrates with LEO Protocol phase transitions:

```javascript
// Example: Gate 4 (Validation → Development)
const riskGate = {
  gate: 4,
  from_phase: 'VALIDATION',
  to_phase: 'DEVELOPMENT',
  required_documents: [
    'risk_recalibration_form',
    'delta_analysis',
    'mitigation_plan_update'
  ],
  blocking_conditions: [
    { condition: 'any_critical_risks', requires: 'chairman_approval' },
    { condition: 'two_or_more_high_risks', requires: 'chairman_review' }
  ]
};
```

### LEO Protocol Handoff Integration

Risk re-calibration forms part of PLAN-TO-LEAD handoff validation:

1. **PLAN-TO-LEAD** checks risk_recalibration_status
2. **BLOCKED** if any CRITICAL risks without Chairman approval
3. **WARNING** if HIGH risks increased since last gate
4. **PASS** if all risks documented with deltas

---

## Risk Re-calibration Form Template

```yaml
Risk Re-calibration Form:
  gate: <3|4|5|6>
  venture_id: <venture-id>
  assessment_date: <YYYY-MM-DD>
  previous_assessment_date: <YYYY-MM-DD>
  assessor: <human:Chairman|LEO>

  risks:
    market:
      previous_level: <CRITICAL|HIGH|MEDIUM|LOW|N/A>
      current_level: <CRITICAL|HIGH|MEDIUM|LOW>
      delta: <↓|→|↑|★|✓>
      justification: <free text>
      mitigations: [<list of mitigations>]

    technical:
      previous_level: <CRITICAL|HIGH|MEDIUM|LOW|N/A>
      current_level: <CRITICAL|HIGH|MEDIUM|LOW>
      delta: <↓|→|↑|★|✓>
      justification: <free text>
      mitigations: [<list of mitigations>]

    financial:
      previous_level: <CRITICAL|HIGH|MEDIUM|LOW|N/A>
      current_level: <CRITICAL|HIGH|MEDIUM|LOW>
      delta: <↓|→|↑|★|✓>
      justification: <free text>
      mitigations: [<list of mitigations>]

    operational:
      previous_level: <CRITICAL|HIGH|MEDIUM|LOW|N/A>
      current_level: <CRITICAL|HIGH|MEDIUM|LOW>
      delta: <↓|→|↑|★|✓>
      justification: <free text>
      mitigations: [<list of mitigations>]

  new_risks: [<list of newly identified risks>]
  resolved_risks: [<list of resolved risks>]

  overall_assessment:
    risk_trajectory: <IMPROVING|STABLE|DEGRADING>
    blocking_risks: <yes|no>
    chairman_review_required: <yes|no>
    go_decision: <GO|NO_GO|CONDITIONAL>
    conditions: [<list of conditions for CONDITIONAL>]

  approval:
    approved_by: <human:Chairman|null>
    approval_date: <YYYY-MM-DD|null>
    notes: <free text>
```

---

## Success Metrics

| Metric | Target | Current | Measurement |
|--------|--------|---------|-------------|
| Risk Review Compliance | 100% | - | Ventures with risk form at gate |
| Delta Documentation | 100% | - | Risks with delta from previous |
| Escalation Response Time | <SLA | - | Time to Chairman review |
| Risk Trajectory Accuracy | >80% | - | Predicted vs. actual outcomes |

---

## Implementation References

### Database
- **Migration**: `database/migrations/20260119_risk_recalibration_gates.sql` - Risk gate schema (26.4 KB)
- **Tables**: `risk_recalibration_forms`, `risk_escalation_log`, `risk_gate_passage_log`
- **Functions**: `fn_evaluate_risk_recalibration_gate()`, `fn_check_risk_escalation_triggers()`, `fn_record_risk_gate_passage()`
- **View**: `v_risk_gate_dashboard` - Risk gate status for all ventures
- **Documentation**: `docs/database/lifecycle-gap-migrations-summary.md` - Complete schema reference

### Application Logic
- `lib/governance/risk-recalibration-gate.js` - Gate validation logic (TO BE IMPLEMENTED)

### Related Protocols
- `docs/04_features/capability-router-protocol.md` - Sibling protocol
- `docs/04_features/stage20-compliance-gate.md` - Security & compliance gate

---

*Protocol defined as part of SD-LIFECYCLE-GAP-005 to address strategic risk forecasting gap in 25-stage venture lifecycle model.*
