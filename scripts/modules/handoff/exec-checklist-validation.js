#!/usr/bin/env node
/**
 * Exec Checklist Validation Gate (US-006)
 *
 * Part of SD-DELIVERABLES-V2-001 Phase 2 - Extraction Enhancement
 * Validates that PRDs have proper exec_checklist with user_story_ids
 * before PLAN→EXEC handoff is approved.
 *
 * Validation Rules:
 * 1. exec_checklist array must exist and have ≥1 items
 * 2. Each item should have user_story_ids array (warning mode, not blocking)
 * 3. user_story_ids must reference valid story keys in user_stories table
 * 4. Score must meet threshold (80%) for pass - SD-VALIDATION-REGISTRY-001
 *
 * Integration: Called from unified-handoff-system.js during PLAN→EXEC
 */

// Pass threshold updated to 80% per SD-VALIDATION-REGISTRY-001
const PASS_THRESHOLD = 80;

/**
 * Validate exec_checklist for PLAN→EXEC handoff
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} prd - PRD object from database
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Options
 * @returns {Promise<Object>} Validation result
 */
export async function validateExecChecklist(sdId, prd, supabase, options = {}) {
  const {
    silent = false,
    strictMode = false,  // If true, blocks on missing user_story_ids
    gracePeriod = true   // If true, warns instead of blocking for existing PRDs
  } = options;

  const result = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {}
  };

  if (!silent) {
    console.log('\n🔍 Exec Checklist Validation (SD-DELIVERABLES-V2-001 Phase 2)');
    console.log('-'.repeat(50));
  }

  // Check 1: exec_checklist exists and is array
  if (!prd.exec_checklist) {
    if (gracePeriod) {
      result.warnings.push('exec_checklist not found in PRD - recommend updating PRD structure');
      result.score += 30; // Partial credit for grace period
    } else {
      result.issues.push('BLOCKING: exec_checklist array missing from PRD');
      result.passed = false;
    }

    if (!silent) {
      console.log(`   ${gracePeriod ? '⚠️' : '❌'} exec_checklist not found (${gracePeriod ? 'warning mode' : 'BLOCKING'})`);
    }

    return result;
  }

  if (!Array.isArray(prd.exec_checklist)) {
    result.issues.push('exec_checklist is not an array');
    result.passed = false;
    if (!silent) console.log('   ❌ exec_checklist is not an array');
    return result;
  }

  // Check 2: exec_checklist has items
  if (prd.exec_checklist.length === 0) {
    if (gracePeriod) {
      result.warnings.push('exec_checklist is empty - recommend adding checklist items');
      result.score += 20;
    } else {
      result.issues.push('BLOCKING: exec_checklist is empty (need ≥1 items)');
      result.passed = false;
    }

    if (!silent) {
      console.log(`   ${gracePeriod ? '⚠️' : '❌'} exec_checklist is empty`);
    }

    return result;
  }

  result.score += 40; // Base points for having checklist
  result.details.checklist_count = prd.exec_checklist.length;

  if (!silent) {
    console.log(`   ✅ exec_checklist has ${prd.exec_checklist.length} items (40/100)`);
  }

  // Check 3: Items have required fields
  let _validItems = 0;
  let itemsWithText = 0;
  let itemsWithStoryLinks = 0;

  // Get user story keys for validation
  const { data: userStories } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', sdId);

  const validStoryKeys = new Set(userStories?.map(s => s.story_key) || []);

  prd.exec_checklist.forEach((item, index) => {
    // Check for text field
    if (item.text && item.text.trim().length > 0) {
      itemsWithText++;
      validItems++;
    }

    // Check for user_story_ids
    if (item.user_story_ids && Array.isArray(item.user_story_ids) && item.user_story_ids.length > 0) {
      itemsWithStoryLinks++;

      // Validate story keys exist
      const invalidKeys = item.user_story_ids.filter(key => !validStoryKeys.has(key));
      if (invalidKeys.length > 0) {
        result.warnings.push(`Checklist item ${index + 1} references invalid story keys: ${invalidKeys.join(', ')}`);
      }
    }
  });

  // Score for item quality
  const textCoverage = itemsWithText / prd.exec_checklist.length;
  result.score += Math.round(textCoverage * 30); // Up to 30 points

  result.details.items_with_text = itemsWithText;
  result.details.items_with_story_links = itemsWithStoryLinks;
  result.details.story_link_coverage = `${itemsWithStoryLinks}/${prd.exec_checklist.length}`;

  if (!silent) {
    console.log(`   ${itemsWithText === prd.exec_checklist.length ? '✅' : '⚠️'} ${itemsWithText}/${prd.exec_checklist.length} items have text`);
  }

  // Check 4: User story linkage (Phase 2 enhancement)
  if (itemsWithStoryLinks === 0) {
    if (strictMode) {
      result.issues.push('No exec_checklist items have user_story_ids - required for deliverable tracking');
      result.passed = false;
    } else {
      result.warnings.push('No exec_checklist items have user_story_ids - recommend adding for Phase 2 tracking');
      result.score += 10; // Partial credit
    }

    if (!silent) {
      console.log('   ⚠️  No items have user_story_ids (recommend updating PRD)');
    }
  } else {
    const linkCoverage = itemsWithStoryLinks / prd.exec_checklist.length;
    result.score += Math.round(linkCoverage * 30); // Up to 30 points

    if (!silent) {
      console.log(`   ✅ ${itemsWithStoryLinks}/${prd.exec_checklist.length} items linked to user stories (+${Math.round(linkCoverage * 30)}/30)`);
    }
  }

  // Check threshold (SD-VALIDATION-REGISTRY-001: updated to 80%)
  if (result.passed && result.score < PASS_THRESHOLD) {
    result.passed = false;
    result.issues.push(`Score ${result.score}% below threshold ${PASS_THRESHOLD}%`);
  }

  // Final summary
  if (!silent) {
    console.log('-'.repeat(50));
    console.log(`   Score: ${result.score}/100 (threshold: ${PASS_THRESHOLD}%)`);
    console.log(`   Status: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);

    if (result.warnings.length > 0) {
      console.log(`   Warnings: ${result.warnings.length}`);
    }
  }

  return result;
}

/**
 * Quick validation for handoff pre-check
 */
export function quickExecChecklistValidation(prd) {
  return {
    hasChecklist: Array.isArray(prd?.exec_checklist),
    itemCount: prd?.exec_checklist?.length || 0,
    hasUserStoryLinks: prd?.exec_checklist?.some(item =>
      item.user_story_ids && Array.isArray(item.user_story_ids) && item.user_story_ids.length > 0
    ) || false
  };
}

export default {
  validateExecChecklist,
  quickExecChecklistValidation
};
