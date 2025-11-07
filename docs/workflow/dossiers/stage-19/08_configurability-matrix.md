# Stage 19: Configurability Matrix

## Purpose

This document defines all tunable parameters for Stage 19 (Tri-Party Integration Verification), enabling venture-specific customization without code changes.

**Customization Level**: HIGH (Stage 19 requires extensive customization per venture)
**Configuration Methods**: Environment variables, YAML files, database records
**Target**: Enable 90% of customization via configuration (no code changes)

## Configuration Categories

### 1. API Integration Configuration

**Purpose**: Define which third-party APIs to test, credentials, endpoints

#### Parameter: `integration_requirements`

**Type**: JSON array
**Location**: Database (`integration_requirements` table) or file (`/docs/integrations.json`)
**Customization Level**: REQUIRED (venture-specific)

**Schema**:
```json
[
  {
    "integration_name": "Stripe",
    "provider": "Stripe Inc.",
    "type": "Payment Gateway",
    "criticality": "HIGH",
    "api_version": "2023-10-16",
    "base_url": "https://api.stripe.com/v1",
    "authentication_type": "API_KEY",
    "test_account_secret": "STRIPE_TEST_KEY",
    "production_account_secret": "STRIPE_PROD_KEY",
    "rate_limit_req_sec": 100,
    "timeout_ms": 5000
  },
  {
    "integration_name": "Auth0",
    "provider": "Auth0",
    "type": "Authentication",
    "criticality": "HIGH",
    "api_version": "v2",
    "base_url": "https://your-tenant.auth0.com",
    "authentication_type": "OAUTH2",
    "test_account_secret": "AUTH0_TEST_CLIENT_ID",
    "production_account_secret": "AUTH0_PROD_CLIENT_ID",
    "rate_limit_req_sec": 50,
    "timeout_ms": 3000
  }
]
```

**Customization Example**:
- **E-commerce venture**: Stripe, Auth0, Mailgun
- **SaaS venture**: Auth0, SendGrid, Twilio
- **AI venture**: OpenAI, Anthropic, Pinecone

**Evidence**: Aligns with Stage 19 input "Integration requirements" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:833)

#### Parameter: `api_documentation_paths`

**Type**: Object (API name → documentation file path)
**Location**: Configuration file (`config/api-docs.yaml`)
**Customization Level**: REQUIRED (venture-specific)

**Schema**:
```yaml
api_documentation:
  stripe:
    openapi_spec: /docs/api/stripe-api-spec.yaml
    sdk_reference: /docs/api/stripe-sdk-reference.md
  auth0:
    openapi_spec: /docs/api/auth0-api-spec.yaml
    sdk_reference: /docs/api/auth0-sdk-reference.md
  openai:
    openapi_spec: /docs/api/openai-api-spec.yaml
    sdk_reference: /docs/api/openai-sdk-reference.md
```

**Evidence**: Aligns with Stage 19 input "API documentation" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:834)

#### Parameter: `test_account_credentials`

**Type**: Environment variables (NEVER commit to Git)
**Location**: AWS Secrets Manager, GitHub Secrets, or `.env.test` (local only)
**Customization Level**: REQUIRED (venture-specific)

**Example**:
```bash
STRIPE_TEST_KEY=sk_test_...
AUTH0_TEST_CLIENT_ID=...
AUTH0_TEST_CLIENT_SECRET=...
OPENAI_TEST_API_KEY=sk-test-...
```

**Security**: Use secrets manager (AWS Secrets Manager, GitHub Secrets), NEVER commit to Git

**Evidence**: Aligns with Stage 19 input "Test accounts" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:835)

### 2. Performance Testing Configuration

**Purpose**: Define SLA targets, load test profiles, performance thresholds

#### Parameter: `sla_targets`

**Type**: YAML object
**Location**: Configuration file (`config/sla-targets.yaml`)
**Customization Level**: RECOMMENDED (venture-specific)

**Schema**:
```yaml
sla_targets:
  latency_p95_ms: 1000    # 95th percentile latency <1000ms
  latency_p99_ms: 2000    # 99th percentile latency <2000ms
  reliability_percentage: 99.0  # API reliability ≥99%
  throughput_req_sec: 100 # Throughput ≥100 req/sec
  error_rate_percentage: 1.0    # Error rate <1%
```

