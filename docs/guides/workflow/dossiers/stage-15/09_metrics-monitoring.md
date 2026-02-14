# Stage 15: Metrics, Monitoring & Dashboards


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

**Purpose**: Define KPIs, tracking queries, and monitoring dashboards for Resource Planning
**Owner**: LEAD agent
**Monitoring Frequency**: Monthly (first year), Quarterly (thereafter)
**Dashboard Refresh**: Real-time (automated) + Manual refresh on-demand

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:656-659` "metrics: Price optimization | Revenue p"

---

## Primary Metrics (Stage 15 YAML)

### Metric #1: Price Optimization

**Definition**: Maximize revenue without triggering market rejection (balance price and acceptance)

**Measurement**: Revenue per customer vs. churn rate correlation

**Formula**:
```
Price Optimization Score = ARPU × (1 - Churn Rate)

Where:
- ARPU = Average Revenue Per User (monthly or annual)
- Churn Rate = Monthly or annual customer churn rate (%)
```

**Example**:
- ARPU = $100/month
- Churn Rate = 5% monthly
- Price Optimization Score = $100 × (1 - 0.05) = $95

**Interpretation**:
- **Higher score**: Better price optimization (high revenue, low churn)
- **Lower score**: Poor optimization (either low revenue OR high churn)

**Target**: Maximize score while maintaining churn < 10% (threshold)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:657` "Price optimization"

**Tracking Frequency**: Monthly

**SQL Query** (Supabase):
```sql
-- Calculate price optimization score per tier
SELECT
  pricing_tier,
  AVG(monthly_revenue) AS avg_arpu,
  (COUNT(CASE WHEN churned = true THEN 1 END)::float / COUNT(*)::float) * 100 AS churn_rate_pct,
  AVG(monthly_revenue) * (1 - (COUNT(CASE WHEN churned = true THEN 1 END)::float / COUNT(*)::float)) AS price_optimization_score
FROM
  customers
WHERE
  created_at >= NOW() - INTERVAL '30 days'
GROUP BY
  pricing_tier
ORDER BY
  price_optimization_score DESC;
```

**Dashboard Widget**: Line chart showing price optimization score trend over time (per tier)

---

### Metric #2: Revenue Potential

**Definition**: Projected Annual Recurring Revenue (ARR) or Monthly Recurring Revenue (MRR) based on pricing model

**Measurement**: Actual ARR/MRR vs. projected ARR/MRR (from substage 15.3)

**Formula**:
```
Revenue Potential Realization = (Actual ARR / Projected ARR) × 100%

Where:
- Actual ARR = Sum of all annual subscriptions (or MRR × 12)
- Projected ARR = ARR from substage 15.3 revenue projections (likely-case scenario)
```

**Example**:
- Projected ARR (likely-case): $1,000,000
- Actual ARR (6 months post-launch): $450,000
- Revenue Potential Realization = ($450,000 / $1,000,000) × 100% = 45%

**Interpretation**:
- **≥ 100%**: Exceeding projections (excellent)
- **80-100%**: On track (good)
- **50-80%**: Below projections (monitor closely)
- **< 50%**: Significantly underperforming (trigger recursion)

**Target**: ≥ 80% of projected ARR (minimum acceptable)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:658` "Revenue potential"

**Tracking Frequency**: Monthly (first year), Quarterly (thereafter)

**SQL Query** (Supabase):
```sql
-- Calculate actual ARR vs. projected ARR
WITH actual_revenue AS (
  SELECT
    SUM(CASE WHEN billing_cycle = 'monthly' THEN monthly_revenue * 12
             WHEN billing_cycle = 'annual' THEN annual_revenue
             ELSE 0 END) AS actual_arr
  FROM
    customers
  WHERE
    status = 'active'
),
projected_revenue AS (
  SELECT
    projected_arr
  FROM
    stage_15_revenue_projections
  WHERE
    venture_id = 'venture-123'  -- Replace with actual venture ID
    AND scenario = 'likely_case'
  ORDER BY
    created_at DESC
  LIMIT 1
)
SELECT
  a.actual_arr,
  p.projected_arr,
  (a.actual_arr / p.projected_arr) * 100 AS revenue_potential_realization_pct
FROM
  actual_revenue a,
  projected_revenue p;
