# Stage 37: Strategic Risk Forecasting - Configurability Matrix

## Purpose

This matrix defines all tunable parameters for Stage 37, enabling Chairman-level customization without code changes. Parameters are organized by substage and agent, with default values, valid ranges, and business impact.

## Substage 37.1: Risk Modeling

### Parameter Group: Scenario Definition

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `scenarios_per_category` | 4 | 3-7 | Integer | Scenario breadth vs analysis effort | Chairman |
| `risk_categories` | ["market", "operational", "regulatory", "financial"] | Array[String] | Array | Coverage areas | Strategic Planning Team |
| `scenario_confidence_threshold` | 0.7 | 0.5-0.9 | Float | Quality bar for accepting scenarios | Chairman |
| `black_swan_inclusion` | true | true/false | Boolean | Include low-probability high-impact events | Chairman |
| `scenario_narrative_min_length` | 200 | 100-500 | Integer (chars) | Detail level for scenario descriptions | Risk Analyst |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1684-1687 "Risk Modeling: Models built, Scenarios defined"

### Parameter Group: Probability Estimation

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `probability_method` | "hybrid" | ["quantitative", "qualitative", "hybrid"] | Enum | Estimation methodology | Risk Analyst |
| `historical_data_lookback` | 12 | 3-36 | Integer (months) | Data volume for quantitative analysis | Data Scientist |
| `confidence_interval_method` | "bootstrap" | ["bootstrap", "analytical", "bayesian"] | Enum | Uncertainty quantification approach | Data Scientist |
| `confidence_level` | 0.95 | 0.90-0.99 | Float | CI width (narrower = more certain) | Risk Analyst |
| `min_historical_samples` | 30 | 10-100 | Integer | Threshold for switching to qualitative method | Data Scientist |
| `probability_rounding` | 0.05 | 0.01-0.10 | Float | Granularity of probabilities (e.g., 0.35 vs 0.3456) | Risk Analyst |

**Rationale**: Probability method impacts forecast accuracy and computational cost. Hybrid method balances data-driven rigor with expert judgment flexibility.

### Parameter Group: Model Calibration

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `calibration_metric` | "r_squared" | ["r_squared", "brier_score", "log_loss"] | Enum | Quality metric for model validation | Data Scientist |
| `calibration_threshold_pass` | 0.7 | 0.5-0.9 | Float | Minimum R² to pass calibration | Chairman |
| `calibration_threshold_warn` | 0.5 | 0.3-0.7 | Float | R² below this triggers warning | Risk Analyst |
| `backtest_period` | 12 | 6-24 | Integer (months) | Historical period for validation | Data Scientist |
| `recalibration_frequency` | "quarterly" | ["monthly", "quarterly", "biannually"] | Enum | How often to recalibrate models | Risk Analyst |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1676 "entry: Models calibrated"

---

## Substage 37.2: Impact Assessment

### Parameter Group: Impact Dimensions

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `impact_dimensions` | ["financial", "operational", "reputational", "strategic"] | Array[String] | Array | Which dimensions to quantify | Chairman |
| `financial_impact_unit` | "USD" | ["USD", "EUR", "GBP"] | Enum | Currency for financial impacts | Finance Team |
| `operational_impact_unit` | "weeks" | ["days", "weeks", "months"] | Enum | Time unit for operational impacts | Strategic Planning Team |
| `discount_rate` | 0.10 | 0.05-0.20 | Float | Time value discount for future impacts | Finance Team |
| `impact_quantification_method` | "expected_value" | ["expected_value", "worst_case", "monte_carlo"] | Enum | How to aggregate scenarios | Chairman |

**Rationale**: Impact dimensions must align with venture context. Early-stage ventures may weight strategic impact higher than financial.

### Parameter Group: Severity Classification

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `severity_levels` | ["critical", "high", "medium", "low"] | Array[String] | Array | Number of severity tiers | Chairman |
| `financial_threshold_critical` | 100000 | 10000-1000000 | Integer (USD) | Loss amount for Critical classification | Chairman |
| `financial_threshold_high` | 50000 | 5000-500000 | Integer (USD) | Loss amount for High classification | Chairman |
| `financial_threshold_medium` | 10000 | 1000-100000 | Integer (USD) | Loss amount for Medium classification | Finance Team |
| `operational_threshold_critical` | 8 | 4-16 | Integer (weeks) | Delay for Critical classification | Chairman |
| `operational_threshold_high` | 4 | 2-8 | Integer (weeks) | Delay for High classification | Strategic Planning Team |
| `operational_threshold_medium` | 2 | 1-4 | Integer (weeks) | Delay for Medium classification | Strategic Planning Team |
| `reputational_threshold_critical` | "brand_crisis" | Qualitative | String | Descriptor for Critical reputational impact | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1693 "Impact Assessment: Thresholds set"

