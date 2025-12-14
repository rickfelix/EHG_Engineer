# Branch Cleanup Workflow Fix - Analysis & Resolution

## Problem Summary

**Issue**: The `.github/workflows/branch-cleanup.yml` workflow was failing with 0s runtime and empty jobs array.

**Evidence**:
- 10+ consecutive failures (run IDs 20199599847 - 20213525948)
- All runs showed `conclusion: failure`, `status: completed`, `jobs: []`
- No logs available (workflow failed before job execution)
- Triggered on `push` events despite only having `schedule` and `workflow_dispatch` triggers

## Root Cause Analysis

### YAML Parser Error

**Location**: Line 93 in the workflow file

**Problem**: JavaScript template literal containing markdown table was interpreted as YAML:

```yaml
script: |
  const summaryText = `
## Open PR Age Distribution

| Age | Count |
|-----|-------|
...
```

**Technical Issue**: 
- The pipe character `|` at the start of line 93 was interpreted as YAML's literal block scalar indicator
- YAML parser expected YAML syntax after `|`, but found markdown table syntax
- Error: `expected a comment or a line break, but found 'A'`

### Why GitHub Actions Failed Silently

When a workflow has YAML syntax errors:
1. GitHub validates the YAML **before** creating job instances
2. If validation fails, no jobs are created (`jobs: []`)
3. The run is marked as `failure` with 0s runtime
4. No logs are generated since no job execution occurred

## Solution Implemented

### Fix Strategy

**Replace**: Template literal markdown with GitHub Actions' `core.summary` API

**Before** (YAML parsing error):
```javascript
const summaryText = `
## Open PR Age Distribution

| Age | Count |
|-----|-------|
| Fresh (< 7 days) | ${summary.fresh} |
...
`;
core.summary.addRaw(summaryText);
await core.summary.write();
```

**After** (Proper API usage):
```javascript
await core.summary
  .addHeading('Open PR Age Distribution', 2)
  .addTable([
    [{data: 'Age', header: true}, {data: 'Count', header: true}],
    ['Fresh (< 7 days)', summary.fresh.toString()],
    ['Aging (7-14 days)', summary.aging.toString()],
    ['Stale (14-30 days)', summary.stale.toString()],
    ['Abandoned (> 30 days)', summary.abandoned.toString()]
  ])
  .addRaw(`\n**Total open PRs:** ${prs.data.length}\n`)
  .write();
```

### Benefits of the Fix

1. **No YAML Parsing Issues**: Uses JavaScript API calls instead of template literals
2. **Proper Table Formatting**: `addTable()` method ensures correct markdown generation
3. **Follows Best Practices**: Matches pattern from `housekeeping-weekly-report.yml`
4. **Better Maintainability**: Clearer intent with method chaining

## Verification

### YAML Validation

```bash
# Python YAML validation
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/branch-cleanup.yml'))"
✓ YAML is valid

# JS YAML validation
npx --yes js-yaml .github/workflows/branch-cleanup.yml
✓ YAML validates with js-yaml
```

### Workflow Execution Test

**Trigger**: Manual workflow dispatch
**Run ID**: 20213635178
**Result**: ✅ SUCCESS

**Jobs**:
- ✓ cleanup-merged-branches (8s runtime)
  - ✓ Set up job
  - ✓ Run actions/checkout@v4
  - ✓ Delete merged report branches
  - ✓ List stale branches
  - ✓ Count open PRs by age (new table rendered successfully)
  - ✓ Post Run actions/checkout@v4
  - ✓ Complete job

**URL**: https://github.com/rickfelix/EHG_Engineer/actions/runs/20213635178

## Key Learnings

### YAML Gotchas in GitHub Actions

1. **Template Literals**: Avoid markdown tables in JavaScript template literals within YAML
2. **Pipe Characters**: The `|` character has special meaning in YAML (literal block scalar)
3. **Validation Failure**: YAML errors prevent job creation (0s runtime, empty jobs)
4. **Core Summary API**: Use `core.summary.addTable()` for tables, not template strings

### Pattern to Follow

When working with `actions/github-script@v7`:
- ✅ Use `core.summary.addHeading()`, `addTable()`, `addRaw()` for formatting
- ✅ Chain methods with `await core.summary...write()`
- ❌ Avoid template literals with markdown tables
- ❌ Don't use pipe characters in strings that could be parsed as YAML

### References

**Similar Workflows Using Core Summary API**:
- `.github/workflows/housekeeping-weekly-report.yml` (lines 69-117)
- Pattern: Return data from github-script, format in bash with heredocs
- Alternative: Use core.summary API directly (our approach)

## Files Modified

**Commit**: `06a5494808cb1a5395a37e136d2e0aa6f38e2835`
**File**: `.github/workflows/branch-cleanup.yml`
**Lines Changed**: 93-104 (12 lines removed, 10 lines added)

## Testing Recommendations

### Future Workflow Development

1. **Local YAML Validation**:
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('path/to/workflow.yml'))"
   ```

2. **Syntax Checking**:
   ```bash
   npx --yes js-yaml path/to/workflow.yml
   ```

3. **Test Before Push**:
   - Use `workflow_dispatch` trigger for manual testing
   - Verify jobs array is populated in API response
   - Check logs for actual execution

4. **Avoid Silent Failures**:
   - Always check `gh run view [id] --json jobs` for empty jobs array
   - Empty jobs = YAML parsing error (not runtime error)

## Incident Timeline

| Time (UTC) | Event |
|------------|-------|
| 2025-12-13 23:45:21 | First failure detected (run 20199599847) |
| 2025-12-14 20:13:59 | 10th consecutive failure (run 20213525948) |
| 2025-12-14 20:20:00 | Root cause identified (YAML parsing error) |
| 2025-12-14 20:21:00 | Fix implemented and committed (06a5494) |
| 2025-12-14 20:23:10 | Workflow manually triggered for testing |
| 2025-12-14 20:23:24 | ✅ Workflow succeeded (run 20213635178) |

**Total Downtime**: ~20 hours (from first failure to fix)
**Impact**: Scheduled branch cleanup not running (low severity - weekly task)

## Prevention Measures

1. **Pre-commit Hook**: Add YAML validation for workflow files
2. **CI Check**: Validate all `.github/workflows/*.yml` files in CI
3. **Documentation**: Add to developer guidelines about GitHub Actions YAML patterns
4. **Monitoring**: Alert on workflows with 0s runtime and empty jobs

---

**Status**: ✅ RESOLVED
**Resolution**: Fix deployed to main branch
**Verified**: Manual trigger successful (run 20213635178)
**Next Run**: Automatic (Sunday 6 AM UTC) or manual dispatch
