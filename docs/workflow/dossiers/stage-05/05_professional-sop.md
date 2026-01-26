# Stage 5: Professional Standard Operating Procedure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: api, unit, validation, infrastructure

**Purpose**: Step-by-step execution procedure for financial modeling and profitability forecasting

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:183-227 "Stage 5 definition"

---

## Pre-Execution Checklist

**Before starting Stage 5, verify**:

- [ ] Stage 4 (Competitive Intelligence) is complete
- [ ] Market positioning is defined with clear USP
- [ ] Pricing signals are captured from market research
- [ ] Market size data is available (TAM/SAM/SOM or estimates)
- [ ] Cost estimates exist from Stage 3 technical feasibility assessment

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:201-203 "entry gates: Market positioning"

---

## Substage 5.1: Revenue Modeling

**Objective**: Define revenue streams and create growth projections

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:210-213 "5.1 Revenue Modeling"

### Step 1: Identify Revenue Streams

**Action**: List all potential revenue sources for the venture

**Examples**:
- Subscription revenue (monthly/annual)
- One-time purchases
- Freemium upsells
- Transaction fees
- Advertising revenue
- Licensing fees

**Deliverable**: Revenue streams documented with pricing for each

**Done When**: Revenue streams defined (per stages.yaml)

---

### Step 2: Build Revenue Model

**Action**: Create spreadsheet or financial model with:
- Unit economics (price per user, conversion rate, churn rate)
- Customer acquisition assumptions
- Growth rate assumptions (MoM, YoY)
- Market penetration assumptions

**Template Structure**:
```
| Month | New Users | Total Users | Churn | Revenue | MRR | ARR |
|-------|-----------|-------------|-------|---------|-----|-----|
| M1    |    100    |    100      |  5%   | $1000   | ... | ... |
| M2    |    150    |    245      |  5%   | $2450   | ... | ... |
...
```

**Deliverable**: 3-5 year revenue projections by month/quarter

**Done When**: Growth projections created (per stages.yaml)

---

## Substage 5.2: Cost Structure

**Objective**: Estimate all costs required to deliver the venture

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:214-219 "5.2 Cost Structure"

### Step 3: Estimate COGS (Cost of Goods Sold)

**Action**: Calculate variable costs per unit/user

**Examples**:
- Cloud infrastructure costs per user
- Transaction processing fees
- Content delivery costs
- Support costs per user

**Formula**: COGS per user = (Infrastructure + Processing + Delivery + Support) / Total Users

**Deliverable**: COGS breakdown by category

**Done When**: COGS estimated (per stages.yaml)

---

### Step 4: Project OpEx (Operating Expenses)

**Action**: Forecast fixed operational expenses

**Categories**:
- **Salaries**: Team size × average salary (engineering, sales, support)
- **Marketing**: Customer acquisition cost (CAC) × target user growth
- **Infrastructure**: Base cloud/hosting costs (non-variable)
- **Tools & Subscriptions**: SaaS tools, licenses, APIs
- **Overhead**: Rent, legal, accounting, insurance

**Deliverable**: Monthly/quarterly OpEx projections for 3-5 years

**Done When**: OpEx projected (per stages.yaml)

---

### Step 5: Plan CapEx (Capital Expenditures)

**Action**: Identify upfront capital investments

**Examples**:
- Initial development costs (MVP build)
- Equipment purchases (servers, laptops)
- Office setup (if physical space required)
- Patents/IP registration

**Deliverable**: One-time CapEx requirements with timing

**Done When**: CapEx planned (per stages.yaml)

---

## Substage 5.3: Profitability Analysis

**Objective**: Calculate break-even, margins, and ROI

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:220-225 "5.3 Profitability Analysis"

### Step 6: Calculate Break-Even

**Action**: Determine when cumulative revenue exceeds cumulative costs

**Formula**: Break-even month = First month where (Cumulative Revenue - Cumulative Costs) ≥ 0

**Thresholds**:
- ✅ Break-even ≤ 24 months: Excellent
- ⚠️ Break-even 24-36 months: Acceptable
- ❌ Break-even > 36 months: High risk (advisory warning per critique)

**Deliverable**: Break-even analysis with timeline

**Done When**: Break-even calculated (per stages.yaml)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:86 "Break-even > 36 months | MEDIUM"

