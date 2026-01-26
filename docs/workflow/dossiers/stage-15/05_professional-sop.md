# Stage 15: Professional Standard Operating Procedure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

**Purpose**: Step-by-step execution guide for Pricing Strategy & Revenue Architecture
**Owner**: LEAD agent
**Execution Mode**: Manual → Assisted → Auto (suggested progression)
**Estimated Duration**: 2-4 weeks (depending on market research complexity)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:643-645` "id: 15 | Pricing Strategy & Revenue Arc"

---

## Pre-Execution Checklist

**STOP**: Do NOT proceed with Stage 15 until ALL entry gates are validated.

### Entry Gate #1: Costs Calculated

**Validation Steps**:
1. Verify Stage 14 (Cost & Resource Estimation) has reached exit status
2. Confirm cost structure artifact exists and is accessible
3. Validate cost structure includes:
   - Fixed costs breakdown
   - Variable costs breakdown
   - One-time costs breakdown
   - Cost per unit (if applicable)
4. Review cost structure for completeness (no missing line items)

**Blocker**: If cost structure is incomplete, HALT and return to Stage 14.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:661-662` "entry: Costs calculated"

---

### Entry Gate #2: Market Research Complete

**Validation Steps**:
1. Verify Stage 5 (Market Analysis) completion OR external market research availability
2. Confirm market research report includes pricing-relevant insights:
   - Customer segments and willingness-to-pay indicators
   - Market size and addressable market
   - Customer pain points and value drivers
3. Validate market research is recent (< 6 months old recommended)
4. Review market research for pricing-specific data (if absent, flag for additional research)

**Blocker**: If market research lacks pricing insights, HALT and conduct supplemental research.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:663` "Market research complete"

---

### Input Readiness Verification

**Input #1**: Cost structure (from Stage 14)
- [ ] Cost structure artifact located
- [ ] All cost categories defined (fixed, variable, one-time)
- [ ] Cost per unit calculated (if applicable)
- [ ] Cost structure approved by LEAD

**Input #2**: Market research (from Stage 5 or external)
- [ ] Market research report available
- [ ] Customer segments identified
- [ ] Pricing-relevant insights present
- [ ] Market research date < 6 months old

**Input #3**: Competitor pricing (external data)
- [ ] Competitor list identified (minimum 5 competitors recommended)
- [ ] Data collection method defined (web scraping, manual research, third-party data)
- [ ] Legal compliance verified (no illegal data collection methods)
- [ ] Data collection timeline established (substage 15.1)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:648-651` "inputs: Cost structure | Market researc"

---

## Substage 15.1: Pricing Research

**Objective**: Analyze competitor pricing, assess customer willingness-to-pay, and define value metrics.

**Estimated Duration**: 1-2 weeks

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:669-674` "id: '15.1' | title: Pricing Research"

---

### Step 1.1: Competitor Price Analysis

**Procedure**:
1. Identify 5-10 direct competitors offering comparable products/services
2. Collect competitor pricing data:
   - Pricing tiers (if tiered pricing)
   - Price points for each tier
   - Features included in each tier
   - Discounts offered (annual subscriptions, volume, etc.)
   - Pricing model (subscription, one-time, usage-based, etc.)
3. Create competitor pricing matrix (spreadsheet or table format)
4. Analyze pricing patterns:
   - Average price across competitors
   - Price range (min to max)
   - Common pricing tiers (e.g., Basic, Pro, Enterprise)
   - Feature differentiation between tiers
5. Identify pricing gaps or opportunities (underpriced or overpriced market segments)

**Deliverable**: Competitor pricing matrix with analysis notes

**Completion Criterion**: "Competitor prices analyzed"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:672` "Competitor prices analyzed"

**Tools**:
- Manual research: Competitor websites, pricing pages
- Automated scraping: Pricing intelligence tools (e.g., PriceIntelligently, Profitwell)
- Third-party data: Industry reports, market research databases