### Parameter Group: Dependency Mapping

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `dependency_detection_method` | "llm_assisted" | ["manual", "llm_assisted", "graph_analysis"] | Enum | How to identify cascading risks | Risk Analyst |
| `min_cascading_probability` | 0.2 | 0.1-0.5 | Float | Threshold for including cascade in graph | Risk Analyst |
| `max_cascade_depth` | 3 | 1-5 | Integer | How many levels of cascades to track | Strategic Planning Team |
| `compound_impact_aggregation` | "sum" | ["sum", "max", "monte_carlo"] | Enum | How to calculate compound impacts | Data Scientist |

**Rationale**: Dependency mapping can be computationally expensive. Limiting cascade depth keeps analysis tractable.

---

## Substage 37.3: Contingency Planning

### Parameter Group: Plan Creation

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `plan_coverage_threshold` | "high" | ["critical_only", "high", "medium", "all"] | Enum | Which severity levels get plans | Chairman |
| `plan_structure_template` | "standard" | ["minimal", "standard", "comprehensive"] | Enum | Detail level for plans | Strategic Planning Team |
| `plan_action_max_count` | 10 | 5-20 | Integer | Maximum actions per plan (complexity limit) | Strategic Planning Team |
| `resource_estimation_method` | "parametric" | ["parametric", "analogous", "expert_judgment"] | Enum | How to estimate resource needs | Finance Team |
| `success_criteria_required` | true | true/false | Boolean | Must every plan have success criteria? | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1697 "Contingency Planning: Plans created"

### Parameter Group: Trigger Configuration

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `trigger_types_enabled` | ["quantitative", "qualitative", "time_based"] | Array[String] | Array | Which trigger types to support | Risk Analyst |
| `quantitative_trigger_buffer` | 0.1 | 0.0-0.3 | Float | Percentage buffer before triggering (reduce false positives) | Risk Analyst |
| `trigger_monitoring_frequency_critical` | "hourly" | ["realtime", "hourly", "daily"] | Enum | Check frequency for Critical risks | Risk Analyst |
| `trigger_monitoring_frequency_high` | "daily" | ["hourly", "daily", "weekly"] | Enum | Check frequency for High risks | Risk Analyst |
| `auto_activation_enabled` | false | true/false | Boolean | Allow automatic contingency activation | Chairman |
| `auto_activation_max_cost` | 5000 | 1000-50000 | Integer (USD) | Max cost for auto-activation without approval | Chairman |

**Rationale**: Auto-activation is high-risk. Default is disabled until RISK-FORECAST-004 implements safeguards.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1698 "Contingency Planning: Triggers defined"

### Parameter Group: Resource Reservation

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `contingency_budget_percentage` | 0.15 | 0.10-0.25 | Float | Percentage of total budget for contingencies | Chairman |
| `personnel_flexibility_requirement` | 0.2 | 0.1-0.5 | Float | Percentage of personnel not fully allocated | Strategic Planning Team |
| `resource_approval_threshold` | 10000 | 5000-50000 | Integer (USD) | Cost requiring explicit Chairman approval | Chairman |
| `resource_reservation_duration` | 90 | 30-180 | Integer (days) | How long to hold reserved resources | Finance Team |
| `resource_reallocation_allowed` | true | true/false | Boolean | Can reserved resources be reallocated if not used? | Finance Team |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1699 "Contingency Planning: Resources reserved"

---

## Stage-Level Parameters

### Parameter Group: Execution Control

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `execution_frequency` | "quarterly" | ["monthly", "quarterly", "biannually", "on_demand"] | Enum | How often Stage 37 runs | Chairman |
| `parallel_execution_enabled` | false | true/false | Boolean | Can Stage 37 run while Stage 16-23 executing? | Chairman |
| `human_checkpoint_required` | true | true/false | Boolean | Must Chairman approve at substage boundaries? | Chairman |
| `automation_level` | "manual" | ["manual", "assisted", "automated"] | Enum | Degree of AI automation | Chairman |
| `output_verbosity` | "standard" | ["minimal", "standard", "verbose"] | Enum | Detail level for reports | Strategic Planning Team |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1701 "progression_mode: Manual → Assisted → Auto"

### Parameter Group: Quality Thresholds

| Parameter | Default | Valid Range | Type | Impact | Override Authority |
|-----------|---------|-------------|------|--------|--------------------|
| `forecast_accuracy_target` | 0.75 | 0.60-0.90 | Float | Quarterly accuracy goal | Chairman |
| `risk_preparedness_target` | 1.0 | 0.80-1.0 | Float | Percentage of risks with contingency plans | Chairman |
| `response_time_critical_target` | 24 | 1-72 | Integer (hours) | Max time from trigger to action (Critical) | Chairman |
| `response_time_high_target` | 168 | 24-336 | Integer (hours) | Max time from trigger to action (High) | Strategic Planning Team |
| `rollback_trigger_accuracy_threshold` | 0.5 | 0.3-0.7 | Float | Accuracy below this triggers rollback | Chairman |
| `rollback_trigger_consecutive_quarters` | 2 | 1-4 | Integer | How many bad quarters before rollback | Chairman |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1670-1672 "Forecast accuracy, Risk preparedness, Response time"