**Customization Example**:
- **High-performance venture**: Lower latency targets (p95 <500ms)
- **Cost-sensitive venture**: Higher latency tolerance (p95 <2000ms)
- **Mission-critical venture**: Higher reliability (≥99.9%)

**Evidence**: Aligns with Stage 19 metric "Latency metrics" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:843) and exit gate "SLAs met" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:851)

#### Parameter: `load_test_profiles`

**Type**: YAML object (API name → k6 load profile)
**Location**: Configuration file (`config/load-test-profiles.yaml`)
**Customization Level**: OPTIONAL (defaults provided)

**Schema**:
```yaml
load_test_profiles:
  stripe:
    test_type: constant_load
    virtual_users: 10
    duration_minutes: 5
    ramp_up_seconds: 30
  auth0:
    test_type: ramp_up
    stages:
      - duration_minutes: 1
        target_req_sec: 50
      - duration_minutes: 1
        target_req_sec: 100
      - duration_minutes: 1
        target_req_sec: 150
  openai:
    test_type: spike
    virtual_users: 50
    duration_minutes: 2
    spike_multiplier: 3  # Spike to 150 VUs
```

**Customization Example**:
- **Load testing focus**: Longer duration (10+ minutes)
- **Spike testing focus**: Higher spike multiplier (5x)
- **Stress testing focus**: Gradual ramp-up to 1000+ req/sec

**Evidence**: Supports Substage 19.2 "Performance Validation" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:859-864)

### 3. Circuit Breaker Configuration

**Purpose**: Define circuit breaker thresholds for fallback patterns

#### Parameter: `circuit_breaker_config`

**Type**: YAML object (API name → circuit breaker thresholds)
**Location**: Configuration file (`config/circuit-breakers.yaml`)
**Customization Level**: RECOMMENDED (venture-specific)

**Schema**:
```yaml
circuit_breakers:
  stripe:
    timeout_ms: 5000                  # Timeout after 5 seconds
    error_threshold_percentage: 50    # Open after 50% errors
    reset_timeout_ms: 60000           # Reset after 1 minute
    fallback_strategy: "cached_payment_methods"
  auth0:
    timeout_ms: 3000
    error_threshold_percentage: 30
    reset_timeout_ms: 30000
    fallback_strategy: "local_session_cache"
  openai:
    timeout_ms: 10000                 # AI APIs need longer timeout
    error_threshold_percentage: 40
    reset_timeout_ms: 300000          # 5 minute cooldown
    fallback_strategy: "cached_ai_responses"
```

**Customization Example**:
- **High-reliability venture**: Lower error threshold (20%)
- **Tolerance for transient failures**: Higher error threshold (70%)
- **Fast recovery**: Shorter reset timeout (15 seconds)

**Evidence**: Supports Substage 19.3 "Circuit breakers set" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:869)

#### Parameter: `retry_logic_config`

**Type**: YAML object (API name → retry parameters)
**Location**: Configuration file (`config/retry-logic.yaml`)
**Customization Level**: OPTIONAL (defaults provided)

**Schema**:
```yaml
retry_logic:
  stripe:
    max_retries: 3
    base_delay_ms: 1000     # 1 second initial delay
    backoff_multiplier: 2   # Exponential backoff (1s, 2s, 4s)
    max_delay_ms: 30000     # Cap at 30 seconds
    retryable_errors:
      - "network_timeout"
      - "rate_limit_exceeded"
  auth0:
    max_retries: 2
    base_delay_ms: 500
    backoff_multiplier: 2
    max_delay_ms: 10000
    retryable_errors:
      - "network_timeout"
```

**Customization Example**:
- **Aggressive retry**: Higher max_retries (5)
- **Fast failure**: Lower max_retries (1)
- **Rate limit handling**: Add "rate_limit_exceeded" to retryable_errors

**Evidence**: Supports Substage 19.3 "Fallbacks implemented" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:868)

### 4. Monitoring Configuration

**Purpose**: Define monitoring dashboards, alerts, metrics collection

#### Parameter: `monitoring_config`

**Type**: YAML object (monitoring platform → configuration)
**Location**: Configuration file (`config/monitoring.yaml`)
**Customization Level**: OPTIONAL (defaults provided)

