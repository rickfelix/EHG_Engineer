# Stage 16 Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, e2e

## Overview

This document defines all tunable parameters, configuration options, and decision variables for Stage 16 (AI CEO Agent Development). It provides a comprehensive reference for customizing AI CEO behavior, model training, and operational constraints.

**Stage**: 16 - AI CEO Agent Development
**Owner**: EVA (AI Agent Owner)
**Configuration Approach**: File-based (YAML/JSON) with version control

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:699 "AI CEO configuration"

---

## Configuration Architecture

### Configuration Files Structure

```
configs/
├── ai-ceo-personality.yaml          # Personality parameters (Substage 16.1)
├── ai-ceo-decision-framework.yaml   # Decision rules and policies (Substage 16.1)
├── ai-ceo-constraints.yaml          # Safety constraints and limits (Substage 16.1)
├── ai-ceo-model-training.yaml       # Model training parameters (Substage 16.2)
├── ai-ceo-integration.yaml          # Integration settings (Substage 16.3)
└── ai-ceo-monitoring.yaml           # Monitoring and alerting (Substage 16.3)
```

**Version Control**: All configuration files stored in Git with semantic versioning (v1.0.0, v1.1.0, etc.)

**Validation**: JSON Schema validation on all configuration files before deployment

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:699-701 "AI CEO configuration, Decision models, Automa"

---

## Substage 16.1: Agent Configuration Parameters

### 1. Personality Configuration (`ai-ceo-personality.yaml`)

#### Risk Tolerance

**Parameter**: `personality.risk_tolerance`
**Type**: Enum
**Options**: `conservative` | `moderate` | `aggressive`
**Default**: `moderate`

**Impact**:
- **Conservative**: Prefers low-risk decisions, escalates more frequently, prioritizes stability
- **Moderate**: Balanced risk-reward, standard escalation thresholds
- **Aggressive**: Accepts higher risks for higher rewards, fewer escalations, prioritizes growth

**Example**:
```yaml
personality:
  risk_tolerance: moderate
```

**Rationale**: Risk tolerance shapes AI CEO's decision-making style and influences which decisions require human approval.

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:718 "Personality defined"

#### Decision Speed

**Parameter**: `personality.decision_speed`
**Type**: Enum
**Options**: `deliberate` | `balanced` | `rapid`
**Default**: `balanced`

**Impact**:
- **Deliberate**: Longer analysis time (seconds), more data considered, higher accuracy
- **Balanced**: Standard analysis time, balance of speed and accuracy
- **Rapid**: Minimal analysis time (milliseconds), prioritizes speed over exhaustive analysis

**Example**:
```yaml
personality:
  decision_speed: balanced
```

**Tuning Guide**:
- Use `deliberate` for high-stakes, infrequent decisions
- Use `rapid` for low-stakes, high-volume decisions
- Use `balanced` as default for mixed decision types

#### Communication Style

**Parameter**: `personality.communication_style`
**Type**: Enum
**Options**: `formal` | `professional` | `casual`
**Default**: `professional`

**Impact**:
- **Formal**: Structured, detailed explanations with references
- **Professional**: Clear, concise, business-appropriate
- **Casual**: Friendly, conversational tone

**Example**:
```yaml
personality:
  communication_style: professional
```

**Use Cases**:
- `formal`: Regulatory communications, executive reports
- `professional`: Standard business communications
- `casual`: Internal team updates, informal notifications

#### Innovation Bias

**Parameter**: `personality.innovation_bias`
**Type**: Enum
**Options**: `stability` | `balanced` | `innovation`
**Default**: `balanced`

**Impact**:
- **Stability**: Prefers proven approaches, low change rate, risk-averse
- **Balanced**: Mix of proven and novel approaches
- **Innovation**: Favors novel solutions, higher change rate, experimentation

**Example**:
```yaml
personality:
  innovation_bias: balanced
```

**Strategic Alignment**: Should align with business strategy from Stage 15

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:695 "Business strategy"

---

### 2. Decision Framework Configuration (`ai-ceo-decision-framework.yaml`)

#### Decision Authority Levels

**Parameter**: `decision_framework.authority_levels`
**Type**: Object with thresholds
**Configurable Fields**:
- `autonomous_max_budget`: Maximum budget for autonomous decisions (USD)
- `autonomous_max_risk_score`: Maximum risk score (0-100) for autonomous decisions
- `assisted_max_budget`: Maximum budget for assisted decisions (USD)
- `assisted_max_risk_score`: Maximum risk score for assisted decisions

