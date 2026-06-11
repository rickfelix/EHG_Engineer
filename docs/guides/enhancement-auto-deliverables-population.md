---
category: guide
status: draft
version: 1.0.0
author: Rick Felix
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Enhancement: Auto-Populate Deliverables During PLAN→EXEC Handoff



## Table of Contents

- [Metadata](#metadata)
- [Problem Statement](#problem-statement)
  - [Immediate Issue (SD-VIF-INTEL-001)](#immediate-issue-sd-vif-intel-001)
  - [Root Cause](#root-cause)
- [Impact](#impact)
- [Proposed Solution](#proposed-solution)
  - [Enhancement to PLAN→EXEC Handoff](#enhancement-to-planexec-handoff)
- [Implementation Steps](#implementation-steps)
  - [Phase 1: Core Enhancement (2-3 hours)](#phase-1-core-enhancement-2-3-hours)
  - [Phase 2: PRD Template Update (1 hour)](#phase-2-prd-template-update-1-hour)
  - [Phase 3: Testing (1-2 hours)](#phase-3-testing-1-2-hours)
  - [Phase 4: Documentation (30 min)](#phase-4-documentation-30-min)
- [Benefits](#benefits)
- [Validation](#validation)
- [Acceptance Criteria](#acceptance-criteria)
- [Rollout Plan](#rollout-plan)
- [Related Issues](#related-issues)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

**Date**: 2025-10-18
**Priority**: HIGH
**Type**: Protocol Enhancement
**Affects**: All future Strategic Directives

---

## Problem Statement

### Immediate Issue (SD-VIF-INTEL-001)
EXEC→PLAN handoff failed because `sd_scope_deliverables` table was empty. Work was completed without database-first tracking of deliverables.

### Root Cause
**The PLAN→EXEC handoff validates deliverables but doesn't create them.**

**Current Flow:**
```
1. PLAN creates PRD → deliverables documented in PRD text
2. PLAN→EXEC handoff → validates PRD quality (no deliverables creation)
3. EXEC implements → works from PRD text, not database
4. EXEC→PLAN handoff → FAILS because no deliverables in database
```

**Expected Flow:**
```
1. PLAN creates PRD → deliverables documented in PRD text
2. PLAN→EXEC handoff → extracts deliverables, populates sd_scope_deliverables table
3. EXEC implements → updates deliverables.completion_status = 'completed'
4. EXEC→PLAN handoff → validates all deliverables complete ✅
```

---

## Impact

**Current State:**
- EXEC agents must manually track deliverables in markdown files
- EXEC→PLAN handoff fails without manual database population
- No single source of truth for deliverables
- Violates LEO Protocol's database-first principle

**Systemic Risk:**
- This affects **every SD** that bypasses proper handoff flow
- Same issue as SD-TEST-MOCK-001 (work without database records)
- Creates technical debt requiring manual cleanup

---

## Proposed Solution

### Enhancement to PLAN→EXEC Handoff

**File**: `scripts/_deprecated/unified-handoff-system.js` (deprecated — the live handoff pipeline is `scripts/handoff.js` with executors under `scripts/modules/handoff/executors/`)
**Function**: `executePlanToExec(sdId, options)`
**Location**: Line ~216-299

#### Current Code (Line ~216)
```javascript
async executePlanToExec(sdId, options) {
  console.log('🔍 PLAN → EXEC HANDOFF EXECUTION');

  // Loads SD
  // BMAD validation
  // Git branch enforcement

  // ❌ Missing: Deliverables extraction and population

  return { success: true, ... };
}
```

#### Proposed Addition
```javascript
async executePlanToExec(sdId, options) {
  console.log('🔍 PLAN → EXEC HANDOFF EXECUTION');

  // ... existing validation code ...

  // NEW: Auto-populate deliverables from PRD
  console.log('\n📦 Step 3: Extracting and Populating Deliverables');
  console.log('-'.repeat(50));

  const deliverablesResult = await this.extractAndPopulateDeliverables(sdId, prd);

  if (!deliverablesResult.success) {
    console.error('❌ Failed to populate deliverables');
    console.error(`   ${deliverablesResult.message}`);
    return {
      success: false,
      rejected: true,
      reasonCode: 'DELIVERABLES_EXTRACTION_FAILED',
      message: deliverablesResult.message
    };
  }

  console.log(`✅ Populated ${deliverablesResult.count} deliverables in database`);
  console.log('-'.repeat(50));

  // ... continue with existing code ...
}

/**
 * Extract deliverables from PRD and populate sd_scope_deliverables table
 */
async extractAndPopulateDeliverables(sdId, prd) {
  try {
    // Extract from PRD's functional_requirements or scope section
    const deliverables = [];

    // Option 1: Parse from functional_requirements
    if (prd.functional_requirements) {
      const requirements = Array.isArray(prd.functional_requirements)
        ? prd.functional_requirements
        : JSON.parse(prd.functional_requirements || '[]');

      requirements.forEach((req, index) => {
        deliverables.push({
          sd_id: sdId,
          deliverable_type: this.inferDeliverableType(req),
          deliverable_name: req.title || req.name || `Requirement ${index + 1}`,
          description: req.description || req.details,
          extracted_from: 'prd',
          priority: 'required',
          completion_status: 'pending',
          completion_evidence: null,
          completion_notes: null
        });
      });
    }

    // Option 2: Parse from scope (if available)
    if (prd.scope && deliverables.length === 0) {
      // Extract deliverables from scope text
      // Look for patterns like "Checkpoint 1:", "Deliverable:", "Component:", etc.
      const scopeLines = prd.scope.split('\n');
      const checkpointPattern = /(?:Checkpoint|Deliverable|Component|Feature)\s*(\d+)?:\s*(.+)/i;

      scopeLines.forEach(line => {
        const match = line.match(checkpointPattern);
        if (match) {
          deliverables.push({
            sd_id: sdId,
            deliverable_type: 'ui_feature', // Default, can be refined
            deliverable_name: match[2].trim(),
            description: `Extracted from PRD scope: ${match[0]}`,
            extracted_from: 'prd',
            priority: 'required',
            completion_status: 'pending'
          });
        }
      });
    }

    if (deliverables.length === 0) {
      return {
        success: false,
        message: 'No deliverables found in PRD - PRD may need refinement'
      };
    }

    // Insert into database
    const { data, error } = await this.supabase
      .from('sd_scope_deliverables')
      .insert(deliverables)
      .select();

    if (error) {
      return {
        success: false,
        message: `Database insert failed: ${error.message}`
      };
    }

    return {
      success: true,
      count: data.length,
      deliverables: data
    };

  } catch (error) {
    return {
      success: false,
      message: `Extraction error: ${error.message}`
    };
  }
}

/**
 * Infer deliverable type from requirement text
 */
inferDeliverableType(requirement) {
  const text = (requirement.title + ' ' + requirement.description || '').toLowerCase();

  if (text.includes('database') || text.includes('table') || text.includes('schema')) return 'database';
  if (text.includes('api') || text.includes('endpoint')) return 'api';
  if (text.includes('ui') || text.includes('component') || text.includes('interface')) return 'ui_feature';
  if (text.includes('test') || text.includes('e2e')) return 'test';
  if (text.includes('integration') || text.includes('service')) return 'integration';
  if (text.includes('migration')) return 'migration';

  return 'ui_feature'; // Default
}
```

---

## Implementation Steps

### Phase 1: Core Enhancement (2-3 hours)
1. Add `extractAndPopulateDeliverables()` method to `UnifiedHandoffSystem` class
2. Add `inferDeliverableType()` helper method
3. Integrate into `executePlanToExec()` after BMAD validation
4. Add error handling and rollback logic

### Phase 2: PRD Template Update (1 hour)
5. Update PRD template to include structured `deliverables` section
6. Add JSON schema for deliverables array in PRD
7. Update PLAN agents to populate this section

### Phase 3: Testing (1-2 hours)
8. Test with new SD (end-to-end flow)
9. Test with existing SD (should skip if deliverables already exist)
10. Test error cases (malformed PRD, missing sections)

### Phase 4: Documentation (30 min)
11. Update LEO Protocol documentation
12. Add examples to PLAN agent instructions
13. Document in handoff system README

---

## Benefits

1. **Prevents This Issue**: Future SDs will have deliverables auto-populated
2. **Database-First**: Enforces LEO Protocol principle
3. **Single Source of Truth**: Deliverables tracked in database, not markdown
4. **EXEC Visibility**: EXEC agents have clear checklist to follow
5. **Automatic Validation**: EXEC→PLAN can validate completion properly

---

## Validation

**Before Enhancement:**
```bash
# PLAN→EXEC handoff creates no deliverables
node scripts/handoff.js execute PLAN-TO-EXEC SD-TEST-001

# EXEC works without database tracking
# ...implementation...

# EXEC→PLAN handoff fails
node scripts/handoff.js execute EXEC-TO-PLAN SD-TEST-001
# ❌ Error: No completed deliverables found
```

**After Enhancement:**
```bash
# PLAN→EXEC handoff extracts and populates deliverables
node scripts/handoff.js execute PLAN-TO-EXEC SD-TEST-001
# ✅ Populated 6 deliverables in database

# EXEC updates deliverables as completed
# ...implementation with database tracking...

# EXEC→PLAN handoff validates completion
node scripts/handoff.js execute EXEC-TO-PLAN SD-TEST-001
# ✅ EXEC→PLAN HANDOFF APPROVED (6/6 deliverables complete)
```

---

## Acceptance Criteria

- [ ] PLAN→EXEC handoff extracts deliverables from PRD
- [ ] Deliverables inserted into `sd_scope_deliverables` table with status='pending'
- [ ] Correct deliverable_type inferred from requirement text
- [ ] EXEC→PLAN handoff passes without manual database population
- [ ] Existing SDs not affected (skip if deliverables already exist)
- [ ] Error handling for malformed PRDs
- [ ] Documentation updated
- [ ] Tested end-to-end with new SD

---

## Rollout Plan

1. **Test with SD-TEST-002** (new test SD)
2. **Validate with SD-RETRO-ENHANCE-001** (existing work)
3. **Deploy to production** after validation
4. **Monitor first 3 SDs** using enhanced handoff
5. **Refine extraction logic** based on feedback

---

## Related Issues

- SD-VIF-INTEL-001: Manual deliverables population required
- SD-TEST-MOCK-001: Work proceeded without database records
- LEO Protocol violation: Database-first principle not enforced

---

**Status**: PROPOSED
**Owner**: TBD
**Est. Effort**: 4-6 hours total
**Priority**: HIGH (affects all future SDs)
**Next Step**: Review and approve enhancement proposal