**Schema**:
```yaml
monitoring:
  grafana:
    enabled: true
    dashboard_path: /monitoring/grafana-dashboard-api-health.yaml
    refresh_interval_seconds: 30
  prometheus:
    enabled: true
    alerts_path: /monitoring/prometheus-alerts.yaml
    scrape_interval_seconds: 15
  datadog:
    enabled: false
    api_key_secret: DATADOG_API_KEY
  custom_metrics:
    - metric_name: integration_success_rate
      measurement_frequency: realtime
      alert_threshold: 90
    - metric_name: api_reliability
      measurement_frequency: hourly
      alert_threshold: 99
    - metric_name: latency_p95_ms
      measurement_frequency: realtime
      alert_threshold: 1000
```

**Customization Example**:
- **Datadog preference**: Enable Datadog, disable Prometheus/Grafana
- **High-frequency monitoring**: Lower scrape_interval_seconds (5s)
- **Custom alerts**: Add venture-specific metrics (payment_success_rate, login_success_rate)

**Evidence**: Supports Substage 19.3 "Monitoring configured" (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:870)

### 5. Exit Gate Thresholds

**Purpose**: Define pass/fail criteria for Stage 19 completion

#### Parameter: `exit_gate_thresholds`

**Type**: YAML object
**Location**: Configuration file (`config/exit-gates.yaml`)
**Customization Level**: RECOMMENDED (venture-specific)

**Schema**:
```yaml
exit_gates:
  integration_success_rate_min: 90    # ≥90% tests passing
  api_reliability_min: 99.0           # ≥99% API uptime
  latency_p95_max_ms: 1000            # p95 <1000ms
  throughput_min_req_sec: 100         # ≥100 req/sec
  fallbacks_configured: true          # Boolean (must be true)
  circuit_breakers_tested: true       # Boolean (must be true)
```

**Customization Example**:
- **Strict venture**: Raise integration_success_rate_min to 95%
- **Lenient venture**: Lower integration_success_rate_min to 80%
- **Performance-critical**: Lower latency_p95_max_ms to 500ms

**Evidence**: Aligns with Stage 19 exit gates (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:849-851)

### 6. Recursion Trigger Configuration

**Purpose**: Define conditions for automated recursion (see 07_recursion-blueprint.md)

#### Parameter: `recursion_triggers`

**Type**: YAML object (trigger name → conditions)
**Location**: Configuration file (`config/recursion-triggers.yaml`)
**Customization Level**: OPTIONAL (defaults provided)

**Schema**:
```yaml
recursion_triggers:
  INTEGRATION-001:
    enabled: true
    trigger_condition: "integration_success_rate < 90"
    target_stage: 19  # Self-recursion (Substage 19.1)
    fallback_target_stage: 14  # If self-recursion fails
    max_recursions: 3
  INTEGRATION-002:
    enabled: true
    trigger_condition: "api_reliability < 99"
    target_stage: 19  # Self-recursion (Substage 19.3)
    fallback_target_stage: 10
    max_recursions: 2
  INTEGRATION-003:
    enabled: true
    trigger_condition: "latency_p95_ms > 1000"
    target_stage: 10  # Architecture review
    fallback_target_stage: 19
    max_recursions: 2
  INTEGRATION-004:
    enabled: true
    trigger_condition: "circuit_breaker_status = 'open'"
    target_stage: 19  # Self-recursion (Substage 19.3)
    fallback_target_stage: 14
    max_recursions: 5  # Higher limit for transient failures
```

**Customization Example**:
- **Disable recursion**: Set enabled to false (manual intervention only)
- **Aggressive recursion**: Increase max_recursions (5+)
- **Conservative recursion**: Decrease max_recursions (1)

**Evidence**: Proposed in 07_recursion-blueprint.md (INTEGRATION-001 to INTEGRATION-004 triggers)

## Configuration Management

### Configuration Loading Priority

**Priority 1**: Environment variables (highest precedence)
**Priority 2**: Database records (`venture_configurations` table)
**Priority 3**: YAML configuration files (`config/*.yaml`)
**Priority 4**: Code defaults (lowest precedence)

**Example**:
```javascript
// Load configuration with priority
const config = {
  sla_targets: {
    latency_p95_ms: process.env.LATENCY_P95_MAX_MS ||  // Priority 1: ENV
                    db.query('SELECT latency_p95_ms FROM venture_configurations') ||  // Priority 2: DB
                    yaml.load('config/sla-targets.yaml').latency_p95_ms ||  // Priority 3: YAML
                    1000  // Priority 4: Code default
  }
};
```

