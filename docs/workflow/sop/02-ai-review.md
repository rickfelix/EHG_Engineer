# 2. AI Review

- **Depends on**: 1
- **Purpose**: Multi-agent AI system reviews and critiques the idea from multiple perspectives.

## Entry Gate
- Idea document complete
- Validation passed

## Exit Gate
- Multi-model pass complete
- Contrarian review done
- Top-5 risks identified

## Inputs
- Structured idea
- Historical data
- Market signals

## Outputs
- AI critique report
- Contrarian analysis
- Risk assessment

## Substages & Checklists
### 2.1 Multi-Model Analysis
  - [ ] EVA multi-model analysis complete
  - [ ] Specialist agents review complete
  - [ ] Contrarian perspectives gathered

### 2.2 Contrarian Red Team
  - [ ] Devil's advocate analysis
  - [ ] Failure mode assessment

### 2.3 Risk Prioritization
  - [ ] Top-5 risks ranked
  - [ ] Mitigation strategies proposed

## Progression Mode
Manual (default). System learns from Chairman feedback over time to suggest Auto.

## Metric -> Action Map (examples)
- Risk count < ${thresholds.stage2.risk_count_max} -> **Advance**
- Critical risks < ${thresholds.stage2.critical_risks_max} -> **Proceed to validation**
- Consensus score > ${thresholds.stage2.consensus_score_min} -> **Approve for next stage**

## Data Flow (contract skeleton)
- **Inputs**: stage_summary.json from Stage 1, market data feeds
- **Outputs**: ai_review_report.json → stored in DB, consumed by Stage 3

## Rollback
- Preserve idea document
- Clear AI analysis results
- Return to Stage 1 if fundamental issues found

## Tooling & Integrations
- **Primary Tools**: EVA orchestration, Specialist AI agents (Finance, Market Analysis)
- **APIs**: TODO: Market data APIs, Historical venture database
- **External Services**: TODO: External AI models for contrarian analysis

## Error Handling
- Agent timeout → Use cached analysis or simplified review
- Conflicting analyses → Flag for Chairman review
- Data feed failures → Use latest cached market data

## Metrics & KPIs
- Review thoroughness
- Risk identification rate
- Processing time

## Risks & Mitigations
- **Primary Risk**: AI bias in review
- **Mitigation Strategy**: Multiple diverse AI models, contrarian analysis
- **Fallback Plan**: Chairman manual review override

## Failure Modes & Recovery
- **Common Failures**: Agent disagreement, insufficient data
- **Recovery Steps**: Escalate to Chairman, gather additional data
- **Rollback Procedure**: Return to Stage 1 with feedback

## Security/Compliance Considerations
- **Data Security**: Standard EHG data protection policies apply
- **Compliance**: SOX, GDPR where applicable
- **Audit Trail**: All decisions and changes logged

## Notes / Open Questions
- TODO: Map to specific PRD implementations
- TODO: Define specific specialist agent configurations
- TODO: Establish concrete risk thresholds