```

**Dashboard Widget**: Gauge chart showing actual ARR vs. projected ARR (% realization)

---

### Metric #3: Market Acceptance

**Definition**: Customer willingness-to-pay validation and pricing satisfaction

**Measurement**: Customer willingness-to-pay survey score OR Net Promoter Score (NPS) for pricing

**Formula**:
```
Market Acceptance Score = (Positive Responses / Total Responses) × 100%

Where:
- Positive Responses = Survey respondents who rate pricing as "acceptable" or "good value"
- Total Responses = Total survey respondents
```

**Example**:
- Survey question: "How do you rate our pricing?" (1-5 scale, where 4-5 is "acceptable/good value")
- Positive responses (4-5 rating): 80 out of 100
- Market Acceptance Score = (80 / 100) × 100% = 80%

**Interpretation**:
- **≥ 80%**: Excellent market acceptance
- **75-80%**: Good market acceptance (target)
- **60-75%**: Moderate acceptance (monitor closely)
- **< 60%**: Poor acceptance (trigger recursion)

**Target**: ≥ 75% (recommended threshold)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:659` "Market acceptance"

**Tracking Frequency**: Quarterly (post-launch)

**SQL Query** (Supabase):
```sql
-- Calculate market acceptance score from pricing surveys
SELECT
  (COUNT(CASE WHEN pricing_rating >= 4 THEN 1 END)::float / COUNT(*)::float) * 100 AS market_acceptance_score,
  COUNT(*) AS total_responses,
  COUNT(CASE WHEN pricing_rating >= 4 THEN 1 END) AS positive_responses,
  AVG(pricing_rating) AS avg_pricing_rating
FROM
  pricing_surveys
WHERE
  survey_date >= NOW() - INTERVAL '90 days'
  AND venture_id = 'venture-123';  -- Replace with actual venture ID
```

**Dashboard Widget**: Bar chart showing market acceptance score per quarter + trend line

---

## Secondary Metrics (Derived & Operational)

### Metric #4: Average Revenue Per User (ARPU)

**Definition**: Average monthly or annual revenue per active customer

**Formula**:
```
ARPU = Total Revenue / Active Customers
```

**Target**: Maintain or increase ARPU over time (indicates customers upgrading to higher tiers)

**SQL Query**:
```sql
-- Calculate ARPU (monthly and annual)
SELECT
  SUM(monthly_revenue) / COUNT(*) AS monthly_arpu,
  SUM(CASE WHEN billing_cycle = 'annual' THEN annual_revenue ELSE monthly_revenue * 12 END) / COUNT(*) AS annual_arpu
FROM
  customers
WHERE
  status = 'active';
```

---

### Metric #5: Tier Distribution

**Definition**: Distribution of customers across pricing tiers (actual vs. projected)

**Formula**:
```
Tier Distribution % = (Customers in Tier / Total Customers) × 100%
```

**Target**: Actual tier distribution within 30% of projected distribution (from substage 15.3)

**SQL Query**:
```sql
-- Calculate actual tier distribution
SELECT
  pricing_tier,
  COUNT(*) AS customer_count,
  (COUNT(*)::float / (SELECT COUNT(*) FROM customers WHERE status = 'active')::float) * 100 AS tier_distribution_pct
FROM
  customers
WHERE
  status = 'active'
GROUP BY
  pricing_tier
ORDER BY
  tier_distribution_pct DESC;
```

**Trigger**: If tier distribution variance > 30%, trigger recursion (PRICE-005)

**Evidence**: `EHG_Engineer@6ef8cf4:../stage-25/07_recursion-blueprint.md` "Trigger PRICE-005"

---

### Metric #6: Discount Utilization Rate

**Definition**: Percentage of customers using discounts (annual, volume, promotional)

**Formula**:
```
Discount Utilization Rate = (Customers with Discounts / Total Customers) × 100%
```

**Target**: Monitor for revenue impact (ensure discounts are not over-utilized)

**SQL Query**:
```sql
-- Calculate discount utilization rate by discount type
SELECT
  discount_type,
  COUNT(*) AS customers_with_discount,
  (COUNT(*)::float / (SELECT COUNT(*) FROM customers WHERE status = 'active')::float) * 100 AS discount_utilization_pct,
  AVG(discount_percentage) AS avg_discount_pct
FROM
  customers
WHERE
  status = 'active'
  AND discount_type IS NOT NULL
GROUP BY
  discount_type;
```

---

### Metric #7: Customer Lifetime Value (CLV)

