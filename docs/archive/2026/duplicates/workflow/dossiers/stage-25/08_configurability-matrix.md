---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Configuration Schema](#configuration-schema)
  - [Table: `stage_25_configuration`](#table-stage_25_configuration)
  - [Configuration Access Pattern](#configuration-access-pattern)
- [Tunable Parameters](#tunable-parameters)
  - [Category 1: Test Coverage Thresholds](#category-1-test-coverage-thresholds)
  - [Category 2: Defect Density Threshold](#category-2-defect-density-threshold)
  - [Category 3: Quality Score Threshold](#category-3-quality-score-threshold)
  - [Category 4: Quality Score Formula Weights](#category-4-quality-score-formula-weights)
  - [Category 5: Bug Severity Blocking Rules](#category-5-bug-severity-blocking-rules)
  - [Category 6: Test Execution Timeouts](#category-6-test-execution-timeouts)
  - [Category 7: Regression Test Scope](#category-7-regression-test-scope)
  - [Category 8: Test Parallelization](#category-8-test-parallelization)
  - [Category 9: Test Retry Logic](#category-9-test-retry-logic)
  - [Category 10: Sign-off Approvers](#category-10-sign-off-approvers)
- [Configuration Management](#configuration-management)
  - [Setting Configuration (CLI)](#setting-configuration-cli)
  - [Getting Configuration (SQL)](#getting-configuration-sql)
  - [Updating Configuration (API)](#updating-configuration-api)
- [Configuration Validation](#configuration-validation)
  - [Validation Rules](#validation-rules)
  - [Validation Query](#validation-query)
- [Configuration Presets](#configuration-presets)
  - [Preset 1: MVP (Fast Iteration)](#preset-1-mvp-fast-iteration)
  - [Preset 2: Production (High Quality)](#preset-2-production-high-quality)
  - [Preset 3: Regulatory (Strict Compliance)](#preset-3-regulatory-strict-compliance)
  - [Applying Presets](#applying-presets)
- [Configuration Audit Trail](#configuration-audit-trail)
  - [Table: `stage_25_configuration_history`](#table-stage_25_configuration_history)
- [Sources Table](#sources-table)

<!-- ARCHIVED: 2026-01-26T16:26:49.108Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-25\08_configurability-matrix.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 25: Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, e2e

## Overview

**Purpose**: Define tunable parameters for Stage 25 (Quality Assurance) to support venture-specific QA requirements.

**Configuration Levels**:
1. **Global Defaults**: Apply to all ventures (e.g., test coverage threshold ≥80%)
2. **Venture-Specific Overrides**: Customize for individual ventures (e.g., fintech venture requires 95% coverage for payment code)
3. **Runtime Adjustments**: Temporary changes during execution (e.g., lower threshold during MVP phase)

---

## Configuration Schema

### Table: `stage_25_configuration`

```sql
CREATE TABLE stage_25_configuration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venture_id UUID REFERENCES ventures(id), -- NULL = global default
    config_key TEXT NOT NULL,
    config_value JSONB NOT NULL,
    config_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_venture_config UNIQUE (venture_id, config_key)
);

-- Example rows:
-- venture_id=NULL, config_key='test_coverage_thresholds', config_value='{"unit": 80, "integration": 70, "e2e": 50}'
-- venture_id='VENTURE-001', config_key='test_coverage_thresholds', config_value='{"unit": 95, "integration": 85, "e2e": 60}' (fintech venture, higher standards)
```

### Configuration Access Pattern

```sql
-- Get configuration value (venture-specific if exists, otherwise global default)
SELECT COALESCE(
    (SELECT config_value FROM stage_25_configuration WHERE venture_id = 'VENTURE-001' AND config_key = 'test_coverage_thresholds'),
    (SELECT config_value FROM stage_25_configuration WHERE venture_id IS NULL AND config_key = 'test_coverage_thresholds')
) AS config_value;

-- Expected output: {"unit": 95, "integration": 85, "e2e": 60} (venture-specific)
-- If venture-specific config doesn't exist: {"unit": 80, "integration": 70, "e2e": 50} (global default)
```

---

## Tunable Parameters

### Category 1: Test Coverage Thresholds

**Parameter**: `test_coverage_thresholds`
**Type**: Object (`{unit: number, integration: number, e2e: number}`)
**Global Default**:
```json
{
  "unit": 80,
  "integration": 70,
  "e2e": 50
}
```

**Rationale**:
- **Unit**: 80% (industry standard for production code)
- **Integration**: 70% (API endpoints, database queries - harder to cover all edge cases)
- **E2E**: 50% (critical user flows only - expensive to maintain)

**Venture-Specific Examples**:

**Fintech Venture** (high risk, regulatory compliance):
```json
{
  "unit": 95,
  "integration": 85,
  "e2e": 70
}
```

**Internal Tool** (low risk, rapid iteration):
```json
{
  "unit": 60,
  "integration": 50,
  "e2e": 30
}
```

**Healthcare Venture** (HIPAA compliance, patient safety):
```json
{
  "unit": 98,
  "integration": 90,
  "e2e": 80
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1117 "- Test coverage"

---

### Category 2: Defect Density Threshold

**Parameter**: `defect_density_threshold`
**Type**: Number (bugs per 1000 lines of code)
**Global Default**: `5` (industry standard)

**Rationale**: <5 bugs per 1000 LOC indicates acceptable code quality (IEEE standard)

**Venture-Specific Examples**:

**Fintech Venture** (zero-tolerance for bugs):
```json
{
  "defect_density_threshold": 2
}
```

**Prototype/MVP** (speed over quality):
```json
{
  "defect_density_threshold": 10
}
```

**Healthcare Venture** (patient safety critical):
```json
{
  "defect_density_threshold": 1
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1118 "- Defect density"

---

### Category 3: Quality Score Threshold

**Parameter**: `quality_score_threshold`
**Type**: Number (0-100)
**Global Default**: `85`

**Rationale**: 85/100 = B+ grade (high quality, release-ready)

**Venture-Specific Examples**:

**MVP/Early Stage** (iterate fast):
```json
{
  "quality_score_threshold": 75
}
```

**Production/Mature** (high standards):
```json
{
  "quality_score_threshold": 90
}
```

**Regulatory/Compliance** (strict requirements):
```json
{
  "quality_score_threshold": 95
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1119 "- Quality score"

---

### Category 4: Quality Score Formula Weights

**Parameter**: `quality_score_weights`
**Type**: Object (`{test_coverage: number, defect_density: number, performance: number, ux: number}`)
**Global Default**:
```json
{
  "test_coverage": 0.4,
  "defect_density": 0.3,
  "performance": 0.2,
  "ux": 0.1
}
```

**Rationale**: Prioritize test coverage (40%) and defect density (30%), moderate weight on performance (20%), light weight on UX (10%)

**Venture-Specific Examples**:

**E-commerce Venture** (performance critical):
```json
{
  "test_coverage": 0.3,
  "defect_density": 0.2,
  "performance": 0.4,
  "ux": 0.1
}
```

**Consumer App** (UX critical):
```json
{
  "test_coverage": 0.3,
  "defect_density": 0.2,
  "performance": 0.2,
  "ux": 0.3
}
```

**Backend API** (reliability critical, no UX):
```json
{
  "test_coverage": 0.5,
  "defect_density": 0.4,
  "performance": 0.1,
  "ux": 0
}
```

**Note**: Sum of weights must equal 1.0 (100%)

---

### Category 5: Bug Severity Blocking Rules

**Parameter**: `bug_severity_blocking_rules`
**Type**: Object (`{P0: boolean, P1: boolean, P2: boolean, P3: boolean, P4: boolean}`)
**Global Default**:
```json
{
  "P0": true,
  "P1": true,
  "P2": false,
  "P3": false,
  "P4": false
}
```

**Interpretation**: P0/P1 bugs block release (exit gate fails), P2/P3/P4 bugs allowed (document known issues)

**Venture-Specific Examples**:

**MVP/Early Stage** (accept P2 bugs):
```json
{
  "P0": true,
  "P1": true,
  "P2": false,
  "P3": false,
  "P4": false
}
```

**Production/Mature** (zero P0/P1/P2 bugs):
```json
{
  "P0": true,
  "P1": true,
  "P2": true,
  "P3": false,
  "P4": false
}
```

**Critical System** (zero tolerance):
```json
{
  "P0": true,
  "P1": true,
  "P2": true,
  "P3": true,
  "P4": false
}
```

---

### Category 6: Test Execution Timeouts

**Parameter**: `test_execution_timeouts`
**Type**: Object (`{unit: number, integration: number, e2e: number}`) (in seconds)
**Global Default**:
```json
{
  "unit": 30,
  "integration": 120,
  "e2e": 300
}
```

**Rationale**: Unit tests fast (30s), integration tests moderate (2m), E2E tests slow (5m)

**Venture-Specific Examples**:

**Large Codebase** (many tests, longer timeouts):
```json
{
  "unit": 60,
  "integration": 300,
  "e2e": 600
}
```

**Small Codebase** (few tests, shorter timeouts):
```json
{
  "unit": 15,
  "integration": 60,
  "e2e": 180
}
```

---

### Category 7: Regression Test Scope

**Parameter**: `regression_test_scope`
**Type**: Enum (`full`, `smoke`, `affected-only`)
**Global Default**: `full`

**Options**:
- **`full`**: Run all tests (unit + integration + E2E) - most thorough, slowest
- **`smoke`**: Run critical tests only (P0 functionality) - faster, less coverage
- **`affected-only`**: Run tests for changed code only (git diff) - fastest, risk of missing regressions

**Venture-Specific Examples**:

**MVP/Early Stage** (fast iteration):
```json
{
  "regression_test_scope": "smoke"
}
```

**Production/Mature** (thorough testing):
```json
{
  "regression_test_scope": "full"
}
```

**Large Monorepo** (optimize CI time):
```json
{
  "regression_test_scope": "affected-only"
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1140 "- Regression tested"

---

### Category 8: Test Parallelization

**Parameter**: `test_parallelization`
**Type**: Object (`{enabled: boolean, max_workers: number}`)
**Global Default**:
```json
{
  "enabled": true,
  "max_workers": 4
}
```

**Rationale**: Run tests in parallel (4 workers) for faster execution

**Venture-Specific Examples**:

**CI/CD Server** (high CPU, many workers):
```json
{
  "enabled": true,
  "max_workers": 16
}
```

**Local Development** (laptop, few workers):
```json
{
  "enabled": true,
  "max_workers": 2
}
```

**Sequential Tests** (tests with shared state, no parallelization):
```json
{
  "enabled": false,
  "max_workers": 1
}
```

---

### Category 9: Test Retry Logic

**Parameter**: `test_retry_logic`
**Type**: Object (`{enabled: boolean, max_retries: number, retry_on: string[]}`)
**Global Default**:
```json
{
  "enabled": true,
  "max_retries": 3,
  "retry_on": ["timeout", "network-error", "flaky-test"]
}
```

**Rationale**: Retry flaky tests (up to 3 times) to reduce false positives

**Venture-Specific Examples**:

**Stable Tests** (no retries):
```json
{
  "enabled": false,
  "max_retries": 0,
  "retry_on": []
}
```

**Flaky E2E Tests** (aggressive retries):
```json
{
  "enabled": true,
  "max_retries": 5,
  "retry_on": ["timeout", "network-error", "flaky-test", "element-not-found"]
}
```

---

### Category 10: Sign-off Approvers

**Parameter**: `signoff_approvers`
**Type**: Array of strings (email addresses or role names)
**Global Default**:
```json
{
  "qa_lead": "qa-lead@example.com",
  "stakeholder": "chairman@example.com"
}
```

**Venture-Specific Examples**:

**Fintech Venture** (additional compliance officer):
```json
{
  "qa_lead": "qa-lead@example.com",
  "compliance_officer": "compliance@example.com",
  "stakeholder": "chairman@example.com"
}
```

**Internal Tool** (simplified approval):
```json
{
  "qa_lead": "qa-lead@example.com"
}
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1146 "- Sign-off received"

---

## Configuration Management

### Setting Configuration (CLI)

```bash
# Set global default
node scripts/set-stage-config.js \
  --stage 25 \
  --key test_coverage_thresholds \
  --value '{"unit": 80, "integration": 70, "e2e": 50}' \
  --global

# Set venture-specific override
node scripts/set-stage-config.js \
  --stage 25 \
  --venture-id VENTURE-001 \
  --key test_coverage_thresholds \
  --value '{"unit": 95, "integration": 85, "e2e": 60}'
```

### Getting Configuration (SQL)

```sql
-- Get venture-specific config (with fallback to global default)
SELECT get_stage_config('VENTURE-001', 25, 'test_coverage_thresholds') AS config_value;

-- Function definition:
CREATE OR REPLACE FUNCTION get_stage_config(
    p_venture_id UUID,
    p_stage_id INTEGER,
    p_config_key TEXT
) RETURNS JSONB AS $$
BEGIN
    RETURN COALESCE(
        (SELECT config_value FROM stage_25_configuration WHERE venture_id = p_venture_id AND config_key = p_config_key),
        (SELECT config_value FROM stage_25_configuration WHERE venture_id IS NULL AND config_key = p_config_key)
    );
END;
$$ LANGUAGE plpgsql;
```

### Updating Configuration (API)

```javascript
// Update configuration via API
POST /api/v1/stages/25/configuration
{
  "venture_id": "VENTURE-001",
  "config_key": "test_coverage_thresholds",
  "config_value": {"unit": 95, "integration": 85, "e2e": 60}
}

// Response:
{
  "success": true,
  "config_id": "c1a2b3c4-d5e6-f7g8-h9i0-j1k2l3m4n5o6",
  "message": "Configuration updated for VENTURE-001"
}
```

---

## Configuration Validation

### Validation Rules

1. **Test Coverage Thresholds**: 0 ≤ value ≤ 100 (percentage)
2. **Defect Density Threshold**: value ≥ 0 (bugs per 1000 LOC)
3. **Quality Score Threshold**: 0 ≤ value ≤ 100
4. **Quality Score Weights**: Sum of weights = 1.0 (100%)
5. **Test Execution Timeouts**: value > 0 (seconds)
6. **Max Workers**: value ≥ 1 (at least 1 worker)
7. **Max Retries**: 0 ≤ value ≤ 10 (prevent infinite loops)

### Validation Query

```sql
-- Validate configuration
SELECT config_key,
       config_value,
       CASE
           WHEN config_key = 'test_coverage_thresholds' THEN
               (config_value->>'unit')::INTEGER BETWEEN 0 AND 100 AND
               (config_value->>'integration')::INTEGER BETWEEN 0 AND 100 AND
               (config_value->>'e2e')::INTEGER BETWEEN 0 AND 100
           WHEN config_key = 'quality_score_weights' THEN
               ((config_value->>'test_coverage')::DECIMAL +
                (config_value->>'defect_density')::DECIMAL +
                (config_value->>'performance')::DECIMAL +
                (config_value->>'ux')::DECIMAL) = 1.0
           ELSE true
       END AS is_valid
FROM stage_25_configuration
WHERE venture_id = 'VENTURE-001';
```

---

## Configuration Presets

### Preset 1: MVP (Fast Iteration)

```json
{
  "test_coverage_thresholds": {"unit": 60, "integration": 50, "e2e": 30},
  "defect_density_threshold": 10,
  "quality_score_threshold": 75,
  "bug_severity_blocking_rules": {"P0": true, "P1": true, "P2": false, "P3": false, "P4": false},
  "regression_test_scope": "smoke"
}
```

### Preset 2: Production (High Quality)

```json
{
  "test_coverage_thresholds": {"unit": 85, "integration": 75, "e2e": 60},
  "defect_density_threshold": 3,
  "quality_score_threshold": 90,
  "bug_severity_blocking_rules": {"P0": true, "P1": true, "P2": true, "P3": false, "P4": false},
  "regression_test_scope": "full"
}
```

### Preset 3: Regulatory (Strict Compliance)

```json
{
  "test_coverage_thresholds": {"unit": 98, "integration": 90, "e2e": 80},
  "defect_density_threshold": 1,
  "quality_score_threshold": 95,
  "bug_severity_blocking_rules": {"P0": true, "P1": true, "P2": true, "P3": true, "P4": false},
  "regression_test_scope": "full"
}
```

### Applying Presets

```bash
# Apply preset to venture
node scripts/apply-stage-preset.js \
  --stage 25 \
  --venture-id VENTURE-001 \
  --preset production

# Output: Applied 'production' preset to VENTURE-001 (5 configs updated)
```

---

## Configuration Audit Trail

### Table: `stage_25_configuration_history`

```sql
CREATE TABLE stage_25_configuration_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venture_id UUID REFERENCES ventures(id),
    config_key TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB NOT NULL,
    changed_by TEXT NOT NULL, -- user email or agent ID
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    change_reason TEXT
);

-- Example: Track who changed test coverage threshold from 80% to 95% and why
INSERT INTO stage_25_configuration_history (venture_id, config_key, old_value, new_value, changed_by, change_reason)
VALUES ('VENTURE-001', 'test_coverage_thresholds', '{"unit": 80}', '{"unit": 95}', 'qa-lead@example.com', 'Fintech venture requires higher test coverage for regulatory compliance');
```

---

## Sources Table

| Claim | Repo | Commit | Path | Lines | Excerpt |
|-------|------|--------|------|-------|---------|
| Test coverage metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1117 | "- Test coverage" |
| Defect density metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1118 | "- Defect density" |
| Quality score metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1119 | "- Quality score" |
| Regression tested | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1140 | "- Regression tested" |
| Sign-off received | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1146 | "- Sign-off received" |

---

**Next**: See `09_metrics-monitoring.md` for KPIs and Supabase queries.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