---

## Configuration Management

### Storage Location

**Database Table**: `stage_37_config` (to be created)

**Schema**:
```sql
CREATE TABLE stage_37_config (
  parameter_name TEXT PRIMARY KEY,
  parameter_value TEXT NOT NULL,
  parameter_type TEXT NOT NULL, -- 'integer', 'float', 'boolean', 'string', 'array', 'enum'
  valid_range TEXT, -- JSON representation of valid values
  default_value TEXT NOT NULL,
  override_authority TEXT NOT NULL, -- 'Chairman', 'Strategic Planning Team', etc.
  last_modified_at TIMESTAMP DEFAULT NOW(),
  last_modified_by TEXT,
  description TEXT
);
```

**Alternative**: YAML configuration file (`/config/stage-37.yaml`) for simpler implementation

### Override Mechanism

**Manual Override**:
1. Chairman edits configuration via dashboard (RISK-FORECAST-002 enhancement)
2. Changes logged in `stage_37_config_audit` table
3. New values take effect on next Stage 37 execution

**Context-Specific Override**:
- Venture-specific configurations (e.g., higher severity thresholds for high-risk ventures)
- Stored in `venture_stage_37_config` table with foreign key to `ventures`
- Overrides take precedence over global defaults

**Rollback**:
- Configuration changes can be rolled back to previous version
- Audit log stores all historical values

### Validation

**Entry Point**: Before Stage 37 execution, validate all parameters

**Validation Rules**:
1. All required parameters present
2. Values within valid ranges
3. Type constraints satisfied (e.g., integers not floats)
4. Dependent parameters consistent (e.g., `financial_threshold_critical > financial_threshold_high`)

**Error Handling**:
- If validation fails, Stage 37 aborts with clear error message
- Alert Chairman to fix configuration

---

## Parameter Profiles

### Profile 1: Conservative Risk Management (Default)

**Use Case**: Established ventures with low risk tolerance

**Key Settings**:
- `scenarios_per_category`: 5 (comprehensive coverage)
- `black_swan_inclusion`: true (prepare for worst case)
- `calibration_threshold_pass`: 0.7 (high quality bar)
- `financial_threshold_critical`: $100k (sensitive to losses)
- `plan_coverage_threshold`: "high" (plans for most risks)
- `contingency_budget_percentage`: 0.20 (larger reserves)

### Profile 2: Agile Risk Management

**Use Case**: Early-stage ventures, fast-moving markets

**Key Settings**:
- `scenarios_per_category`: 3 (faster analysis)
- `black_swan_inclusion`: false (focus on likely risks)
- `calibration_threshold_pass`: 0.5 (lower quality bar, faster iteration)
- `financial_threshold_critical`: $50k (higher tolerance)
- `plan_coverage_threshold`: "critical_only" (lean planning)
- `contingency_budget_percentage`: 0.10 (smaller reserves)
- `execution_frequency`: "monthly" (more frequent updates)

### Profile 3: Automated Risk Management (Future State)

**Use Case**: After RISK-FORECAST-001 through 004 implemented

**Key Settings**:
- `automation_level`: "automated"
- `human_checkpoint_required`: false (only for Critical risks)
- `auto_activation_enabled`: true
- `trigger_monitoring_frequency_critical`: "realtime"
- `response_time_critical_target`: 1 (hour)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-37.md:33 "80% automation"

---

## Impact Analysis

### High-Impact Parameters (Chairman Approval Required)

1. **`calibration_threshold_pass`**: Affects forecast quality and execution speed
2. **`severity_levels` + thresholds**: Determines which risks get attention
3. **`plan_coverage_threshold`**: Affects planning workload and preparedness
4. **`contingency_budget_percentage`**: Direct financial impact
5. **`auto_activation_enabled`**: High-risk operational change

**Change Process**:
1. Propose change with business justification
2. Chairman reviews impact analysis
3. Approval + audit log entry
4. Gradual rollout (test with 1 venture before global)

### Low-Impact Parameters (Analyst/Team Authority)

1. **`scenario_narrative_min_length`**: Cosmetic detail level
2. **`probability_rounding`**: Presentation preference
3. **`output_verbosity`**: Report detail level
4. **`impact_quantification_method`**: Technical methodology choice

**Change Process**:
1. Analyst updates configuration
2. Audit log entry
3. Immediate effect

---

## Version Control

**Configuration Version**: 1.0
**Last Updated**: 2025-11-06
**Schema Compatibility**: Stage 37 definition at EHG_Engineer@6ef8cf4

**Change Log**:
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-06 | Initial configuration matrix | Claude Code Phase 13 |

---

<!-- Generated by Claude Code Phase 13 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