**Definition**: Projected revenue from a customer over their entire relationship

**Formula**:
```
CLV = ARPU × Average Customer Lifetime (in months)

Where:
Average Customer Lifetime = 1 / Monthly Churn Rate

Example:
- ARPU = $100/month
- Monthly Churn Rate = 5% (0.05)
- Average Customer Lifetime = 1 / 0.05 = 20 months
- CLV = $100 × 20 = $2,000
```

**Target**: CLV ≥ 3× Customer Acquisition Cost (CLV:CAC ratio)

**SQL Query**:
```sql
-- Calculate CLV
WITH churn_rate AS (
  SELECT
    (COUNT(CASE WHEN churned = true THEN 1 END)::float / COUNT(*)::float) AS monthly_churn_rate
  FROM
    customers
  WHERE
    created_at >= NOW() - INTERVAL '30 days'
),
arpu_calc AS (
  SELECT
    AVG(monthly_revenue) AS avg_arpu
  FROM
    customers
  WHERE
    status = 'active'
)
SELECT
  a.avg_arpu,
  c.monthly_churn_rate,
  (1.0 / c.monthly_churn_rate) AS avg_customer_lifetime_months,
  a.avg_arpu * (1.0 / c.monthly_churn_rate) AS customer_lifetime_value
FROM
  arpu_calc a,
  churn_rate c;
```

---

### Metric #8: Pricing Tier Upgrade Rate

**Definition**: Percentage of customers who upgrade from lower to higher tiers

**Formula**:
```
Upgrade Rate = (Customers Upgraded / Total Active Customers) × 100%
```

**Target**: ≥ 5% quarterly upgrade rate (indicates effective tier value differentiation)

**SQL Query**:
```sql
-- Calculate quarterly upgrade rate
SELECT
  COUNT(CASE WHEN previous_tier < current_tier THEN 1 END) AS upgrades,
  COUNT(*) AS total_active_customers,
  (COUNT(CASE WHEN previous_tier < current_tier THEN 1 END)::float / COUNT(*)::float) * 100 AS upgrade_rate_pct
FROM
  customers c
  JOIN customer_tier_history h ON c.customer_id = h.customer_id
WHERE
  c.status = 'active'
  AND h.changed_at >= NOW() - INTERVAL '90 days';
```

---

### Metric #9: Churn Rate by Tier

**Definition**: Churn rate segmented by pricing tier (identifies tier-specific retention issues)

**Formula**:
```
Churn Rate (Tier) = (Churned Customers in Tier / Total Customers in Tier) × 100%
```

**Target**: Lower churn in higher tiers (indicates value proposition is working)

**SQL Query**:
```sql
-- Calculate churn rate by tier
SELECT
  pricing_tier,
  COUNT(CASE WHEN churned = true THEN 1 END) AS churned_customers,
  COUNT(*) AS total_customers,
  (COUNT(CASE WHEN churned = true THEN 1 END)::float / COUNT(*)::float) * 100 AS churn_rate_pct
FROM
  customers
WHERE
  created_at >= NOW() - INTERVAL '30 days'
GROUP BY
  pricing_tier
ORDER BY
  churn_rate_pct ASC;
```

---

### Metric #10: Competitor Pricing Index

**Definition**: Our average price vs. competitor average price (competitive positioning)

**Formula**:
```
Competitor Pricing Index = (Our Average Price / Competitor Average Price) × 100

Where:
- 100 = Parity (same as competitors)
- > 100 = Premium (more expensive than competitors)
- < 100 = Discount (less expensive than competitors)
```

**Target**: 90-110 (within 10% of competitor average for competitive positioning)

**SQL Query** (requires competitor pricing data table):
```sql
-- Calculate competitor pricing index
WITH our_pricing AS (
  SELECT
    AVG(monthly_price) AS our_avg_price
  FROM
    pricing_tiers
  WHERE
    venture_id = 'venture-123'
),
competitor_pricing AS (
  SELECT
    AVG(monthly_price) AS competitor_avg_price
  FROM
    competitor_pricing_data
  WHERE
    updated_at >= NOW() - INTERVAL '30 days'
)
SELECT
  o.our_avg_price,
  c.competitor_avg_price,
  (o.our_avg_price / c.competitor_avg_price) * 100 AS competitor_pricing_index
FROM
  our_pricing o,
  competitor_pricing c;
```

