# Stage 15: Configurability Matrix & Tunable Parameters

**Purpose**: Define adjustable parameters for customizing Stage 15 execution across different contexts
**Owner**: LEAD agent
**Configuration Scope**: Per-venture, per-market, per-product pricing strategy variations
**Default Profile**: SaaS B2B pricing (modify for other business models)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:643-688` "Pricing Strategy & Revenue Architecture"

---

## Configuration Dimensions

### Dimension 1: Business Model Type

**Parameter**: `business_model_type`
**Type**: Enum
**Default**: `saas_b2b`
**Options**:
- `saas_b2b`: SaaS B2B subscription pricing (default)
- `saas_b2c`: SaaS B2C subscription pricing (consumer-facing)
- `ecommerce`: E-commerce transactional pricing
- `marketplace`: Marketplace take-rate pricing
- `services`: Professional services hourly/project pricing
- `hardware`: Physical product pricing
- `freemium`: Freemium with paid upgrades
- `hybrid`: Combination of multiple models

**Impact on Stage 15**:
- **SaaS B2B**: Focus on tiered subscription pricing (Basic/Pro/Enterprise), ARR/MRR metrics
- **SaaS B2C**: Focus on consumer pricing psychology, lower price points, larger volume
- **E-commerce**: Focus on product pricing, margins, competitive positioning
- **Marketplace**: Focus on take-rate optimization (% of transaction value)
- **Services**: Focus on hourly rates, project-based pricing, utilization
- **Hardware**: Focus on BOM cost, manufacturing margins, retail pricing
- **Freemium**: Focus on conversion rate optimization, paid tier differentiation
- **Hybrid**: Combine pricing approaches (e.g., SaaS + usage-based)

**Configuration Adjustments**:
- **Substage 15.1**: Customer willingness survey questions vary by business model
- **Substage 15.2**: Pricing model type selection varies (subscription vs. transactional vs. usage-based)
- **Substage 15.3**: Revenue projection metrics vary (ARR/MRR vs. GMV vs. billable hours)

---

### Dimension 2: Market Segment

**Parameter**: `target_market_segment`
**Type**: Enum
**Default**: `smb`
**Options**:
- `smb`: Small and Medium Business (1-500 employees)
- `mid_market`: Mid-market (500-5000 employees)
- `enterprise`: Enterprise (5000+ employees)
- `consumer`: Consumer/individual (B2C)
- `mixed`: Multiple segments (requires segment-specific pricing)

**Impact on Stage 15**:
- **SMB**: Price-sensitive, self-service, standardized pricing tiers
- **Mid-market**: Moderate customization, annual contracts, volume discounts
- **Enterprise**: Custom pricing, multi-year contracts, heavy negotiation
- **Consumer**: Low price points, high volume, promotional pricing
- **Mixed**: Segment-specific tiers (e.g., Starter for SMB, Enterprise for large companies)

**Configuration Adjustments**:
- **Substage 15.1**: Competitor analysis focuses on segment-specific competitors
- **Substage 15.2**: Tier structure varies (3 tiers for SMB, 5+ tiers for mixed segments)
- **Substage 15.3**: Customer acquisition projections vary by segment (SMB high volume, Enterprise low volume)

---

### Dimension 3: Geographic Market

**Parameter**: `primary_geographic_market`
**Type**: Enum
**Default**: `north_america`
**Options**:
- `north_america`: USA, Canada
- `europe`: EU, UK
- `asia_pacific`: Asia-Pacific region
- `latin_america`: Latin America
- `middle_east_africa`: Middle East and Africa
- `global`: Multi-region (requires localized pricing)

**Impact on Stage 15**:
- **North America**: USD pricing, higher willingness-to-pay, competitive market
- **Europe**: EUR/GBP pricing, VAT considerations, GDPR compliance for pricing data
- **Asia-Pacific**: Localized currencies, lower price points (price sensitivity), regional competitors
- **Latin America**: Currency volatility, inflationary adjustments, payment method constraints
- **Middle East Africa**: Emerging markets, variable willingness-to-pay, limited competitor data
- **Global**: Multi-currency pricing, purchasing power parity adjustments, regional tier variations

**Configuration Adjustments**:
- **Substage 15.1**: Competitor analysis includes regional competitors, currency conversion
- **Substage 15.2**: Pricing model may vary by region (e.g., lower prices in emerging markets)
- **Substage 15.3**: Revenue projections account for currency fluctuations, regional growth rates

---

## Tunable Parameters by Substage

### Substage 15.1: Pricing Research

#### Parameter 1.1: Competitor Analysis Depth

**Parameter**: `competitor_analysis_count`
**Type**: Integer
**Default**: `5`
**Range**: `3-10`
**Recommended**: `5-7` (balance between depth and effort)

**Description**: Number of competitors to analyze in detail for pricing benchmarking

**Configuration Guidelines**:
- **Minimum 3**: For niche markets with few competitors
- **5-7**: Standard for most markets (recommended)
- **10+**: For highly competitive markets (e.g., SaaS CRM, project management)

**Impact**: More competitors → better pricing benchmarks, but higher research effort

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:672` "Competitor prices analyzed"

