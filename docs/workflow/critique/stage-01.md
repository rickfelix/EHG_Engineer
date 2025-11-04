# Stage 1 Critique: Draft Idea

## Rubric Scoring (0-5 scale)

| Criteria | Score | Notes |
|----------|-------|-------|
| Clarity | 4 | Well-defined purpose and outputs |
| Feasibility | 4 | Automated execution possible |
| Testability | 3 | Metrics defined but validation criteria unclear |
| Risk Exposure | 2 | Moderate risk level |
| Automation Leverage | 5 | Fully automatable |
| Data Readiness | 3 | Input/output defined but data flow unclear |
| Security/Compliance | 2 | Standard security requirements |
| UX/Customer Signal | 4 | Direct customer interaction |
| Recursion Readiness | 3 | Receives CUSTOM triggers, entry rework |
| **Overall** | **3.1** | Functional but needs optimization |

## Strengths
- Clear ownership (EVA)
- Defined dependencies (standalone)
- 3 metrics identified

## Weaknesses
- Limited automation for manual processes
- Unclear rollback procedures
- Missing specific tool integrations
- No explicit error handling

## Recursive Workflow Behavior (SD-VENTURE-UNIFICATION-001)

### Status
⚠️ **Recursion mappings pending**: As part of Phase 2-3 implementation of SD-VENTURE-UNIFICATION-001, this stage will be analyzed for potential recursion triggers. The system supports "20-25 recursion scenarios" across all 40 stages.

### Intelligent Dependency-Driven Recursion
This stage is the **entry point** for venture creation. It participates in the unified system where downstream discoveries can invalidate fundamental assumptions about the problem definition, triggering recursion back to refine the initial idea.

### Potential Recursion Triggers FROM This Stage
As the first stage, this stage rarely triggers recursion to earlier stages (none exist). However, it provides the foundation that later stages validate.

### Potential Recursion Triggers That May RETURN TO This Stage

| From Stage | Trigger Type | Likely Condition | Severity | Reason |
|------------|--------------|------------------|----------|--------|
| Stage 2 | CUSTOM | AI review reveals fundamental problem definition flaw | HIGH | Need to refine problem statement with AI insights |
| Stage 3 | CUSTOM | Technical infeasibility discovered | HIGH | Problem definition may need complete rework |
| Stage 5 | CUSTOM | Financial model reveals flawed value proposition | MEDIUM | Refine idea with financial viability constraints |

### Recursion Behavior Pattern
When later stages trigger recursion back to Stage 1:

1. **Preserve Original Idea**: Keep v1 for comparison and learning
2. **Refine with Downstream Insights**:
   - AI analysis feedback (from Stage 2)
   - Validation learnings (from Stage 3)
   - Financial constraints (from Stage 5)
   - Technical feasibility insights (from Stage 10)
3. **Re-capture Refined Idea**: Updated problem statement, assumptions, success criteria
4. **Comparison Analysis**: Show idea v1 vs v2 delta

### Potential Recursion Triggers This Stage May Use
- **CUSTOM**: Custom business logic triggers for fundamental rework
- **QUALITY-001**: Quality standard violations requiring idea refinement
- **COMPLIANCE-001**: Regulatory issues affecting problem definition

### Loop Prevention
- **Max recursions**: 3 returns to Stage 1 per venture
- **Escalation**: After 3rd recursion, Chairman must decide:
  - Accept refined idea and proceed
  - Kill venture (problem not well-defined)
  - Pivot to different problem space
  - Start new venture (different approach)
- **Tracking**: All recursions logged in `recursion_events` table

### Chairman Controls
- **HIGH severity** recursions:
  - Requires Chairman approval before returning to Stage 1
  - Review panel shows original vs refined problem definitions
  - Can choose to approve, modify, or reject recursion
- **Override capability**: Chairman can skip recursion if strategic clarity exists

### Database Tracking
All recursion events logged in the `recursion_events` table with:
- `from_stage` and `to_stage` (target: Stage 1)
- `trigger_type` (CUSTOM or other enum values)
- `threshold_severity` (CRITICAL/HIGH/MEDIUM/LOW)
- `chairman_approved` (null/true/false for approval workflow)
- `recursion_count_for_stage` (for loop prevention)
- `trigger_data` (JSON with specific reasoning for recursion)

### Performance Requirements
- **Recursion detection**: <100ms per stage
- **Database logging**: Async, non-blocking
- **UI updates**: Real-time recursion status

### UI/UX Implications
- **Recursion History Panel**: Timeline showing all recursions affecting Stage 1
- **Comparison View**: Side-by-side of original idea vs refined versions
- **Explanation**: Clear messaging why recursion occurred with downstream learnings

### Documentation Reference
Full recursion logic will be documented in:
- **recursionEngine.ts**: `/mnt/c/_EHG/ehg/src/services/recursionEngine.ts`
- **Database schema**: `recursion_events` table
- **Architecture**: `docs/architecture/SD-VENTURE-UNIFICATION-001-database-migration-plan.md`

## Specific Improvements

### 1. Enhance Automation
- **Current State**: Automated
- **Target State**: 80% automation
- **Action**: Optimize existing automation

### 2. Define Clear Metrics
- **Current Metrics**: Idea quality score, Validation completeness, Time to capture
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
- **Current**: Has customer touchpoint
- **Opportunity**: Add customer validation checkpoint
- **Action**: Enhance existing touchpoint

## Dependencies Analysis
- **Upstream Dependencies**: None
- **Downstream Impact**: Stages 2
- **Critical Path**: Yes

## Risk Assessment
- **Primary Risk**: Process delays
- **Mitigation**: Clear success criteria
- **Residual Risk**: Low to Medium

## Recommendations Priority
1. Optimize existing automation
2. Define concrete success metrics with thresholds
3. Document data transformation rules
4. Enhance customer feedback mechanisms
5. Create detailed rollback procedures