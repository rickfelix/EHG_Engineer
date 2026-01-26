<!-- ARCHIVED: 2026-01-26T16:26:43.060Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-19\05_professional-sop.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 19: Professional Standard Operating Procedure


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, unit

## Purpose

This document provides step-by-step execution guidance for Stage 19 (Tri-Party Integration Verification), enabling EXEC agents to execute all 3 substages (Integration Testing, Performance Validation, Fallback Configuration) consistently and efficiently.

**Intended Audience**: EXEC agents, automation engineers
**Execution Time**: 9-18 hours (manual), 2-4 hours (automated)
**Prerequisites**: Stage 18 completion (API documentation, test accounts available)

## Pre-Execution Checklist

### Entry Gate Validation

**Before Starting Stage 19**, verify all entry gates pass:

**Entry Gate 1: Integrations Identified**
```bash
# Verify integration requirements file exists
test -f /mnt/c/_EHG/EHG_Engineer/docs/integrations.md && echo "✅ Integrations identified" || echo "❌ Missing integrations.md"

# Verify integration requirements contain ≥1 integration
grep -q "integration" /mnt/c/_EHG/EHG_Engineer/docs/integrations.md && echo "✅ At least 1 integration documented" || echo "❌ No integrations documented"
```

**Expected Output**: ✅ Integrations identified, ✅ At least 1 integration documented

**Failure Recovery**: If entry gates fail, recurse to Stage 18 (document integrations) or Stage 14 (create integration requirements)

**Entry Gate 2: APIs Documented**
```bash
# Verify API documentation directory exists
test -d /mnt/c/_EHG/EHG_Engineer/docs/api && echo "✅ API docs directory exists" || echo "❌ Missing /docs/api/"

# Count API documentation files (expect ≥1 per integration)
find /mnt/c/_EHG/EHG_Engineer/docs/api -name "*.yaml" -o -name "*.md" | wc -l
```

**Expected Output**: ✅ API docs directory exists, ≥1 API documentation file

**Failure Recovery**: If API documentation missing, recurse to Stage 14 (create API documentation)

### Environment Setup

**Step 1: Load Test Accounts**
```bash
# Load test account credentials from secrets manager
# (NEVER commit secrets to Git)
export STRIPE_TEST_KEY=$(aws secretsmanager get-secret-value --secret-id STRIPE_TEST_KEY --query SecretString --output text)
export AUTH0_TEST_CLIENT_ID=$(aws secretsmanager get-secret-value --secret-id AUTH0_TEST_CLIENT_ID --query SecretString --output text)
export OPENAI_TEST_API_KEY=$(aws secretsmanager get-secret-value --secret-id OPENAI_TEST_API_KEY --query SecretString --output text)

# Verify credentials loaded
echo "Stripe key: ${STRIPE_TEST_KEY:0:10}..." # Show first 10 chars only
echo "Auth0 client: ${AUTH0_TEST_CLIENT_ID:0:10}..."
echo "OpenAI key: ${OPENAI_TEST_API_KEY:0:10}..."
```

**Expected Output**: Credentials loaded (partial keys displayed, full keys hidden)

**Failure Recovery**: If credentials not found in secrets manager, procure test accounts (Stripe dashboard, Auth0 dashboard, OpenAI dashboard)

**Step 2: Install Testing Tools**
```bash
# Install integration testing dependencies
npm install --save-dev jest @jest/globals supertest

# Install performance testing tools
npm install --save-dev k6 autocannon

# Install circuit breaker libraries
npm install --save express-circuit-breaker opossum

# Verify installations
npx jest --version
npx k6 version
node -e "console.log(require('opossum').version)"
```

**Expected Output**: Tool versions displayed (Jest 29.x, k6 0.x, Opossum 6.x)

**Failure Recovery**: If installation fails, check `package.json` for conflicts, resolve dependencies

## Substage 19.1: Integration Testing (3-6 hours)

### Objective
Test all API integrations for functional correctness, data flow validation, and error handling.

### Inputs
- Integration requirements (`/docs/integrations.md`)
- API documentation (`/docs/api/*.yaml`)
- Test accounts (loaded in environment variables)

### Outputs
- Integration test results (JUnit XML, JSON)
- Test coverage report (% of APIs tested)
- Error logs (failed tests, API errors)