---

#### Parameter 1.2: Survey Sample Size

**Parameter**: `willingness_survey_sample_size`
**Type**: Integer
**Default**: `100`
**Range**: `30-500`
**Recommended**: `100-200` (statistically significant)

**Description**: Target number of customer survey responses for willingness-to-pay assessment

**Configuration Guidelines**:
- **30-50**: Minimum for early-stage ventures (small customer base or no customer base)
- **100-200**: Standard for statistically significant results (recommended)
- **500+**: For high-confidence pricing decisions or large customer bases

**Statistical Note**: n=100 provides ~10% margin of error at 95% confidence; n=400 provides ~5% margin of error

**Impact**: Larger sample → higher confidence in willingness-to-pay data, but higher survey effort

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:673` "Customer willingness assessed"

---

#### Parameter 1.3: Value Metrics Count

**Parameter**: `value_metrics_count`
**Type**: Integer
**Default**: `2`
**Range**: `1-5`
**Recommended**: `2-3` (avoid metric overload)

**Description**: Number of value metrics to define for pricing model (e.g., users, storage, API calls)

**Configuration Guidelines**:
- **1**: Single metric (e.g., per-user pricing only) - simple but inflexible
- **2-3**: Multiple metrics (e.g., users + storage) - recommended for flexibility
- **4-5**: Complex value-based pricing (e.g., users + storage + API calls + features) - advanced

**Impact**: More metrics → finer pricing granularity, but increased complexity for customers

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:674` "Value metrics defined"

---

### Substage 15.2: Model Development

#### Parameter 2.1: Pricing Model Type

**Parameter**: `pricing_model_approach`
**Type**: Enum
**Default**: `hybrid`
**Options**:
- `cost_plus`: Cost + margin (e.g., cost $10, margin 50% → price $15)
- `value_based`: Based on customer value perception (premium pricing)
- `competitive`: Based on competitor benchmarks (market parity)
- `hybrid`: Combination (cost floor, value ceiling, competitive benchmark)

**Configuration Guidelines**:
- **Cost-plus**: For commodity products (minimal differentiation)
- **Value-based**: For differentiated products (high customer value)
- **Competitive**: For highly competitive markets (price-sensitive customers)
- **Hybrid**: Recommended default (balanced approach)

**Impact**: Pricing model determines price calculation methodology

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:677` "Pricing model created"

---

#### Parameter 2.2: Number of Pricing Tiers

**Parameter**: `pricing_tiers_count`
**Type**: Integer
**Default**: `3`
**Range**: `2-5`
**Recommended**: `3` (Good-Better-Best)

**Description**: Number of pricing tiers to offer customers

**Configuration Guidelines**:
- **2 tiers**: Minimal (e.g., Free + Pro) - simple but limited flexibility
- **3 tiers**: Standard (e.g., Basic, Pro, Enterprise) - recommended (Good-Better-Best psychology)
- **4-5 tiers**: Advanced (e.g., Starter, Basic, Pro, Enterprise, Custom) - for complex segmentation
- **6+ tiers**: Avoid (decision paralysis, excessive complexity)

**Psychological Note**: 3 tiers leverages middle-option bias (most customers choose Tier 2)

**Impact**: More tiers → finer segmentation, but higher decision complexity for customers

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:678` "Tiers structured"

