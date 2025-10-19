# Lesson Learned: Always Check Existing Code Patterns First

**Date**: 2025-10-16
**Context**: SD-RETRO-ENHANCE-001 PRD creation
**Issue**: Used wrong table name (`prds` instead of `product_requirements_v2`)

## What Happened

When creating the PRD insertion script for SD-RETRO-ENHANCE-001, I assumed the table name was `prds` without verifying against existing code patterns. This caused a schema error when trying to insert.

## Root Cause

**Process failure**: Didn't search for existing similar scripts before writing new code.

**What I should have done**:
```bash
# Step 1: Find existing PRD creation scripts
grep -r "from.*product_requirements" scripts/create-prd-*.js

# Step 2: Read a recent example
cat scripts/create-prd-knowledge-001-v2.js

# Step 3: Verify table name pattern
# strategic_directives_v2 → product_requirements_v2 (both use _v2 suffix)
```

## The Pattern

The codebase follows a consistent V2 naming convention:
- ✅ `strategic_directives_v2` (not `strategic_directives`)
- ✅ `product_requirements_v2` (not `prds` or `product_requirements`)
- ✅ `leo_handoff_executions` (v2 tables added during migrations)

## Prevention Rule

**BEFORE creating any database insert/update script**:

1. **Search for existing patterns**:
   ```bash
   grep -l "from.*<table_pattern>" scripts/**/*.js | head -5
   ```

2. **Read 1-2 recent examples**:
   ```bash
   ls -t scripts/create-* | head -2 | xargs cat
   ```

3. **Verify table exists and get schema**:
   - Use database-agent to confirm table name
   - Get full schema before writing insert code

4. **Only then write the script**

## Impact

- ❌ Wasted time debugging schema errors
- ❌ User had to point out the issue
- ✅ Opportunity to improve process and prevent future occurrences

## Action Items

- [x] Document this lesson learned
- [x] Fix the script to use `product_requirements_v2`
- [ ] Add to CLAUDE.md as a reminder for future sessions
- [ ] Consider adding a pre-commit hook to catch table name mismatches

## Quote from User

> "Moving forward, if you run into any issues, let's resolve them and not work around them. That way, in the future, things will just run smoother, and we won't run into the same issues again."

This is exactly the kind of root cause analysis the user expects. Not just fixing the immediate error, but understanding and preventing the underlying pattern.

---

**Takeaway**: Assumptions are expensive. Verification is cheap. Always verify table names against existing code patterns before writing new database operations.
