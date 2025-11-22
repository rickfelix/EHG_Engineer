# Database Validation Tools

**Created**: 2025-11-15
**Status**: ACTIVE
**Purpose**: Comprehensive database health monitoring and validation toolkit

---

## Overview

Three-tier toolkit for maintaining EHG_Engineer database quality:

1. **Quick Dashboard** - Lightweight health check (15 seconds)
2. **Comprehensive Validation** - Deep scan with categorized findings (60 seconds)
3. **Fix Generator** - Automated SQL fix script creation (30 seconds)

---

## Tool 1: Database Health Dashboard

**Script**: `scripts/database-health-dashboard.js`

**Purpose**: Quick overview of database health metrics

**Usage**:
```bash
node scripts/database-health-dashboard.js
```

**Output**:
- Strategic Directives summary (count, status breakdown, phase distribution)
- PRDs summary (count, status breakdown, orphaned count)
- User Stories summary (count, status breakdown, test coverage warnings)
- Phase Handoffs summary (count, type distribution)
- Health indicators (errors and warnings)
- Overall health score (0-100)

**When to Use**:
- Daily health check
- Before starting new SD work
- After bulk operations
- Quick validation before deployments

**Example Output**:
```
════════════════════════════════════════════════════════════════════════════════
                    DATABASE HEALTH DASHBOARD
════════════════════════════════════════════════════════════════════════════════
Generated: 2025-11-15 10:30:00
════════════════════════════════════════════════════════════════════════════════

📋 STRATEGIC DIRECTIVES
────────────────────────────────────────────────────────────────────────────────
   Total: 45
   By Status:
     draft          : 10
     active         : 15
     completed      : 20
   By Phase:
     LEAD           : 5
     PLAN           : 8
     EXEC           : 12

📄 PRODUCT REQUIREMENTS
────────────────────────────────────────────────────────────────────────────────
   Total: 38
   By Status:
     draft          : 5
     approved       : 20
     completed      : 13

🏥 HEALTH INDICATORS
────────────────────────────────────────────────────────────────────────────────
   ✅ All checks passed - database is healthy!

   📊 Health Score: 100/100
```

---

## Tool 2: Comprehensive Database Validation

**Script**: `scripts/comprehensive-database-validation.js`

**Purpose**: Deep validation scan with categorized findings and actionable fix paths

**Usage**:
```bash
node scripts/comprehensive-database-validation.js
```

**Validation Categories**:

### 1. Strategic Directives Validation
- Missing required fields (title, description)
- Invalid status values
- Invalid priority values
- Status/Phase mismatches
- Timestamp anomalies (future dates, created_at > updated_at)
- Missing metadata (complexity, user_story_count)
- Inconsistent SD-ID format (should be SD-XXX-001)

### 2. Product Requirements Validation
- Missing parent SD references (orphaned PRDs)
- Missing required fields (title, description)
- Invalid status values
- Approved PRDs without user stories
- Missing objectives (non-draft PRDs)
- Missing acceptance criteria (approved PRDs)

### 3. Handoff Validation
- Orphaned handoffs (SD deleted)
- Incomplete handoffs (missing summary)
- Missing context health reporting
- Invalid handoff types

### 4. User Story Validation
- Orphaned stories (PRD deleted/missing)
- Missing acceptance criteria
- Implemented stories without test coverage
- Invalid status values

### 5. Schema Compliance
- Duplicate SD-IDs
- Duplicate PRD-IDs
- Foreign key constraint violations (logical)

### 6. Data Quality
- Placeholder text detection (TODO, PLACEHOLDER, TBD, FIXME)
- Stale records (>30 days in transitional state)
- Empty JSONB fields that should have data

**Output Categories**:

| Severity | Description | Weight | Example |
|----------|-------------|--------|---------|
| **CRITICAL** | Blocks operations, data corruption risk | 10x | Duplicate IDs, invalid foreign keys |
| **HIGH** | Impacts functionality, inconsistent state | 5x | Orphaned records, missing test coverage |
| **MEDIUM** | Quality issues, best practice violations | 2x | Missing metadata, placeholder text |
| **LOW** | Minor inconsistencies, cosmetic | 1x | Inconsistent naming, missing context health |

**Fix Effort Estimates**:

| Effort | Duration | Description | Example |
|--------|----------|-------------|---------|
| **QUICK** | 5min | Simple UPDATE/INSERT | Fix invalid status values |
| **FAST** | 15min | Multiple updates or script | Generate missing titles |
| **MODERATE** | 30min | Complex updates, data investigation | Link orphaned PRDs to SDs |
| **LONG** | 1hr+ | Requires analysis, migration, bulk ops | Create user stories for approved PRDs |

