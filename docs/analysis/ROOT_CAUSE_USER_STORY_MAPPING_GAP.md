# Root Cause Analysis: User Story → E2E Test Mapping Gap


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, testing, e2e, protocol

**Date**: 2025-10-18
**SD Affected**: SD-VIF-INTEL-001 (and likely others)
**Priority**: CRITICAL
**Type**: Systemic Process Gap

---

## Problem Statement

### Immediate Issue
All 26 user stories for SD-VIF-INTEL-001 have:
- `e2e_test_path: NULL`
- `e2e_test_status: 'not_created'`

Despite:
- E2E tests existing and passing (86/92 tests, 93.5% functional pass rate)
- Tests following proper US-XXX naming convention
- LEO Protocol requiring 100% user story → E2E test mapping

---

## Root Cause Discovery Process

### Investigation Steps

1. **Protocol Review** - Found explicit requirement in `docs/reference/user-story-e2e-mapping.md`:
   ```
   Line 7: "CRITICAL: E2E tests MUST map to user stories explicitly."
   Line 169: "100% user story coverage (no exceptions)"
   Line 190: "Handoff blocked if coverage incomplete"
   ```

2. **E2E Test Analysis** - Confirmed tests DO follow US-XXX naming:
   ```typescript
   // /mnt/c/_EHG/EHG/tests/e2e/customer-intelligence.spec.ts
   test('US-001: User can see Customer Intelligence tab in Stage 3', async ({ page }) => {
   test('US-002: User sees "Generate" button when no data exists', async ({ page }) => {
   test('US-003: User can generate customer personas (mock data)', async ({ page }) => {
   // ... US-004 through US-010
   ```

3. **QA Director Examination** - Found test plan generator creates mapping:
   ```javascript
   // scripts/modules/qa/test-plan-generator.js:256-262
   userStoryMapping.push({
     story_key: story.story_key,
     story_title: story.title,
     test_case_id: testCase.id,
     coverage_status: 'planned'
   });
   ```

4. **Database Storage Review** - Mapping stored in `test_plans` table:
   ```javascript
   // scripts/modules/qa/test-plan-generator.js:488-511
   await supabase
     .from('test_plans')
     .insert({
       sd_id: testPlan.sd_id,
       prd_id: testPlan.prd_id,
       e2e_test_strategy: testPlan.e2e_test_strategy  // Contains user_story_mapping
     })
   ```

5. **Gap Identification** - No script updates `user_stories.e2e_test_path`:
   ```bash
   # Searched all scripts for:
   grep -r "UPDATE user_stories" scripts/
   grep -r "e2e_test_path" scripts/

   # Found: Scripts that SET e2e_test_path when CREATING user stories
   # Missing: Script that UPDATES e2e_test_path after E2E tests are written
   ```

---

## Root Cause

### The Systemic Gap

**The LEO Protocol has a 3-step process with a missing middle step:**

```
Step 1: PLAN creates user stories in database ✅ DONE
   ↓
   User stories exist with e2e_test_path = NULL

Step 2: EXEC creates E2E tests with US-XXX naming ✅ DONE
   ↓
   E2E tests exist with proper naming convention

Step 3: ??? Map tests back to user stories ❌ MISSING
   ↓
   SHOULD update user_stories.e2e_test_path and e2e_test_status
```

### What Exists

1. **Test Plan Generator** (PLAN phase)
   - Creates *planned* mapping in `test_plans` table
   - Mapping structure: `{ story_key, test_case_id, coverage_status: 'planned' }`
   - Does NOT create actual test files
   - Does NOT update user_stories table

2. **E2E Test Creation** (EXEC phase)
   - Tests created manually following US-XXX convention
   - Tests stored in `/mnt/c/_EHG/EHG/tests/e2e/*.spec.ts`
   - No automation to link tests back to database

3. **Manual Mapping Examples** (found in some SDs)
   ```javascript
   // scripts/create-settings-user-stories.mjs:18
   {
     story_key: 'US-SETTINGS-001',
     e2e_test_path: "tests/e2e/settings/US-001-system-configuration-refactor.spec.ts",
     e2e_test_status: 'created'
   }
   ```
   - Some scripts manually specify `e2e_test_path` AT CREATION TIME
   - But SD-VIF-INTEL-001 user stories were created BEFORE tests existed

### What's Missing

**An automated script that:**
1. Scans all E2E test files (`/mnt/c/_EHG/EHG/tests/e2e/**/*.spec.ts`)
2. Extracts US-XXX references from test names: `test('US-001: ...')`
3. Maps each US-XXX to its file path
4. Updates `user_stories` table:
   ```sql
   UPDATE user_stories
   SET
     e2e_test_path = 'tests/e2e/customer-intelligence.spec.ts',
     e2e_test_status = 'created'
   WHERE story_key = 'US-VIF-INTEL-001';
   ```

---

## Impact Analysis

### Why This Matters

1. **Handoff Validation Fails**
   - EXEC→PLAN handoff checks for user story validation
   - No e2e_test_path = "not validated"
   - Progress calculation stuck at 85%

2. **BMAD Warnings**
   ```
   ⚠️  WARNING: User story → E2E test mapping not found
   ```

3. **Violates LEO Protocol**
   - Explicit requirement: "100% user story coverage (no exceptions)"
   - Handoff should be "BLOCKED if coverage incomplete"
   - But no automation to enforce this

4. **Manual Workaround Required**
   - Currently: User stories marked as "validated" without true verification
   - Risk: Claiming completion without proof of testing
   - User feedback: "Don't just update the user_stories to validate it unless they've truly been validated"

### Affected SDs

Potentially ALL SDs where:
- User stories created in PLAN phase (database-first ✅)
- E2E tests created in EXEC phase (correct order ✅)
- But no retrospective mapping step (gap ❌)

