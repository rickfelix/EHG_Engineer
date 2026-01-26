# AEGIS CLI Guide

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-24
- **Tags**: aegis, cli, governance, command-line, tools
- **SD**: SD-AEGIS-GOVERNANCE-001
- **Related Docs**:
  - [AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)
  - [AEGIS API Documentation](../02_api/aegis-endpoints.md)
  - [AEGIS Integration Guide](../guides/aegis-integration-guide.md)

## Overview

The AEGIS CLI (`scripts/governance.js`) provides a command-line interface for governance rule management, validation, and violation tracking. It's useful for debugging, monitoring, and automated workflows.

**Script Location**: `scripts/governance.js`

**Prerequisites**:
- Node.js 18+
- Supabase credentials in `.env`
- Database with AEGIS schema migrated

## Table of Contents

- [Installation & Setup](#installation-setup)
- [Command Summary](#command-summary)
- [Command Reference](#command-reference)
  - [constitutions](#constitutions-list-all-constitutions)
  - [list](#list-list-governance-rules)
  - [validate](#validate-validate-context)
  - [violations](#violations-list-violations)
  - [stats](#stats-compliance-statistics)
- [Common Workflows](#common-workflows)
- [Scripting & Automation](#scripting-automation)
- [Troubleshooting](#troubleshooting)

## Installation & Setup

### 1. Verify Installation

```bash
# Check if governance CLI is available
node scripts/governance.js help
```

**Expected Output**:

```
AEGIS Governance CLI

Commands:
  list          List governance rules
  validate      Validate context against rules
  violations    List violations
  stats         Show compliance statistics
  constitutions List all constitutions

Options:
  --constitution=CODE  Filter by constitution (PROTOCOL, FOUR_OATHS, etc.)
  --severity=LEVEL     Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
  --category=CAT       Filter by category
  --status=STATUS      Filter violations by status (open, acknowledged, etc.)
  --limit=N            Limit results
  --period=DAYS        Stats period in days
  --context=JSON       JSON context for validation

Examples:
  npm run governance list --constitution=PROTOCOL
  npm run governance validate --context='{"risk_tier":"GOVERNED","auto_applicable":true}'
  npm run governance violations --status=open --limit=5
  npm run governance stats --period=7
```

### 2. Configure Environment

Ensure `.env` has Supabase credentials:

```bash
# .env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# OR
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Verify Database Connection

```bash
# List constitutions (tests database connection)
node scripts/governance.js constitutions
```

**Expected Output**:

```
=== AEGIS Constitutions ===

code              | name                      | domain            | enforcement_mode | is_active | version
------------------|---------------------------|-------------------|------------------|-----------|--------
PROTOCOL          | Protocol Constitution     | self_improvement  | enforced         | true      | 1.0.0
FOUR_OATHS        | Four Oaths                | agent_behavior    | enforced         | true      | 1.0.0
DOCTRINE          | Doctrine of Constraint    | system_state      | enforced         | true      | 1.0.0
HARD_HALT         | Hard Halt Protocol        | system_state      | enforced         | true      | 1.0.0
MANIFESTO_MODE    | Manifesto Mode            | system_state      | enforced         | true      | 1.0.0
CREW_GOVERNANCE   | Crew Governance           | execution         | enforced         | true      | 1.0.0
COMPLIANCE        | Compliance Policies       | compliance        | enforced         | true      | 1.0.0

Total: 7 constitutions
```

## Command Summary

| Command | Purpose | Example |
|---------|---------|---------|
| `constitutions` | List all governance frameworks | `node scripts/governance.js constitutions` |
| `list` | List rules with filters | `node scripts/governance.js list --constitution=PROTOCOL` |
| `validate` | Validate context against rules | `node scripts/governance.js validate --context='{...}'` |
| `violations` | List violations with filters | `node scripts/governance.js violations --status=open` |
| `stats` | Show compliance statistics | `node scripts/governance.js stats --period=7` |
| `help` | Show usage information | `node scripts/governance.js help` |

## Command Reference

### constitutions - List all constitutions

**Purpose**: Display all governance frameworks with metadata.

**Usage**:

```bash
node scripts/governance.js constitutions
```

**No Options**

**Output**: Table of all constitutions with columns:
- `code` - Constitution identifier
- `name` - Human-readable name
- `domain` - Governance domain
- `enforcement_mode` - `enforced`, `audit_only`, or `disabled`
- `is_active` - Active status
- `version` - Version number

**Example**:

```bash
node scripts/governance.js constitutions
```

**Output**:

```
=== AEGIS Constitutions ===

code            | name                      | domain            | enforcement_mode | is_active | version
----------------|---------------------------|-------------------|------------------|-----------|--------
PROTOCOL        | Protocol Constitution     | self_improvement  | enforced         | true      | 1.0.0
DOCTRINE        | Doctrine of Constraint    | system_state      | enforced         | true      | 1.0.0
...

Total: 7 constitutions
```

---

### list - List governance rules

**Purpose**: Display rules with optional filters.

**Usage**:

```bash
node scripts/governance.js list [OPTIONS]
```

**Options**:

| Option | Type | Description |
|--------|------|-------------|
| `--constitution=CODE` | string | Filter by constitution (e.g., PROTOCOL) |
| `--severity=LEVEL` | string | Filter by severity (CRITICAL, HIGH, MEDIUM, LOW) |
| `--category=CAT` | string | Filter by category (safety, governance, audit, etc.) |

**Output**: Table of rules with columns:
- `constitution_code` - Parent constitution
- `rule_code` - Rule identifier
- `rule_name` - Rule name
- `severity` - Severity level
- `enforcement_action` - Action on violation

**Examples**:

**List all rules**:

```bash
node scripts/governance.js list
```

**List PROTOCOL rules**:

```bash
node scripts/governance.js list --constitution=PROTOCOL
```

**Output**:

```
=== AEGIS Rules ===

constitution_code | rule_code | rule_name                      | severity | enforcement_action
------------------|-----------|--------------------------------|----------|--------------------
PROTOCOL          | CONST-001 | Human Approval Required        | CRITICAL | BLOCK
PROTOCOL          | CONST-002 | No Self-Approval               | CRITICAL | BLOCK
PROTOCOL          | CONST-003 | Audit Trail                    | HIGH     | BLOCK
PROTOCOL          | CONST-004 | Rollback Capability            | HIGH     | BLOCK
PROTOCOL          | CONST-005 | Database First                 | HIGH     | BLOCK
PROTOCOL          | CONST-006 | Complexity Conservation        | MEDIUM   | WARN_AND_LOG
PROTOCOL          | CONST-007 | Velocity Limit                 | CRITICAL | BLOCK
PROTOCOL          | CONST-008 | Chesterton's Fence             | MEDIUM   | WARN_AND_LOG
PROTOCOL          | CONST-009 | Emergency Freeze               | CRITICAL | BLOCK

Total: 9 rules
```

**List all CRITICAL rules**:

```bash
node scripts/governance.js list --severity=CRITICAL
```

**List safety rules**:

```bash
node scripts/governance.js list --category=safety
```

---

### validate - Validate context

**Purpose**: Validate an operation context against governance rules.

**Usage**:

```bash
node scripts/governance.js validate --context='JSON' [OPTIONS]
```

**Options**:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--context=JSON` | JSON string | Yes | Operation context to validate |
| `--constitution=CODE` | string | No | Validate against specific constitution (default: all) |

**Output**:
- Validation result (PASSED or FAILED)
- Rules checked count
- Violation count
- Warning count
- Detailed violation messages

**Examples**:

**Validate GOVERNED tier auto-apply (should fail)**:

```bash
node scripts/governance.js validate --context='{"risk_tier":"GOVERNED","auto_applicable":true}'
```

**Output**:

```
=== AEGIS Validation ===

Context:
{
  "risk_tier": "GOVERNED",
  "auto_applicable": true
}

Result: FAILED
Rules checked: 9
Violations: 1
Warnings: 0

Violations:
  [CRITICAL] CONST-001: GOVERNED tier improvements cannot be auto-applied
```

**Validate EXEC creating SD (should fail)**:

```bash
node scripts/governance.js validate \
  --context='{"actor_role":"EXEC","target_table":"strategic_directives_v2","operation_type":"INSERT"}' \
  --constitution=DOCTRINE
```

**Output**:

```
=== AEGIS Validation ===

Context:
{
  "actor_role": "EXEC",
  "target_table": "strategic_directives_v2",
  "operation_type": "INSERT"
}

Result: FAILED
Rules checked: 4
Violations: 1
Warnings: 0

Violations:
  [CRITICAL] DOC-001: Role EXEC is forbidden from this operation
```

**Validate valid crew execution (should pass)**:

```bash
node scripts/governance.js validate \
  --context='{"venture_id":"uuid","prd_id":"uuid","budget_remaining":1000}' \
  --constitution=CREW_GOVERNANCE
```

**Output**:

```
=== AEGIS Validation ===

Context:
{
  "venture_id": "uuid",
  "prd_id": "uuid",
  "budget_remaining": 1000
}

Result: PASSED
Rules checked: 5
Violations: 0
Warnings: 0
```

**Complex validation**:

```bash
node scripts/governance.js validate \
  --context='{
    "risk_tier": "AUTO",
    "target_table": "protocol_improvement_queue",
    "target_operation": "INSERT",
    "actor": "system",
    "timestamp": "2026-01-24T10:00:00Z",
    "payload": {"size": 1000}
  }'
```

---

### violations - List violations

**Purpose**: Display violations with filters for audit and monitoring.

**Usage**:

```bash
node scripts/governance.js violations [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--status=STATUS` | string | `open` | Filter by status (open, acknowledged, overridden, remediated, false_positive) |
| `--severity=LEVEL` | string | - | Filter by severity |
| `--sd-key=KEY` | string | - | Filter by SD key |
| `--limit=N` | integer | 20 | Limit results (max: 500) |

**Output**: Table of violations with columns:
- `id` - Violation ID (truncated)
- `constitution` - Constitution code
- `rule` - Rule code
- `severity` - Severity level
- `status` - Current status
- `sd_key` - Related SD (if any)
- `created` - Creation date

**Examples**:

**List all open violations**:

```bash
node scripts/governance.js violations
```

**Output**:

```
=== AEGIS Violations ===

id        | constitution | rule     | severity | status | sd_key        | created
----------|--------------|----------|----------|--------|---------------|----------
a1b2c3... | DOCTRINE     | DOC-001  | CRITICAL | open   | SD-XXX-001    | 1/24/2026
d4e5f6... | CREW_GOVERNANCE | CREW-003 | CRITICAL | open   | -             | 1/23/2026

Showing 2 violations (limit: 20)
```

**List all CRITICAL violations (any status)**:

```bash
node scripts/governance.js violations --severity=CRITICAL --status=all --limit=50
```

**List violations for specific SD**:

```bash
node scripts/governance.js violations --sd-key=SD-AEGIS-GOVERNANCE-001
```

**List remediated violations (success stories)**:

```bash
node scripts/governance.js violations --status=remediated --limit=10
```

---

### stats - Compliance statistics

**Purpose**: Show compliance metrics and rule effectiveness.

**Usage**:

```bash
node scripts/governance.js stats [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--period=DAYS` | integer | 30 | Days to include in statistics |

**Output**:
- Constitution summary table
- Violations by severity
- Violations by status
- Total violations in period

**Examples**:

**Show last 30 days stats**:

```bash
node scripts/governance.js stats
```

**Output**:

```
=== AEGIS Statistics ===

Period: Last 30 days

Constitution Summary:
code            | enforcement_mode | active_rules | critical_rules | open_violations
----------------|------------------|--------------|----------------|----------------
PROTOCOL        | enforced         | 9            | 4              | 0
FOUR_OATHS      | enforced         | 9            | 5              | 0
DOCTRINE        | enforced         | 4            | 4              | 1
HARD_HALT       | enforced         | 4            | 3              | 0
MANIFESTO_MODE  | enforced         | 4            | 2              | 0
CREW_GOVERNANCE | enforced         | 5            | 2              | 0
COMPLIANCE      | enforced         | 6            | 2              | 0

Violations by Severity:
  CRITICAL: 3
  HIGH: 5
  MEDIUM: 4
  LOW: 3

Violations by Status:
  open: 1
  acknowledged: 3
  remediated: 8
  overridden: 2
  false_positive: 1

Total violations in period: 15
```

**Show last 7 days (weekly report)**:

```bash
node scripts/governance.js stats --period=7
```

**Show last 90 days (quarterly report)**:

```bash
node scripts/governance.js stats --period=90
```

---

## Common Workflows

### 1. Daily Monitoring Workflow

**Check for new violations every day**:

```bash
#!/bin/bash
# daily-aegis-check.sh

echo "=== Daily AEGIS Compliance Check ==="
echo "Date: $(date)"
echo ""

# Check open violations
echo "1. Checking open violations..."
node scripts/governance.js violations --status=open --limit=100

# Check stats
echo ""
echo "2. Last 24 hours statistics..."
node scripts/governance.js stats --period=1

# Alert on CRITICAL violations
CRITICAL_COUNT=$(node scripts/governance.js violations \
  --status=open \
  --severity=CRITICAL \
  --limit=1 | grep -c "CRITICAL")

if [ "$CRITICAL_COUNT" -gt 0 ]; then
  echo ""
  echo "⚠️  ALERT: $CRITICAL_COUNT CRITICAL violations require immediate attention!"
  exit 1
fi

echo ""
echo "✅ Compliance check complete"
exit 0
```

**Run daily via cron**:

```bash
# Add to crontab
0 9 * * * /path/to/daily-aegis-check.sh >> /var/log/aegis-daily.log 2>&1
```

### 2. Pre-Deployment Validation

**Validate changes before deploying**:

```bash
#!/bin/bash
# pre-deploy-validation.sh

echo "=== Pre-Deployment Validation ==="

# Validate common scenarios
SCENARIOS=(
  '{"risk_tier":"AUTO","target_table":"protocol_improvement_queue"}'
  '{"actor_role":"EXEC","target_table":"strategic_directives_v2","operation_type":"INSERT"}'
  '{"venture_id":"test","prd_id":"test","budget_remaining":1000}'
)

FAILED=0
for scenario in "${SCENARIOS[@]}"; do
  echo "Testing: $scenario"
  if ! node scripts/governance.js validate --context="$scenario" > /dev/null 2>&1; then
    echo "  ❌ FAILED"
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ PASSED"
  fi
done

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "⚠️  $FAILED scenarios failed validation!"
  exit 1
fi

echo ""
echo "✅ All scenarios passed"
exit 0
```

### 3. Weekly Compliance Report

**Generate weekly report**:

```bash
#!/bin/bash
# weekly-report.sh

OUTPUT="aegis-weekly-report-$(date +%Y%m%d).txt"

{
  echo "==================================="
  echo "AEGIS Weekly Compliance Report"
  echo "Date: $(date)"
  echo "Period: Last 7 days"
  echo "==================================="
  echo ""

  echo "--- Constitution Overview ---"
  node scripts/governance.js constitutions
  echo ""

  echo "--- Rule Statistics ---"
  node scripts/governance.js list | head -20
  echo ""

  echo "--- Violation Summary ---"
  node scripts/governance.js stats --period=7
  echo ""

  echo "--- Open Violations ---"
  node scripts/governance.js violations --status=open --limit=50
  echo ""

  echo "--- Recently Remediated ---"
  node scripts/governance.js violations --status=remediated --limit=10

} > "$OUTPUT"

echo "Report saved to: $OUTPUT"
cat "$OUTPUT"
```

### 4. Rule Effectiveness Analysis

**Analyze which rules are most/least effective**:

```bash
#!/bin/bash
# rule-effectiveness.sh

echo "=== Rule Effectiveness Analysis ==="
echo ""

# Get all rules
echo "Total rules by constitution:"
for const in PROTOCOL FOUR_OATHS DOCTRINE HARD_HALT MANIFESTO_MODE CREW_GOVERNANCE COMPLIANCE; do
  COUNT=$(node scripts/governance.js list --constitution="$const" 2>/dev/null | grep "Total:" | awk '{print $2}')
  echo "  $const: $COUNT"
done

echo ""
echo "Violations by constitution (last 30 days):"
node scripts/governance.js stats --period=30 | grep -A 20 "Constitution Summary"

echo ""
echo "Most triggered rules:"
# This would require enhanced CLI or database query
# For now, show violation counts
node scripts/governance.js violations --limit=100 | \
  awk '{print $4}' | sort | uniq -c | sort -rn | head -10
```

### 5. Testing New Rules

**Test a new rule before activating**:

```bash
#!/bin/bash
# test-new-rule.sh

RULE_CODE="TEST-001"

echo "=== Testing Rule: $RULE_CODE ==="

# Test cases that should PASS
PASS_CASES=(
  '{"field1":"value1","field2":"value2"}'
  '{"field1":"value1"}'
)

# Test cases that should FAIL
FAIL_CASES=(
  '{"field1":""}'
  '{}'
)

echo "Testing PASS cases..."
for case in "${PASS_CASES[@]}"; do
  if node scripts/governance.js validate --context="$case" | grep -q "PASSED"; then
    echo "  ✅ $case"
  else
    echo "  ❌ $case (expected PASS)"
  fi
done

echo ""
echo "Testing FAIL cases..."
for case in "${FAIL_CASES[@]}"; do
  if node scripts/governance.js validate --context="$case" | grep -q "FAILED"; then
    echo "  ✅ $case"
  else
    echo "  ❌ $case (expected FAIL)"
  fi
done
```

## Scripting & Automation

### Output Parsing

**Parse CLI output in scripts**:

```bash
# Count open violations
OPEN_COUNT=$(node scripts/governance.js violations --status=open | \
  grep "Showing" | awk '{print $2}')

echo "Open violations: $OPEN_COUNT"

# Extract specific field
CRITICAL_RULES=$(node scripts/governance.js list --severity=CRITICAL | \
  grep -E "^\w+" | wc -l)

echo "Critical rules: $CRITICAL_RULES"
```

### JSON Output (Future Enhancement)

**Proposed `--json` flag for machine-readable output**:

```bash
# Future feature
node scripts/governance.js violations --status=open --json | jq '.violations | length'
```

### CI/CD Integration

**GitHub Actions example**:

```yaml
# .github/workflows/aegis-compliance.yml
name: AEGIS Compliance Check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Check AEGIS compliance
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_KEY }}
        run: |
          # Check for open CRITICAL violations
          node scripts/governance.js violations \
            --status=open \
            --severity=CRITICAL \
            --limit=1 > violations.txt

          if grep -q "CRITICAL" violations.txt; then
            echo "❌ CRITICAL violations found!"
            cat violations.txt
            exit 1
          fi

          echo "✅ No CRITICAL violations"
```

## Troubleshooting

### Issue: "Supabase credentials not found"

**Error**:

```
Error: Supabase credentials not found in environment
```

**Solution**:

1. Check `.env` file exists in project root
2. Verify credentials are correct:

```bash
cat .env | grep SUPABASE
```

3. Ensure environment variables are loaded:

```bash
# Test connection
node -e "require('dotenv').config(); console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"
```

### Issue: "No data found"

**Error**:

```
No data found.
```

**Causes**:
- Database not migrated
- RLS policies blocking access
- No data in table

**Solution**:

```bash
# Check if tables exist
psql $DATABASE_URL -c "\dt aegis_*"

# Check row counts
psql $DATABASE_URL -c "SELECT 'constitutions' AS table, COUNT(*) FROM aegis_constitutions UNION ALL SELECT 'rules', COUNT(*) FROM aegis_rules UNION ALL SELECT 'violations', COUNT(*) FROM aegis_violations;"
```

### Issue: "Failed to fetch rules"

**Error**:

```
Error: Failed to fetch rules
message: relation "aegis_rules" does not exist
```

**Solution**:

Run AEGIS migrations:

```bash
# Run foundation migration
psql $DATABASE_URL < database/migrations/20260124_aegis_governance_foundation.sql

# Run phase 4 migration
psql $DATABASE_URL < database/migrations/20260124_aegis_phase4_rules.sql

# Run phase 5 migration
psql $DATABASE_URL < database/migrations/20260124_aegis_phase5_rules.sql

# Verify
node scripts/governance.js constitutions
```

### Issue: "Validation error"

**Error**:

```
Validation error: Invalid JSON in --context
```

**Solution**:

Ensure JSON is properly escaped:

```bash
# ❌ Wrong
node scripts/governance.js validate --context={"field":"value"}

# ✅ Correct (single quotes around JSON)
node scripts/governance.js validate --context='{"field":"value"}'

# ✅ Correct (escape double quotes)
node scripts/governance.js validate --context="{\"field\":\"value\"}"
```

### Issue: Performance

**Symptom**: CLI commands are slow (>5 seconds)

**Solutions**:

1. **Check database performance**:

```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM aegis_rules WHERE is_active = true;
```

2. **Rebuild indexes**:

```sql
REINDEX TABLE aegis_rules;
REINDEX TABLE aegis_violations;
```

3. **Clear cache** (restart Node process)

4. **Reduce result set**:

```bash
# Use --limit
node scripts/governance.js violations --limit=10
```

## Related Documentation

- **[AEGIS Architecture Overview](../01_architecture/aegis-system-overview.md)** - System design and components
- **[AEGIS API Documentation](../02_api/aegis-endpoints.md)** - REST API alternative
- **[AEGIS Integration Guide](../guides/aegis-integration-guide.md)** - Integration patterns

## Version History

- **v1.0.0** (2026-01-24) - Initial CLI documentation for SD-AEGIS-GOVERNANCE-001
  - All commands documented
  - Usage examples for each command
  - Common workflows and automation patterns
  - Troubleshooting guide