### Execution Steps

**Step 1.1: Generate Integration Test Cases (1-2 hours manual, 15 min automated)**

**Manual Approach**:
```bash
# For each integration in /docs/integrations.md, create Jest test file
# Example: Stripe integration

cat > tests/integration/stripe.test.js <<'EOF'
const stripe = require('stripe')(process.env.STRIPE_TEST_KEY);
const { describe, test, expect } = require('@jest/globals');

describe('Stripe Payment Integration', () => {
  test('Create Payment Intent', async () => {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // $10.00
      currency: 'usd',
    });
    expect(paymentIntent.id).toMatch(/^pi_/);
    expect(paymentIntent.status).toBe('requires_payment_method');
  });

  test('Process Refund', async () => {
    // Create charge first
    const charge = await stripe.charges.create({
      amount: 1000,
      currency: 'usd',
      source: 'tok_visa', // Test token
    });

    // Refund charge
    const refund = await stripe.refunds.create({
      charge: charge.id,
    });
    expect(refund.status).toBe('succeeded');
  });
});
EOF
```

**Automated Approach** (using IntegrationVerificationCrew):
```bash
# APITester agent generates test cases from API documentation
node scripts/generate-integration-tests.js \
  --input /mnt/c/_EHG/EHG_Engineer/docs/api/stripe-api-spec.yaml \
  --output /mnt/c/_EHG/EHG_Engineer/tests/integration/stripe.test.js
```

**Expected Output**: Test file created (`tests/integration/stripe.test.js`)

**Step 1.2: Run Integration Tests (1-2 hours manual, 30 min automated)**

```bash
# Run all integration tests
npx jest tests/integration/ --verbose --coverage

# Save results to JUnit XML (for CI/CD)
npx jest tests/integration/ --reporters=jest-junit --outputFile=integration-test-results.xml

# Save results to JSON (for database storage)
npx jest tests/integration/ --json --outputFile=integration-test-results.json
```

**Expected Output**:
```
Test Suites: 3 passed, 3 total
Tests:       18 passed, 18 total
Time:        12.45s
Coverage:    85%
```

**Failure Recovery**: If tests fail:
1. Check error logs (identify failing API)
2. Verify API credentials (correct test key?)
3. Verify API endpoint (correct base URL?)
4. Recurse to Stage 14 (fix integration code, add error handling)

**Step 1.3: Verify Data Flows (1-2 hours manual, 30 min automated)**

**Test Scenario**: Data roundtrip (send data to API, retrieve, verify matches)

**Example: Auth0 User Creation**
```javascript
test('Auth0 User Data Flow', async () => {
  const auth0 = new ManagementClient({
    domain: 'your-tenant.auth0.com',
    clientId: process.env.AUTH0_TEST_CLIENT_ID,
    clientSecret: process.env.AUTH0_TEST_CLIENT_SECRET,
  });

  // Create user
  const user = await auth0.createUser({
    email: 'test@example.com',
    password: 'TestPass123!',
    connection: 'Username-Password-Authentication',
  });
  expect(user.email).toBe('test@example.com');

  // Retrieve user (verify data roundtrip)
  const retrievedUser = await auth0.getUser({ id: user.user_id });
  expect(retrievedUser.email).toBe('test@example.com');

  // Cleanup
  await auth0.deleteUser({ id: user.user_id });
});
```

**Expected Output**: Test passes (data roundtrip successful)

**Failure Recovery**: If data flow fails:
1. Check data transformation logic (correct mapping?)
2. Check API response schema (matches expected format?)
3. Recurse to Stage 14 (fix data transformation code)

**Step 1.4: Confirm Error Handling (1 hour manual, 15 min automated)**

**Test Scenario**: Simulate API errors, verify graceful handling

**Example: Invalid API Key**
```javascript
test('Stripe Error Handling - Invalid API Key', async () => {
  const stripeInvalidKey = require('stripe')('sk_test_invalid_key');

  // Expect API error (not crash)
  await expect(stripeInvalidKey.paymentIntents.create({
    amount: 1000,
    currency: 'usd',
  })).rejects.toThrow('Invalid API Key');
});

test('Stripe Error Handling - Network Timeout', async () => {
  const stripe = require('stripe')(process.env.STRIPE_TEST_KEY, {
    timeout: 1, // 1ms timeout (force timeout)
  });

  // Expect timeout error (not crash)
  await expect(stripe.paymentIntents.create({
    amount: 1000,
    currency: 'usd',
  })).rejects.toThrow('Timeout');
});
```