**Trigger**: If competitor pricing index > 150 (50% more expensive), review competitiveness

---

## Monitoring Dashboards

### Dashboard 1: Stage 15 Executive Summary

**Purpose**: High-level overview of pricing strategy health for LEAD agent

**Widgets**:
1. **Price Optimization Score**: Gauge (target: maximize while churn < 10%)
2. **Revenue Potential Realization**: Gauge (actual ARR vs. projected ARR, target ≥ 80%)
3. **Market Acceptance Score**: Gauge (target ≥ 75%)
4. **ARPU Trend**: Line chart (monthly ARPU over time)
5. **Tier Distribution**: Pie chart (actual vs. projected tier distribution)

**Refresh Frequency**: Daily (automated)

**Dashboard URL**: `/dashboards/stage-15-executive`

---

### Dashboard 2: Revenue Performance Tracking

**Purpose**: Detailed revenue metrics for financial planning

**Widgets**:
1. **Actual ARR/MRR**: Line chart (actual vs. projected, best/likely/worst scenarios)
2. **Revenue by Tier**: Stacked bar chart (revenue contribution per tier)
3. **Customer Growth**: Line chart (new customers, churned customers, net growth)
4. **Churn Rate**: Line chart (monthly churn rate over time, segmented by tier)
5. **CLV:CAC Ratio**: Gauge (target ≥ 3.0)

**Refresh Frequency**: Weekly (automated)

**Dashboard URL**: `/dashboards/stage-15-revenue`

---

### Dashboard 3: Pricing Competitiveness

**Purpose**: Monitor competitive positioning and market dynamics

**Widgets**:
1. **Competitor Pricing Index**: Gauge (target 90-110)
2. **Competitor Pricing Matrix**: Table (our price vs. top 5 competitors per tier)
3. **Market Acceptance by Quarter**: Bar chart (quarterly market acceptance score)
4. **Pricing Tier Upgrade/Downgrade Flow**: Sankey diagram (tier migration patterns)

**Refresh Frequency**: Weekly (automated competitor scraping)

**Dashboard URL**: `/dashboards/stage-15-competitiveness`

---

### Dashboard 4: Discount & Promotion Analysis

**Purpose**: Track discount utilization and revenue impact

**Widgets**:
1. **Discount Utilization Rate**: Pie chart (% customers using each discount type)
2. **Average Discount Percentage**: Bar chart (by discount type)
3. **Revenue Impact**: Line chart (revenue with vs. without discounts)
4. **Annual Subscription Adoption**: Gauge (% customers on annual plans)

**Refresh Frequency**: Monthly

**Dashboard URL**: `/dashboards/stage-15-discounts`

---

## Monitoring Alerts & Thresholds

### Alert #1: Market Acceptance Below Threshold

**Trigger**: `market_acceptance_score < 75%` for 2 consecutive quarters

**Severity**: HIGH (triggers recursion PRICE-001)

**Action**: LEAD agent investigates and considers pricing strategy revision

**Evidence**: `EHG_Engineer@6ef8cf4:../stage-25/07_recursion-blueprint.md` "Trigger PRICE-001"

---

### Alert #2: Revenue Underperformance

**Trigger**: `actual_arr < (worst_case_projected_arr * 0.8)` for 3 consecutive months

**Severity**: HIGH (triggers recursion PRICE-002)

**Action**: LEAD agent revises revenue projections or adjusts pricing

**Evidence**: `EHG_Engineer@6ef8cf4:../stage-25/07_recursion-blueprint.md` "Trigger PRICE-002"

---

### Alert #3: Competitive Pricing Disruption

**Trigger**: `competitor_price_change > 30%` (major competitor drops price significantly)

**Severity**: MEDIUM (triggers recursion PRICE-003 evaluation)

**Action**: LEAD agent evaluates competitive response (maintain or adjust pricing)

**Evidence**: `EHG_Engineer@6ef8cf4:../stage-25/07_recursion-blueprint.md` "Trigger PRICE-003"

---

### Alert #4: Churn Rate Spike

**Trigger**: `monthly_churn_rate > (baseline_churn_rate * 1.5)` for 2 consecutive months

**Severity**: MEDIUM (potential pricing issue)

**Action**: Investigate churn reasons (pricing too high? value perception issue?)

---

### Alert #5: Tier Distribution Variance

**Trigger**: `tier_distribution_variance > 30%` for 2 consecutive quarters

