# LEO Protocol Validation Tools


## Metadata
- **Category**: Deployment
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, testing, e2e, migration

**Last Updated**: 2026-01-19
**Related SD**: SD-LEARN-011
**Status**: Active

## Overview

This document describes validation tools for the LEO Protocol that ensure workflow integrity and artifact chronology.

---

## Bypass Detection Validator

**Purpose**: Detect when artifacts are created retroactively (out of chronological order) to prevent circumvention of the intended workflow order.

**Location**: `scripts/modules/bypass-detection-validator.js`

### How It Works

The bypass detection validator checks that artifacts are created AFTER their prerequisite steps complete, with a 60-second clock skew tolerance.

**Prerequisite Relationships**:
- **Retrospective** requires EXEC-TO-PLAN handoff accepted first
- **EXEC-TO-PLAN handoff** requires PLAN-TO-EXEC accepted first
- **PLAN-TO-LEAD handoff** requires EXEC-TO-PLAN accepted first
- **LEAD-FINAL-APPROVAL** requires PLAN-TO-LEAD accepted first
- **PRD** requires LEAD-TO-PLAN accepted first

### Running Bypass Detection

**CLI Usage**:
```bash
# Validate recent SDs (last 7 days)
npm run validate:bypass

# Validate all SDs
npm run validate:bypass:all

# Validate specific SD
node scripts/modules/bypass-detection-validator.js --sd=SD-XXX-001
```

### Output

The validator generates two files in `.leo-validation/`:
1. `bypass-detection-report.json` - Machine-readable findings
2. `bypass-detection-summary.md` - Human-readable summary

**Report Structure**:
```json
{
  "timestamp": "2026-01-19T...",
  "duration_ms": 1234,
  "sds_validated": 50,
  "findings_count": 2,
  "pass": false,
  "findings": [
    {
      "sd_id": "sd-123",
      "artifact_type": "retrospective",
      "artifact_id": "retro-456",
      "artifact_timestamp": "2026-01-19T10:00:00Z",
      "expected_min_timestamp": "2026-01-19T10:05:00Z",
      "prerequisite_type": "EXEC-TO-PLAN",
      "prerequisite_timestamp": "2026-01-19T10:06:00Z",
      "time_delta_seconds": -360,
      "failure_category": "bypass"
    }
  ]
}
```

### CI Integration

**GitHub Actions Workflow**: `.github/workflows/leo-bypass-validation.yml`

**Triggers**:
- Pull requests to `main` or `develop` branches
- Pushes to `main` branch
- Manual workflow dispatch

**Behavior**:
- Runs bypass detection on recent SDs
- Uploads JSON report and Markdown summary as artifacts
- Comments on PR if findings detected
- Fails the workflow if bypass attempts found

**Required Status Check**: Add `bypass-validation-result` to branch protection rules to enforce.

---

## SD Type Sync Verification

**Purpose**: Ensure that SD types in validation profiles match the database constraint and code.

**Location**: `scripts/verify-sd-type-sync.js`

### How It Works

Verifies synchronization between three sources:
1. **Database constraint** (`sd_type_check` on `strategic_directives_v2`)
2. **Validation profiles** (`sd_type_validation_profiles` table)
3. **Code** (`scripts/modules/sd-type-checker.js`)

### Running Sync Verification

```bash
npm run validate:sd-type-sync
```

### Output

```
Type               | Constraint | Profiles | Code
-------------------|------------|----------|------
feature            | ✅         | ✅       | ✅
infrastructure     | ✅         | ✅       | ✅
qa                 | ✅         | ✅       | ⚠️
testing            | ✅         | ✅       | ✅
...
```

**Exit Codes**:
- `0` - All types synchronized
- `1` - Drift detected (types missing from constraint)
- `2` - Verification failed (database error)

### CI Integration

This check can be added to CI to prevent deployment when SD types are out of sync:

```yaml
- name: Verify SD Type Sync
  run: npm run validate:sd-type-sync
```

---

## Test Coverage Metrics (Retrospectives)

**Purpose**: Track test coverage changes for testing/QA SDs to measure quality improvements.

**Migration**: `database/migrations/20260119_add_coverage_metrics_to_retrospectives.sql`

### New Columns

| Column | Type | Description |
|--------|------|-------------|
| `coverage_tool` | VARCHAR(50) | Tool used (vitest, istanbul, c8, nyc, etc.) |
| `coverage_pre_percent` | DECIMAL(5,2) | Coverage % before SD |
| `coverage_post_percent` | DECIMAL(5,2) | Coverage % after SD |
| `coverage_delta_percent` | DECIMAL(5,2) | Change (post - pre) |

### Validation

For `sd_type IN ('testing', 'qa')`:
- `coverage_pre_percent` is **REQUIRED**
- `coverage_post_percent` is **REQUIRED**
- `coverage_delta_percent` is **AUTO-COMPUTED** if not provided
- `coverage_tool` triggers a warning if missing

