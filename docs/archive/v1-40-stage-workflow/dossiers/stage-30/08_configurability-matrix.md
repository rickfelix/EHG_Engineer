---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 30: Configurability Matrix


## Table of Contents

- [Tunable Parameters](#tunable-parameters)
- [Category 1: Deployment Thresholds](#category-1-deployment-thresholds)
  - [Parameter: `deployment.timeout`](#parameter-deploymenttimeout)
  - [Parameter: `deployment.healthCheckRetries`](#parameter-deploymenthealthcheckretries)
  - [Parameter: `deployment.backupVerificationTimeout`](#parameter-deploymentbackupverificationtimeout)
- [Category 2: Rollback Thresholds](#category-2-rollback-thresholds)
  - [Parameter: `rollback.errorRateThreshold`](#parameter-rollbackerrorratethreshold)
  - [Parameter: `rollback.responseTimeThreshold`](#parameter-rollbackresponsetimethreshold)
  - [Parameter: `rollback.rollbackTimeout`](#parameter-rollbackrollbacktimeout)
- [Category 3: Traffic Management](#category-3-traffic-management)
  - [Parameter: `traffic.canaryStages`](#parameter-trafficcanarystages)
  - [Parameter: `traffic.canaryMonitoringDuration`](#parameter-trafficcanarymonitoringduration)
- [Category 4: Chairman Approval](#category-4-chairman-approval)
  - [Parameter: `chairman.approvalRequired`](#parameter-chairmanapprovalrequired)
  - [Parameter: `chairman.approvalTimeout`](#parameter-chairmanapprovaltimeout)
- [Category 5: Monitoring & Alerting](#category-5-monitoring-alerting)
  - [Parameter: `monitoring.alertChannels`](#parameter-monitoringalertchannels)
  - [Parameter: `monitoring.metricsSamplingInterval`](#parameter-monitoringmetricssamplinginterval)
- [Category 6: Smoke Tests](#category-6-smoke-tests)
  - [Parameter: `smokeTests.timeout`](#parameter-smoketeststimeout)
  - [Parameter: `smokeTests.criticalFlowsOnly`](#parameter-smoketestscriticalflowsonly)
- [Configuration File Structure](#configuration-file-structure)
- [Environment Variables (.env Template)](#environment-variables-env-template)
- [Parameter Override Scenarios](#parameter-override-scenarios)
  - [Scenario 1: Emergency Deployment (Bypass Chairman Approval)](#scenario-1-emergency-deployment-bypass-chairman-approval)
  - [Scenario 2: Conservative Deployment (Lower Error Rate Threshold)](#scenario-2-conservative-deployment-lower-error-rate-threshold)
  - [Scenario 3: Fast Smoke Tests (Critical Flows Only)](#scenario-3-fast-smoke-tests-critical-flows-only)
- [Sources Table](#sources-table)

## Tunable Parameters

**Purpose**: Define configurable thresholds and settings for production deployment automation

**Status**: ⚠️ PROPOSED (no current implementation)

---

## Category 1: Deployment Thresholds

### Parameter: `deployment.timeout`
**Description**: Maximum deployment duration before automatic abortion

**Default Value**: 120 minutes
**Range**: 30-300 minutes
**Unit**: minutes

**Rationale**: Prevents hung deployments from blocking CI/CD pipeline

**Implementation**:
```javascript
// config/deployment.js
module.exports = {
  deployment: {
    timeout: process.env.DEPLOYMENT_TIMEOUT || 120, // minutes
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Section 1-4 "Estimated Duration: 60-120 minutes"

---

### Parameter: `deployment.healthCheckRetries`
**Description**: Number of health check retry attempts before failure

**Default Value**: 3 retries
**Range**: 1-10 retries
**Unit**: count

**Rationale**: Handles transient network issues without false-positive failures

**Implementation**:
```javascript
// config/deployment.js
module.exports = {
  deployment: {
    healthCheckRetries: process.env.HEALTH_CHECK_RETRIES || 3,
    healthCheckInterval: 10, // seconds between retries
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1362 "Health checks passed"

---

### Parameter: `deployment.backupVerificationTimeout`
**Description**: Maximum time to verify backup integrity before deployment

**Default Value**: 30 minutes
**Range**: 10-60 minutes
**Unit**: minutes

**Rationale**: Large database backups require extended verification time

**Implementation**:
```javascript
// config/deployment.js
module.exports = {
  deployment: {
    backupVerificationTimeout: process.env.BACKUP_VERIFY_TIMEOUT || 30, // minutes
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1364 "Backups created"

---

## Category 2: Rollback Thresholds

### Parameter: `rollback.errorRateThreshold`
**Description**: Error rate percentage triggering automated rollback

**Default Value**: 5%
**Range**: 1-10%
**Unit**: percentage

**Rationale**: Balances false-positive rollbacks vs production failure exposure

**Implementation**:
```javascript
// config/rollback.js
module.exports = {
  rollback: {
    errorRateThreshold: process.env.ERROR_RATE_THRESHOLD || 5, // percentage
    errorRateDuration: 120, // seconds (2 minutes) to sustain before rollback
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Step 2.2 "If error rates spike >5% → EXECUTE ROLLBACK"

---

### Parameter: `rollback.responseTimeThreshold`
**Description**: p95 response time (ms) triggering automated rollback

**Default Value**: 500ms
**Range**: 200-2000ms
**Unit**: milliseconds

**Rationale**: Maintains performance SLA during deployment

**Implementation**:
```javascript
// config/rollback.js
module.exports = {
  rollback: {
    responseTimeThreshold: process.env.RESPONSE_TIME_THRESHOLD || 500, // ms p95
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Step 2.2 "Response times within SLA (<500ms p95)"

---

### Parameter: `rollback.rollbackTimeout`
**Description**: Maximum time to execute rollback before escalation

**Default Value**: 5 minutes
**Range**: 1-10 minutes
**Unit**: minutes

**Rationale**: Fast rollback critical to minimize downtime

**Implementation**:
```javascript
// config/rollback.js
module.exports = {
  rollback: {
    rollbackTimeout: process.env.ROLLBACK_TIMEOUT || 5, // minutes
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1349 "Rollback time" (metric)

---

## Category 3: Traffic Management

### Parameter: `traffic.canaryStages`
**Description**: Canary deployment stages (% green environment traffic)

**Default Value**: [10, 50, 100]
**Range**: Array of integers 1-100
**Unit**: percentage

**Rationale**: Gradual traffic cutover reduces blast radius of deployment failures

**Implementation**:
```javascript
// config/traffic.js
module.exports = {
  traffic: {
    canaryStages: process.env.CANARY_STAGES?.split(',').map(Number) || [10, 50, 100],
    canaryInterval: 300, // seconds (5 minutes) between stages
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Step 2.2 "Route 10% → 50% → 100%"

---

### Parameter: `traffic.canaryMonitoringDuration`
**Description**: Monitoring duration (seconds) at each canary stage before progression

**Default Value**: 300 seconds (5 minutes)
**Range**: 60-900 seconds
**Unit**: seconds

**Rationale**: Sufficient time to detect error rate spikes before increasing traffic

**Implementation**:
```javascript
// config/traffic.js
module.exports = {
  traffic: {
    canaryMonitoringDuration: process.env.CANARY_MONITORING_DURATION || 300, // seconds
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Step 2.2 "Monitor for 5 minutes"

---

## Category 4: Chairman Approval

### Parameter: `chairman.approvalRequired`
**Description**: Flag to require Chairman approval before deployment (CRITICAL)

**Default Value**: `true`
**Range**: `true | false`
**Unit**: boolean

**Rationale**: Chairman gate ensures executive oversight for production deployments

**Implementation**:
```javascript
// config/chairman.js
module.exports = {
  chairman: {
    approvalRequired: process.env.CHAIRMAN_APPROVAL_REQUIRED === 'true', // default true
    approvalTimeout: 24 * 60, // minutes (24 hours) before deployment request expires
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1353 "Chairman approval received"

**Warning**: Setting to `false` bypasses Chairman gate — USE ONLY IN EMERGENCIES

---

### Parameter: `chairman.approvalTimeout`
**Description**: Maximum time to wait for Chairman approval before deployment request expires

**Default Value**: 1440 minutes (24 hours)
**Range**: 60-10080 minutes (1 hour - 1 week)
**Unit**: minutes

**Rationale**: Prevents stale deployment requests from executing

**Implementation**:
```javascript
// config/chairman.js
module.exports = {
  chairman: {
    approvalTimeout: process.env.CHAIRMAN_APPROVAL_TIMEOUT || 1440, // minutes (24 hours)
  },
};
```

---

## Category 5: Monitoring & Alerting

### Parameter: `monitoring.alertChannels`
**Description**: Notification channels for deployment alerts

**Default Value**: `['slack', 'email']`
**Range**: Array of `['slack', 'email', 'pagerduty', 'sms']`
**Unit**: array of strings

**Rationale**: Multi-channel alerting ensures Chairman notification redundancy

**Implementation**:
```javascript
// config/monitoring.js
module.exports = {
  monitoring: {
    alertChannels: process.env.ALERT_CHANNELS?.split(',') || ['slack', 'email'],
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    emailRecipients: process.env.EMAIL_RECIPIENTS?.split(',') || ['chairman@ehg.com'],
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1356 "Monitoring active"

---

### Parameter: `monitoring.metricsSamplingInterval`
**Description**: Sampling interval (seconds) for deployment metrics collection

**Default Value**: 10 seconds
**Range**: 1-60 seconds
**Unit**: seconds

**Rationale**: High-frequency sampling detects error rate spikes quickly

**Implementation**:
```javascript
// config/monitoring.js
module.exports = {
  monitoring: {
    metricsSamplingInterval: process.env.METRICS_SAMPLING_INTERVAL || 10, // seconds
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/07_recursion-blueprint.md:DEPLOY-002 "Real-time error rate monitoring"

---

## Category 6: Smoke Tests

### Parameter: `smokeTests.timeout`
**Description**: Maximum time to execute smoke test suite before failure

**Default Value**: 30 minutes
**Range**: 5-60 minutes
**Unit**: minutes

**Rationale**: Prevents hung smoke tests from blocking deployment verification

**Implementation**:
```javascript
// config/smokeTests.js
module.exports = {
  smokeTests: {
    timeout: process.env.SMOKE_TESTS_TIMEOUT || 30, // minutes
    retries: 1, // number of retries on test failure
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1374 "Smoke tests passed"

---

### Parameter: `smokeTests.criticalFlowsOnly`
**Description**: Flag to run only critical user flows (faster validation)

**Default Value**: `false`
**Range**: `true | false`
**Unit**: boolean

**Rationale**: Critical-only tests reduce verification time during emergency deployments

**Implementation**:
```javascript
// config/smokeTests.js
module.exports = {
  smokeTests: {
    criticalFlowsOnly: process.env.CRITICAL_FLOWS_ONLY === 'true', // default false (full suite)
  },
};
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-30/05_professional-sop.md:Step 4.1 "Execute comprehensive smoke test suite"

---

## Configuration File Structure

**Proposed File**: `config/deployment.config.js`

```javascript
// config/deployment.config.js
module.exports = {
  deployment: {
    timeout: process.env.DEPLOYMENT_TIMEOUT || 120, // minutes
    healthCheckRetries: process.env.HEALTH_CHECK_RETRIES || 3,
    backupVerificationTimeout: process.env.BACKUP_VERIFY_TIMEOUT || 30, // minutes
  },
  rollback: {
    errorRateThreshold: process.env.ERROR_RATE_THRESHOLD || 5, // percentage
    responseTimeThreshold: process.env.RESPONSE_TIME_THRESHOLD || 500, // ms p95
    rollbackTimeout: process.env.ROLLBACK_TIMEOUT || 5, // minutes
  },
  traffic: {
    canaryStages: process.env.CANARY_STAGES?.split(',').map(Number) || [10, 50, 100],
    canaryInterval: process.env.CANARY_INTERVAL || 300, // seconds (5 minutes)
    canaryMonitoringDuration: process.env.CANARY_MONITORING_DURATION || 300, // seconds
  },
  chairman: {
    approvalRequired: process.env.CHAIRMAN_APPROVAL_REQUIRED !== 'false', // default true
    approvalTimeout: process.env.CHAIRMAN_APPROVAL_TIMEOUT || 1440, // minutes (24 hours)
  },
  monitoring: {
    alertChannels: process.env.ALERT_CHANNELS?.split(',') || ['slack', 'email'],
    metricsSamplingInterval: process.env.METRICS_SAMPLING_INTERVAL || 10, // seconds
  },
  smokeTests: {
    timeout: process.env.SMOKE_TESTS_TIMEOUT || 30, // minutes
    criticalFlowsOnly: process.env.CRITICAL_FLOWS_ONLY === 'true', // default false
  },
};
```

---

## Environment Variables (.env Template)

```bash
# Deployment Thresholds
DEPLOYMENT_TIMEOUT=120
HEALTH_CHECK_RETRIES=3
BACKUP_VERIFY_TIMEOUT=30

# Rollback Thresholds
ERROR_RATE_THRESHOLD=5
RESPONSE_TIME_THRESHOLD=500
ROLLBACK_TIMEOUT=5

# Traffic Management
CANARY_STAGES=10,50,100
CANARY_INTERVAL=300
CANARY_MONITORING_DURATION=300

# Chairman Approval
CHAIRMAN_APPROVAL_REQUIRED=true
CHAIRMAN_APPROVAL_TIMEOUT=1440

# Monitoring & Alerting
ALERT_CHANNELS=slack,email
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
EMAIL_RECIPIENTS=chairman@ehg.com,cto@ehg.com
METRICS_SAMPLING_INTERVAL=10

# Smoke Tests
SMOKE_TESTS_TIMEOUT=30
CRITICAL_FLOWS_ONLY=false
```

---

## Parameter Override Scenarios

### Scenario 1: Emergency Deployment (Bypass Chairman Approval)
**Use Case**: Critical hotfix requires immediate deployment

**Override**:
```bash
CHAIRMAN_APPROVAL_REQUIRED=false npm run deploy:production
```

**Risk**: High (no executive oversight)
**Justification**: Chairman unavailable, production outage ongoing

---

### Scenario 2: Conservative Deployment (Lower Error Rate Threshold)
**Use Case**: High-risk deployment requires extra caution

**Override**:
```bash
ERROR_RATE_THRESHOLD=1 CANARY_MONITORING_DURATION=600 npm run deploy:production
```

**Effect**: Rollback triggered at 1% error rate (vs 5% default), monitor for 10 minutes per canary stage (vs 5 minutes default)

---

### Scenario 3: Fast Smoke Tests (Critical Flows Only)
**Use Case**: Time-sensitive deployment, skip full test suite

**Override**:
```bash
CRITICAL_FLOWS_ONLY=true SMOKE_TESTS_TIMEOUT=10 npm run deploy:production
```

**Effect**: Run only critical user flows (authentication, CRUD), reduce timeout to 10 minutes

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| Deployment duration | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-30/05_professional-sop.md | Section 1-4 | Timeout parameter |
| Rollback threshold | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-30/05_professional-sop.md | Step 2.2 | Error rate threshold |
| Canary stages | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-30/05_professional-sop.md | Step 2.2 | Traffic management |
| Chairman approval | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1353 | Approval flag |
| Smoke tests | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1374 | Test timeout |

---

**Next**: See `09_metrics-monitoring.md` for deployment KPIs and dashboards.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
