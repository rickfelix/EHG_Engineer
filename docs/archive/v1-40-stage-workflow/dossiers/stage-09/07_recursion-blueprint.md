# Stage 9: Recursion Blueprint

**Status**: ⚠️ **NO RECURSION TRIGGERS DEFINED** (honest gap documentation)

**Consistency Scan Result**: N/N/N (No recursion section in Stage 9 critique, no references in Stage 8 or Stage 10 critiques)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:28-71 "Standard improvements only, no recursion section"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:29-156 "Recursion section present, no Stage 9 references"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:29-193 "Recursion section present, no Stage 9 references"

---

## Recursion Role in Unified Venture Creation System

**Current State**: Stage 9 (Gap Analysis & Market Opportunity Modeling) has **NO DEFINED RECURSION TRIGGERS** in the current critique documentation.

**Expected Role**: Gap analysis should trigger recursion when:
1. **Critical capability gaps** invalidate earlier planning assumptions
2. **Market opportunity size** is too small to justify venture investment
3. **ROI projections** reveal financial infeasibility

**Gap Status**: ⚠️ **RECURSION LOGIC NOT YET DESIGNED** (documented as implementation gap in File 10)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:28-71 "No Recursive Workflow Behavior section"

---

## Outbound Recursion Triggers

**Recursion Triggers FROM This Stage**: ⚠️ **NONE DEFINED YET**

**Proposed Outbound Triggers** (logical inference, not implemented):

| Target Stage | Trigger Type | Condition | Severity | Reason |
|--------------|--------------|-----------|----------|--------|
| **Stage 7** | **GAP-001** | **Critical capability gaps require 3+ months to close** | **HIGH** | Comprehensive Planning needs timeline adjustment - cannot execute venture on original schedule |
| Stage 7 | GAP-002 | Gap closure costs exceed budget by 25%+ | HIGH | Resource Planning needs update - additional hiring/tooling budget required |
| Stage 5 | GAP-003 | Opportunity size (SOM) below profitability threshold | CRITICAL | Profitability forecasting needs update - market too small to justify investment |
| Stage 8 | GAP-004 | Required capabilities reveal WBS underestimated complexity | MEDIUM | Problem Decomposition needs re-scoping - tasks need to be broken down further |

**Rationale**: These triggers are **logical extensions** of Gap Analysis purpose but are not documented in critique.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:28-71 "No outbound recursion triggers defined"

---

## Inbound Recursion Triggers

**Recursion Triggers That May RETURN TO This Stage**: ⚠️ **NONE FOUND**

**Scan Results**:
- **Stage 8 (Problem Decomposition)**: No references to Stage 9 recursion
- **Stage 10 (Technical Review)**: No references to Stage 9 recursion
- **Other Stages**: Not scanned (only Stage 8 and Stage 10 reviewed per instructions)

**Proposed Inbound Triggers** (logical inference, not implemented):

| From Stage | Trigger Type | Condition | Severity | Reason |
|------------|--------------|-----------|----------|--------|
| Stage 10 | TECH-002 | Technical review reveals new capability gaps | MEDIUM | Technical Review uncovers required capabilities not identified in Stage 9 (e.g., specialized security tools, performance optimization expertise) |
| Stage 14 | DEV-001 | Development prep reveals tooling gaps | LOW | Development environment setup identifies missing tools/infrastructure not captured in Stage 9 capability assessment |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:29-156 "Recursion targets: Stage 7, Stage 10, Stage 14, Stage 22 (no Stage 9)"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:34-112 "Recursion targets: Stage 8, 7, 5, 3 (no Stage 9)"

---

## Proposed GAP-001 Recursion Logic (Not Implemented)

### Conceptual Implementation

