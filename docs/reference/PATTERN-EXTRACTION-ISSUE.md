# Pattern Extraction Script Bug [FIXED]


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-22
- **Tags**: testing, leo, sd, documentation

**File**: `lib/learning/issue-knowledge-base.js`
**Function**: `createPattern()` (line 228)
**Issue**: Incorrect pattern ID generation due to timestamp collision

## Problem

Lines 239-244:
```javascript
const { data: lastPattern } = await supabase
  .from('issue_patterns')
  .select('pattern_id')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();
```

**Bug**: Orders by `created_at` to find the last pattern, but PAT-001 through PAT-005 have identical timestamps (2025-10-02T23:02:43.844Z). This causes the query to return PAT-001 instead of PAT-008 (the actual latest pattern).

**Result**: Script tries to create PAT-002 which already exists → duplicate key error

## Current State

```
Existing patterns:
- PAT-001 through PAT-008 exist
- PAT-001 to PAT-005: created_at = 2025-10-02T23:02:43.844Z (bulk insert)
- PAT-006, PAT-007, PAT-008: later timestamps

Next ID should be: PAT-009
Script calculates: PAT-002 (wrong!)
```

## Fix Required

Replace line 242 with:
```javascript
.order('pattern_id', { ascending: false })
```

Or better, query for MAX pattern number:
```javascript
const { data: patterns } = await supabase
  .from('issue_patterns')
  .select('pattern_id')
  .order('pattern_id', { ascending: false })
  .limit(1);

let patternNum = 1;
if (patterns && patterns.length > 0) {
  const match = patterns[0].pattern_id.match(/PAT-(\d+)/);
  if (match) {
    patternNum = parseInt(match[1]) + 1;
  }
}
```

## Impact on SD-LEO-LEARN-001

**Status**: Pattern extraction skipped due to this bug
**Workaround**: Can be run manually after fixing the script
**Alternative**: Manually create patterns if needed

## Resolution

**Fixed**: 2025-10-25
**Change**: Modified line 242 from `.order('created_at', ...)` to `.order('pattern_id', ...)`
**Result**: ✅ Successfully extracted 3 patterns from SD-LEO-LEARN-001 retrospective
- PAT-009: Documentation could be enhanced with more visual diagrams (category: general)
- PAT-010: Testing coverage could be expanded to include edge cases (category: testing)
- PAT-011: Performance benchmarks could be added for future comparison (category: performance)

## Related

- SD-LEO-LEARN-001 retrospective ID: 71eb9695-ff30-4821-b66c-1b248feb30b5
- Retrospective quality: 90/100
- Pattern extraction: ✅ Complete (3 patterns created)