---

#### Parameter 2.3: Annual Discount Percentage

**Parameter**: `annual_subscription_discount`
**Type**: Float
**Default**: `20.0`
**Range**: `10.0-30.0`
**Recommended**: `15.0-25.0` (industry standard)

**Description**: Percentage discount for annual subscriptions (vs. monthly)

**Configuration Guidelines**:
- **10-15%**: Conservative discount (lower incentive for annual commitment)
- **15-25%**: Standard discount (recommended, aligns with industry norms)
- **25-30%**: Aggressive discount (strong incentive for annual commitment, cash flow benefit)

**Calculation**: If monthly price = $100, annual price = $100 * 12 * (1 - 0.20) = $960 (20% discount)

**Impact**: Higher discount → more annual customers (cash flow benefit), but lower monthly revenue

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:679` "Discounts planned"

---

#### Parameter 2.4: Volume Discount Tiers

**Parameter**: `volume_discount_tiers`
**Type**: Array of objects
**Default**:
```json
[
  {"min_users": 50, "discount": 10},
  {"min_users": 100, "discount": 20},
  {"min_users": 250, "discount": 30}
]
```

**Description**: Volume discount structure based on number of users/licenses

**Configuration Guidelines**:
- **No volume discounts**: For small customer bases (< 50 users per customer)
- **2-3 tiers**: Standard (recommended for SMB/Mid-market)
- **4-5 tiers**: Advanced (for enterprise customers with large teams)

**Customization**: Adjust `min_users` and `discount` percentages per business model

**Impact**: Volume discounts incentivize larger purchases (higher deal sizes, but lower per-user revenue)

---

### Substage 15.3: Revenue Projection

#### Parameter 3.1: Projection Timeframe

**Parameter**: `revenue_projection_months`
**Type**: Integer
**Default**: `36`
**Range**: `12-60`
**Recommended**: `36` (3 years)

**Description**: Number of months to project revenue (forward-looking)

**Configuration Guidelines**:
- **12 months**: Minimum (short-term planning)
- **24-36 months**: Standard (recommended for business planning)
- **48-60 months**: Long-term (for financial modeling, investor pitches)

**Impact**: Longer timeframe → more uncertainty, but better long-term visibility

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:683` "Projections calculated"

---

#### Parameter 3.2: Churn Rate Assumption

**Parameter**: `monthly_churn_rate`
**Type**: Float
**Default**: `5.0`
**Range**: `1.0-15.0`
**Recommended**: `5.0-10.0` (industry benchmark for SaaS)

**Description**: Expected monthly customer churn rate (% of customers canceling per month)

**Configuration Guidelines**:
- **1-3%**: Excellent (enterprise SaaS, high switching costs)
- **5-7%**: Good (standard SaaS, competitive market)
- **8-10%**: Average (consumer SaaS, price-sensitive customers)
- **10-15%**: Poor (high churn, product-market fit issues)

**Industry Benchmarks** (SaaS):
- Enterprise SaaS: 1-2% monthly churn
- SMB SaaS: 5-7% monthly churn
- Consumer SaaS: 10-15% monthly churn

**Impact**: Higher churn → lower cumulative customers over time, lower revenue projections

**Evidence**: Churn is a key variable in revenue projections (substage 15.3)

---

#### Parameter 3.3: Customer Acquisition Growth Rate

**Parameter**: `monthly_acquisition_growth_rate`
**Type**: Float
**Default**: `10.0`
**Range**: `0.0-50.0`
**Recommended**: `5.0-20.0` (sustainable growth)

**Description**: Month-over-month growth rate in new customer acquisitions

