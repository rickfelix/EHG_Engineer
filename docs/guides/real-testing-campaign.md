# Real Testing Campaign Guide


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, testing, e2e, unit

## Overview

This campaign executes **actual Vitest unit tests and Playwright E2E tests** for all completed Strategic Directives, replacing the previous placeholder testing with real validation.

## What's Different from Previous Campaign?

| Aspect | Previous (Fake) | New (Real) |
|--------|-----------------|------------|
| **Tests Executed** | 0 (hardcoded PASS) | 2,000+ actual tests |
| **Pass Rate** | 99.9% (placeholder) | TBD (real results) |
| **Coverage Data** | None | Real coverage % from Vitest |
| **Validation** | Theater | Actual code quality |
| **Runtime** | ~2 hours | 6-10 hours (5 min avg per SD) |
| **Value** | Compliance tracking | Real QA |

## Prerequisites

### 1. Database Schema Enhancement (REQUIRED)

Before launching, apply the database migration:

```bash
# Check current schema
node scripts/apply-testing-schema-enhancement.cjs

# If columns don't exist, apply manually:
# 1. Open: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql
# 2. Copy SQL from: database/schema/enhance_sd_testing_status.sql
# 3. Paste and execute
```

### 2. Test Infrastructure Verification

Ensure test suites are available:

```bash
# From EHG directory (../ehg from EHG_Engineer)

# Verify unit tests
npm run test:unit -- --run

# Verify E2E tests
npm run test:e2e -- --list
```

## Launch Campaign

### Option 1: Fully Autonomous (Recommended)

Run in background for hours without intervention:

```bash
# From EHG_Engineer root directory

# Launch campaign in background
nohup node scripts/batch-test-completed-sds-real.cjs > /tmp/real-testing-output.log 2>&1 &

# Note the process ID
echo $! > /tmp/batch-test-pid.txt
```

### Option 2: Monitored Execution

Run with live monitoring in separate terminal:

```bash
# Terminal 1: Launch campaign (from EHG_Engineer root)
node scripts/batch-test-completed-sds-real.cjs

# Terminal 2: Monitor progress
node scripts/monitor-real-batch-testing.cjs
```

### Option 3: Test Single SD First

Validate setup before batch:

```bash
# Test one SD to verify everything works
node scripts/qa-engineering-director-enhanced.js SD-RECONNECT-001 --skip-build
```

## Monitoring Progress

### Real-Time Dashboard

```bash
# Default: Refresh every 5 minutes
node scripts/monitor-real-batch-testing.cjs

# Custom refresh interval (seconds)
node scripts/monitor-real-batch-testing.cjs 60  # Every 1 minute
```

Shows:
- Total progress (X/117 SDs tested)
- Pass/fail/error rates
- Average coverage %
- Estimated completion time
- Recent failures
- Recent activity log

### Log Files

```bash
# Progress log
tail -f /tmp/batch-test-progress.log

# Error log
tail -f /tmp/batch-test-errors.log

# Full output (if using nohup)
tail -f /tmp/real-testing-output.log
```

### Database Queries

```sql
-- Overall statistics
SELECT
  COUNT(*) as total_tested,
  AVG(test_pass_rate) as avg_pass_rate,
  AVG(coverage_percentage) as avg_coverage,
  SUM(test_count) as total_tests
FROM sd_testing_status
WHERE tested = true;

-- Recent results
SELECT
  sd_id,
  test_pass_rate,
  coverage_percentage,
  test_duration_seconds,
  testing_notes
FROM sd_testing_status
WHERE tested = true
ORDER BY last_tested_at DESC
LIMIT 10;

-- Failures
SELECT
  sd_id,
  test_pass_rate,
  unit_tests_failed,
  e2e_tests_failed,
  testing_notes
FROM sd_testing_status
WHERE test_pass_rate < 100
ORDER BY test_pass_rate ASC;
```

## Expected Runtime

### Timeline Estimates