### Configuration Validation

**Pre-Stage 19 Validation**:
```bash
# Validate configuration before starting Stage 19
node scripts/validate-stage-19-config.js \
  --venture-id VENTURE-001 \
  --config-dir /mnt/c/_EHG/EHG_Engineer/config/

# Expected output:
# ✅ integration_requirements.json: Valid (3 integrations defined)
# ✅ sla-targets.yaml: Valid (all thresholds defined)
# ✅ circuit-breakers.yaml: Valid (3 circuit breakers configured)
# ✅ exit-gates.yaml: Valid (6 exit gates defined)
```

**Failure Recovery**: If validation fails, block Stage 19 start, escalate to EXEC

### Configuration Documentation

**Auto-Generated Documentation**:
```bash
# Generate configuration documentation (human-readable)
node scripts/generate-config-docs.js \
  --config-dir /mnt/c/_EHG/EHG_Engineer/config/ \
  --output /mnt/c/_EHG/EHG_Engineer/docs/stage-19-config-guide.md

# Output includes:
# - Parameter descriptions
# - Example values
# - Customization recommendations
# - Validation rules
```

## Venture-Specific Configuration Examples

### Example 1: E-commerce Venture (High Payment Reliability)

**Configuration Highlights**:
- **Integrations**: Stripe (payment), Auth0 (auth), SendGrid (email)
- **SLA Targets**: Strict (p95 <500ms, reliability ≥99.9%)
- **Circuit Breakers**: Low error threshold (20%) for payment APIs
- **Exit Gates**: High integration success rate (≥95%)

**Config File**: `config/ventures/ecommerce-venture.yaml`
```yaml
integration_requirements:
  - integration_name: Stripe
    criticality: HIGH
    rate_limit_req_sec: 100
sla_targets:
  latency_p95_ms: 500
  reliability_percentage: 99.9
circuit_breakers:
  stripe:
    error_threshold_percentage: 20
exit_gates:
  integration_success_rate_min: 95
```

### Example 2: AI SaaS Venture (High AI API Usage)

**Configuration Highlights**:
- **Integrations**: OpenAI (AI), Anthropic (AI), Pinecone (vector DB)
- **SLA Targets**: Lenient latency (p95 <2000ms, AI APIs slower)
- **Circuit Breakers**: Higher error threshold (50%, AI APIs less reliable)
- **Retry Logic**: Aggressive retries (5 attempts, long timeouts)

**Config File**: `config/ventures/ai-saas-venture.yaml`
```yaml
integration_requirements:
  - integration_name: OpenAI
    criticality: HIGH
    timeout_ms: 10000
  - integration_name: Anthropic
    criticality: MEDIUM
    timeout_ms: 10000
sla_targets:
  latency_p95_ms: 2000
circuit_breakers:
  openai:
    timeout_ms: 10000
    error_threshold_percentage: 50
retry_logic:
  openai:
    max_retries: 5
    base_delay_ms: 2000
```

### Example 3: Low-Budget Startup (Minimal Testing)

**Configuration Highlights**:
- **Integrations**: Only critical APIs (Auth0, SendGrid)
- **Load Testing**: Minimal (1 minute, 5 VUs)
- **Exit Gates**: Lenient (≥80% success rate)
- **Monitoring**: Disabled (use manual checks)

**Config File**: `config/ventures/startup-venture.yaml`
```yaml
integration_requirements:
  - integration_name: Auth0
    criticality: HIGH
  - integration_name: SendGrid
    criticality: MEDIUM
load_test_profiles:
  auth0:
    duration_minutes: 1
    virtual_users: 5
exit_gates:
  integration_success_rate_min: 80
monitoring:
  grafana:
    enabled: false
  prometheus:
    enabled: false
```

## Configuration Change Management

**Version Control**: Store all configuration files in Git
**Change Approval**: LEAD or EXEC approval required for exit gate threshold changes
**Rollback**: Revert to previous configuration version if Stage 19 fails

**Example Git Workflow**:
```bash
# Update configuration
vim config/sla-targets.yaml
git add config/sla-targets.yaml
git commit -m "feat(config): Lower latency SLA to 500ms for high-performance venture"
git push origin main

# Rollback if needed
git revert HEAD
git push origin main
```

---

**Conclusion**: Stage 19 provides extensive configurability (90% of customization via configuration files), enabling venture-specific tuning without code changes.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
