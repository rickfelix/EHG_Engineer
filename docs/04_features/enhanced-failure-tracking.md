# Enhanced Failure Tracking - Detailed Test Results

## Overview

The real testing campaign now captures **detailed failure information** for every failing test, providing actionable guidance for fixing issues.

## What Gets Stored

### In `sd_testing_status` Table

#### 1. Standard Test Metrics (Always Captured)
```javascript
{
  sd_id: 'SD-RECONNECT-011',
  tested: true,
  test_count: 63,
  tests_passed: 58,
  tests_failed: 5,
  test_pass_rate: 92.06,
  test_duration_seconds: 285,
  test_framework: 'qa-director-v2-real'
}
```

#### 2. Detailed Testing Notes (With Failures)
```javascript
testing_notes: `Real Testing: Unit (43/45), E2E (15/18), Coverage: 78.5%, Verdict: FAIL

FAILURES:
1. [vitest] src/components/Dashboard.test.tsx: Expected 'Welcome' to be in the document
2. [vitest] src/services/api.test.ts: NetworkError: Failed to fetch from /api/ventures
3. [playwright] tests/e2e/navigation.spec.ts › Navigate to settings: Timeout 30000ms exceeded waiting for selector "#settings-panel"
4. [playwright] tests/e2e/forms.spec.ts › Submit venture form: Expected "Success" but got "Error"
5. [playwright] tests/e2e/auth.spec.ts › Protected route redirect: Page did not redirect to /login`
```

#### 3. Structured Failure Data (JSONB Field)
```javascript
test_results: {
  failures: [
    {
      framework: 'vitest',
      test_file: 'src/components/Dashboard.test.tsx',
      error_message: "Expected 'Welcome' to be in the document"
    },
    {
      framework: 'vitest',
      test_file: 'src/services/api.test.ts',
      error_message: 'NetworkError: Failed to fetch from /api/ventures'
    },
    {
      framework: 'playwright',
      test_file: 'tests/e2e/navigation.spec.ts',
      test_name: 'Navigate to settings',
      error_message: 'Timeout 30000ms exceeded waiting for selector "#settings-panel"'
    },
    {
      framework: 'playwright',
      test_file: 'tests/e2e/forms.spec.ts',
      test_name: 'Submit venture form',
      error_message: 'Expected "Success" but got "Error"'
    },
    {
      framework: 'playwright',
      test_file: 'tests/e2e/auth.spec.ts',
      test_name: 'Protected route redirect',
      error_message: 'Page did not redirect to /login'
    }
  ]
}
```

## Query Examples

### Find All Failing SDs with Details
```sql
SELECT
  sd_id,
  test_pass_rate,
  tests_failed,
  testing_notes
FROM sd_testing_status
WHERE test_pass_rate < 100
ORDER BY test_pass_rate ASC;
```

### Get Structured Failure Data
```sql
SELECT
  sd_id,
  test_results->'failures' as failure_details
FROM sd_testing_status
WHERE test_results IS NOT NULL
  AND test_pass_rate < 100;
```

### Group Failures by Type
```sql
SELECT
  sd_id,
  jsonb_array_elements(test_results->'failures')->>'framework' as framework,
  jsonb_array_elements(test_results->'failures')->>'error_message' as error
FROM sd_testing_status
WHERE test_results IS NOT NULL;
```

### Find Common Error Patterns
```sql
SELECT
  jsonb_array_elements(test_results->'failures')->>'error_message' as error_pattern,
  COUNT(*) as occurrence_count
FROM sd_testing_status
WHERE test_results IS NOT NULL
GROUP BY error_pattern
ORDER BY occurrence_count DESC;
```

## Failure Information Captured

### For Vitest Unit Tests
- ✅ **Test file path** - Which test file failed
- ✅ **Error message** - Actual assertion error (first 200 chars)
- ✅ **Framework** - `vitest`

**Example**:
```
{
  framework: 'vitest',
  test_file: 'src/services/auth.test.ts',
  error_message: 'Expected token to be defined, but got undefined'
}
```

### For Playwright E2E Tests
- ✅ **Test file path** - Which E2E test spec failed
- ✅ **Test name** - Specific test case that failed
- ✅ **Error message** - Playwright error (timeout, selector not found, etc.)
- ✅ **Framework** - `playwright`

**Example**:
```
{
  framework: 'playwright',
  test_file: 'tests/e2e/dashboard.spec.ts',
  test_name: 'Load venture portfolio',
  error_message: 'Timeout 30000ms exceeded waiting for selector ".venture-card"'
}
```

## Use Cases

### 1. Prioritize Fixes by Frequency
```sql
-- Find most common test failures across all SDs
SELECT
  substring(
    jsonb_array_elements(test_results->'failures')->>'error_message',
    1, 50
  ) as error_snippet,
  COUNT(*) as sds_affected
FROM sd_testing_status
WHERE test_results IS NOT NULL
GROUP BY error_snippet
ORDER BY sds_affected DESC
LIMIT 10;
```