Example SDs with same issue:
```bash
# From grep results:
SD-BOARD-VISUAL-BUILDER-003: "All 8 user stories have e2e_test_path = NULL"
```

---

## Proposed Solutions

### Option 1: Automated Mapping Script (RECOMMENDED)

**Create**: `scripts/map-e2e-tests-to-user-stories.js`

**Function**:
```javascript
async function mapE2ETestsToUserStories(sdId) {
  // 1. Get all user stories for SD
  const { data: stories } = await supabase
    .from('user_stories')
    .select('id, story_key, sd_id')
    .eq('sd_id', sdId);

  // 2. Scan E2E test files
  const testDir = '/mnt/c/_EHG/EHG/tests/e2e';
  const testFiles = await glob(`${testDir}/**/*.spec.ts`);

  // 3. Extract US-XXX references from each file
  const mapping = [];
  for (const file of testFiles) {
    const content = await fs.readFile(file, 'utf-8');
    const matches = content.matchAll(/test\('(US-[A-Z0-9-]+):/g);

    for (const match of matches) {
      const storyKey = match[1];
      const relativePath = file.replace('/mnt/c/_EHG/EHG/', '');

      mapping.push({
        story_key: storyKey,
        e2e_test_path: relativePath,
        e2e_test_status: 'created'
      });
    }
  }

  // 4. Update user_stories table
  for (const map of mapping) {
    await supabase
      .from('user_stories')
      .update({
        e2e_test_path: map.e2e_test_path,
        e2e_test_status: map.e2e_test_status
      })
      .eq('story_key', map.story_key)
      .eq('sd_id', sdId);
  }

  return mapping;
}
```

**Integration Point**:
- Run automatically after E2E tests created (EXEC phase)
- Or run during EXEC→PLAN handoff validation
- Add to unified-handoff-system.js validation

**Benefits**:
- Eliminates manual mapping
- Enforces 100% coverage requirement
- Provides audit trail (which tests cover which stories)
- Prevents progress calculation issues

### Option 2: Enhanced Test Plan Generator

**Modify**: `scripts/modules/qa/test-plan-generator.js`

Add post-test-creation step:
```javascript
// After E2E tests are written, run this
export async function reconcileTestPlanWithActualTests(sdId, supabase) {
  const testPlan = await getTestPlan(sdId);
  const actualTests = await scanE2ETestFiles(sdId);

  // Compare planned vs actual
  // Update user_stories table
  // Report coverage percentage
}
```

### Option 3: Enhanced User Story Creation

**Modify**: PLAN phase to create placeholder paths:
```javascript
{
  story_key: 'US-VIF-INTEL-001',
  e2e_test_path: 'tests/e2e/customer-intelligence.spec.ts',  // Planned path
  e2e_test_status: 'planned'  // Not yet created
}
```

Then EXEC verifies actual file matches planned path.

---

## Recommended Implementation

### Phase 1: Immediate Fix (SD-VIF-INTEL-001)
1. Create `map-e2e-tests-to-user-stories.js` script
2. Run for SD-VIF-INTEL-001 to populate 26 user stories
3. Verify EXEC→PLAN handoff passes
4. Complete SD to 100%

### Phase 2: Permanent Fix (All Future SDs)
1. Add automated mapping to EXEC→PLAN handoff:
   ```javascript
   // scripts/unified-handoff-system.js:executeExecToPlan()

   // Step 2.5: Auto-map E2E tests to user stories
   console.log('\n🔗 Step 2.5: Mapping E2E Tests to User Stories');
   const mappingResult = await mapE2ETestsToUserStories(sdId);

   if (mappingResult.unmappedStories.length > 0) {
     return {
       success: false,
       rejected: true,
       reasonCode: 'INCOMPLETE_E2E_COVERAGE',
       message: `${mappingResult.unmappedStories.length} user stories have no E2E tests`
     };
   }
   ```

2. Add validation gate:
   - BLOCK EXEC→PLAN handoff if coverage < 100%
   - List missing user stories explicitly
   - Force EXEC to create remaining tests

### Phase 3: Documentation Update
1. Update `docs/reference/user-story-e2e-mapping.md` with automation details
2. Add to EXEC checklist: "Run E2E test mapping script before handoff"
3. Add to CLAUDE_EXEC.md execution requirements

---

## Success Criteria

- [ ] Automated script creates and maintains user story → E2E test mapping
- [ ] 100% coverage enforced (no exceptions)
- [ ] EXEC→PLAN handoff validates mapping automatically
- [ ] Database columns `e2e_test_path` and `e2e_test_status` always accurate
- [ ] Progress calculation uses real test coverage data
- [ ] Future SDs don't encounter this issue

---

## Lessons Learned

1. **Database-First Principle**: The protocol correctly requires database-first tracking, but lacked automation to maintain it
2. **Automation Gaps**: Having a PLAN (test_plans table) without automation to verify EXECUTION against that plan
3. **Naming Convention Value**: US-XXX naming convention made retrospective mapping possible
4. **Validation vs Enforcement**: Protocol documented requirement but didn't enforce it in handoff gates

---

**Status**: ROOT CAUSE IDENTIFIED
**Next Step**: Create automated mapping script
**Est. Effort**: 2-3 hours (script + testing + integration)
**Priority**: CRITICAL (blocking SD-VIF-INTEL-001 completion + affects all future SDs)

---

**Related Documentation**:
- `docs/reference/user-story-e2e-mapping.md` - Mapping requirements
- `scripts/modules/qa/test-plan-generator.js` - Test plan creation
- `scripts/unified-handoff-system.js` - Handoff validation
- `ENHANCEMENT_AUTO_DELIVERABLES_POPULATION.md` - Similar systemic gap discovered