**Default**:
```yaml
decision_framework:
  authority_levels:
    autonomous_max_budget: 10000        # $10K
    autonomous_max_risk_score: 30       # Low-medium risk
    assisted_max_budget: 100000         # $100K
    assisted_max_risk_score: 70         # Medium-high risk
```

**Tuning Guide**:
- Start with conservative thresholds (low budgets, low risk scores)
- Gradually increase as AI CEO proves reliable (progression mode: Manual → Assisted → Auto)
- Monitor automation rate metric to balance autonomy vs. safety

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:704 "Automation rate"
Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:734 "progression_mode: Manual → Assisted → Auto"

#### Escalation Paths

**Parameter**: `decision_framework.escalation_paths`
**Type**: Array of escalation rules
**Configurable Fields**:
- `condition`: Trigger condition for escalation
- `escalate_to`: Role or person to escalate to
- `timeout_hours`: Hours before automatic escalation
- `fallback_action`: Action if escalation times out

**Example**:
```yaml
decision_framework:
  escalation_paths:
    - condition: "budget > autonomous_max_budget"
      escalate_to: "finance_manager"
      timeout_hours: 24
      fallback_action: "reject_decision"
    - condition: "risk_score > autonomous_max_risk_score"
      escalate_to: "ceo"
      timeout_hours: 48
      fallback_action: "defer_decision"
    - condition: "strategic_alignment < 0.8"
      escalate_to: "strategy_lead"
      timeout_hours: 72
      fallback_action: "request_clarification"
```

**Customization**: Add escalation paths for specific decision types, departments, or risk categories

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:719 "Decision framework set"

#### Approval Workflows

**Parameter**: `decision_framework.approval_workflows`
**Type**: Object mapping decision types to approval chains
**Configurable Fields**:
- `decision_type`: Type of decision (e.g., budget_allocation, hiring, product_launch)
- `approval_chain`: Array of approvers in sequence
- `parallel_approval`: Boolean (true = all approve in parallel, false = sequential)
- `approval_timeout_hours`: Hours before timeout

**Example**:
```yaml
decision_framework:
  approval_workflows:
    budget_allocation:
      approval_chain: ["finance_manager", "ceo"]
      parallel_approval: false
      approval_timeout_hours: 48
    hiring:
      approval_chain: ["hiring_manager", "hr_lead"]
      parallel_approval: true
      approval_timeout_hours: 72
```

**Customization**: Define workflows for each decision type relevant to your ventures

---

### 3. Constraints Configuration (`ai-ceo-constraints.yaml`)

#### Hard Constraints (Never Violate)

**Parameter**: `constraints.hard`
**Type**: Array of constraint rules
**Configurable Fields**:
- `constraint_id`: Unique identifier
- `constraint_type`: Type (budget, legal, data_access, resource)
- `rule`: Constraint rule expression
- `action_on_violation`: Action (block_decision, alert_and_block)

**Example**:
```yaml
constraints:
  hard:
    - constraint_id: "max_single_budget"
      constraint_type: "budget"
      rule: "decision_budget <= 500000"  # Never exceed $500K per decision
      action_on_violation: "block_decision"
    - constraint_id: "no_customer_pii_access"
      constraint_type: "data_access"
      rule: "accessed_data NOT CONTAINS 'pii'"
      action_on_violation: "block_decision"
    - constraint_id: "legal_compliance"
      constraint_type: "legal"
      rule: "decision_complies_with('gdpr', 'ccpa')"
      action_on_violation: "block_decision"
```

**Tuning**: Set hard constraints based on business policies, legal requirements, and risk appetite

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:720 "Constraints configured"

#### Soft Constraints (Warn If Approaching)

**Parameter**: `constraints.soft`
**Type**: Array of constraint rules with warning thresholds
**Configurable Fields**:
- `constraint_id`: Unique identifier
- `constraint_type`: Type (budget, performance, strategic_alignment)
- `warning_threshold`: Threshold value for warning
- `action_on_threshold`: Action (warn, log, escalate)

**Example**:
```yaml
constraints:
  soft:
    - constraint_id: "monthly_budget_limit"
      constraint_type: "budget"
      warning_threshold: 0.8  # Warn at 80% of monthly budget
      action_on_threshold: "warn"
    - constraint_id: "decision_latency"
      constraint_type: "performance"
      warning_threshold: 1.5  # Warn if decision takes >1.5s
      action_on_threshold: "log"
    - constraint_id: "strategic_alignment_minimum"
      constraint_type: "strategic_alignment"
      warning_threshold: 0.85  # Warn if alignment <85%
      action_on_threshold: "escalate"
```

**Tuning**: Set soft constraints for early warning indicators before hard limits are hit

#### Circuit Breakers