**Quality Check**:
- [ ] Minimum 5 competitors analyzed
- [ ] All pricing tiers documented
- [ ] Feature comparison completed
- [ ] Pricing patterns identified

---

### Step 1.2: Customer Willingness-to-Pay Assessment

**Procedure**:
1. Design willingness-to-pay survey or focus group questions:
   - "What would you expect to pay for [product/service]?"
   - "At what price point would you consider this too expensive?"
   - "At what price point would you question the quality?"
   - "What features are most valuable to you?" (for tier design)
2. Distribute survey to target customer segments:
   - Email list (if available)
   - Social media outreach
   - Customer advisory board (if established)
   - Focus groups or interviews
3. Collect survey responses (target: n ≥ 100 for statistical significance)
4. Analyze willingness-to-pay data:
   - Median willingness-to-pay per customer segment
   - Price sensitivity analysis (elasticity)
   - Feature value rankings
5. Correlate willingness-to-pay with customer segments (e.g., SMB vs. Enterprise)

**Deliverable**: Customer willingness-to-pay report with statistical analysis

**Completion Criterion**: "Customer willingness assessed"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:673` "Customer willingness assessed"

**Tools**:
- Survey platforms: Typeform, SurveyMonkey, Google Forms
- Statistical analysis: Excel, R, Python (pandas)
- Conjoint analysis tools (for advanced feature valuation)

**Quality Check**:
- [ ] Survey designed with pricing-specific questions
- [ ] Minimum 100 responses collected (or justify smaller sample)
- [ ] Statistical analysis completed (median, distribution)
- [ ] Customer segments correlated with willingness-to-pay

**Fallback**: If no active customer base exists, use competitor pricing as proxy and flag for post-launch validation.

---

### Step 1.3: Value Metrics Definition

**Procedure**:
1. Identify value drivers from market research and customer surveys:
   - What problems does the product solve?
   - What outcomes do customers achieve?
   - What features are most valuable?
2. Define value metrics (quantifiable measures of value):
   - **For SaaS**: Users, seats, usage (API calls, storage), features unlocked
   - **For E-commerce**: Transaction volume, GMV (Gross Merchandise Value)
   - **For Services**: Hours, projects, deliverables
3. Map value metrics to pricing model:
   - **Usage-based pricing**: Price scales with usage (e.g., $0.01 per API call)
   - **Tiered pricing**: Price scales with features/users (e.g., Basic, Pro, Enterprise)
   - **Flat-rate pricing**: Single price for unlimited usage
4. Validate value metrics with customer segments:
   - Does the metric align with perceived value?
   - Is the metric easy to understand and track?
   - Does the metric incentivize desired customer behavior?
5. Document value metrics with rationale

**Deliverable**: Value metrics framework with pricing model alignment

**Completion Criterion**: "Value metrics defined"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:674` "Value metrics defined"

**Quality Check**:
- [ ] Value drivers identified from customer research
- [ ] Value metrics defined (quantifiable)
- [ ] Metrics mapped to pricing model type
- [ ] Metrics validated for customer alignment

**Example Value Metrics**:
- SaaS: Monthly Active Users (MAU), storage GB, API calls
- E-commerce: Number of transactions, GMV percentage
- Services: Billable hours, number of projects

---

### Substage 15.1 Exit Criteria

**All 3 completion criteria MUST be TRUE**:
- [x] Competitor prices analyzed
- [x] Customer willingness assessed
- [x] Value metrics defined

**Validation**: LEAD agent reviews deliverables and approves progression to substage 15.2.

---

## Substage 15.2: Model Development

**Objective**: Create pricing model, structure tiers, and plan discount policies.

