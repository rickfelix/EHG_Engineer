<!-- ARCHIVED: 2026-01-26T16:26:45.191Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-19\06_agent-orchestration.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 19: Agent Orchestration


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Purpose

This document defines the IntegrationVerificationCrew architecture for automating Stage 19 (Tri-Party Integration Verification), including agent specifications, task assignments, and CrewAI integration patterns.

**Framework**: CrewAI (multi-agent orchestration)
**Crew Name**: IntegrationVerificationCrew
**Agents**: 4 (APITester, PerformanceAnalyzer, FallbackConfigurator, IntegrationReporter)
**Execution Mode**: Sequential (19.1 → 19.2 → 19.3 → Reporting)
**Automation Target**: 80% (reduce execution time from 9-18 hours to 2-4 hours)

## IntegrationVerificationCrew Overview

### Crew Architecture

```
[IntegrationVerificationCrew]
       ↓
Entry Gates Validation
       ↓
[Agent 1: APITester] → Substage 19.1 (Integration Testing)
       ↓
[Agent 2: PerformanceAnalyzer] → Substage 19.2 (Performance Validation)
       ↓
[Agent 3: FallbackConfigurator] → Substage 19.3 (Fallback Configuration)
       ↓
[Agent 4: IntegrationReporter] → Summary Report Generation
       ↓
Exit Gates Validation
```

**Process Type**: Sequential (per CrewAI documentation, agents execute in order)
**Evidence**: Sequential execution ensures performance validation (19.2) uses integration test results (19.1)

### Crew Configuration

**File**: `crews/integration-verification-crew.yaml`
```yaml
crew:
  name: IntegrationVerificationCrew
  process: sequential
  verbose: true
  agents:
    - APITester
    - PerformanceAnalyzer
    - FallbackConfigurator
    - IntegrationReporter
  inputs:
    - integration_requirements_path
    - api_documentation_path
    - test_accounts_secrets_manager
    - venture_id
  outputs:
    - integration_test_results
    - performance_validation_report
    - fallback_configuration_code
    - stage_19_summary_report
```

**Evidence**: Crew configuration aligns with Stage 19 canonical definition (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:827-873)

## Agent 1: APITester

### Role
Automate Substage 19.1 (Integration Testing) by generating and executing API integration tests.

### Responsibilities
1. Parse integration requirements (`/docs/integrations.md`)
2. Generate Jest test cases from API documentation (OpenAPI specs)
3. Execute integration tests with test accounts
4. Validate data flows (roundtrip tests)
5. Confirm error handling (simulate API errors)
6. Generate integration test results (JUnit XML, JSON)

### Agent Configuration

**File**: `agents/api-tester.yaml`
```yaml
agent:
  role: "API Integration Test Engineer"
  goal: "Execute comprehensive integration tests for all third-party APIs with ≥90% success rate"
  backstory: >
    Expert in API testing (REST, GraphQL, SOAP), proficient with Jest, Supertest, and Postman.
    Specializes in data flow validation and error handling verification.
  tools:
    - JestTestGenerator
    - SupertestRunner
    - APIDocumentationParser
    - ErrorSimulator
  verbose: true
  allow_delegation: false
```

### Task Specification

**Task 1.1: Generate Integration Tests**
```yaml
task:
  description: >
    Parse API documentation (OpenAPI specs) and generate Jest test cases
    for all endpoints (GET, POST, PUT, DELETE). Test cases must cover:
    - Successful API calls (2xx responses)
    - Error handling (4xx, 5xx responses)
    - Data validation (response schema matches API docs)
  expected_output: "Jest test files saved to tests/integration/ directory"
  agent: APITester
```

**Task 1.2: Execute Integration Tests**
```yaml
task:
  description: >
    Run all Jest integration tests with test account credentials.
    Save results to JUnit XML (for CI/CD) and JSON (for database storage).
    Calculate integration success rate (passing tests / total tests).
  expected_output: "Integration test results (JSON, XML) with ≥90% success rate"
  agent: APITester
```