**Parameter**: `constraints.circuit_breakers`
**Type**: Object defining circuit breaker rules
**Configurable Fields**:
- `error_rate_threshold`: Error rate (%) to trigger circuit breaker
- `evaluation_window_minutes`: Time window to evaluate error rate
- `cooldown_minutes`: Cooldown period before resuming
- `action_on_trigger`: Action (stop_autonomous, revert_to_assisted)

**Example**:
```yaml
constraints:
  circuit_breakers:
    decision_errors:
      error_rate_threshold: 0.10  # 10% error rate
      evaluation_window_minutes: 60
      cooldown_minutes: 30
      action_on_trigger: "stop_autonomous"
    api_failures:
      error_rate_threshold: 0.05  # 5% API failure rate
      evaluation_window_minutes: 15
      cooldown_minutes: 15
      action_on_trigger: "revert_to_assisted"
```

**Tuning**: Start with conservative thresholds (e.g., 5% error rate), adjust based on operational experience

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:732 "Failsafes verified"

---

## Substage 16.2: Model Training Parameters

### Model Training Configuration (`ai-ceo-model-training.yaml`)

#### Data Processing Parameters

**Parameter**: `data_processing`
**Configurable Fields**:
- `training_split`: Percentage for training set (e.g., 0.70 = 70%)
- `validation_split`: Percentage for validation set (e.g., 0.15 = 15%)
- `test_split`: Percentage for test set (e.g., 0.15 = 15%)
- `min_data_quality_score`: Minimum data quality score (0-1) to include record
- `outlier_detection_method`: Method (iqr, zscore, isolation_forest)

**Default**:
```yaml
data_processing:
  training_split: 0.70
  validation_split: 0.15
  test_split: 0.15
  min_data_quality_score: 0.95
  outlier_detection_method: "iqr"
```

**Tuning**: Adjust splits based on data volume (more data = can afford larger test set)

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:724 "Historical data processed"

#### Model Architectures

**Parameter**: `model_architectures`
**Type**: Object mapping decision types to model types
**Configurable Fields**:
- `decision_type`: Type of decision
- `model_type`: Model architecture (random_forest, xgboost, neural_network, etc.)
- `hyperparameters`: Model-specific hyperparameters

**Example**:
```yaml
model_architectures:
  budget_allocation:
    model_type: "xgboost"
    hyperparameters:
      max_depth: 6
      learning_rate: 0.1
      n_estimators: 100
  outcome_prediction:
    model_type: "neural_network"
    hyperparameters:
      hidden_layers: [128, 64, 32]
      activation: "relu"
      dropout_rate: 0.2
  option_ranking:
    model_type: "random_forest"
    hyperparameters:
      n_estimators: 200
      max_features: "sqrt"
```

**Tuning**:
- Start with simpler models (random_forest, xgboost) for interpretability
- Use neural networks for complex, high-volume decision types
- Tune hyperparameters via grid search or Bayesian optimization

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:725 "Decision models trained"

#### Training Hyperparameters

**Parameter**: `training_hyperparameters`
**Configurable Fields**:
- `learning_rate`: Learning rate for gradient descent (e.g., 0.001)
- `batch_size`: Batch size for training (e.g., 32, 64, 128)
- `epochs`: Number of training epochs (e.g., 100)
- `early_stopping_patience`: Epochs to wait before early stopping (e.g., 10)
- `regularization`: Regularization type (l1, l2, elastic_net)
- `regularization_strength`: Regularization strength (e.g., 0.01)

**Default**:
```yaml
training_hyperparameters:
  learning_rate: 0.001
  batch_size: 64
  epochs: 100
  early_stopping_patience: 10
  regularization: "l2"
  regularization_strength: 0.01
```

**Tuning**:
- Lower learning rate (0.0001) for stability, higher (0.01) for speed
- Larger batch size for speed, smaller for better generalization
- More epochs if underfitting, fewer if overfitting

#### Validation Thresholds

**Parameter**: `validation_thresholds`
**Configurable Fields**:
- `high_stakes_accuracy`: Minimum accuracy for high stakes decisions (0-1)
- `medium_stakes_accuracy`: Minimum accuracy for medium stakes decisions (0-1)
- `low_stakes_accuracy`: Minimum accuracy for low stakes decisions (0-1)
- `max_bias_score`: Maximum allowable bias score (0-1)
- `min_f1_score`: Minimum F1 score (0-1)

**Default**:
```yaml
validation_thresholds:
  high_stakes_accuracy: 0.90   # 90% accuracy required
  medium_stakes_accuracy: 0.80  # 80% accuracy required
  low_stakes_accuracy: 0.70     # 70% accuracy required
  max_bias_score: 0.10          # Max 10% bias
  min_f1_score: 0.75            # Min 75% F1 score
```

