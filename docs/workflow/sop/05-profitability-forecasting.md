# 5. Profitability Forecasting

- **Depends on**: 4
- **Purpose**: Create financial models and profitability projections for the venture.

## Entry Gate
- Market positioning defined
- Pricing signals captured

## Exit Gate
- Financial model complete
- Profitability validated
- Investment requirements defined

## Inputs
- Market size data
- Pricing strategy
- Cost estimates

## Outputs
- Financial model
- P&L projections
- Break-even analysis

## Substages & Checklists
### 5.1 Revenue Modeling
  - [ ] Revenue streams defined
  - [ ] Growth projections created

### 5.2 Cost Structure
  - [ ] COGS estimated
  - [ ] OpEx projected
  - [ ] CapEx planned

### 5.3 Profitability Analysis
  - [ ] Break-even calculated
  - [ ] Margins projected
  - [ ] ROI estimated

## Progression Mode
Manual (default). System learns from Chairman feedback over time to suggest Auto.

## Metric -> Action Map (examples)
- Gross margin > 60% -> **Advance**
- Break-even > 24 months -> **Re-evaluate business model**
- ROI < 3x -> **Halt for Chairman review**

## Data Flow (contract skeleton)
- **Inputs**: competitive_analysis.json from Stage 4, market_sizing.json
- **Outputs**: financial_model.json -> stored in DB, consumed by Stage 6

## Rollback
- Preserve financial model for iteration
- Return to Stage 4 if pricing strategy needs adjustment
- Document assumptions that need revision

## Tooling & Integrations
- **Primary Tools**: Specialist agent (Finance/Profitability), Financial modeling software
- **APIs**: TODO: Market data feeds, Cost estimation services
- **External Services**: TODO: Financial benchmarking databases

## Error Handling
- Unrealistic projections detected -> Flag for Chairman review
- Missing cost data -> Use industry benchmarks
- Model validation failures -> Rerun with adjusted assumptions

## Metrics & KPIs
- Model accuracy
- Revenue projections
- Margin forecasts

## Risks & Mitigations
- **Primary Risk**: Over-optimistic projections
- **Mitigation Strategy**: Multiple scenario modeling, conservative base case
- **Fallback Plan**: Stress test with 50% revenue reduction

## Failure Modes & Recovery
- **Common Failures**: Unrealistic growth assumptions, underestimated costs
- **Recovery Steps**: Benchmark against similar ventures, adjust model
- **Rollback Procedure**: Return to Stage 4 for market re-evaluation

## Security/Compliance Considerations
- **Data Security**: Standard EHG data protection policies apply
- **Compliance**: SOX, GDPR where applicable
- **Audit Trail**: All decisions and changes logged

## Notes / Open Questions
- TODO: Map to specific PRD implementations
- TODO: Define model validation criteria
- TODO: Establish profitability thresholds