**Estimated Duration**: 1 week

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:675-680` "id: '15.2' | title: Model Development"

---

### Step 2.1: Pricing Model Creation

**Procedure**:
1. Select pricing model type based on value metrics (from substage 15.1):
   - **Cost-plus pricing**: Cost + margin (e.g., cost $10, margin 50% → price $15)
   - **Value-based pricing**: Price based on perceived value (e.g., customer saves $1000, price $300)
   - **Competitive pricing**: Price based on competitor benchmarks (e.g., average competitor price ± 10%)
   - **Hybrid pricing**: Combination (e.g., cost-plus floor, value-based ceiling, competitive benchmark)
2. Calculate price points for each pricing model:
   - Cost-plus: Total cost per unit + target margin
   - Value-based: Customer willingness-to-pay from surveys
   - Competitive: Average competitor price ± positioning (premium, parity, discount)
3. Validate pricing model against inputs:
   - **Cost structure**: Ensure price > cost (positive margin)
   - **Market research**: Ensure price ≤ customer willingness-to-pay
   - **Competitor pricing**: Ensure price is competitive (within 20% of average)
4. Select final pricing model with rationale (document decision)
5. Define pricing logic:
   - How price changes with usage/users/features
   - Pricing formula (e.g., Base price + $X per user)
   - Price floors and ceilings (min/max constraints)

**Deliverable**: Pricing model document with rationale and pricing logic

**Completion Criterion**: "Pricing model created"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:677` "Pricing model created"

**Quality Check**:
- [ ] Pricing model type selected (cost-plus, value-based, competitive, hybrid)
- [ ] Price points calculated and validated
- [ ] Pricing logic documented (formula, constraints)
- [ ] Rationale documented (why this model?)

---

### Step 2.2: Tier Structure Design

**Procedure**:
1. Define number of tiers (recommended: 3-5 tiers)
   - **Minimum 3 tiers**: Basic, Pro, Enterprise (common SaaS pattern)
   - **Maximum 5 tiers**: Avoid tier overload (decision paralysis)
2. Structure tier differentiation:
   - **Good-Better-Best framework**: Each tier adds incremental value
   - **Feature gating**: Higher tiers unlock advanced features
   - **Usage limits**: Higher tiers increase usage allowances (users, storage, API calls)
3. Design tier pricing:
   - **Tier 1 (Basic)**: Entry-level price (competitive with low-cost alternatives)
   - **Tier 2 (Pro)**: Mid-tier price (target for majority of customers)
   - **Tier 3 (Enterprise)**: Premium price (custom pricing or high-value features)
4. Map features to tiers:
   - Core features: Available in all tiers
   - Advanced features: Pro and Enterprise only
   - Premium features: Enterprise only
5. Validate tier structure:
   - Clear value differentiation between tiers (no confusing overlaps)
   - Price anchoring: Tier 2 should be most attractive (middle option bias)
   - Upgrade path: Easy to upgrade from lower to higher tiers

**Deliverable**: Pricing tiers document with features and pricing per tier

**Completion Criterion**: "Tiers structured"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:678` "Tiers structured"

**Quality Check**:
- [ ] Minimum 3 tiers defined
- [ ] Features mapped to each tier
- [ ] Clear value differentiation
- [ ] Price anchoring validated (Tier 2 most attractive)

**Example Tier Structure**:
| Tier | Price/Month | Users | Storage | Support | Features |
|------|-------------|-------|---------|---------|----------|
| Basic | $29 | 5 | 10GB | Email | Core |
| Pro | $99 | 25 | 100GB | Priority | Core + Advanced |
| Enterprise | $499 | Unlimited | 1TB | Dedicated | All Features |

---

### Step 2.3: Discount Policy Planning

**Procedure**:
1. Identify discount types:
   - **Annual subscription discount**: Incentivize annual commitments (e.g., 20% off)
   - **Volume discount**: Bulk purchases or high-usage customers (e.g., 10% off for 100+ users)
   - **Promotional discount**: Limited-time offers for acquisition (e.g., 50% off first 3 months)
   - **Educational/Nonprofit discount**: Special pricing for non-commercial use (e.g., 50% off)
2. Define discount percentages:
   - Annual discount: 15-25% off monthly rate (industry standard)
   - Volume discount: Tiered (e.g., 10% for 50+ users, 20% for 100+ users)
   - Promotional discount: Limited duration (e.g., 3 months, first 100 customers)
   - Special discounts: Case-by-case approval (LEAD sign-off required)
3. Calculate discount impact on revenue:
   - Estimate % of customers using each discount type
   - Calculate average revenue per user (ARPU) with discounts applied
   - Validate revenue projections account for discounts
4. Document discount approval process:
   - Standard discounts: Automated (annual, volume)
   - Promotional discounts: Marketing team approval
   - Custom discounts: LEAD approval required
5. Plan discount communication strategy:
   - Where discounts are displayed (pricing page, checkout)
   - Discount codes vs. automatic application
   - Terms and conditions (non-refundable, non-transferable)

**Deliverable**: Discount policy document with approval workflows

**Completion Criterion**: "Discounts planned"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:679` "Discounts planned"

