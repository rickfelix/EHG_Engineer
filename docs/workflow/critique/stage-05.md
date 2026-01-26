# Stage 5 Critique: Profitability Forecasting


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, unit, schema, security

## Rubric Scoring (0-5 scale)

| Criteria | Score | Notes |
|----------|-------|-------|
| Clarity | 4 | Well-defined purpose and outputs |
| Feasibility | 3 | Requires significant resources |
| Testability | 3 | Metrics defined but validation criteria unclear |
| Risk Exposure | 2 | Moderate risk level |
| Automation Leverage | 3 | Partial automation possible |
| Data Readiness | 3 | Input/output defined but data flow unclear |
| Security/Compliance | 2 | Standard security requirements |
| UX/Customer Signal | 1 | No customer touchpoint |
| Recursion Readiness | 5 | Triggers FIN-001, critical quality gate |
| **Overall** | **3.2** | Functional but needs optimization |

## Strengths
- Clear ownership (PLAN)
- Defined dependencies (4)
- 3 metrics identified

## Weaknesses
- Limited automation for manual processes
- Unclear rollback procedures
- Missing specific tool integrations
- No explicit error handling

## Recursive Workflow Behavior (SD-VENTURE-UNIFICATION-001)

### Intelligent Dependency-Driven Recursion
This stage is a **CRITICAL recursion trigger** in the unified venture creation system. Financial viability discovered here can invalidate upstream validation assumptions, automatically triggering recursion back to earlier stages.

### Recursion Triggers FROM This Stage

| Target Stage | Trigger Type | Condition | Severity | Auto-Execute? | Reason |
|--------------|--------------|-----------|----------|---------------|--------|
| **Stage 3** | **FIN-001** | **ROI < 15%** | **CRITICAL** | **Yes** | **PRIMARY TRIGGER**: Profitability forecasting reveals venture is not financially viable. Requires re-validation of problem-solution fit, willingness-to-pay assumptions, and potentially Kill/Revise/Proceed decision. |
| Stage 4 | FIN-001 | Margin forecasts below target | HIGH | Needs approval | Competitive positioning may need adjustment to improve margins |
| Stage 2 | FIN-001 | Revenue model fundamentally flawed | CRITICAL | Yes | AI review needed with corrected financial assumptions |

### Recursion Logic (SC-003)

```javascript
// Success Criteria SC-003: Recursion triggers automatically when Stage 5 detects ROI < 15%
async function onStage5Complete(ventureId, financialModel) {
  const calculatedROI = financialModel.calculateROI();

  if (calculatedROI < 15) {
    // CRITICAL severity: Auto-execute recursion
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 5,
      toStage: 3,
      triggerType: 'FIN-001',
      triggerData: {
        calculated_roi: calculatedROI,
        threshold: 15,
        revenue_projections: financialModel.revenueProjections,
        cost_structure: financialModel.costs,
        break_even_analysis: financialModel.breakEven
      },
      severity: 'CRITICAL',
      autoExecuted: true,
      resolution_notes: `ROI of ${calculatedROI}% falls below 15% threshold. Re-validation required for:
        1. Willingness to pay assumptions
        2. Problem-solution fit with corrected financial constraints
        3. MVP scope reduction to improve ROI
        4. Kill/Revise/Proceed decision with accurate financial data`
    });

    // Recursion event logged to database
    // User redirected to Stage 3 with context
    // Chairman notified (post-execution for CRITICAL)
  }
}
```

### Recursion Thresholds

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| ROI | < 15% | CRITICAL | Auto-recurse to Stage 3 |
| ROI | 15-20% | HIGH | Chairman approval to recurse |
| Margin | < 20% | HIGH | Chairman approval to recurse to Stage 4 |
| Break-even | > 36 months | MEDIUM | Advisory warning only |

### Recursion Triggers That May RETURN TO This Stage

| From Stage | Trigger Type | Condition | Severity | Reason |
|------------|--------------|-----------|----------|--------|
| Stage 6 | FIN-001 | Risk assessment uncovers hidden costs | HIGH | Financial model needs update with risk-adjusted costs |
| Stage 10 | TECH-001 | Technical feasibility reveals higher development costs | HIGH | Revenue/cost projections need recalculation |

### Loop Prevention
- **Max recursions**: 3 returns from Stage 5 per venture
- **Escalation**: After 3rd FIN-001 trigger, Chairman must approve:
  - Continue with adjusted financial model
  - Kill venture (not financially viable)
  - Pivot to different revenue model
- **Tracking**: Each FIN-001 event logged with full financial snapshot for trend analysis

### Chairman Controls
- **CRITICAL severity** (ROI < 15%):
  - Auto-executed immediately
  - Chairman notified post-execution
  - Can override and skip recursion if strategic reasons exist
- **HIGH severity** (ROI 15-20% or margin issues):
  - Requires Chairman approval before recursion
  - Can adjust thresholds for specific venture types (e.g., strategic bets)
- **Override capability**: Chairman can:
  - Modify ROI threshold for specific industry/venture type
  - Approve ventures below threshold for strategic reasons
  - Skip recursion if downstream optimization planned

### Performance Requirements
- **ROI calculation**: Must complete in <500ms
- **Recursion detection**: <100ms after ROI calculated
- **Total stage latency**: <1 second from data entry to recursion decision
- **Database logging**: Async, non-blocking

### UI/UX Implications
- **Pre-emptive Warning**: Show ROI trend as user enters financial data
  - Green: ROI > 20% ✓
  - Yellow: ROI 15-20% ⚠️ (may trigger approval flow)
  - Red: ROI < 15% ❌ (will trigger automatic recursion)
- **Recursion Explanation**: Clear modal explaining:
  - "ROI of 12% is below 15% threshold"
  - "System will return to Stage 3 to re-validate assumptions"
  - "Previous validation data preserved for comparison"
- **Financial Comparison**: Side-by-side of original vs updated financial model after recursion

### Integration Points
- **validationFramework.ts**: Reuse threshold validation logic
- **evaValidation.ts**: Integrate quality scoring with recursion decision
- **recursionEngine.ts**: Central recursion orchestration service
- **recursion_events table**: Database logging for all FIN-001 triggers

## Specific Improvements

### 1. Enhance Automation
- **Current State**: Manual process
- **Target State**: 80% automation
- **Action**: Build automation workflows

### 2. Define Clear Metrics
- **Current Metrics**: Model accuracy, Revenue projections, Margin forecasts
- **Missing**: Threshold values, measurement frequency
- **Action**: Establish concrete KPIs with targets

### 3. Improve Data Flow
- **Current Inputs**: 3 defined
- **Current Outputs**: 3 defined
- **Gap**: Data transformation and validation rules
- **Action**: Document data schemas and transformations

### 4. Add Rollback Procedures
- **Current**: No rollback defined
- **Required**: Clear rollback triggers and steps
- **Action**: Define rollback decision tree

### 5. Customer Integration
- **Current**: No customer interaction
- **Opportunity**: Add customer validation checkpoint
- **Action**: Consider adding customer feedback loop

## Dependencies Analysis
- **Upstream Dependencies**: 4
- **Downstream Impact**: Stages 6
- **Critical Path**: Yes

## Risk Assessment
- **Primary Risk**: Process delays
- **Mitigation**: Clear success criteria
- **Residual Risk**: Low to Medium

## Recommendations Priority
1. Increase automation level
2. Define concrete success metrics with thresholds
3. Document data transformation rules
4. Add customer validation touchpoint
5. Create detailed rollback procedures