**Tuning**: Set thresholds based on business risk tolerance and acceptable error rates

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:726 "Validation complete"
Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:703 "Decision accuracy"

---

## Substage 16.3: Integration & Testing Parameters

### Integration Configuration (`ai-ceo-integration.yaml`)

#### Database Connections

**Parameter**: `database_connections`
**Configurable Fields**:
- `connection_name`: Unique name for connection
- `host`: Database host URL
- `port`: Database port
- `database`: Database name
- `connection_pool_size`: Connection pool size
- `timeout_seconds`: Query timeout

**Example**:
```yaml
database_connections:
  venture_management:
    host: "db.example.com"
    port: 5432
    database: "venture_mgmt"
    connection_pool_size: 10
    timeout_seconds: 30
  kpi_metrics:
    host: "metrics-db.example.com"
    port: 5432
    database: "kpi_metrics"
    connection_pool_size: 5
    timeout_seconds: 15
```

**Tuning**: Adjust connection pool size and timeout based on load and latency

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:730 "Systems integrated"

#### API Integrations

**Parameter**: `api_integrations`
**Configurable Fields**:
- `api_name`: Unique name for API
- `base_url`: API base URL
- `timeout_seconds`: Request timeout
- `retry_attempts`: Number of retry attempts on failure
- `rate_limit_per_minute`: Rate limit (requests per minute)

**Example**:
```yaml
api_integrations:
  workflow_automation:
    base_url: "https://api.workflow.example.com"
    timeout_seconds: 10
    retry_attempts: 3
    rate_limit_per_minute: 100
  notification_service:
    base_url: "https://api.notifications.example.com"
    timeout_seconds: 5
    retry_attempts: 2
    rate_limit_per_minute: 200
```

**Tuning**: Set timeouts based on API SLAs, adjust rate limits to avoid throttling

#### Performance Targets

**Parameter**: `performance_targets`
**Configurable Fields**:
- `max_decision_latency_ms`: Maximum decision latency (milliseconds)
- `max_concurrent_decisions`: Maximum concurrent decisions
- `target_throughput_per_hour`: Target decisions per hour
- `max_memory_usage_gb`: Maximum memory usage (GB)

**Default**:
```yaml
performance_targets:
  max_decision_latency_ms: 2000   # 2 seconds
  max_concurrent_decisions: 100
  target_throughput_per_hour: 1000
  max_memory_usage_gb: 8
```

**Tuning**: Set targets based on infrastructure capacity and business requirements

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:731 "Testing complete"

### Monitoring Configuration (`ai-ceo-monitoring.yaml`)

#### Metrics Collection

**Parameter**: `metrics_collection`
**Configurable Fields**:
- `collection_interval_seconds`: Metrics collection frequency
- `retention_days`: Days to retain metrics data
- `aggregation_intervals`: Aggregation intervals (1m, 5m, 1h, 1d)

**Example**:
```yaml
metrics_collection:
  collection_interval_seconds: 60  # Every 1 minute
  retention_days: 90               # 90 days retention
  aggregation_intervals: ["1m", "5m", "1h", "1d"]
```

**Tuning**: Balance granularity (shorter intervals) vs. storage costs (retention days)

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:702-705 "metrics: Decision accuracy, Automation rate, S"

#### Alerting Thresholds

**Parameter**: `alerting_thresholds`
**Configurable Fields**:
- `metric_name`: Metric to alert on
- `warning_threshold`: Warning threshold value
- `critical_threshold`: Critical threshold value
- `evaluation_window_minutes`: Time window to evaluate
- `alert_channels`: Channels to send alerts (email, slack, pagerduty)

**Example**:
```yaml
alerting_thresholds:
  decision_accuracy:
    warning_threshold: 0.85   # Warn if accuracy <85%
    critical_threshold: 0.75  # Critical if accuracy <75%
    evaluation_window_minutes: 60
    alert_channels: ["email", "slack"]
  automation_rate:
    warning_threshold: 0.75   # Warn if automation <75%
    critical_threshold: 0.65  # Critical if automation <65%
    evaluation_window_minutes: 120
    alert_channels: ["email", "slack"]
  circuit_breaker_activations:
    warning_threshold: 1      # Warn if 1+ activation
    critical_threshold: 3     # Critical if 3+ activations
    evaluation_window_minutes: 1440  # 24 hours
    alert_channels: ["email", "slack", "pagerduty"]
```

**Tuning**: Set thresholds to catch issues early (warning) without excessive alerts

