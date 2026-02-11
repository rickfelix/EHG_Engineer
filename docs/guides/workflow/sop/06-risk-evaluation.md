# 6. Risk Evaluation


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, security, workflow

- **Depends on**: 5
- **Purpose**: Comprehensive risk assessment and mitigation strategy development.

## Entry Gate
- Financial model complete
- Technical review done

## Exit Gate
- All risks identified
- Mitigation plans approved
- Risk tolerance defined

## Inputs
- Financial model
- Technical assessment
- Market analysis

## Outputs
- Risk matrix
- Mitigation plans
- Contingency strategies

## Substages & Checklists
### 6.1 Risk Identification
  - [ ] Technical risks listed
  - [ ] Market risks assessed
  - [ ] Operational risks mapped

### 6.2 Risk Scoring
  - [ ] Probability assigned
  - [ ] Impact assessed
  - [ ] Risk matrix created

### 6.3 Mitigation Planning
  - [ ] Mitigation strategies defined
  - [ ] Contingencies planned
  - [ ] Triggers identified

## Progression Mode
Manual (default). System learns from Chairman feedback over time to suggest Auto.

## Metric -> Action Map (examples)
- Risk score < ${thresholds.stage6.risk_score_max} -> **Advance**
- Unresolved critical risks > ${thresholds.stage6.unresolved_critical_risks_max} -> **Halt for Chairman review**
- Mitigation coverage > ${thresholds.stage6.mitigation_coverage_min} -> **Proceed to planning**

## Data Flow (contract skeleton)
- **Inputs**: financial_model.json from Stage 5, technical_assessment.json
- **Outputs**: risk_matrix.json -> stored in DB, consumed by Stage 7

## Rollback
- Preserve risk assessments for iteration
- Return to Stage 5 if financial risks too high
- Document unmitigated risks for executive review

## Tooling & Integrations
- **Primary Tools**: Risk Assessment Agent, Scenario Modeling Tools
- **APIs**: TODO: Risk scoring services, Industry benchmarks
- **External Services**: TODO: Compliance databases, Security scanners

## Error Handling
- Missing risk data -> Use conservative estimates
- Mitigation plan failures -> Escalate to Chairman
- Risk threshold breaches -> Automatic halt for review

## Metrics & KPIs
- Risk coverage
- Mitigation effectiveness
- Risk score

## Risks & Mitigations
- **Primary Risk**: Unknown risks not identified
- **Mitigation Strategy**: Multi-model risk assessment, external audit
- **Fallback Plan**: Conservative risk assumptions, phased rollout

## Failure Modes & Recovery
- **Common Failures**: Incomplete risk identification, over-optimistic scoring
- **Recovery Steps**: Re-run with different models, seek expert consultation
- **Rollback Procedure**: Return to Stage 5 for model adjustment

## Security/Compliance Considerations
- **Data Security**: Standard EHG data protection policies apply
- **Compliance**: SOX, GDPR where applicable
- **Audit Trail**: All decisions and changes logged

## Notes / Open Questions
- TODO: Map to specific PRD implementations
- TODO: Define risk scoring methodology
- TODO: Establish industry-specific risk benchmarks