**Quality Check**:
- [ ] Discount types identified (annual, volume, promotional, special)
- [ ] Discount percentages defined
- [ ] Revenue impact calculated
- [ ] Approval process documented

---

### Substage 15.2 Exit Criteria

**All 3 completion criteria MUST be TRUE**:
- [x] Pricing model created
- [x] Tiers structured
- [x] Discounts planned

**Validation**: LEAD agent reviews deliverables and approves progression to substage 15.3.

**Optional Customer Validation Checkpoint** (Recommended):
- Present pricing tiers to customer advisory board or focus group
- Collect feedback on pricing perception and tier value
- Adjust pricing/tiers based on customer feedback
- Document customer validation results

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:52-55` "Opportunity: Add customer validation ch"

---

## Substage 15.3: Revenue Projection

**Objective**: Calculate revenue projections, model scenarios, and set financial targets.

**Estimated Duration**: 1 week

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:681-686` "id: '15.3' | title: Revenue Projection"

---

### Step 3.1: Revenue Projections Calculation

**Procedure**:
1. Define projection timeframe:
   - **Short-term**: 12 months (monthly breakdown)
   - **Medium-term**: 3 years (quarterly or annual breakdown)
   - **Long-term**: 5 years (annual breakdown, optional)
2. Estimate customer acquisition:
   - Month 1-3: Early adopters (e.g., 10-50 customers)
   - Month 4-12: Growth phase (e.g., 50-500 customers)
   - Year 2-3: Scaling phase (e.g., 500-5000 customers)
3. Calculate revenue per customer segment:
   - **Tier 1 (Basic)**: % of customers × price per month × months
   - **Tier 2 (Pro)**: % of customers × price per month × months
   - **Tier 3 (Enterprise)**: % of customers × price per month × months
4. Apply churn rate (customer attrition):
   - Industry benchmark: 5-10% monthly churn for SaaS (adjust by industry)
   - Churn impact: Reduces cumulative customers over time
5. Apply discount impact:
   - % of customers using annual discount (e.g., 30% pay annually)
   - % of customers using volume discount (e.g., 10% enterprise customers)
   - Reduce ARPU by weighted average discount percentage
6. Calculate total revenue:
   - **MRR (Monthly Recurring Revenue)**: Sum of all monthly subscriptions
   - **ARR (Annual Recurring Revenue)**: MRR × 12 (for SaaS)
   - **Total Revenue**: ARR × projection years

**Deliverable**: Revenue projection spreadsheet with monthly/annual breakdown