**Task 1.3: Verify Data Flows**
```yaml
task:
  description: >
    Execute data roundtrip tests (send data to API, retrieve, verify matches).
    Examples: Create user in Auth0 → retrieve user → verify email matches.
  expected_output: "Data flow verification report (all roundtrip tests passed)"
  agent: APITester
```

**Task 1.4: Confirm Error Handling**
```yaml
task:
  description: >
    Simulate API errors (invalid credentials, network timeouts) and verify
    graceful error handling (no crashes, retry logic works).
  expected_output: "Error handling verification report (all error tests passed)"
  agent: APITester
```

### Tools

**Tool 1: JestTestGenerator**
- **Purpose**: Auto-generate Jest test cases from OpenAPI specs
- **Input**: OpenAPI YAML file (`stripe-api-spec.yaml`)
- **Output**: Jest test file (`stripe.test.js`)
- **Implementation**: Parse OpenAPI spec, extract endpoints, generate test templates

**Tool 2: SupertestRunner**
- **Purpose**: Execute HTTP requests in Jest tests
- **Input**: API endpoint, test credentials
- **Output**: HTTP response (status, body, headers)
- **Implementation**: Wrap Supertest library for Jest integration

**Tool 3: APIDocumentationParser**
- **Purpose**: Parse OpenAPI specs, extract endpoint metadata
- **Input**: OpenAPI YAML/JSON file
- **Output**: Endpoint list (path, method, parameters, response schema)
- **Implementation**: Use `swagger-parser` library

**Tool 4: ErrorSimulator**
- **Purpose**: Simulate API errors (invalid credentials, network timeouts)
- **Input**: API endpoint, error type (401, 429, timeout)
- **Output**: Mock error response
- **Implementation**: Use `nock` library to mock API errors

### Integration with Stage 19

**Substage Mapping**: APITester agent → Substage 19.1 (Integration Testing)

**Done Criteria**:
- ✅ APIs tested (all integration tests pass, ≥90% success rate)
- ✅ Data flows verified (roundtrip tests pass)
- ✅ Error handling confirmed (error simulation tests pass)

**Evidence**: Done criteria match canonical definition (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:855-858)

## Agent 2: PerformanceAnalyzer

### Role
Automate Substage 19.2 (Performance Validation) by measuring API performance and validating SLAs.

### Responsibilities
1. Generate k6 load test scripts from API documentation
2. Execute load tests (measure latency, throughput)
3. Identify rate limits (gradual ramp-up until 429 errors)
4. Validate SLAs (p95 <1000ms, reliability ≥99%)
5. Generate performance validation report

### Agent Configuration

**File**: `agents/performance-analyzer.yaml`
```yaml
agent:
  role: "API Performance Test Engineer"
  goal: "Validate all API SLAs (p95 <1000ms, reliability ≥99%, throughput ≥100 req/sec)"
  backstory: >
    Expert in performance testing (k6, JMeter, Gatling), proficient with latency
    analysis and throughput optimization. Specializes in SLA validation.
  tools:
    - K6ScriptGenerator
    - K6Runner
    - LatencyAnalyzer
    - RateLimitDetector
  verbose: true
  allow_delegation: false
```

### Task Specification

**Task 2.1: Generate Load Tests**
```yaml
task:
  description: >
    Generate k6 load test scripts for all API endpoints.
    Configure load profiles (constant load for latency, ramp-up for throughput).
  expected_output: "k6 test scripts saved to performance-tests/ directory"
  agent: PerformanceAnalyzer
```

**Task 2.2: Measure Latency**
```yaml
task:
  description: >
    Run k6 load tests (constant load, 10 VUs, 5 minutes) and measure latency
    percentiles (p50, p95, p99). Validate p95 <1000ms SLA.
  expected_output: "Latency metrics (p50, p95, p99) with SLA validation (✅ or ❌)"
  agent: PerformanceAnalyzer
```

**Task 2.3: Test Throughput**
```yaml
task:
  description: >
    Run k6 ramp-up tests (50→100→150 req/sec) and measure max throughput
    before API throttling. Validate throughput ≥100 req/sec SLA.
  expected_output: "Throughput metrics (max req/sec) with SLA validation (✅ or ❌)"
  agent: PerformanceAnalyzer
```