```javascript
// From Stage 9: Gap Analysis & Market Opportunity Modeling
async function onStage9Complete(ventureId, gapAnalysisOutput) {
  const criticalGaps = gapAnalysisOutput.gaps.filter(g => g.priority === 'P0' || g.priority === 'P1');
  const maxClosureTimeline = Math.max(...criticalGaps.map(g => g.eta_weeks));
  const stage7Timeline = await fetchStage7Timeline(ventureId);

  // Check if gap closure extends timeline beyond Stage 7 planning
  if (maxClosureTimeline > 12) {  // 3+ months
    // HIGH severity: Requires Chairman approval
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 9,
      toStage: 7,
      targetSubstage: '7.2',  // Technical Planning
      triggerType: 'GAP-001',
      triggerData: {
        critical_gaps_count: criticalGaps.length,
        critical_gaps: criticalGaps.map(g => ({
          capability: g.capability,
          closure_approach: g.closure_approach,
          eta_weeks: g.eta_weeks,
          cost_usd: g.cost_usd
        })),
        max_closure_timeline_weeks: maxClosureTimeline,
        original_timeline_weeks: stage7Timeline.total_weeks,
        timeline_extension_needed_weeks: maxClosureTimeline - stage7Timeline.buffer_weeks
      },
      severity: 'HIGH',
      autoExecuted: false,
      resolution_notes: `Gap analysis identified ${criticalGaps.length} critical capability gaps requiring ${maxClosureTimeline} weeks to close.
        Original timeline: ${stage7Timeline.total_weeks} weeks
        Extension needed: ${maxClosureTimeline - stage7Timeline.buffer_weeks} weeks

        Critical gaps:
        ${criticalGaps.map((g, idx) => `${idx + 1}. ${g.capability} - ${g.closure_approach} (${g.eta_weeks} weeks, $${g.cost_usd})`).join('\n        ')}

        Recommended actions:
        1. Update Stage 7.2 Technical Planning timeline with gap closure lead time
        2. Adjust project start date or reduce scope to fit original timeline
        3. Consider parallel gap closure + development if feasible`
    });
  }

  // Check if gap closure costs exceed budget
  const totalGapClosureCost = criticalGaps.reduce((sum, g) => sum + g.cost_usd, 0);
  const stage7Budget = await fetchStage7ResourceBudget(ventureId);

  if (totalGapClosureCost > stage7Budget * 1.25) {  // 25% over budget
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 9,
      toStage: 7,
      targetSubstage: '7.3',  // Resource Planning
      triggerType: 'GAP-002',
      triggerData: {
        gap_closure_cost_usd: totalGapClosureCost,
        original_budget_usd: stage7Budget,
        budget_overrun_pct: ((totalGapClosureCost / stage7Budget) - 1) * 100,
        cost_breakdown: criticalGaps.map(g => ({ capability: g.capability, cost: g.cost_usd }))
      },
      severity: 'HIGH',
      autoExecuted: false,
      resolution_notes: `Gap closure costs ($${totalGapClosureCost}) exceed Stage 7 resource budget ($${stage7Budget}) by ${Math.round(((totalGapClosureCost / stage7Budget) - 1) * 100)}%`
    });
  }

  // Check if opportunity size justifies investment
  const opportunitySize = gapAnalysisOutput.opportunity_matrix.reduce((sum, o) => sum + o.som, 0);
  const stage5Profitability = await fetchStage5ProfitabilityModel(ventureId);

  if (opportunitySize < stage5Profitability.break_even_revenue) {
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 9,
      toStage: 5,
      triggerType: 'GAP-003',
      triggerData: {
        opportunity_size_som_usd: opportunitySize,
        break_even_revenue_usd: stage5Profitability.break_even_revenue,
        revenue_gap_usd: stage5Profitability.break_even_revenue - opportunitySize,
        opportunities: gapAnalysisOutput.opportunity_matrix.map(o => ({ name: o.opportunity, som: o.som, roi: o.roi }))
      },
      severity: 'CRITICAL',
      autoExecuted: true,  // Financial infeasibility is auto-execute
      resolution_notes: `Market opportunity size ($${opportunitySize} SOM) is below break-even revenue ($${stage5Profitability.break_even_revenue}). Venture is not financially viable with current scope.`
    });
  }
}
```

**Evidence**: N/A (proposed logic, not in source materials)

---

## Recursion Thresholds (Proposed)

| Trigger | Threshold | Target Stage | Severity | Action |
|---------|-----------|--------------|----------|--------|
| GAP-001 | Critical gap closure > 12 weeks | Stage 7 | HIGH | Chairman approval to adjust timeline |
| GAP-002 | Gap costs > 25% over budget | Stage 7 | HIGH | Chairman approval to increase budget |
| GAP-003 | SOM < break-even revenue | Stage 5 | CRITICAL | Auto-recurse to update financial model |
| GAP-004 | Capability complexity underestimated | Stage 8 | MEDIUM | Advisory to re-decompose WBS |