### Usage

**Query coverage summary**:
```sql
SELECT * FROM get_sd_coverage_summary('SD-XXX-001');
```

**Example output**:
```json
{
  "sd_id": "SD-XXX-001",
  "sd_type": "qa",
  "requires_coverage_metrics": true,
  "coverage": {
    "tool": "vitest",
    "pre_percent": 72.10,
    "post_percent": 75.55,
    "delta_percent": 3.45,
    "improved": true
  }
}
```

---

## Validation Audit Log

**Purpose**: Centralized logging for all validation failures (bypass detection, coverage validation, gate failures).

**Migration**: `database/migrations/20260119_validation_audit_log.sql`

### Table Structure

```sql
validation_audit_log (
  id UUID PRIMARY KEY,
  correlation_id VARCHAR(100),     -- Groups related events
  sd_id VARCHAR(100),
  sd_type VARCHAR(50),
  validator_name VARCHAR(100),     -- e.g., 'bypass_detection'
  failure_reason TEXT,
  artifact_id VARCHAR(255),
  failure_category VARCHAR(50),    -- 'bypass', 'missing_coverage', etc.
  metadata JSONB,
  execution_context VARCHAR(50),   -- 'cli', 'ci', 'server'
  created_at TIMESTAMPTZ
)
```

### Functions

**Log an event**:
```sql
SELECT log_validation_event(
  'SD-XXX-001',                    -- sd_id
  'qa',                            -- sd_type
  'bypass_detection',              -- validator_name
  'Artifact created before prereq', -- failure_reason
  'bypass',                        -- failure_category
  'retro-456',                     -- artifact_id
  '{"time_delta": -360}'::jsonb,   -- metadata
  'bypass-detection-123',          -- correlation_id
  'ci'                             -- execution_context
);
```

**Query failures**:
```sql
-- Last 7 days
SELECT * FROM get_validation_failure_summary(7);

-- Last 30 days, specific validator
SELECT * FROM get_validation_failure_summary(30, 'bypass_detection');
```

### Metrics View

```sql
SELECT * FROM validation_failure_metrics
WHERE validator_name = 'bypass_detection'
ORDER BY failure_date DESC;
```

---

## QA SD Type Support

**Purpose**: First-class support for Quality Assurance SDs focused on test review, cleanup, and coverage improvements.

**Migration**: `database/migrations/20260119_qa_validation_profile_coverage.sql`

### QA Validation Profile

| Setting | Value |
|---------|-------|
| **requires_prd** | true |
| **requires_deliverables** | false |
| **requires_e2e_tests** | false |
| **requires_retrospective** | true (with coverage metrics) |
| **requires_sub_agents** | false |
| **min_handoffs** | 2 |

### Required Handoffs

1. LEAD-TO-PLAN
2. PLAN-TO-EXEC
3. PLAN-TO-LEAD
4. LEAD-FINAL-APPROVAL

*Note*: EXEC-TO-PLAN is optional for QA SDs

### Coverage Requirement

QA SDs **MUST** include coverage metrics in their retrospective:
- `coverage_tool`
- `coverage_pre_percent`
- `coverage_post_percent`
- `coverage_delta_percent` (auto-computed)

---

## Database Constraint Synchronization

**Function**: `verify_sd_type_sync()` (SQL)

**Purpose**: Database-level verification that validation profiles and constraints are in sync.

```sql
SELECT * FROM verify_sd_type_sync() ORDER BY profile_type;
```

**Output**:
| profile_type | in_profiles | in_constraint | status |
|--------------|-------------|---------------|--------|
| feature | true | true | ✅ SYNCED |
| qa | true | true | ✅ SYNCED |
| testing | true | true | ✅ SYNCED |

---

## Troubleshooting

### Bypass Detection False Positives

If you see bypass detection failures for legitimate workflow:
1. Check system clocks (60-second tolerance)
2. Verify prerequisite handoffs are properly recorded
3. Check `sd_phase_handoffs` table for `accepted_at` timestamps

### Coverage Metrics Not Required

If coverage metrics aren't being enforced:
1. Verify `sd_type` is exactly `'testing'` or `'qa'` (case-sensitive)
2. Check `sd_type_validation_profiles` for correct profile
3. Run migration: `20260119_add_coverage_metrics_to_retrospectives.sql`

### SD Type Not Accepted

If database rejects an SD type:
1. Run `npm run validate:sd-type-sync` to check drift
2. Add type to `20260119_qa_validation_profile_coverage.sql` migration
3. Run migration to update constraint
4. Verify with `SELECT * FROM verify_sd_type_sync()`

---

## Related Documentation

- [LEO Protocol Documentation](../../CLAUDE.md)
- [Handoff System](../leo/handoffs/handoff-system-guide.md)
- [Database Migrations](../database/migrations/MIGRATION_SUCCESS_REPORT.md)
- [CI/CD Workflows](../../.github/workflows/)

---

*Generated for SD-LEARN-011*