**Example Output**:
```
═══════════════════════════════════════════════════════════════════════════════
                 DATABASE VALIDATION REPORT
═══════════════════════════════════════════════════════════════════════════════
Generated: 2025-11-15T10:30:00.000Z
Database: https://dedlbzhpgkmetvhbkyzq.supabase.co
═══════════════════════════════════════════════════════════════════════════════

📊 OVERALL DATA HEALTH SCORE: 85/100
   Status: GOOD ⚠️ (Minor issues to address)

📋 ISSUE SUMMARY:
   🔴 CRITICAL: 0
   🟠 HIGH:     3
   🟡 MEDIUM:   5
   🟢 LOW:      2
   ━━━━━━━━━━━━━━━━━━━━
   📊 TOTAL:    10

⚡ QUICK WINS (High-impact, 5-min fixes): 2

────────────────────────────────────────────────────────────────────────────────
HIGH ISSUES (3)
────────────────────────────────────────────────────────────────────────────────

1. PRD: Approved Without User Stories
   Description: PRDs in APPROVED status but no user stories created
   Affected Records: 3
   Fix Effort: 1hr+
   Fix Path: Generate user stories via stories sub-agent or revert to in_review
   Impact: Cannot implement without user stories, violates workflow
   Sample IDs: PRD-EXPORT-001, PRD-AUTH-002, PRD-SETTINGS-003

2. User Story: Missing Test Coverage
   Description: Stories marked IMPLEMENTED without test coverage data
   Affected Records: 2
   Fix Effort: 1hr+
   Fix Path: Create E2E tests or revert status to in_progress
   Impact: Violates testing-first mandate, no verification of implementation
   Sample IDs: US-001, US-002
```

**Health Score Calculation**:
```
Health Score = 100 - (CRITICAL × 10 + HIGH × 5 + MEDIUM × 2 + LOW × 1)
Max Penalty = 100 (floor at 0)

Example:
  0 CRITICAL × 10 = 0
  3 HIGH     × 5  = 15
  5 MEDIUM   × 2  = 10
  2 LOW      × 1  = 2
  ──────────────────
  Total Penalty   = 27
  Health Score    = 100 - 27 = 73/100 (FAIR)
```

**When to Use**:
- Weekly database audit
- Before major releases
- After bulk data operations
- When dashboard shows warnings
- After database migrations

---

## Tool 3: Fix Script Generator

**Script**: `scripts/generate-database-fixes.js`

**Purpose**: Generate SQL migration scripts to fix validation issues

**Usage**:
```bash
# Generate specific fix category
node scripts/generate-database-fixes.js <category>

# Generate all fix scripts
node scripts/generate-database-fixes.js all
```

**Available Categories**:

| Category | Description | Example Fixes |
|----------|-------------|---------------|
| `invalid-status` | Fix invalid status values | Normalize status to valid enum values |
| `timestamps` | Fix timestamp anomalies | Set future dates to NOW(), fix created > updated |
| `orphaned` | Clean up orphaned records | Delete handoffs/stories for missing parents |
| `invalid-priority` | Fix invalid priority values | Normalize priority to valid enum values |
| `missing-fields` | Set defaults for missing fields | Generate titles from sd_id/prd_id |
| `all` | Generate all fix scripts | Creates separate file for each category |

**Output**:
- SQL migration file saved to `migrations/fixes/`
- Timestamped filename (e.g., `2025-11-15T10-30-00_fix_invalid_status.sql`)
- Preview of SQL in console
- Execution instructions

**Example Output**:
```bash
$ node scripts/generate-database-fixes.js invalid-status

🔧 Generating invalid status fixes...

✅ Fix script generated: migrations/fixes/2025-11-15T10-30-00_fix_invalid_status.sql

Preview:
────────────────────────────────────────────────────────────────────────────────
-- Fix Invalid Status Values
-- Generated: 2025-11-15T10:30:00.000Z

-- Strategic Directives: Normalize invalid statuses to draft
UPDATE strategic_directives_v2
SET status = 'draft'
WHERE status NOT IN ('draft', 'active', 'in_progress', 'on_hold', 'completed', 'archived', 'cancelled');

-- Product Requirements: Normalize invalid statuses to draft
UPDATE product_requirements_v2
SET status = 'draft'
WHERE status NOT IN ('draft', 'in_review', 'approved', 'active', 'completed', 'archived');
────────────────────────────────────────────────────────────────────────────────

⚠️  REVIEW BEFORE EXECUTING!

To execute:
  1. Review the SQL carefully
  2. Execute via Supabase Dashboard SQL Editor
  3. Or use: psql -f migrations/fixes/2025-11-15T10-30-00_fix_invalid_status.sql
```

**When to Use**:
- After comprehensive validation identifies issues
- Before bulk fixing common issues
- To automate repetitive manual fixes
- To document fix strategy

---

## Workflow Integration

### Daily Routine
```bash
# Morning health check
node scripts/database-health-dashboard.js
```

### Weekly Audit
```bash
# Comprehensive scan
node scripts/comprehensive-database-validation.js

# If issues found, generate fixes
node scripts/generate-database-fixes.js all

# Review and execute SQL via Supabase Dashboard
```

### Before Major Changes
```bash
# Baseline health check
node scripts/database-health-dashboard.js

# Make changes...

# Post-change validation
node scripts/comprehensive-database-validation.js
```