**Evidence**: N/A (proposed thresholds, not in source materials)

---

## Loop Prevention (Proposed)

- **Max recursions**: 2 returns to Stage 7/8 per venture from Stage 9
- **Escalation**: After 2nd GAP-001 or GAP-002 trigger, Chairman must decide:
  - Accept timeline/budget extension (approve recursion)
  - Simplify scope (remove features requiring rare capabilities)
  - Kill venture (capability gaps too severe)
  - Pivot to different approach (buy instead of build)
- **Tracking**: Each recursion logs gap analysis snapshot for trend analysis

**Evidence**: N/A (proposed logic, not in source materials)

---

## Chairman Controls (Proposed)

**HIGH severity** (GAP-001, GAP-002):
- Requires Chairman approval before recursion
- Review panel shows:
  - Critical gaps with closure timelines and costs
  - Original Stage 7 timeline vs adjusted timeline
  - Budget impact breakdown
- Can choose to:
  - Approve recursion (adjust timeline/budget)
  - Reduce scope (remove features requiring unavailable capabilities)
  - Accept risk (proceed with capability gaps, plan to acquire later)
  - Kill venture (gaps too severe)

**CRITICAL severity** (GAP-003 financial infeasibility):
- Auto-executed to Stage 5
- Chairman notified post-execution
- Can override if strategic reasons justify unprofitable venture (e.g., loss leader, market entry)

**Evidence**: N/A (proposed controls, not in source materials)

---

## Performance Requirements (Proposed)

- **Gap analysis completion**: <10 seconds for capability assessment
- **Recursion detection**: <100ms after gap analysis complete
- **ROI calculation**: <2 seconds for opportunity matrix
- **Database logging**: Async, stores full gap analysis snapshot

**Evidence**: N/A (proposed requirements, not in source materials)

---

## UI/UX Implications (Proposed)

**Gap Analysis Dashboard**: Real-time indicators during Stage 9:
- **Gap Coverage**: Green (≥80%), Yellow (60-80%), Red (<60%)
- **Opportunity Size**: SOM total with break-even threshold line
- **Critical Gaps**: Count with timeline/cost impact

**Recursion Warning Modal** (when GAP-001/GAP-002 triggered):
- "Gap analysis identified {count} critical gaps requiring {weeks} weeks and ${cost} to close"
- List of gaps with closure approaches
- Impact on Stage 7 timeline and budget
- Chairman approval request with approve/modify/reject options

**Evidence**: N/A (proposed UI, not in source materials)

---

## Integration Points (Proposed)

- **Stage 7 (Comprehensive Planning)**: Primary recursion target for timeline/budget adjustments
- **Stage 8 (Problem Decomposition)**: Recursion target for WBS re-scoping
- **Stage 5 (Profitability)**: Recursion target for financial model updates
- **validationFramework.ts**: Reuse for threshold checks
- **recursionEngine.ts**: Central orchestration
- **recursion_events table**: Log all gap-triggered recursions

**Evidence**: N/A (proposed integrations, not in source materials)

---

## Implementation Gap Summary

**Gap Type**: Missing recursion logic
**Severity**: MEDIUM (Stage 9 can function without recursion, but lacks feedback loop to correct upstream assumptions)
**Impact**:
- Ventures may proceed with unrealistic timelines (capability gaps not accounted for in Stage 7)
- Budget overruns if gap closure costs not fed back to Stage 7 Resource Planning
- Financially infeasible ventures not caught early (no feedback to Stage 5)

**Recommended Action**: Design and implement recursion triggers GAP-001, GAP-002, GAP-003 (feeds SD-RECURSION-AI-002 if exists)

**Cross-Reference**: See File 10 (Gaps & Backlog) for full gap documentation with SD mappings

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-09.md:28-71 "No recursion section defined"

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-09.md | 28-71 | No recursion section (gap documentation) |
| recursion scan | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-08.md | 29-156 | No Stage 9 references |
| recursion scan | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-10.md | 34-112 | No Stage 9 references |

---

<!-- Generated by Claude Code Phase 5 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