**Completion Criterion**: "Projections calculated"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:683` "Projections calculated"

**Tools**:
- Spreadsheet: Excel, Google Sheets (with formulas for automation)
- Financial modeling tools: SaaS-specific templates (e.g., Baremetrics, ChartMogul)

**Quality Check**:
- [ ] Projection timeframe defined (12 months minimum)
- [ ] Customer acquisition estimated per tier
- [ ] Churn rate applied (industry benchmark)
- [ ] Discount impact calculated
- [ ] MRR/ARR calculated

**Example Revenue Projection** (simplified):
| Month | Customers | ARPU | MRR | ARR |
|-------|-----------|------|-----|-----|
| 1 | 10 | $99 | $990 | $11,880 |
| 6 | 100 | $99 | $9,900 | $118,800 |
| 12 | 500 | $99 | $49,500 | $594,000 |

---

### Step 3.2: Scenario Modeling

**Procedure**:
1. Define 3 scenarios (minimum):
   - **Best-case**: Optimistic assumptions (high acquisition, low churn, premium pricing)
   - **Likely-case**: Realistic assumptions (moderate acquisition, average churn, standard pricing)
   - **Worst-case**: Pessimistic assumptions (low acquisition, high churn, discounted pricing)
2. Adjust key variables per scenario:
   - Customer acquisition rate (best: +50%, likely: baseline, worst: -50%)
   - Churn rate (best: -30%, likely: baseline, worst: +30%)
   - Average price per user (best: Tier 2 average, likely: Tier 1-2 mix, worst: Tier 1 dominant)
3. Calculate revenue for each scenario:
   - Run projection model with scenario-specific inputs
   - Generate scenario comparison table (best/likely/worst side-by-side)
4. Assign probability weights to scenarios:
   - Best-case: 20% probability
   - Likely-case: 60% probability
   - Worst-case: 20% probability
5. Calculate probability-weighted revenue:
   - Weighted revenue = (Best × 20%) + (Likely × 60%) + (Worst × 20%)
   - Use weighted revenue for financial planning

**Deliverable**: Scenario comparison table with probability-weighted revenue

**Completion Criterion**: "Scenarios modeled"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:684` "Scenarios modeled"

**Quality Check**:
- [ ] Minimum 3 scenarios defined (best, likely, worst)
- [ ] Key variables adjusted per scenario
- [ ] Revenue calculated for each scenario
- [ ] Probability weights assigned (totaling 100%)
- [ ] Probability-weighted revenue calculated

**Example Scenario Comparison**:
| Scenario | Customers (Year 1) | ARR (Year 1) | Probability | Weighted ARR |
|----------|---------------------|--------------|-------------|--------------|
| Best | 750 | $891,000 | 20% | $178,200 |
| Likely | 500 | $594,000 | 60% | $356,400 |
| Worst | 250 | $297,000 | 20% | $59,400 |
| **Weighted** | - | - | **100%** | **$594,000** |

---

### Step 3.3: Financial Targets Setting

**Procedure**:
1. Define target metrics based on projections:
   - **Revenue targets**: MRR and ARR goals per quarter/year
   - **Customer targets**: Number of customers per tier
   - **Growth rate targets**: Month-over-month (MoM) or Year-over-Year (YoY) growth
   - **ARPU targets**: Average revenue per user (maintain or grow)
2. Align targets with business goals:
   - **Break-even**: When cumulative revenue > cumulative costs (from Stage 14)
   - **Profitability**: Target profit margin (e.g., 20% net margin)
   - **Funding milestones**: Revenue targets for next funding round (if applicable)
3. Set conservative targets (use Likely or Worst-case scenarios):
   - Avoid overpromising on revenue projections
   - Build buffer for unforeseen challenges (market shifts, competition)
4. Document target rationale:
   - Why these targets are achievable (based on market research, competitor benchmarks)
   - What assumptions underpin targets (acquisition rate, churn, pricing)
5. Create target tracking plan:
   - KPIs to monitor: MRR, ARR, customer count, ARPU, churn
   - Reporting frequency: Monthly (for MRR), Quarterly (for ARR)
   - Accountability: LEAD agent owns target achievement

**Deliverable**: Financial targets document with KPIs and tracking plan

