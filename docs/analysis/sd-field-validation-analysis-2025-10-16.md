# Strategic Directive Field Validation Analysis

**Date**: 2025-10-16
**Issue**: Column name mismatch in handoff validation
**Status**: ✅ RESOLVED (but cleanup needed)

## Executive Summary

The `business_objectives` field **does not exist** in the `strategic_directives_v2` schema and has been replaced by `strategic_objectives`. The main validation code has been fixed, but there are legacy scripts still referencing the old field name.

## Analysis Results

### 1. Database Schema (GROUND TRUTH)
```
Total columns in strategic_directives_v2: 60

Objective-related columns:
  • strategic_intent (string) - High-level summary
  • strategic_objectives (array) - List of objectives

business_objectives: ❌ DOES NOT EXIST
```

### 2. Field Usage Patterns (20 most recent SDs)
- **strategic_objectives**: 18/20 SDs (90% usage) ✅
- **strategic_intent**: 8/20 SDs (40% usage) ✅
- **business_objectives**: 0/20 SDs (0% usage) ❌

### 3. Code Analysis

#### ✅ CORRECT (Already Fixed)
- `scripts/verify-handoff-lead-to-plan.js:35`
  - Uses `strategic_objectives`
  - Comment: "Updated from business_objectives"
  - Fixed in commit `ebed9ac` (Oct 4, 2025)

#### ❌ LEGACY (Needs Cleanup)
Files still referencing `business_objectives`:
1. `scripts/enhance-sd-vif-parent.js` - workaround script (can be removed)
2. `scripts/create-prd-subagent-001.js` - old PRD creator
3. `scripts/create-prd-sd-agent-admin-002.js` - old PRD creator
4. `scripts/archived-sd-scripts/sd046-lead-final-approval.js` - archived
5. `scripts/archived-sd-scripts/sd027-lead-final-approval.js` - archived

## Root Cause

**Historical**: The field was originally called `business_objectives` but was renamed to `strategic_objectives` to better align with LEO Protocol terminology.

**Fix Applied**: Commit `ebed9ac` (Oct 4, 2025) updated the main validation files:
- ✅ Fixed `verify-handoff-lead-to-plan.js`
- ✅ Fixed `verify-handoff-plan-to-exec.js`
- ✅ Updated unified-handoff-system.js

**Remaining Issue**: Legacy scripts not cleaned up, causing confusion.

## Correct Field Usage

### Primary Field: strategic_objectives (array)
**Purpose**: List of specific, measurable objectives for the SD

**Format**: Array of strings
```javascript
strategic_objectives: [
  "Reduce idea-to-evaluation time by 70%",
  "Enhance decision quality with LLM intelligence",
  "Enable rapid idea capture with triage"
]
```

**Validation**: Minimum 2 objectives required

### Secondary Field: strategic_intent (string)
**Purpose**: High-level summary of strategic direction

**Format**: Single paragraph string (100+ characters)
```javascript
strategic_intent: "Next-generation venture ideation system optimizing Chairman workflow through tiered complexity routing, LLM-powered intelligence, and recursive refinement..."
```

**Validation**: Optional but recommended (40% of SDs use it)

## Recommendations

### 1. Cleanup Legacy Scripts (LOW PRIORITY)
Remove or update files that still reference `business_objectives`:
```bash
# Non-archived
rm scripts/enhance-sd-vif-parent.js  # Workaround script no longer needed
```

Update these if actively used:
- `scripts/create-prd-subagent-001.js`
- `scripts/create-prd-sd-agent-admin-002.js`

Note: Archived scripts can stay as-is (historical reference)

### 2. Validation Already Correct ✅
No changes needed to main validation:
- `verify-handoff-lead-to-plan.js` ✅
- `verify-handoff-plan-to-exec.js` ✅
- `unified-handoff-system.js` ✅

### 3. Documentation Update (OPTIONAL)
Consider adding schema reference doc:
- `docs/reference/sd-schema-fields.md`
- Document field names, types, and purposes
- Prevent future confusion

## Test Validation

Tested with SD-VIF-PARENT-001:
- ✅ strategic_objectives: 5 items populated
- ✅ strategic_intent: 248 chars populated
- ✅ Handoff validation passed (100% completeness)

## Conclusion

**Status**: ✅ RESOLVED
**Action**: No urgent action needed - validation code is correct
**Optional**: Cleanup legacy scripts to prevent confusion

**Key Takeaway**: Always use `strategic_objectives` (array) and optionally `strategic_intent` (string). Never use `business_objectives` (does not exist).

---

*Analysis Date: 2025-10-16*
*Analyst: Claude Code*
*Verification: Database schema check + git history*