**Severity**: MEDIUM (triggers recursion PRICE-005)

**Action**: LEAD agent re-structures tiers based on actual customer preferences

**Evidence**: `EHG_Engineer@6ef8cf4:../stage-25/07_recursion-blueprint.md` "Trigger PRICE-005"

---

### Alert #6: Cost Structure Change

**Trigger**: Notification from Stage 14 (cost change > 20%)

**Severity**: MEDIUM (triggers recursion PRICE-004)

**Action**: LEAD agent recalculates pricing model with updated cost structure

**Evidence**: `EHG_Engineer@6ef8cf4:../stage-25/07_recursion-blueprint.md` "Trigger PRICE-004"

---

## Data Collection Requirements

### Data Source #1: Customer Database

**Table**: `customers`

**Required Fields**:
- `customer_id` (UUID, primary key)
- `pricing_tier` (string: Basic, Pro, Enterprise)
- `monthly_revenue` (numeric: monthly subscription revenue)
- `annual_revenue` (numeric: annual subscription revenue, if applicable)
- `billing_cycle` (string: monthly, annual)
- `discount_type` (string: annual, volume, promotional, null)
- `discount_percentage` (numeric: 0-100%)
- `status` (string: active, churned)
- `churned_at` (timestamp, nullable)
- `created_at` (timestamp)

---

### Data Source #2: Pricing Surveys

**Table**: `pricing_surveys`

**Required Fields**:
- `survey_id` (UUID, primary key)
- `customer_id` (UUID, foreign key to customers)
- `venture_id` (UUID, foreign key to ventures)
- `pricing_rating` (integer: 1-5 scale)
- `survey_date` (timestamp)
- `feedback_text` (text, optional)

---

### Data Source #3: Stage 15 Revenue Projections

**Table**: `stage_15_revenue_projections`

**Required Fields**:
- `projection_id` (UUID, primary key)
- `venture_id` (UUID, foreign key to ventures)
- `scenario` (string: best_case, likely_case, worst_case)
- `projected_arr` (numeric: annual recurring revenue projection)
- `projected_mrr` (numeric: monthly recurring revenue projection)
- `projection_month` (integer: 1-60, projection timeframe)
- `created_at` (timestamp)

---

### Data Source #4: Competitor Pricing Data

**Table**: `competitor_pricing_data`

**Required Fields**:
- `competitor_id` (UUID, primary key)
- `competitor_name` (string)
- `pricing_tier` (string: Basic, Pro, Enterprise, equivalent)
- `monthly_price` (numeric)
- `annual_price` (numeric, nullable)
- `features` (jsonb: list of features per tier)
- `updated_at` (timestamp)

---

## Monitoring Governance

**Monitoring Owner**: LEAD agent (primary) + Financial team (secondary)

**Review Frequency**:
- **Daily**: Automated dashboard refresh (no manual review unless alerts)
- **Weekly**: Quick review of revenue performance dashboard (5-10 minutes)
- **Monthly**: Detailed review of all dashboards (30-60 minutes)
- **Quarterly**: Comprehensive pricing strategy review (2-4 hours)
  - Market acceptance survey results
  - Revenue vs. projections analysis
  - Competitor pricing changes
  - Tier distribution analysis
  - Recursion trigger evaluation

**Reporting**:
- **Monthly Report**: Summary of key metrics (ARPU, ARR, churn, market acceptance) to executive team
- **Quarterly Report**: Comprehensive pricing performance report to LEAD agent and executive team
- **Annual Report**: Full pricing strategy retrospective (lessons learned, optimization opportunities)

---

## Continuous Improvement

**Improvement #1**: Automate competitor pricing monitoring (weekly scraping)
**Improvement #2**: Implement A/B testing framework for pricing changes (validate before full deployment)
**Improvement #3**: Predictive analytics for churn (machine learning model to predict churn risk by customer)
**Improvement #4**: Dynamic pricing (real-time price adjustments based on market data, future state)

**Evidence**: Automation is a key improvement area (critique Priority 1)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-15.md:31-34` "Current State: Manual process | Target"

---

**Document Metadata**:
- **Generated**: 2025-11-05
- **Source Commit**: EHG_Engineer@6ef8cf4
- **Stage Version**: stages.yaml lines 643-688 (metrics lines 656-659)
- **Critique Version**: stage-15.md (missing thresholds gap)
- **Phase**: 7 (Contract Specification)

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