**Task 2.4: Document Limits**
```yaml
task:
  description: >
    Gradually increase request rate until API returns 429 Too Many Requests.
    Document rate limits, quotas, concurrency limits in /docs/api-limits.md.
  expected_output: "API rate limits documented (e.g., Stripe: 100 req/sec)"
  agent: PerformanceAnalyzer
```

### Tools

**Tool 1: K6ScriptGenerator**
- **Purpose**: Auto-generate k6 scripts from API documentation
- **Input**: API endpoint list, load profile (constant, ramp-up)
- **Output**: k6 JavaScript file (`stripe-latency.js`)
- **Implementation**: Template-based generation (k6 script templates)

**Tool 2: K6Runner**
- **Purpose**: Execute k6 load tests, collect metrics
- **Input**: k6 script, test credentials
- **Output**: k6 results (JSON, CSV)
- **Implementation**: Run `k6 run` command, parse JSON output

**Tool 3: LatencyAnalyzer**
- **Purpose**: Parse k6 results, extract latency percentiles
- **Input**: k6 JSON results
- **Output**: Latency metrics (p50, p95, p99)
- **Implementation**: Parse `http_req_duration` metrics from k6 JSON

**Tool 4: RateLimitDetector**
- **Purpose**: Detect API rate limits (identify 429 errors)
- **Input**: k6 results, HTTP response logs
- **Output**: Rate limit threshold (e.g., 120 req/sec)
- **Implementation**: Parse HTTP status codes, identify first 429 error

### Integration with Stage 19

**Substage Mapping**: PerformanceAnalyzer agent → Substage 19.2 (Performance Validation)

**Done Criteria**:
- ✅ Latency measured (p95 <1000ms for all critical APIs)
- ✅ Throughput tested (≥100 req/sec for all critical APIs)
- ✅ Limits documented (rate limits recorded in `/docs/api-limits.md`)

**Evidence**: Done criteria match canonical definition (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:861-864)

## Agent 3: FallbackConfigurator

### Role
Automate Substage 19.3 (Fallback Configuration) by implementing resilience patterns (circuit breakers, retry logic).

### Responsibilities
1. Analyze integration test failures (identify failure modes)
2. Generate circuit breaker code (using Opossum library)
3. Generate retry logic code (exponential backoff)
4. Configure monitoring dashboards (Grafana, Prometheus alerts)
5. Test circuit breaker activation (simulate API failures)

### Agent Configuration

**File**: `agents/fallback-configurator.yaml`
```yaml
agent:
  role: "API Resilience Engineer"
  goal: "Implement circuit breakers and fallback strategies for all critical APIs"
  backstory: >
    Expert in resilience patterns (circuit breakers, retry logic, caching),
    proficient with Opossum, Polly, and monitoring tools (Grafana, Prometheus).
    Specializes in fault-tolerant API integration design.
  tools:
    - CircuitBreakerGenerator
    - RetryLogicGenerator
    - MonitoringConfigGenerator
    - CircuitBreakerTester
  verbose: true
  allow_delegation: false
```

### Task Specification

**Task 3.1: Implement Fallbacks**
```yaml
task:
  description: >
    Generate circuit breaker code (Opossum) and retry logic (exponential backoff)
    for all critical APIs. Save code to utils/circuit-breaker.js and utils/retry.js.
  expected_output: "Fallback code files (circuit-breaker.js, retry.js)"
  agent: FallbackConfigurator
```

**Task 3.2: Set Circuit Breakers**
```yaml
task:
  description: >
    Configure circuit breaker thresholds (timeout, error threshold, reset timeout)
    for each API. Save configuration to config/circuit-breakers.js.
  expected_output: "Circuit breaker configuration file"
  agent: FallbackConfigurator
```

**Task 3.3: Configure Monitoring**
```yaml
task:
  description: >
    Generate Grafana dashboards (API uptime, latency, error rate) and Prometheus
    alerts (uptime <99%, latency >1s). Save to monitoring/ directory.
  expected_output: "Monitoring configuration files (Grafana, Prometheus)"
  agent: FallbackConfigurator
```