### 2. Identify Flaky E2E Tests
```sql
-- Find E2E tests that timeout frequently
SELECT
  jsonb_array_elements(test_results->'failures')->>'test_name' as test_name,
  COUNT(*) as timeout_count
FROM sd_testing_status
WHERE test_results->'failures' @> '[{"framework": "playwright"}]'::jsonb
  AND jsonb_array_elements(test_results->'failures')->>'error_message' LIKE '%Timeout%'
GROUP BY test_name
ORDER BY timeout_count DESC;
```

### 3. Generate Fix TODO List
```sql
-- Create actionable fix list for a specific SD
SELECT
  sd_id,
  (jsonb_array_elements(test_results->'failures')->>'framework')::text as framework,
  (jsonb_array_elements(test_results->'failures')->>'test_file')::text as file,
  (jsonb_array_elements(test_results->'failures')->>'error_message')::text as issue
FROM sd_testing_status
WHERE sd_id = 'SD-RECONNECT-011'
  AND test_results IS NOT NULL;
```

**Output**:
```
SD-RECONNECT-011
- [vitest] src/components/Analytics.test.tsx: Expected chart to render
- [playwright] tests/e2e/analytics.spec.ts: Chart data not loaded
```

### 4. Track Fix Progress
```sql
-- Compare test results over time for same SD
SELECT
  sd_id,
  last_tested_at,
  test_pass_rate,
  tests_failed,
  jsonb_array_length(test_results->'failures') as failure_count
FROM sd_testing_status
WHERE sd_id = 'SD-RECONNECT-011'
ORDER BY last_tested_at DESC;
```

## Benefits

### Before Enhancement
```
testing_notes: "Smoke (5/5) + E2E (15/15) passed"
```
❌ No failure details
❌ No actionable information
❌ Can't prioritize fixes

### After Enhancement
```
testing_notes: "Real Testing: Unit (43/45), E2E (15/18), Coverage: 78.5%, Verdict: FAIL

FAILURES:
1. [vitest] src/components/Dashboard.test.tsx: Expected 'Welcome' to be in the document
2. [playwright] tests/e2e/navigation.spec.ts › Navigate to settings: Timeout exceeded"

test_results: { failures: [ { framework: 'vitest', test_file: '...', error_message: '...' }, ... ] }
```
✅ Specific failing tests identified
✅ Error messages captured
✅ Can create targeted fixes
✅ Can track common patterns
✅ Structured data for analysis

## Real-World Example

**SD-RECONNECT-011** (Chairman Decision Analytics)
```javascript
{
  sd_id: 'SD-RECONNECT-011',
  test_pass_rate: 88.24,
  tests_failed: 4,
  testing_notes: `Real Testing: Unit (15/17), E2E (13/17), Coverage: 72.3%, Verdict: FAIL

FAILURES:
1. [vitest] src/components/DecisionHistoryTable.test.tsx: Expected 10 rows, got 0
2. [vitest] src/services/decisionAnalytics.test.ts: API endpoint /api/decisions returned 404
3. [playwright] tests/e2e/chairman-analytics.spec.ts › Filter by date range: Date picker not clickable
4. [playwright] tests/e2e/chairman-analytics.spec.ts › Export analytics CSV: Download did not start`,

  test_results: {
    failures: [
      {
        framework: 'vitest',
        test_file: 'src/components/DecisionHistoryTable.test.tsx',
        error_message: 'Expected 10 rows, got 0'
      },
      {
        framework: 'vitest',
        test_file: 'src/services/decisionAnalytics.test.ts',
        error_message: 'API endpoint /api/decisions returned 404'
      },
      {
        framework: 'playwright',
        test_file: 'tests/e2e/chairman-analytics.spec.ts',
        test_name: 'Filter by date range',
        error_message: 'Date picker not clickable'
      },
      {
        framework: 'playwright',
        test_file: 'tests/e2e/chairman-analytics.spec.ts',
        test_name: 'Export analytics CSV',
        error_message: 'Download did not start'
      }
    ]
  }
}
```

**Actionable Fixes**:
1. Fix data loading in DecisionHistoryTable component
2. Implement `/api/decisions` endpoint
3. Fix date picker z-index/pointer-events
4. Implement CSV export functionality

## Status

✅ **Implementation Complete**
✅ **Failure extraction in test output parser**
✅ **Detailed notes generation in batch script**
✅ **Structured JSONB storage in database**
✅ **Ready for campaign**

The running campaign will now capture all this detailed failure information automatically!

---

**Last Updated**: 2025-10-05
**Feature**: Enhanced Failure Tracking
**Storage**: `sd_testing_status.testing_notes` + `sd_testing_status.test_results`