**Completion Criterion**: "Targets set"

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:685` "Targets set"

**Quality Check**:
- [ ] Revenue targets defined (MRR, ARR per quarter/year)
- [ ] Customer targets defined (per tier)
- [ ] Growth rate targets defined (MoM, YoY)
- [ ] Targets aligned with business goals (break-even, profitability)
- [ ] Target tracking plan documented

**Example Financial Targets**:
| Period | MRR Target | ARR Target | Customers | Growth Rate |
|--------|-----------|-----------|-----------|-------------|
| Q1 | $10,000 | $120,000 | 100 | - |
| Q2 | $25,000 | $300,000 | 250 | 150% |
| Q3 | $40,000 | $480,000 | 400 | 60% |
| Q4 | $50,000 | $600,000 | 500 | 25% |

---

### Substage 15.3 Exit Criteria

**All 3 completion criteria MUST be TRUE**:
- [x] Projections calculated
- [x] Scenarios modeled
- [x] Targets set

**Validation**: LEAD agent reviews deliverables and approves progression to exit gate validation.

---

## Exit Gate Validation

**STOP**: Do NOT mark Stage 15 complete until ALL exit gates are validated.

### Exit Gate #1: Pricing Approved

**Validation Steps**:
1. LEAD agent reviews pricing model document:
   - Pricing model type is justified (cost-plus, value-based, competitive, hybrid)
   - Price points are competitive and profitable (> cost, ≤ willingness-to-pay)
   - Pricing logic is clear and implementable
2. LEAD agent reviews pricing tiers:
   - Minimum 3 tiers defined
   - Clear value differentiation between tiers
   - Features mapped to tiers
3. LEAD agent reviews discount policy:
   - Discounts are sustainable (revenue impact acceptable)
   - Approval workflows defined
4. **APPROVAL**: LEAD agent signs off on pricing model (formal approval record)

**Blocker**: If pricing model is not approved, return to substage 15.2 for revisions.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:665` "Pricing approved"

---

### Exit Gate #2: Tiers Defined

**Validation Steps**:
1. Verify minimum 3 pricing tiers exist
2. Validate each tier has:
   - Tier name (e.g., Basic, Pro, Enterprise)
   - Price per month (and annual price if applicable)
   - Features list (detailed)
   - Target customer segment (e.g., SMB, Mid-market, Enterprise)
3. Confirm tier structure is customer-facing ready:
   - Tiers can be displayed on pricing page
   - Tier descriptions are clear and compelling
   - Upgrade/downgrade paths are defined
4. **VALIDATION**: Tiers document is complete and approved

**Blocker**: If tiers are incomplete, return to substage 15.2 for completion.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:666` "Tiers defined"

---

### Exit Gate #3: Projections Validated

**Validation Steps**:
1. Financial review of revenue projections:
   - Assumptions are documented and justified
   - Customer acquisition estimates are realistic (compared to market benchmarks)
   - Churn rate is reasonable (industry benchmark ± 20%)
   - Discount impact is accounted for
2. Scenario modeling review:
   - Minimum 3 scenarios modeled (best, likely, worst)
   - Probability weights are reasonable (likely-case ≥ 50%)
   - Probability-weighted revenue calculated
3. Financial targets validation:
   - Targets are achievable (based on likely or worst-case scenarios)
   - Targets align with business goals (break-even, profitability)
   - KPI tracking plan is in place
4. **VALIDATION**: Financial team or LEAD agent approves projections as realistic

**Blocker**: If projections are unrealistic, return to substage 15.3 for revision.

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:667` "Projections validated"

---

## Stage 15 Completion

**Completion Criteria** (all MUST be TRUE):
- [x] Entry Gate #1: Costs calculated
- [x] Entry Gate #2: Market research complete
- [x] Substage 15.1 complete: Pricing research done
- [x] Substage 15.2 complete: Model development done
- [x] Substage 15.3 complete: Revenue projection done
- [x] Exit Gate #1: Pricing approved
- [x] Exit Gate #2: Tiers defined
- [x] Exit Gate #3: Projections validated