**Configuration Guidelines**:
- **0-5%**: Slow growth (mature market, limited marketing budget)
- **5-15%**: Moderate growth (recommended, sustainable)
- **15-30%**: High growth (aggressive marketing, product-market fit)
- **30-50%**: Hypergrowth (viral product, significant funding)

**Note**: High growth rates are typically unsustainable long-term (adjust projections accordingly)

**Impact**: Higher growth rate → faster revenue scaling, but requires aggressive customer acquisition

**Evidence**: Customer acquisition is a key variable in revenue projections (substage 15.3)

---

#### Parameter 3.4: Scenario Probability Weights

**Parameter**: `scenario_probabilities`
**Type**: Object
**Default**:
```json
{
  "best_case": 20,
  "likely_case": 60,
  "worst_case": 20
}
```

**Description**: Probability weights for revenue scenarios (must sum to 100%)

**Configuration Guidelines**:
- **Conservative weighting**: `{best: 10, likely: 50, worst: 40}` (higher weight on worst-case)
- **Standard weighting**: `{best: 20, likely: 60, worst: 20}` (recommended)
- **Optimistic weighting**: `{best: 40, likely: 50, worst: 10}` (higher weight on best-case)

**Impact**: Probability weights affect probability-weighted revenue (financial planning targets)

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:684` "Scenarios modeled"

---

## Configuration Profiles (Pre-Defined)

### Profile 1: SaaS B2B (Default)

```yaml
profile_name: "SaaS B2B Default"
business_model_type: saas_b2b
target_market_segment: smb
primary_geographic_market: north_america

substage_15_1:
  competitor_analysis_count: 5
  willingness_survey_sample_size: 100
  value_metrics_count: 2

substage_15_2:
  pricing_model_approach: hybrid
  pricing_tiers_count: 3
  annual_subscription_discount: 20.0
  volume_discount_tiers:
    - {min_users: 50, discount: 10}
    - {min_users: 100, discount: 20}

substage_15_3:
  revenue_projection_months: 36
  monthly_churn_rate: 5.0
  monthly_acquisition_growth_rate: 10.0
  scenario_probabilities: {best_case: 20, likely_case: 60, worst_case: 20}
```

**Evidence**: `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:688` "progression_mode: Manual → Assisted → A"

---

### Profile 2: SaaS B2C (Consumer)

```yaml
profile_name: "SaaS B2C Consumer"
business_model_type: saas_b2c
target_market_segment: consumer
primary_geographic_market: north_america

substage_15_1:
  competitor_analysis_count: 7  # More competitive market
  willingness_survey_sample_size: 200  # Larger sample for consumer
  value_metrics_count: 1  # Simpler pricing (per-user only)

substage_15_2:
  pricing_model_approach: competitive  # Price-sensitive consumers
  pricing_tiers_count: 3
  annual_subscription_discount: 25.0  # Higher discount for consumer cash flow
  volume_discount_tiers: []  # No volume discounts for individual consumers

substage_15_3:
  revenue_projection_months: 24  # Shorter horizon for consumer products
  monthly_churn_rate: 10.0  # Higher churn for consumer SaaS
  monthly_acquisition_growth_rate: 20.0  # Higher growth potential
  scenario_probabilities: {best_case: 30, likely_case: 50, worst_case: 20}
```

---

### Profile 3: Enterprise SaaS

```yaml
profile_name: "Enterprise SaaS"
business_model_type: saas_b2b
target_market_segment: enterprise
primary_geographic_market: north_america

substage_15_1:
  competitor_analysis_count: 5
  willingness_survey_sample_size: 50  # Smaller sample (fewer enterprise customers)
  value_metrics_count: 3  # Complex value metrics (users + storage + features)

substage_15_2:
  pricing_model_approach: value_based  # Enterprise values differentiation
  pricing_tiers_count: 4  # More tiers (Pro, Enterprise, Enterprise Plus, Custom)
  annual_subscription_discount: 15.0  # Lower discount (multi-year contracts common)
  volume_discount_tiers:
    - {min_users: 100, discount: 10}
    - {min_users: 250, discount: 20}
    - {min_users: 500, discount: 30}