**Expected Output**: Tests pass (errors handled gracefully, no crashes)

**Failure Recovery**: If error handling missing:
1. Add try-catch blocks (wrap API calls)
2. Add retry logic (exponential backoff)
3. Recurse to Stage 14 (implement error handling)

**Done Criteria for Substage 19.1**:
- ✅ APIs tested (all integration tests pass, ≥90% success rate)
- ✅ Data flows verified (roundtrip tests pass)
- ✅ Error handling confirmed (error simulation tests pass)

## Substage 19.2: Performance Validation (2-4 hours)

### Objective
Measure API performance (latency, throughput, rate limits) and validate SLAs.

### Inputs
- API endpoints (from integration tests)
- SLA targets (p95 <1000ms, throughput ≥100 req/sec)

### Outputs
- Performance test results (latency percentiles, throughput metrics)
- Rate limit documentation (max req/sec per API)
- Performance validation report (SLAs met ✅ or not met ❌)

### Execution Steps

**Step 2.1: Measure Latency (1-2 hours manual, 30 min automated)**

**Tool**: k6 (load testing)

**Example: Stripe API Latency Test**
```javascript
// performance-tests/stripe-latency.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 10, // 10 virtual users
      duration: '5m', // 5 minutes
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'], // p95 < 1000ms
  },
};

export default function () {
  const payload = JSON.stringify({
    amount: 1000,
    currency: 'usd',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.STRIPE_TEST_KEY}`,
    },
  };

  const res = http.post('https://api.stripe.com/v1/payment_intents', payload, params);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
```

**Run Test**:
```bash
# Run k6 load test
k6 run performance-tests/stripe-latency.js --env STRIPE_TEST_KEY=$STRIPE_TEST_KEY

# Save results to JSON
k6 run performance-tests/stripe-latency.js --env STRIPE_TEST_KEY=$STRIPE_TEST_KEY --out json=stripe-latency-results.json
```

**Expected Output**:
```
http_req_duration..........: avg=245ms min=120ms med=230ms max=850ms p(90)=450ms p(95)=680ms p(99)=800ms
✅ p(95) < 1000ms (SLA met)
```

**Failure Recovery**: If latency SLA not met (p95 ≥1000ms):
1. Investigate bottlenecks (API server slow? network latency?)
2. Optimize API calls (batch requests, use caching)
3. Recurse to Stage 10 (architecture review, add caching layer)

**Step 2.2: Test Throughput (1 hour manual, 30 min automated)**

**Tool**: k6 (ramp-up test)

**Example: Auth0 Throughput Test**
```javascript
// performance-tests/auth0-throughput.js
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '1m', target: 50 },  // Ramp-up to 50 req/sec
    { duration: '1m', target: 100 }, // Ramp-up to 100 req/sec
    { duration: '1m', target: 150 }, // Ramp-up to 150 req/sec
    { duration: '1m', target: 0 },   // Ramp-down
  ],
};

export default function () {
  http.get('https://your-tenant.auth0.com/.well-known/openid-configuration');
}
```

**Run Test**:
```bash
k6 run performance-tests/auth0-throughput.js
```

**Expected Output**:
```
http_reqs..................: 12000 (100/s) ✅ Throughput ≥100 req/sec
http_req_failed............: 0.00% (no failures)
```

**Failure Recovery**: If throughput <100 req/sec:
1. Check API rate limits (exceed provider limits?)
2. Distribute load (use multiple API keys, load balancing)
3. Recurse to Stage 10 (architecture review, add API gateway)

**Step 2.3: Document Limits (0.5-1 hour manual, 15 min automated)**

**Identify Rate Limits**: Gradually increase request rate until API returns 429 Too Many Requests

**Example: OpenAI API Rate Limit Test**
```bash
# Start with 10 req/sec, increase by 10 every minute
for rate in 10 20 30 40 50 60 70 80 90 100 110 120; do
  echo "Testing $rate req/sec..."
  k6 run --vus $rate --duration 1m performance-tests/openai-rate-limit.js
  sleep 5 # Cooldown