**Final Validation**: LEAD agent confirms Stage 15 completion and authorizes progression to Stage 16.

**Output Artifacts Delivered**:
1. Pricing model document (with rationale and logic)
2. Revenue projections spreadsheet (with scenarios)
3. Pricing tiers document (customer-facing ready)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:652-655` "outputs: Pricing model | Revenue projec"

---

## Rollback Procedures

**Trigger Conditions** (when to rollback):
1. **Market Rejection**: Customer feedback indicates pricing is too high (acceptance < threshold)
2. **Revenue Underperformance**: Actual revenue < 50% of worst-case projection after 3 months
3. **Cost Changes**: Stage 14 cost structure changes significantly (> 20% increase)
4. **Competitive Pressure**: Competitors drop prices significantly (> 30% below our pricing)

**Rollback Steps**:
1. **Trigger Detection**: Monitor metrics for rollback triggers (monthly review)
2. **Root Cause Analysis**: Identify why pricing strategy failed (too high, wrong value metrics, poor tier design)
3. **Rollback to Substage**:
   - If market rejection → Return to substage 15.1 (re-assess customer willingness)
   - If revenue underperformance → Return to substage 15.3 (revise projections)
   - If cost changes → Return to substage 15.2 (re-calculate pricing model)
   - If competitive pressure → Return to substage 15.1 (re-analyze competitor pricing)
4. **Execute Substage**: Re-run substage with updated inputs
5. **Re-validate Exit Gates**: LEAD agent re-approves revised pricing strategy
6. **Document Rollback**: Record rollback reason and resolution in Stage 15 history

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:47-50` "Current: No rollback defined | Required"

**Approval**: Rollback requires LEAD agent authorization (do NOT rollback without approval).

---

## Post-Completion Activities

**Handoff to Stage 16**:
1. Transfer pricing model to Stage 16 (Business Model Canvas)
2. Transfer revenue projections to financial planning stages
3. Transfer pricing tiers to marketing and sales enablement teams

**Ongoing Monitoring** (post-Stage 15):
1. Track actual pricing metrics vs. projections:
   - MRR/ARR vs. targets
   - ARPU vs. projections
   - Churn rate vs. assumptions
2. Collect customer feedback on pricing:
   - Pricing surveys (quarterly)
   - Sales team feedback (monthly)
   - Customer support feedback (ongoing)
3. Adjust pricing based on market feedback:
   - Price optimization (A/B testing, if applicable)
   - Tier adjustments (add/remove features)
   - Discount policy refinements
4. Report pricing performance to LEAD agent (quarterly review)

**Continuous Improvement**:
- Automate competitor pricing monitoring (monthly updates)
- Automate revenue projection updates (quarterly)
- Implement dynamic pricing (future state, if applicable)

---

## Common Pitfalls & Mitigation

**Pitfall #1**: Pricing too high (market rejection)
**Mitigation**: Conduct thorough customer willingness-to-pay research (substage 15.1, step 1.2)

**Pitfall #2**: Pricing too low (leaving money on table)
**Mitigation**: Use value-based pricing, not just cost-plus (substage 15.2, step 2.1)

**Pitfall #3**: Too many pricing tiers (decision paralysis)
**Mitigation**: Limit to 3-5 tiers with clear differentiation (substage 15.2, step 2.2)

**Pitfall #4**: Overly optimistic revenue projections
**Mitigation**: Use conservative assumptions (likely or worst-case scenarios for targets)

**Pitfall #5**: Ignoring customer feedback post-launch
**Mitigation**: Implement ongoing pricing monitoring and customer feedback loops

---

## SOP Revision History

**Version**: 1.0
**Date**: 2025-11-05
**Author**: Claude Code Phase 7
**Commit**: EHG_Engineer@6ef8cf4
**Changes**: Initial SOP creation from stages.yaml and critique

**Next Review**: After first Stage 15 execution (gather lessons learned)

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