substage_15_3:
  revenue_projection_months: 48  # Longer horizon for enterprise planning
  monthly_churn_rate: 2.0  # Very low churn (high switching costs)
  monthly_acquisition_growth_rate: 5.0  # Slower growth (longer sales cycles)
  scenario_probabilities: {best_case: 20, likely_case: 60, worst_case: 20}
```

---

### Profile 4: E-Commerce

```yaml
profile_name: "E-Commerce Transactional"
business_model_type: ecommerce
target_market_segment: consumer
primary_geographic_market: north_america

substage_15_1:
  competitor_analysis_count: 10  # Highly competitive e-commerce market
  willingness_survey_sample_size: 150
  value_metrics_count: 1  # Product price (transactional)

substage_15_2:
  pricing_model_approach: competitive  # Price-sensitive e-commerce
  pricing_tiers_count: 1  # Single product pricing (not tiered subscriptions)
  annual_subscription_discount: 0.0  # Not applicable (no subscriptions)
  volume_discount_tiers:
    - {min_quantity: 5, discount: 10}  # Quantity discounts instead of user discounts
    - {min_quantity: 10, discount: 20}

substage_15_3:
  revenue_projection_months: 24
  monthly_churn_rate: 0.0  # Not applicable (transactional, not subscription)
  monthly_acquisition_growth_rate: 15.0
  scenario_probabilities: {best_case: 25, likely_case: 50, worst_case: 25}
```

---

### Profile 5: Freemium SaaS

```yaml
profile_name: "Freemium SaaS"
business_model_type: freemium
target_market_segment: mixed  # Free tier for consumers, paid for SMB/Enterprise
primary_geographic_market: global

substage_15_1:
  competitor_analysis_count: 7
  willingness_survey_sample_size: 200  # Larger sample (many free users)
  value_metrics_count: 2

substage_15_2:
  pricing_model_approach: hybrid
  pricing_tiers_count: 4  # Free, Basic, Pro, Enterprise
  annual_subscription_discount: 20.0
  volume_discount_tiers:
    - {min_users: 50, discount: 10}
    - {min_users: 100, discount: 20}

substage_15_3:
  revenue_projection_months: 36
  monthly_churn_rate: 8.0  # Moderate churn (free tier churn is high, paid is low)
  monthly_acquisition_growth_rate: 25.0  # High growth (viral freemium)
  scenario_probabilities: {best_case: 30, likely_case: 50, worst_case: 20}

freemium_specific:
  free_to_paid_conversion_rate: 5.0  # % of free users converting to paid (key metric)
```

---

## Advanced Configuration Parameters

### Parameter A1: Price Elasticity

**Parameter**: `price_elasticity`
**Type**: Float
**Default**: `-1.5`
**Range**: `-3.0 to -0.5`
**Description**: Price elasticity of demand (% change in quantity for 1% price change)

**Interpretation**:
- **-0.5 to -1.0**: Inelastic (price increases have minimal impact on demand)
- **-1.0 to -2.0**: Moderate elasticity (recommended range)
- **-2.0 to -3.0**: Elastic (price increases significantly reduce demand)

**Impact**: Used for price optimization models (advanced pricing strategy)

---

### Parameter A2: Customer Lifetime Value (CLV) Target

**Parameter**: `target_clv_to_cac_ratio`
**Type**: Float
**Default**: `3.0`
**Range**: `2.0-5.0`
**Description**: Target ratio of Customer Lifetime Value to Customer Acquisition Cost

**Interpretation**:
- **2.0-3.0**: Minimum acceptable (CLV = 2-3x CAC)
- **3.0-5.0**: Healthy (recommended)
- **5.0+**: Excellent (high LTV, low CAC)

**Impact**: Influences pricing strategy (higher pricing → higher CLV → better CLV:CAC ratio)

---

### Parameter A3: Gross Margin Target

**Parameter**: `target_gross_margin`
**Type**: Float
**Default**: `70.0`
**Range**: `30.0-90.0`
**Description**: Target gross margin % (revenue - direct costs) / revenue

**Industry Benchmarks**:
- **SaaS**: 70-85% gross margin (high margin)
- **E-commerce**: 30-50% gross margin (lower margin)
- **Hardware**: 40-60% gross margin (moderate margin)
- **Services**: 50-70% gross margin (variable)

**Impact**: Influences pricing model (price must achieve target gross margin after costs)

---

## Configuration Override Mechanism

**Scenario**: User wants to customize Stage 15 for a specific venture without changing defaults

**Implementation**:
1. Create venture-specific configuration file: `stage-15-config-{venture_id}.yaml`
2. Override specific parameters (inherits defaults for unspecified parameters)
3. Pass configuration file to Stage 15 orchestration: `execute_stage_15(config_path='...')`

**Example Override** (only change competitor count and churn rate):
```yaml
venture_id: "venture-123"
overrides:
  substage_15_1:
    competitor_analysis_count: 10  # Override: analyze 10 competitors (vs. default 5)
  substage_15_3:
    monthly_churn_rate: 3.0  # Override: assume 3% churn (vs. default 5%)
  # All other parameters inherit from default profile
