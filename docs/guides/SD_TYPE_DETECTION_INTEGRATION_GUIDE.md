# SD Type Detection Integration Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, testing, e2e, unit

**Created**: 2025-10-18
**Purpose**: Guide for integrating sd-type-detection.js into progress calculation and deliverable creation workflows
**Issue**: Resolves Issue #4 from SD-PLAN-PRESENT-001 retrospective

## Overview

The `lib/utils/sd-type-detection.js` utility distinguishes between:
- **Engineering SDs**: Infrastructure, tooling, protocols (target: EHG_Engineer)
- **Feature SDs**: Customer-facing features (target: EHG)

This enables appropriate validation requirements and progress calculation logic.

## Integration Points

### 1. Progress Calculation (Database Function)

**File**: `supabase/functions/get_progress_breakdown.sql` (RPC function)
**Current Issue**: Treats all SDs identically, causing engineering SDs to show low progress due to irrelevant deliverables

**Required Changes**:

```sql
-- Add SD type detection logic to get_progress_breakdown()
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  sd_record RECORD;
  sd_type TEXT;
  is_engineering BOOLEAN;
  deliverable_count INTEGER;
  completed_deliverable_count INTEGER;
  -- ... other variables
BEGIN
  -- Load SD
  SELECT * INTO sd_record
  FROM strategic_directives_v2
  WHERE id = sd_uuid;

  -- Detect SD type (simplified version of sd-type-detection.js)
  is_engineering := (
    sd_record.target_application ILIKE '%engineer%' OR
    sd_record.category IN ('Engineering', 'Tool', 'Infrastructure', 'Protocol', 'Testing', 'Database')
  );

  -- Count deliverables (filter out boilerplate for engineering SDs)
  IF is_engineering THEN
    -- Only count deliverables that are NOT boilerplate
    SELECT COUNT(*) INTO deliverable_count
    FROM sd_deliverables_v2
    WHERE strategic_directive_id = sd_uuid
      AND title NOT IN (
        'E2E Test Coverage Report',
        'Unit Test Coverage Report',
        'Build Success Verification',
        'UI Screenshots',
        'Loom Video Demonstration',
        'Code Review Checklist'
      );

    SELECT COUNT(*) INTO completed_deliverable_count
    FROM sd_deliverables_v2
    WHERE strategic_directive_id = sd_uuid
      AND status = 'completed'
      AND title NOT IN (
        'E2E Test Coverage Report',
        'Unit Test Coverage Report',
        'Build Success Verification',
        'UI Screenshots',
        'Loom Video Demonstration',
        'Code Review Checklist'
      );
  ELSE
    -- Count all deliverables for feature SDs
    SELECT COUNT(*) INTO deliverable_count
    FROM sd_deliverables_v2
    WHERE strategic_directive_id = sd_uuid;

    SELECT COUNT(*) INTO completed_deliverable_count
    FROM sd_deliverables_v2
    WHERE strategic_directive_id = sd_uuid
      AND status = 'completed';
  END IF;

  -- Continue with rest of progress calculation...
END;
$$ LANGUAGE plpgsql;
```

**Impact**: Engineering SDs will calculate progress correctly without boilerplate deliverables dragging down the percentage.

### 2. Deliverable Creation Workflow

**Files to Modify**:
- `scripts/create-deliverables.mjs` (if exists)
- Any PRD creation scripts that auto-generate deliverables
- PLAN phase scripts that populate deliverables

**Integration Pattern**:

```javascript
import { shouldSkipBoilerplateDeliverables } from '../lib/utils/sd-type-detection.js';

async function createDeliverables(sdId) {
  // Load SD
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  const skipBoilerplate = shouldSkipBoilerplateDeliverables(sd);

  // Core deliverables (always include)
  const coreDeliverables = [
    { title: 'Implementation Code', type: 'code' },
    { title: 'Database Migration (if applicable)', type: 'database' }
  ];

  // Boilerplate deliverables (skip for engineering SDs)
  const boilerplateDeliverables = skipBoilerplate ? [] : [
    { title: 'E2E Test Coverage Report', type: 'testing' },
    { title: 'Unit Test Coverage Report', type: 'testing' },
    { title: 'Build Success Verification', type: 'validation' },
    { title: 'UI Screenshots', type: 'documentation' },
    { title: 'Loom Video Demonstration', type: 'documentation' },
    { title: 'Code Review Checklist', type: 'quality' }
  ];

  const allDeliverables = [...coreDeliverables, ...boilerplateDeliverables];

  // Insert deliverables
  for (const deliverable of allDeliverables) {
    await supabase.from('sd_deliverables_v2').insert({
      strategic_directive_id: sdId,
      ...deliverable,
      status: 'pending'
    });
  }

  console.log(`Created ${allDeliverables.length} deliverables for SD ${sd.sd_id}`);
  if (skipBoilerplate) {
    console.log('⚡ Skipped boilerplate deliverables (engineering SD detected)');
  }
}
```