### After Bulk Operations
```bash
# Validate data integrity
node scripts/comprehensive-database-validation.js

# Fix any issues
node scripts/generate-database-fixes.js <category>
```

---

## Automation Opportunities

### CI/CD Integration
```yaml
# .github/workflows/database-validation.yml
name: Database Validation

on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6 AM

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: npm install
      - name: Run validation
        run: node scripts/comprehensive-database-validation.js
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: validation-results
          path: validation-report.txt
```

### Pre-commit Hook
```bash
#!/bin/bash
# .husky/pre-commit

# Quick health check before commit
node scripts/database-health-dashboard.js

if [ $? -ne 0 ]; then
  echo "❌ Database health check failed"
  exit 1
fi
```

---

## Metrics & Thresholds

### Health Score Interpretation

| Score Range | Status | Action Required |
|-------------|--------|-----------------|
| 90-100 | EXCELLENT ✅ | None, maintain current quality |
| 75-89 | GOOD ⚠️ | Address minor issues when convenient |
| 50-74 | FAIR ⚠️ | Schedule fix sprint, prioritize HIGH issues |
| 0-49 | POOR ❌ | Immediate action required, block new work |

### Quick Win Criteria

A fix is a "Quick Win" if:
- **Severity**: CRITICAL or HIGH
- **Effort**: QUICK (≤5 minutes)
- **Impact**: High-value improvement

**Priority Order**:
1. CRITICAL Quick Wins (immediate)
2. HIGH Quick Wins (same day)
3. CRITICAL Fast/Moderate (within 24 hours)
4. HIGH Fast/Moderate (within week)
5. MEDIUM issues (backlog)
6. LOW issues (opportunistic)

---

## Troubleshooting

### Issue: Script hangs or times out
**Cause**: Large dataset, slow network
**Solution**: Run validation during off-peak hours, increase timeout

### Issue: Permission errors
**Cause**: Using ANON_KEY for operations requiring elevated privileges
**Solution**: Some fixes require Supabase Dashboard execution (SERVICE_ROLE level)

### Issue: False positives in validation
**Cause**: Legitimate edge cases not accounted for
**Solution**: Update validation logic in `comprehensive-database-validation.js`

### Issue: Fix script doesn't resolve issue
**Cause**: Complex data dependency
**Solution**: Manual investigation required, document pattern for future

---

## Extension Points

### Adding New Validation Rules

```javascript
// In comprehensive-database-validation.js

async function validateCustomRule() {
  console.log('\n🔍 Validating custom rule...');

  const { data } = await supabase
    .from('your_table')
    .select('id, field1, field2');

  const issues = data.filter(record => {
    // Your validation logic
    return someCondition;
  });

  if (issues.length > 0) {
    addIssue(
      SEVERITY.HIGH,
      'Category: Rule Name',
      'Description of issue',
      issues.map(i => i.id),
      EFFORT.MODERATE,
      'How to fix this issue',
      'Impact of this issue'
    );
  }

  console.log(`   ✅ Custom rule validation complete`);
}

// Add to main()
async function main() {
  // ... existing validations
  await validateCustomRule();
  // ...
}
```

### Adding New Fix Generators

```javascript
// In generate-database-fixes.js

async function generateCustomFix() {
  console.log('🔧 Generating custom fix...\n');

  const sql = [];
  sql.push('-- Fix Custom Issue');
  sql.push('-- Generated: ' + new Date().toISOString());
  sql.push('');

  // Your SQL generation logic
  sql.push('UPDATE your_table');
  sql.push('SET field = value');
  sql.push('WHERE condition;');

  return sql.join('\n');
}

// Add to main() switch statement
case 'custom':
  sqlContent = await generateCustomFix();
  filename = `${timestamp}_fix_custom.sql`;
  break;
```

---

## Best Practices

### Before Running Validation
1. Ensure no active migrations are running
2. Check database isn't under heavy load
3. Verify environment variables are correct

### After Validation
1. Review CRITICAL issues immediately
2. Prioritize Quick Wins
3. Document patterns for future prevention
4. Update validation rules if new patterns emerge

### Fix Script Execution
1. **ALWAYS** review SQL before execution
2. Test on staging/development first (if available)
3. Back up data for destructive operations (DELETE)
4. Execute during low-traffic periods
5. Verify fix with post-execution validation

### Continuous Improvement
1. Track issue recurrence (same issue appearing weekly)
2. Add preventive constraints to schema
3. Automate common fixes
4. Update documentation with lessons learned

---

## Related Documentation

- **Database Agent Patterns**: `docs/reference/database-agent-patterns.md`
- **Schema Documentation**: `docs/reference/schema/engineer/database-schema-overview.md`
- **LEO Protocol**: `CLAUDE_CORE.md`, `CLAUDE_PLAN.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-15 | Initial toolkit creation (dashboard, validation, fix generator) |

---

**REMEMBER**: Validation is proactive maintenance, not reactive firefighting. Regular health checks prevent data quality issues from accumulating.

> "An ounce of validation is worth a pound of debugging." - Database Engineering Proverb