```

---

## Configuration Validation

**Validation Rules**:
1. **competitor_analysis_count**: Must be ≥ 3 (minimum for meaningful analysis)
2. **willingness_survey_sample_size**: Must be ≥ 30 (minimum for statistical validity)
3. **pricing_tiers_count**: Must be ≥ 2 and ≤ 5 (usability constraints)
4. **annual_subscription_discount**: Must be 0-50% (economic constraints)
5. **monthly_churn_rate**: Must be 0-30% (realistic range)
6. **scenario_probabilities**: Must sum to 100% (probability constraint)

**Validation Implementation**:
```python
def validate_stage_15_config(config: dict) -> bool:
    """Validate Stage 15 configuration parameters."""
    errors = []

    # Validate competitor count
    if config['substage_15_1']['competitor_analysis_count'] < 3:
        errors.append("competitor_analysis_count must be >= 3")

    # Validate survey sample size
    if config['substage_15_1']['willingness_survey_sample_size'] < 30:
        errors.append("willingness_survey_sample_size must be >= 30")

    # Validate pricing tiers count
    tiers = config['substage_15_2']['pricing_tiers_count']
    if tiers < 2 or tiers > 5:
        errors.append("pricing_tiers_count must be between 2 and 5")

    # Validate annual discount
    discount = config['substage_15_2']['annual_subscription_discount']
    if discount < 0 or discount > 50:
        errors.append("annual_subscription_discount must be between 0 and 50%")

    # Validate churn rate
    churn = config['substage_15_3']['monthly_churn_rate']
    if churn < 0 or churn > 30:
        errors.append("monthly_churn_rate must be between 0 and 30%")

    # Validate scenario probabilities sum to 100
    probs = config['substage_15_3']['scenario_probabilities']
    if sum(probs.values()) != 100:
        errors.append("scenario_probabilities must sum to 100%")

    if errors:
        print("❌ Configuration validation failed:")
        for error in errors:
            print(f"   - {error}")
        return False

    print("✅ Configuration validation passed")
    return True
```

---

## Configuration Best Practices

**Best Practice #1**: Start with default profile, override only what's necessary
**Best Practice #2**: Document rationale for parameter overrides (why deviate from defaults?)
**Best Practice #3**: Validate configuration before Stage 15 execution (avoid mid-stage failures)
**Best Practice #4**: Version control configuration files (track changes over time)
**Best Practice #5**: Review and update configurations annually (market conditions change)

---

**Document Metadata**:
- **Generated**: 2025-11-05
- **Source Commit**: EHG_Engineer@6ef8cf4
- **Stage Version**: stages.yaml lines 643-688
- **Default Profile**: SaaS B2B (modify per business model)
- **Phase**: 7 (Contract Specification)

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
