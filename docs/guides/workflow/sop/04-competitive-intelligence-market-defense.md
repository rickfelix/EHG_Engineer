---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# 4. Competitive Intelligence & Market Defense


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, unit, security

- **Depends on**: 3
- **Purpose**: Analyze competitive landscape and establish market positioning strategy.

## Entry Gate
- Validation complete
- Market defined

## Exit Gate
- Competitors analyzed
- Positioning defined
- Moat identified

## Inputs
- Market research
- Competitor data
- Industry reports

## Outputs
- Competitive analysis
- Market positioning
- Defense strategy

## Substages & Checklists
### 4.1 Competitor Identification
  - [ ] Direct competitors listed
  - [ ] Indirect competitors mapped

### 4.2 Feature Comparison
  - [ ] Feature matrix complete
  - [ ] Gaps identified

### 4.3 Market Positioning
  - [ ] USP defined
  - [ ] Differentiation strategy set

### 4.4 Defense Strategy
  - [ ] Competitive moat defined
  - [ ] IP strategy outlined

## Progression Mode
Manual (default). System learns from Chairman feedback over time to suggest Auto.

## Metric -> Action Map (examples)
- Competitor count > 10 -> **Deep differentiation required**
- Market share opportunity > 20% -> **Advance**
- No clear differentiation -> **Halt for strategy revision**

## Data Flow (contract skeleton)
- **Inputs**: validation_report.json from Stage 3, market_data.json
- **Outputs**: competitive_analysis.json -> stored in DB, consumed by Stage 5

## Rollback
- Return to Stage 3 if market not viable
- Preserve competitor analysis for future reference
- Re-evaluate market selection with Chairman input

## Tooling & Integrations
- **Primary Tools**: Specialist agents (Market Analysis), Competitive intelligence platforms
- **APIs**: TODO: Market data APIs, Competitor monitoring services
- **External Services**: TODO: Industry research databases, Patent search tools

## Error Handling
- Incomplete competitor data -> Use proxy metrics and estimates
- Market data unavailable -> Leverage specialist agent analysis
- IP conflicts discovered -> Escalate to Chairman for strategic decision

## Metrics & KPIs
- Market coverage
- Competitor identification
- Differentiation score

## Risks & Mitigations
- **Primary Risk**: Underestimating competition
- **Mitigation Strategy**: Continuous competitor monitoring, regular updates
- **Fallback Plan**: Pivot to adjacent market segment

## Failure Modes & Recovery
- **Common Failures**: Missing key competitors, overestimating differentiation
- **Recovery Steps**: Expand competitive analysis scope, validate with users
- **Rollback Procedure**: Return to Stage 3 with new market insights

## Security/Compliance Considerations
- **Data Security**: Standard EHG data protection policies apply
- **Compliance**: SOX, GDPR where applicable
- **Audit Trail**: All decisions and changes logged

## Notes / Open Questions
- TODO: Map to specific PRD implementations
- TODO: Define competitive monitoring frequency
- TODO: Establish differentiation score thresholds