**Task 3.4: Test Circuit Breakers**
```yaml
task:
  description: >
    Simulate API failures (5 consecutive errors) and verify circuit breaker opens.
    Verify auto-reset after cooldown period.
  expected_output: "Circuit breaker test report (activation verified ✅)"
  agent: FallbackConfigurator
```

### Tools

**Tool 1: CircuitBreakerGenerator**
- **Purpose**: Auto-generate circuit breaker code using Opossum
- **Input**: API endpoint, thresholds (timeout, error rate, reset timeout)
- **Output**: Circuit breaker code (`circuit-breaker.js`)
- **Implementation**: Template-based code generation

**Tool 2: RetryLogicGenerator**
- **Purpose**: Auto-generate retry logic with exponential backoff
- **Input**: API endpoint, max retries, base delay
- **Output**: Retry logic code (`retry.js`)
- **Implementation**: Template-based code generation

**Tool 3: MonitoringConfigGenerator**
- **Purpose**: Generate Grafana dashboards and Prometheus alerts
- **Input**: API endpoint list, SLA thresholds
- **Output**: Grafana YAML, Prometheus rules YAML
- **Implementation**: Template-based config generation

**Tool 4: CircuitBreakerTester**
- **Purpose**: Test circuit breaker activation (simulate failures)
- **Input**: Circuit breaker code, failure count
- **Output**: Test report (circuit breaker opened ✅ or not ❌)
- **Implementation**: Run test script, parse logs

### Integration with Stage 19

**Substage Mapping**: FallbackConfigurator agent → Substage 19.3 (Fallback Configuration)

**Done Criteria**:
- ✅ Fallbacks implemented (retry logic, circuit breakers, cached data)
- ✅ Circuit breakers set (thresholds configured, activation tested)
- ✅ Monitoring configured (Grafana dashboards, Prometheus alerts)

**Evidence**: Done criteria match canonical definition (EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:868-870)

## Agent 4: IntegrationReporter

### Role
Aggregate results from all agents (APITester, PerformanceAnalyzer, FallbackConfigurator) and generate Stage 19 summary report.

### Responsibilities
1. Collect integration test results (from APITester)
2. Collect performance validation results (from PerformanceAnalyzer)
3. Collect fallback configuration (from FallbackConfigurator)
4. Calculate overall Stage 19 metrics (integration success rate, API reliability, latency)
5. Validate exit gates (≥90% success, fallbacks configured, SLAs met)
6. Generate Stage 19 summary report (Markdown)

### Agent Configuration

**File**: `agents/integration-reporter.yaml`
```yaml
agent:
  role: "Integration Test Reporter"
  goal: "Generate comprehensive Stage 19 summary report with exit gate validation"
  backstory: >
    Expert in test reporting and data aggregation. Specializes in synthesizing
    test results from multiple sources into actionable summary reports.
  tools:
    - ResultsAggregator
    - ExitGateValidator
    - ReportGenerator
  verbose: true
  allow_delegation: false
```

### Task Specification

**Task 4.1: Aggregate Results**
```yaml
task:
  description: >
    Collect all test results (integration tests, performance tests, fallback configs)
    from previous agents. Calculate overall metrics (success rate, reliability, latency).
  expected_output: "Aggregated metrics (JSON)"
  agent: IntegrationReporter
```

**Task 4.2: Validate Exit Gates**
```yaml
task:
  description: >
    Validate Stage 19 exit gates:
    1. All integrations verified (success rate ≥90%)
    2. Fallbacks configured (circuit breakers tested)
    3. SLAs met (p95 <1000ms, reliability ≥99%)
  expected_output: "Exit gate validation report (✅ or ❌ for each gate)"
  agent: IntegrationReporter
```

**Task 4.3: Generate Summary Report**
```yaml
task:
  description: >
    Generate Stage 19 summary report (Markdown) with:
    - Integration success rate: X%
    - API reliability: Y%
    - Latency p95: Zms
    - All exit gates: PASSED ✅ or FAILED ❌
    Save to /docs/stage-19-summary.md.
  expected_output: "Stage 19 summary report (Markdown)"
  agent: IntegrationReporter
```