done

# Check logs for 429 errors
grep "429 Too Many Requests" k6-output.log
```

**Expected Output**: Rate limit identified (e.g., "OpenAI API throttles at 120 req/sec")

**Document Limits**:
```bash
cat > /mnt/c/_EHG/EHG_Engineer/docs/api-limits.md <<'EOF'
# API Rate Limits

| API | Provider | Rate Limit | Quota | Notes |
|-----|----------|------------|-------|-------|
| Stripe | Stripe | 100 req/sec per API key | 1000 req/min per account | Use multiple API keys for higher throughput |
| Auth0 | Auth0 | 50 req/sec per tenant | Unlimited | Management API has stricter limits (10 req/sec) |
| OpenAI | OpenAI | 120 req/sec | 10,000 req/day (free tier) | Upgrade to paid tier for higher limits |
EOF
```

**Done Criteria for Substage 19.2**:
- ✅ Latency measured (p95 <1000ms for all critical APIs)
- ✅ Throughput tested (≥100 req/sec for all critical APIs)
- ✅ Limits documented (rate limits recorded in `/docs/api-limits.md`)

## Substage 19.3: Fallback Configuration (4-8 hours)

### Objective
Implement resilience patterns (circuit breakers, retry logic, fallback data sources) to handle API failures gracefully.

### Inputs
- Integration test results (identify failure modes)
- Performance validation results (identify latency issues)

### Outputs
- Fallback strategies (circuit breaker code, retry logic)
- Monitoring configuration (API health dashboards)

### Execution Steps

**Step 3.1: Implement Fallbacks (2-4 hours manual, 1 hour automated)**

**Pattern 1: Retry Logic with Exponential Backoff**

**Example: Stripe Payment with Retry**
```javascript
// utils/retry.js
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Retry attempt ${attempt} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
const paymentIntent = await retryWithBackoff(() =>
  stripe.paymentIntents.create({ amount: 1000, currency: 'usd' })
);
```

**Pattern 2: Circuit Breaker (using Opossum library)**

**Example: Auth0 API with Circuit Breaker**
```javascript
// utils/circuit-breaker.js
const CircuitBreaker = require('opossum');

const auth0CircuitBreaker = new CircuitBreaker(auth0.getUser, {
  timeout: 5000, // 5 seconds
  errorThresholdPercentage: 50, // Open circuit if >50% errors
  resetTimeout: 30000, // 30 seconds cooldown
});

// Fallback function (use cached data)
auth0CircuitBreaker.fallback((userId) => {
  console.log('Circuit breaker open, using cached user data');
  return cache.get(`user:${userId}`);
});

// Usage
const user = await auth0CircuitBreaker.fire({ id: 'user_123' });
```

**Pattern 3: Fallback Data Source (Cached Responses)**

**Example: OpenAI API with Cache Fallback**
```javascript
// utils/cache-fallback.js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 min TTL

async function getOpenAICompletion(prompt) {
  const cacheKey = `openai:${prompt}`;

  try {
    const response = await openai.createCompletion({ prompt });
    cache.set(cacheKey, response); // Cache success
    return response;
  } catch (error) {
    console.error('OpenAI API failed, using cached response');
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    throw new Error('OpenAI API failed and no cached response available');
  }
}
```

**Done Criteria**: Fallback code implemented for all critical APIs

**Step 3.2: Set Circuit Breakers (1-2 hours manual, 30 min automated)**

**Configure Circuit Breaker Thresholds**:
```javascript
// config/circuit-breakers.js
module.exports = {
  stripe: {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000, // 1 min cooldown
  },
  auth0: {
    timeout: 3000,
    errorThresholdPercentage: 30,
    resetTimeout: 30000, // 30 sec cooldown
  },
  openai: {
    timeout: 10000, // Higher timeout for AI APIs
    errorThresholdPercentage: 40,
    resetTimeout: 300000, // 5 min cooldown
  },
};
```

**Test Circuit Breaker Activation**:
```bash
# Simulate API failures (mock 5 consecutive errors)
node tests/circuit-breaker-test.js --api stripe --consecutive-errors 5

