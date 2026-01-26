# Critical SD Completion Fields Documentation


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, leo, sd

## Problem Statement
When Strategic Directives (SDs) complete through the LEO orchestrator, three critical database fields MUST be updated correctly for the dashboard to accurately reflect completion status. Failure to update these fields causes completed SDs to appear as "still working on" in the UI.

## The Three Critical Fields

### 1. `status` Field
- **Required Value**: `'completed'`
- **Common Error**: Leaving as `'active'`
- **Impact**: SD appears as ongoing work despite completion
- **Dashboard Effect**: Shows in active/working section instead of completed

### 2. `progress` Field
- **Required Value**: `100`
- **Common Error**: Partial percentages (e.g., 30%, 85%)
- **Impact**: SD appears partially complete
- **Dashboard Effect**: Progress bar shows incomplete status

### 3. `is_working_on` Field
- **Required Value**: `false`
- **Common Error**: Remains `true` after completion
- **Impact**: SD marked with "Working On" badge
- **Dashboard Effect**: Sorts to top as active work item

## Implementation Details

### Where Updates Happen

#### 1. APPROVAL Phase Handler (`templates/execute-phase.js`)
When git evidence is found during APPROVAL phase:
```javascript
// Lines 307-331: Auto-completion with evidence
if (hasImplementationEvidence) {
  await this.markSDComplete(sd.id); // This sets all three fields
}
```

#### 2. markSDComplete Function (`templates/execute-phase.js`)
Lines 557-589 contain the actual update logic:
```javascript
await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'completed',        // Critical Field #1
    is_working_on: false,        // Critical Field #2
    progress: 100,               // Critical Field #3
    current_phase: 'APPROVAL_COMPLETE',
    completion_date: completionTimestamp
  })
```

## Dashboard Sorting Logic

The dashboard (`src/client/src/components/SDManager.jsx`) uses these fields for sorting:
- SDs with `is_working_on: true` appear at the top
- SDs with `progress: 100` are considered complete
- SDs with `status: 'completed'` are shown in the completed section

## Testing Checklist

Before considering an SD complete, verify in the database:

```sql
SELECT id, status, progress, is_working_on, current_phase
FROM strategic_directives_v2
WHERE id = 'SD-XXX';
```

Expected values for completed SD:
- `status`: 'completed'
- `progress`: 100
- `is_working_on`: false
- `current_phase`: 'APPROVAL_COMPLETE'

## Common Scenarios

### Scenario 1: SD Completed But Shows "Working On"
**Cause**: `is_working_on` is still `true`
**Fix**: Update to `false`

### Scenario 2: SD Complete But Progress Bar Not Full
**Cause**: `progress` is less than 100
**Fix**: Update to `100`

### Scenario 3: SD in Wrong Section of Dashboard
**Cause**: `status` is not 'completed'
**Fix**: Update to `'completed'`

## Manual Fix Command

If an SD needs manual correction after completion:

```javascript
// scripts/fix-sd-completion-status.js
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'completed',
    is_working_on: false,
    progress: 100,
    current_phase: 'APPROVAL_COMPLETE'
  })
  .eq('id', 'SD-XXX');
```

## Prevention

To prevent this issue:
1. Always use `markSDComplete()` function when SD completes
2. Never partially update these fields
3. Validate all three fields after orchestrator runs
4. Test dashboard display after completion

## Related Files

- `/templates/execute-phase.js` - Contains markSDComplete function
- `/scripts/leo-orchestrator-enforced.js` - Main orchestrator
- `/src/client/src/components/SDManager.jsx` - Dashboard display logic
- `/scripts/validate-sd-completion-evidence.js` - Validation logic

## Version History
- **v1.0** - Initial documentation (2025-09-27)
- **Issue**: Discovered that orchestrator wasn't calling markSDComplete
- **Fix**: Added automatic completion when git evidence exists