### 3. Validation Gate Updates

**File**: `scripts/verify-handoff-plan-to-exec.js` (and similar validation scripts)
**Purpose**: Adjust validation requirements based on SD type

```javascript
import { getValidationRequirements } from '../lib/utils/sd-type-detection.js';

async function validateReadiness(sdId) {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  const requirements = getValidationRequirements(sd);

  const validationResults = {
    passed: [],
    failed: []
  };

  // E2E tests (required for features, optional for engineering)
  if (requirements.requiresE2ETests) {
    const hasE2ETests = await checkE2ETests(sdId);
    if (hasE2ETests) {
      validationResults.passed.push('E2E tests present');
    } else {
      validationResults.failed.push('Missing E2E tests');
    }
  } else {
    validationResults.passed.push('E2E tests not required (engineering SD)');
  }

  // UI screenshots (required for features, not for engineering)
  if (requirements.requiresUIScreenshots) {
    const hasScreenshots = await checkScreenshots(sdId);
    if (hasScreenshots) {
      validationResults.passed.push('UI screenshots present');
    } else {
      validationResults.failed.push('Missing UI screenshots');
    }
  } else {
    validationResults.passed.push('UI screenshots not required (engineering SD)');
  }

  // Unit tests (always required)
  if (requirements.requiresUnitTests) {
    const hasUnitTests = await checkUnitTests(sdId);
    if (hasUnitTests) {
      validationResults.passed.push('Unit tests present');
    } else {
      validationResults.failed.push('Missing unit tests');
    }
  }

  return validationResults;
}
```

## Testing Plan

### Test Case 1: Engineering SD Progress Calculation
1. Create test engineering SD with target_application = 'EHG_engineer'
2. Add 2 core deliverables + 6 boilerplate deliverables
3. Complete only 2 core deliverables
4. Verify progress shows 100% (not 25%)

### Test Case 2: Feature SD Progress Calculation
1. Create test feature SD with target_application = 'EHG'
2. Add 2 core deliverables + 6 boilerplate deliverables
3. Complete only 2 core deliverables
4. Verify progress shows 25% (2/8)

### Test Case 3: Deliverable Creation
1. Run deliverable creation for engineering SD
2. Verify only core deliverables created (no boilerplate)
3. Run deliverable creation for feature SD
4. Verify all deliverables created (core + boilerplate)

## Migration Path

### Phase 1: Immediate (Non-Breaking)
- ✅ Create sd-type-detection.js utility
- ⬜ Document integration requirements (this file)
- ⬜ Add unit tests for sd-type-detection.js

### Phase 2: Progress Calculation (Database)
- ⬜ Update get_progress_breakdown() SQL function
- ⬜ Test with existing engineering SDs
- ⬜ Deploy via migration

### Phase 3: Deliverable Creation (Application)
- ⬜ Identify all deliverable creation scripts
- ⬜ Add sd-type-detection integration
- ⬜ Test with new SD creation

### Phase 4: Validation Gates (Application)
- ⬜ Update PLAN→EXEC handoff validation
- ⬜ Update EXEC→PLAN handoff validation
- ⬜ Test full SD lifecycle

## Rollback Plan

If issues arise:
1. Database changes are isolated to get_progress_breakdown() - can revert migration
2. Application changes are opt-in - default behavior unchanged
3. No data loss - only calculation logic affected

## Success Metrics

After integration:
- Engineering SDs reach 100% progress with appropriate deliverables (not all boilerplate)
- Feature SDs maintain existing validation requirements
- No increase in validation gate failures
- Reduction in manual deliverable deletion (currently 6 per engineering SD)

## Known Limitations

1. **Hybrid SDs**: SDs with both engineering and feature work may be misclassified
   - Mitigation: Manual override via `sd_metadata` field if needed

2. **Confidence Threshold**: Currently set to 70% for boilerplate skipping
   - May need tuning based on real-world usage

3. **Database Function**: Cannot import Node.js module, requires SQL rewrite
   - Must maintain parallel logic in SQL and JS

## References

- Original Issue: SD-PLAN-PRESENT-001 retrospective, Issue #4
- Created Utility: `lib/utils/sd-type-detection.js`
- Related: Handoff storage architecture, progress calculation RPC function