# Expected: Circuit breaker opens, API calls blocked for 1 minute
```

**Done Criteria**: Circuit breakers configured and tested for all critical APIs

**Step 3.3: Configure Monitoring (1-2 hours manual, 30 min automated)**

**Create API Health Dashboard (Grafana)**:
```yaml
# monitoring/grafana-dashboard-api-health.yaml
dashboard:
  title: "API Health Dashboard"
  panels:
    - title: "Stripe API Uptime"
      targets:
        - expr: "sum(rate(stripe_api_success[5m])) / sum(rate(stripe_api_requests[5m])) * 100"
      thresholds:
        - value: 99
          color: green
        - value: 95
          color: yellow
        - value: 0
          color: red
    - title: "Stripe API Latency (p95)"
      targets:
        - expr: "histogram_quantile(0.95, stripe_api_duration_seconds)"
      thresholds:
        - value: 1.0
          color: red
        - value: 0.5
          color: yellow
        - value: 0
          color: green
```

**Configure Alerts (Prometheus)**:
```yaml
# monitoring/prometheus-alerts.yaml
groups:
  - name: api-health
    rules:
      - alert: StripeAPIDown
        expr: stripe_api_uptime < 99
        for: 5m
        annotations:
          summary: "Stripe API uptime <99%"
          description: "Stripe API uptime is {{ $value }}% (last 5 min)"
      - alert: StripeAPILatencyHigh
        expr: histogram_quantile(0.95, stripe_api_duration_seconds) > 1.0
        for: 5m
        annotations:
          summary: "Stripe API p95 latency >1s"
          description: "Stripe API p95 latency is {{ $value }}s"
```

**Done Criteria for Substage 19.3**:
- ✅ Fallbacks implemented (retry logic, circuit breakers, cached data)
- ✅ Circuit breakers set (thresholds configured, activation tested)
- ✅ Monitoring configured (Grafana dashboards, Prometheus alerts)

## Exit Gate Validation

### Exit Gate 1: All Integrations Verified

**Validation**:
```bash
# Calculate integration success rate
total_tests=$(jq '.numTotalTests' integration-test-results.json)
passed_tests=$(jq '.numPassedTests' integration-test-results.json)
success_rate=$(echo "scale=2; $passed_tests / $total_tests * 100" | bc)

echo "Integration success rate: $success_rate%"

# Check threshold
if (( $(echo "$success_rate >= 90" | bc -l) )); then
  echo "✅ Exit Gate 1 PASSED (success rate ≥90%)"
else
  echo "❌ Exit Gate 1 FAILED (success rate <90%)"
  exit 1
fi
```

**Expected Output**: ✅ Exit Gate 1 PASSED

**Failure Recovery**: If <90%, recurse to Stage 19 (Substage 19.1) or Stage 14 (fix integration code)

### Exit Gate 2: Fallbacks Configured

**Validation**:
```bash
# Test circuit breaker activation
node tests/circuit-breaker-test.js --api stripe --consecutive-errors 5

# Expected: Circuit breaker opens (API calls blocked)
```

**Expected Output**: ✅ Circuit breaker opens after 5 failures

**Failure Recovery**: If fallbacks not working, recurse to Stage 19 (Substage 19.3)

### Exit Gate 3: SLAs Met

**Validation**:
```bash
# Check latency SLA (p95 <1000ms)
p95_latency=$(jq '.metrics.http_req_duration.values["p(95)"]' stripe-latency-results.json)
if (( $(echo "$p95_latency < 1000" | bc -l) )); then
  echo "✅ Latency SLA met (p95 <1000ms)"
else
  echo "❌ Latency SLA NOT met (p95 ≥1000ms)"
  exit 1
fi

# Check reliability SLA (≥99%)
reliability=$(jq '.metrics.http_req_failed.values.rate' stripe-latency-results.json)
reliability_pct=$(echo "scale=2; (1 - $reliability) * 100" | bc)
if (( $(echo "$reliability_pct >= 99" | bc -l) )); then
  echo "✅ Reliability SLA met (≥99%)"
else
  echo "❌ Reliability SLA NOT met (<99%)"
  exit 1
fi
```

**Expected Output**: ✅ Latency SLA met, ✅ Reliability SLA met

**Failure Recovery**: If SLAs not met, recurse to Stage 10 (architecture review) or Stage 19 (performance tuning)

## Post-Execution Tasks

### Archive Test Results

```bash
# Archive all test results to database
node scripts/archive-integration-results.js \
  --integration-tests integration-test-results.json \
  --performance-tests stripe-latency-results.json \
  --venture-id VENTURE-001