Evidence: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:713 "Oversight configured"

---

## Configuration Management Best Practices

### Version Control

**Recommendation**: Use semantic versioning for configuration files

**Versioning Scheme**:
- **Major version** (v2.0.0): Breaking changes (e.g., personality overhaul, framework redesign)
- **Minor version** (v1.1.0): Feature additions (e.g., new decision type, new constraint)
- **Patch version** (v1.0.1): Bug fixes, threshold tuning

**Git Workflow**:
1. Create feature branch for configuration changes
2. Update configuration files
3. Increment version in file metadata
4. Test configuration changes in staging
5. Create PR with configuration diff
6. Review and approve
7. Merge and deploy to production

### Configuration Validation

**Pre-Deployment Validation**:
- JSON Schema validation for structure
- Range checks for numeric parameters
- Enum validation for categorical parameters
- Dependency checks (e.g., splits sum to 1.0)

**Validation Tool**:
```bash
# Example validation script
python scripts/validate-ai-ceo-config.py --config configs/ai-ceo-personality.yaml
```

**Output**: Pass/Fail with specific error messages

### Configuration Rollback

**Rollback Procedure**:
1. Identify previous stable version (e.g., v1.2.0)
2. Checkout configuration from Git: `git checkout v1.2.0 configs/`
3. Validate rolled-back configuration
4. Deploy to production
5. Verify metrics return to acceptable levels
6. Document rollback reason

**Rollback Trigger**: Metrics degradation, circuit breaker activations, validation failures

### Configuration Documentation

**Documentation Requirements**:
- Document rationale for each parameter value
- Include tuning history (what was tried, what worked)
- Link to related metrics and dashboards
- Specify owner/reviewer for each configuration file

**Example Documentation**:
```yaml
# ai-ceo-personality.yaml
# Version: 1.2.0
# Owner: EVA
# Last Updated: 2025-11-05
# Rationale: Set risk_tolerance to 'moderate' based on business strategy from Stage 15
#            Adjusted from 'conservative' (v1.1.0) after 30 days of stable operation
personality:
  risk_tolerance: moderate  # Changed from 'conservative' on 2025-10-15
```

---

## Configuration Testing Strategy

### Unit Testing Configuration Loading

**Test**: Verify configuration files load correctly

```python
def test_personality_config_loads():
    config = load_config("configs/ai-ceo-personality.yaml")
    assert config["personality"]["risk_tolerance"] in ["conservative", "moderate", "aggressive"]
```

### Integration Testing Configuration Application

**Test**: Verify configuration parameters are applied in AI CEO behavior

```python
def test_risk_tolerance_affects_decisions():
    config = load_config("configs/ai-ceo-personality.yaml")
    config["personality"]["risk_tolerance"] = "conservative"
    ai_ceo = AICEOAgent(config)
    decision = ai_ceo.make_decision(scenario="high_risk")
    assert decision.escalated == True  # Conservative should escalate high risk
```

### E2E Testing Configuration Changes

**Test**: Verify end-to-end flow with new configuration

```python
def test_e2e_with_new_config():
    # Deploy new configuration
    deploy_config("configs/ai-ceo-personality.yaml", version="1.3.0")

    # Run E2E test suite
    results = run_e2e_tests()

    # Verify all tests pass
    assert results.all_passed()

    # Verify metrics remain acceptable
    metrics = get_metrics(window_minutes=60)
    assert metrics["decision_accuracy"] >= 0.90
```

---

## Quick Reference: Common Configuration Changes

### Increase Automation Rate

**Change**:
```yaml
# In ai-ceo-decision-framework.yaml
decision_framework:
  authority_levels:
    autonomous_max_budget: 20000  # Increase from 10000
    autonomous_max_risk_score: 40  # Increase from 30
```

**Expected Impact**: Higher % of decisions made autonomously, increased automation rate

**Monitor**: Automation rate metric, decision accuracy (ensure no degradation)

### Tighten Safety Constraints

**Change**:
```yaml
# In ai-ceo-constraints.yaml
constraints:
  circuit_breakers:
    decision_errors:
      error_rate_threshold: 0.05  # Decrease from 0.10
```

**Expected Impact**: Circuit breaker triggers more frequently, increased safety

**Monitor**: Circuit breaker activation frequency, decision throughput

### Improve Decision Accuracy

**Change**:
```yaml
# In ai-ceo-model-training.yaml
training_hyperparameters:
  epochs: 200  # Increase from 100
  early_stopping_patience: 20  # Increase from 10
```

**Expected Impact**: Models train longer, potentially higher accuracy

**Monitor**: Decision accuracy metric, training time (cost)

---

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