---

### Step 7: Project Margins

**Action**: Calculate gross margin and net margin over time

**Formulas**:
- Gross Margin = (Revenue - COGS) / Revenue
- Net Margin = (Revenue - COGS - OpEx - CapEx) / Revenue

**Thresholds**:
- ❌ Gross Margin < 20%: May trigger recursion to Stage 4 (HIGH severity)
- ⚠️ Gross Margin 20-40%: Acceptable
- ✅ Gross Margin > 40%: Excellent

**Deliverable**: Margin forecasts by quarter for 3-5 years

**Done When**: Margins projected (per stages.yaml)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:85 "Margin < 20% | HIGH"

---

### Step 8: Estimate ROI

**Action**: Calculate return on investment percentage

**Formula**: ROI = (Net Profit / Total Investment) × 100%

**CRITICAL THRESHOLDS**:
- ❌ **ROI < 15%**: **CRITICAL** - Automatically triggers FIN-001 recursion to Stage 3
- ⚠️ ROI 15-20%: HIGH - Requires Chairman approval to proceed
- ✅ ROI > 20%: Excellent - No recursion triggered

**Deliverable**: ROI estimate with confidence interval

**Done When**: ROI estimated (per stages.yaml)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:49 "if (calculatedROI < 15)"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:83-84 "ROI thresholds table"

---

## Recursion Decision Point

**Action**: System automatically evaluates recursion triggers

**Trigger Logic** (from critique lines 44-77):

```javascript
async function onStage5Complete(ventureId, financialModel) {
  const calculatedROI = financialModel.calculateROI();

  if (calculatedROI < 15) {
    // CRITICAL severity: Auto-execute recursion to Stage 3
    await recursionEngine.triggerRecursion({
      ventureId,
      fromStage: 5,
      toStage: 3,
      triggerType: 'FIN-001',
      severity: 'CRITICAL',
      autoExecuted: true,
      resolution_notes: `ROI of ${calculatedROI}% falls below 15% threshold.`
    });
  }
}
```

**User Experience**:
- Pre-emptive warning as user enters financial data:
  - 🟢 ROI > 20%: Green indicator
  - 🟡 ROI 15-20%: Yellow indicator (may trigger approval flow)
  - 🔴 ROI < 15%: Red indicator (will trigger automatic recursion)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:44-77 "Recursion Logic (SC-003)"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:122-127 "UI/UX Implications"

---

## Exit Gate Validation

**Before marking Stage 5 complete, verify**:

- [ ] Financial model complete (all revenue, cost, profitability calculations validated)
- [ ] Profitability validated (ROI ≥ 15% or Chairman override)
- [ ] Investment requirements defined (clear funding needs for execution)
- [ ] Break-even timeline calculated
- [ ] Margin forecasts documented
- [ ] ROI estimate finalized

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:205-207 "exit gates"

---

## Rollback Procedures

**When to Rollback**:
- Critical calculation errors discovered
- Input data invalidated (e.g., pricing strategy changed in Stage 4)
- Recursion triggered to upstream stage (Stage 3, 4, or 2)

**Rollback Steps**:
1. Preserve current financial model in `financial_model_history` table
2. Mark stage status as "In Progress" (not Complete)
3. Document reason for rollback in `stage_history` table
4. If recursion triggered, await upstream stage completion before re-executing Stage 5

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:157-160 "Add Rollback Procedures"

---

## Common Pitfalls

1. **Over-optimistic growth assumptions**: Use conservative estimates, not best-case scenarios
2. **Underestimating OpEx**: Include all operational costs (marketing, support, tools)
3. **Ignoring churn**: Model realistic customer retention rates
4. **Forgetting CapEx**: Include upfront development and setup costs
5. **Not validating with real data**: Use Stage 4 pricing signals, not assumptions

---

## Success Criteria

**Stage 5 is complete when**:
- All 3 substages (5.1, 5.2, 5.3) marked "Done"
- All exit gates passed
- Financial model validated by PLAN team
- ROI ≥ 15% (or Chairman override documented)
- No recursion triggers activated (or recursion resolved)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:205-207 "exit gates"

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Stage definition | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 183-227 |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 208-225 |
| Recursion logic | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 44-77 |
| Thresholds | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 79-86 |
| UI/UX | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 122-132 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