# Expected: Test results stored in database (stage_19_metrics table)
```

### Generate Summary Report

```bash
# Generate Stage 19 summary report
node scripts/generate-stage-19-report.js \
  --venture-id VENTURE-001 \
  --output /mnt/c/_EHG/EHG_Engineer/docs/stage-19-summary.md

# Report includes:
# - Integration success rate: 95%
# - API reliability: 99.5%
# - Latency p95: 680ms
# - All exit gates: PASSED ✅
```

### Update Venture Status

```bash
# Mark Stage 19 complete in database
node scripts/update-venture-status.js \
  --venture-id VENTURE-001 \
  --stage 19 \
  --status completed

# Expected: Venture status updated, Stage 20 unblocked
```

## Error Recovery Procedures

### Error 1: Integration Test Failures (success rate <90%)

**Symptom**: Integration tests fail (API errors, authentication failures)

**Diagnosis**:
1. Check error logs (`integration-test-results.json`)
2. Identify failing API (Stripe? Auth0? OpenAI?)
3. Check API credentials (correct test key?)
4. Check API endpoint (correct base URL?)

**Recovery**:
- If transient error (network timeout): Retry tests
- If credential error (invalid API key): Update credentials, retry
- If integration code error (wrong API call): Recurse to Stage 14 (fix code)

### Error 2: Performance SLA Violations (latency p95 ≥1000ms)

**Symptom**: Load tests show high latency

**Diagnosis**:
1. Check k6 results (`stripe-latency-results.json`)
2. Identify slow API (Stripe? Auth0? OpenAI?)
3. Check API server status (provider outage?)

**Recovery**:
- If transient slowdown (API provider issue): Wait 1 hour, retry
- If systematic slowdown (always slow): Recurse to Stage 10 (add caching layer)
- If network latency (distant API server): Use CDN, API gateway with caching

### Error 3: Circuit Breaker Not Activating

**Symptom**: Circuit breaker does not open after consecutive failures

**Diagnosis**:
1. Check circuit breaker configuration (`config/circuit-breakers.js`)
2. Verify error threshold (50% errors required to open?)
3. Test with simulated failures (`node tests/circuit-breaker-test.js`)

**Recovery**:
- If configuration error (wrong threshold): Lower threshold (e.g., 30%), retry
- If circuit breaker not installed: Install Opossum library, implement circuit breaker
- If circuit breaker bypassed (code not using CircuitBreaker wrapper): Fix code, wrap API calls

## Automation Script Reference

**IntegrationVerificationCrew Invocation** (for automated execution):
```bash
# Run Stage 19 fully automated (2-4 hours)
node scripts/run-stage-19-automated.js \
  --venture-id VENTURE-001 \
  --integrations /mnt/c/_EHG/EHG_Engineer/docs/integrations.md \
  --test-accounts aws-secrets-manager \
  --output /mnt/c/_EHG/EHG_Engineer/docs/stage-19-results/

# Expected: All substages executed, exit gates validated, results archived
```

**IntegrationVerificationCrew Agents**:
1. **APITester**: Generates and runs integration tests (Substage 19.1)
2. **PerformanceAnalyzer**: Runs load tests, measures latency/throughput (Substage 19.2)
3. **FallbackConfigurator**: Generates circuit breaker code, configures monitoring (Substage 19.3)
4. **IntegrationReporter**: Aggregates results, generates summary report

**Evidence**: See `06_agent-orchestration.md` for detailed agent specifications

---

**Execution Checklist Summary**:
- ✅ Entry gates validated (integrations identified, APIs documented)
- ✅ Substage 19.1 completed (APIs tested, data flows verified, error handling confirmed)
- ✅ Substage 19.2 completed (latency measured, throughput tested, limits documented)
- ✅ Substage 19.3 completed (fallbacks implemented, circuit breakers set, monitoring configured)
- ✅ Exit gates validated (integrations verified, fallbacks configured, SLAs met)
- ✅ Test results archived, summary report generated, venture status updated

**Stage 19 Execution Status**: COMPLETE ✅

<!-- Generated by Claude Code Phase 8 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