### Tools

**Tool 1: ResultsAggregator**
- **Purpose**: Aggregate test results from all agents
- **Input**: Integration test JSON, k6 results JSON, fallback config files
- **Output**: Aggregated metrics JSON
- **Implementation**: Parse JSON files, calculate aggregate metrics

**Tool 2: ExitGateValidator**
- **Purpose**: Validate Stage 19 exit gates
- **Input**: Aggregated metrics JSON, exit gate thresholds
- **Output**: Exit gate validation report (boolean pass/fail)
- **Implementation**: Compare metrics to thresholds

**Tool 3: ReportGenerator**
- **Purpose**: Generate Markdown summary report
- **Input**: Aggregated metrics, exit gate validation
- **Output**: Markdown report file
- **Implementation**: Template-based report generation

### Integration with Stage 19

**Substage Mapping**: IntegrationReporter agent → Post-execution reporting

**Output**: Stage 19 summary report (`/docs/stage-19-summary.md`)

## Crew Execution Flow

### Step 1: Entry Gate Validation

**Before Crew Execution**:
```python
# Validate entry gates (integrations identified, APIs documented)
if not entry_gates_passed():
    raise Exception("Stage 19 entry gates failed, cannot start IntegrationVerificationCrew")
```

### Step 2: Agent Execution (Sequential)

```python
# CrewAI sequential process
crew = Crew(
    agents=[api_tester, performance_analyzer, fallback_configurator, integration_reporter],
    tasks=[task_1_1, task_1_2, ..., task_4_3],
    process=Process.sequential,
)

result = crew.kickoff(inputs={
    "integration_requirements_path": "/docs/integrations.md",
    "api_documentation_path": "/docs/api/",
    "test_accounts_secrets_manager": "aws-secrets-manager",
    "venture_id": "VENTURE-001",
})
```

**Execution Order**:
1. APITester executes tasks 1.1-1.4 (Substage 19.1) → Integration test results
2. PerformanceAnalyzer executes tasks 2.1-2.4 (Substage 19.2) → Performance validation results
3. FallbackConfigurator executes tasks 3.1-3.4 (Substage 19.3) → Fallback configuration
4. IntegrationReporter executes tasks 4.1-4.3 → Stage 19 summary report

### Step 3: Exit Gate Validation

**After Crew Execution**:
```python
# Validate exit gates (integrations verified, fallbacks configured, SLAs met)
if not exit_gates_passed(result):
    raise Exception("Stage 19 exit gates failed, cannot proceed to Stage 20")
```

## Integration with SD-CREWAI-ARCHITECTURE-001

**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001 (CrewAI agent registry)
**Purpose**: Register IntegrationVerificationCrew in central agent registry

**Registry Entry**:
```json
{
  "crew_name": "IntegrationVerificationCrew",
  "crew_id": "crew_integration_verification_001",
  "stage": 19,
  "agents": [
    {"name": "APITester", "role": "API Integration Test Engineer"},
    {"name": "PerformanceAnalyzer", "role": "API Performance Test Engineer"},
    {"name": "FallbackConfigurator", "role": "API Resilience Engineer"},
    {"name": "IntegrationReporter", "role": "Integration Test Reporter"}
  ],
  "status": "active",
  "automation_level": 0.80
}
```

**Evidence**: Registry integration enables crew discovery and reuse across ventures

## Success Metrics

| Metric | Manual (Current) | Automated (Target) | Improvement |
|--------|------------------|-------------------|-------------|
| **Execution Time** | 9-18 hours | 2-4 hours | 70% reduction |
| **Error Rate** | 30% (incomplete tests) | 10% (automated validation) | 67% reduction |
| **Integration Success Rate** | 70% (manual testing) | 90% (automated test suite) | 29% improvement |
| **Automation Level** | 20% | 80% | 4x improvement |

**Evidence**: Metrics align with critique recommendation "Target State: 80% automation" (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-19.md:33)

---

**Conclusion**: IntegrationVerificationCrew provides 80% automation for Stage 19, reducing execution time from 9-18 hours to 2-4 hours while improving integration success rate from 70% to 90%.

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