- **117 SDs × 5 min avg = ~10 hours**
- Best case: 6 hours (fast tests)
- Worst case: 12 hours (slow E2E tests)

### Recommended Schedule

Run overnight or during off-hours:
- Start: 6 PM
- Complete: 4-6 AM next day

## Error Recovery

### Automatic Retry

The script automatically retries once on:
- Timeout errors
- Network connection errors (ECONNREFUSED)

### Manual Intervention

If campaign stalls (no progress for 30 min):

```bash
# Check if process is running
cat /tmp/batch-test-pid.txt
ps aux | grep [PID]

# Check recent logs
tail -20 /tmp/batch-test-progress.log
tail -20 /tmp/batch-test-errors.log

# If stuck, restart from failed SD
# (Campaign tracks progress in database, won't re-test passed SDs)
```

### Skip Problematic SDs

If specific SD consistently fails:

```sql
-- Manually mark as tested (skip)
UPDATE sd_testing_status
SET tested = true,
    testing_notes = 'Skipped due to infrastructure issues'
WHERE sd_id = 'SD-PROBLEMATIC-001';
```

## Post-Campaign Analysis

### Generate Final Report

```bash
node scripts/generate-real-testing-report.cjs
```

### Key Metrics to Review

1. **Overall Pass Rate**
   - Target: ≥85% (realistic for first run)
   - Action if <85%: Review common failures

2. **Coverage Percentage**
   - Target: ≥50% average
   - Action if <50%: Identify untested areas

3. **E2E Pass Rate**
   - Target: ≥90% (E2E should be more stable)
   - Action if <90%: Fix flaky tests

4. **Common Failure Patterns**
   - Group by error message
   - Prioritize by impact

### Compare to Fake Results

Previous campaign claimed:
- 99.9% pass rate (fake)
- 0 real tests executed

Real campaign will show:
- Actual pass rate (likely 70-90%)
- 2,000+ real tests
- Real quality assessment

## Troubleshooting

### Build Failures

```bash
# Rebuild EHG app (from EHG directory)
cd ../ehg
npm run build
```

### Test Timeouts

Increase timeout in `batch-test-completed-sds-real.cjs`:

```javascript
timeout: 3600000, // Change to 7200000 for 2 hours
```

### Database Connection Issues

```bash
# Verify credentials
node -e "
require('dotenv').config();
console.log('URL:', process.env.SUPABASE_URL);
console.log('Key:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
"
```

### Disk Space

Campaign generates logs - ensure sufficient space:

```bash
df -h /tmp
# Should have >1GB free
```

## Files Created

### Scripts
- `scripts/batch-test-completed-sds-real.cjs` - Main campaign script
- `scripts/monitor-real-batch-testing.cjs` - Progress monitor
- `scripts/apply-testing-schema-enhancement.cjs` - Database migration
- `scripts/modules/qa/test-output-parser.js` - Test result parser

### Database
- `database/schema/enhance_sd_testing_status.sql` - Schema migration
- New columns in `sd_testing_status` table

### Logs
- `/tmp/batch-test-progress.log` - Progress tracking
- `/tmp/batch-test-errors.log` - Error log
- `/tmp/real-testing-output.log` - Full output (if using nohup)

## Success Criteria

✅ All 117 completed SDs tested with real tests
✅ Database contains actual pass/fail counts
✅ Coverage data captured for each SD
✅ Honest quality assessment available
✅ Process runs autonomously without intervention
✅ Final report shows real testing metrics

## Next Steps After Campaign

1. **Review Failures**: Triage failed tests by priority
2. **Fix Critical Issues**: Address blockers first
3. **Improve Coverage**: Add tests for uncovered areas
4. **Automate Testing**: Integrate into CI/CD pipeline
5. **Update Documentation**: Document real quality baseline

---

**Campaign Status**: Ready to launch
**Last Updated**: 2025-10-05
**Estimated Runtime**: 6-10 hours
**Expected Completion**: Real quality data for all completed SDs
