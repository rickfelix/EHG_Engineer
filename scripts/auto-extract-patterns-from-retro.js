#!/usr/bin/env node
/**
 * AUTO-EXTRACT PATTERNS FROM RETROSPECTIVES
 * Automatically analyzes retrospectives and creates/updates issue patterns
 * in the learning history system
 *
 * Triggered by: Continuous Improvement Coach after generating retrospective
 * Purpose: Ensure all learnings are captured in searchable pattern database
 *
 * LEO Protocol v4.3.2 Enhancement:
 * - Auto-populates related_sub_agents based on category
 * - Adds resolution_date and resolution_notes support
 */

// SD-REFILL-00CAKXC2: read with the SERVICE client, not the ANON client. retrospectives is
// RLS-protected and rows are written by the service role, so an anon read returns zero rows →
// the script threw 'Retrospective not found' for EVERY generated retro and silently skipped
// pattern extraction (witnessed: retro 66938c8b on SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001).
// This is a server-side batch script (no end-user context), so the service role is correct.
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { IssueKnowledgeBase } from '../lib/learning/issue-knowledge-base.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

const kb = new IssueKnowledgeBase();

/**
 * Category to sub-agent mapping (LEO Protocol v4.3.2)
 * Used to auto-populate related_sub_agents when patterns are created
 */
const CATEGORY_SUBAGENT_MAPPING = {
  database: ['DATABASE', 'SECURITY'],
  testing: ['TESTING', 'UAT'],
  build: ['GITHUB', 'DEPENDENCY'],
  deployment: ['GITHUB', 'DEPENDENCY'],
  security: ['SECURITY', 'DATABASE'],
  protocol: ['RETRO', 'DOCMON', 'VALIDATION'],
  code_structure: ['VALIDATION', 'DESIGN'],
  performance: ['PERFORMANCE', 'DATABASE'],
  over_engineering: ['VALIDATION', 'DESIGN'],
  api: ['API', 'SECURITY'],
  ui: ['DESIGN', 'UAT'],
  general: ['VALIDATION']
};

/**
 * Get related sub-agents for a category
 */
/**
 * QF-20260808-463: action_items entries are NOT reliably strings. Passing one straight through as
 * `solution` put an object into proven_solutions, and the knowledge base then threw
 * "s.solution.toLowerCase is not a function" on the next comparison — killing the update and
 * losing the lesson. Fixed at BOTH ends: this coerces at the producer, and the KB no longer
 * assumes its element shapes.
 *
 * NOT `String(item)`: that renders every object as '[object Object]', so two unrelated action
 * items would become the same string and get merged into one another's stats. JSON is used only
 * as a last resort because it is at least distinct per item and preserves the content.
 */
export function actionItemToText(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    for (const key of ['action', 'text', 'description', 'title', 'item', 'summary']) {
      if (typeof item[key] === 'string' && item[key].trim()) return item[key];
    }
    return JSON.stringify(item);
  }
  return null;
}

function getRelatedSubAgents(category) {
  return CATEGORY_SUBAGENT_MAPPING[category] || ['VALIDATION'];
}

/**
 * Categorize an issue based on keywords
 */
function categorizeIssue(text) {
  const categories = {
    database: ['database', 'schema', 'migration', 'query', 'supabase', 'postgres', 'RLS', 'SQL'],
    testing: ['test', 'coverage', 'jest', 'playwright', 'e2e', 'unit test', 'integration'],
    build: ['build', 'vite', 'compile', 'bundle', 'webpack', 'dist', 'output'],
    deployment: ['deploy', 'ci/cd', 'github actions', 'pipeline', 'release'],
    security: ['auth', 'security', 'permission', 'RLS', 'encryption', 'token', 'session'],
    protocol: ['handoff', 'sub-agent', 'LEO', 'phase', 'LEAD', 'PLAN', 'EXEC'],
    code_structure: ['import', 'component', 'refactor', 'architecture', 'pattern'],
    performance: ['performance', 'optimization', 'slow', 'timeout', 'latency'],
    over_engineering: ['over-engineer', 'complexity', 'premature', 'abstraction', 'simplify']
  };

  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      return category;
    }
  }

  return 'general';
}

/**
 * Determine severity based on impact keywords
 */
function determineSeverity(text, impact) {
  const lowerText = text.toLowerCase();
  const lowerImpact = impact?.toLowerCase() || '';

  if (lowerText.includes('critical') || lowerText.includes('blocker') ||
      lowerText.includes('production') || lowerText.includes('data loss') ||
      lowerImpact.includes('critical')) {
    return 'critical';
  }

  if (lowerText.includes('high') || lowerText.includes('delayed') ||
      lowerText.includes('blocked') || lowerImpact.includes('high')) {
    return 'high';
  }

  if (lowerText.includes('low') || lowerText.includes('minor') ||
      lowerImpact.includes('standard')) {
    return 'low';
  }

  return 'medium';
}

/**
 * Extract patterns from "What Needs Improvement" items
 */
async function extractPatternsFromImprovements(retro, sdId, _sdKey, linkedFeedbackIds = []) {
  if (!retro.what_needs_improvement || retro.what_needs_improvement.length === 0) {
    console.log('  ℹ️  No improvement items to extract');
    return [];
  }

  const patterns = [];
  // SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 / FR-2 — per-item isolation.
  //
  // THIS IS THE LIVE PRODUCTION WRITER, and it had no try/catch anywhere in its own module. A
  // single createPattern throw propagated UNCAUGHT out of this loop, abandoned every REMAINING
  // improvement in the retrospective, and left learning_extracted_at permanently NULL — then
  // scripts/generate-comprehensive-retrospective.js:771-773 swallowed it to a console.warn, AFTER
  // the retro had already printed its own success line at :748. So one malformed lesson silently
  // cost the whole batch and the run still looked clean.
  //
  // Worth stating because the SD points elsewhere: the SD cites lib/team/findings-extractor.js as
  // the failure site. That function is DEAD CODE — its only reference in the tree is its own barrel
  // re-export. THIS file is the one that actually runs, and its failure mode is worse, because
  // findings-extractor at least isolates per finding.
  const failures = [];

  for (const improvement of retro.what_needs_improvement) {
    // Skip generic items
    if (improvement.length < 20 ||
        improvement === 'No significant challenges documented') {
      continue;
    }
    try {

    const category = categorizeIssue(improvement);
    const severity = determineSeverity(improvement, retro.business_value_delivered);

    console.log(`\n  🔍 Analyzing improvement item (${category}/${severity}):`);
    console.log(`     "${improvement.substring(0, 80)}..."`);

    // Search for similar existing patterns
    const similarPatterns = await kb.search(improvement, {
      limit: 3,
      category: category,
      minSuccessRate: 0
    });

    if (similarPatterns.length > 0 && similarPatterns[0].similarity > 0.5) {
      // High similarity - update existing pattern
      const pattern = similarPatterns[0];
      console.log(`     ✅ Found similar pattern: ${pattern.pattern_id} (${Math.round(pattern.similarity * 100)}% match)`);

      // Increment occurrence count
      await kb.recordOccurrence({
        pattern_id: pattern.pattern_id,
        sd_id: sdId,
        solution_applied: 'Identified in retrospective',
        resolution_time_minutes: 0,
        was_successful: true,
        found_via_search: false
      });

      patterns.push({
        action: 'updated',
        pattern_id: pattern.pattern_id,
        issue: improvement
      });

    } else {
      // No similar pattern - create new one
      console.log('     ✨ Creating new pattern...');

      // LEO Protocol v4.3.2: Auto-populate related_sub_agents
      const relatedSubAgents = getRelatedSubAgents(category);
      console.log(`     📎 Related sub-agents: ${relatedSubAgents.join(', ')}`);

      const newPattern = await kb.createPattern({
        issue_summary: improvement,
        category: category,
        severity: severity,
        sd_id: sdId,
        // QF-20260808-463: was `retro.action_items[0]` raw — an object reached the KB and threw.
        solution: retro.action_items.length > 0 ? actionItemToText(retro.action_items[0]) : null,
        resolution_time_minutes: null,
        related_sub_agents: relatedSubAgents,
        source_feedback_ids: linkedFeedbackIds
      });

      patterns.push({
        action: 'created',
        pattern_id: newPattern.pattern_id,
        issue: improvement,
        related_sub_agents: relatedSubAgents
      });

      console.log(`     ✅ Created pattern: ${newPattern.pattern_id}`);
    }
    } catch (err) {
      // FR-3 — a DESTROYED lesson must be distinguishable from nothing-to-create.
      //
      // Note what is NOT being fixed here: the printed count. The SD claims the summary count is
      // "contradicted by the database". It is not — createPattern throws, and every counter
      // increment sits after its await, so a failure never inflates a count. The count was always
      // honest. What was missing is that destruction surfaced ONLY as a warning that nothing read
      // and nothing acted on, so "0 created" from a healthy run and "0 created" because three
      // lessons were destroyed were indistinguishable.
      failures.push({ improvement: improvement.substring(0, 120), code: err.code || null, message: err.message });
      console.error(`     ❌ LESSON LOST (${err.code || 'error'}): ${err.message}`);
    }
  }

  if (failures.length) {
    // Loud, structured, and returned to the caller — not a warn that dies in the log.
    console.error(`\n  ⚠️  ${failures.length} lesson(s) DESTROYED and not persisted:`);
    failures.forEach((f) => console.error(`     - [${f.code || 'error'}] ${f.improvement}`));
    patterns.destroyed = failures;
  }

  return patterns;
}

/**
 * Extract successful patterns from "What Went Well"
 */
async function extractSuccessPatternsFromAchievements(retro, _sdId) {
  if (!retro.success_patterns || retro.success_patterns.length === 0) {
    console.log('  ℹ️  No success patterns to extract');
    return [];
  }

  const patterns = [];

  for (const successPattern of retro.success_patterns) {
    if (successPattern.length < 20) continue;

    const category = categorizeIssue(successPattern);

    console.log(`\n  ✅ Analyzing success pattern (${category}):`);
    console.log(`     "${successPattern.substring(0, 80)}..."`);

    // Create prevention checklist items from success patterns
    const similarPatterns = await kb.search(successPattern, {
      limit: 3,
      category: category
    });

    if (similarPatterns.length > 0 && similarPatterns[0].similarity > 0.4) {
      const pattern = similarPatterns[0];
      console.log(`     📋 Adding to prevention checklist: ${pattern.pattern_id}`);

      // This would update the pattern's prevention_checklist
      // Implementation depends on your update mechanism
      patterns.push({
        action: 'prevention_added',
        pattern_id: pattern.pattern_id,
        prevention: successPattern
      });
    }
  }

  return patterns;
}

/**
 * Main extraction function
 */
async function extractPatternsFromRetrospective(retroId) {
  console.log('\n📚 PATTERN EXTRACTION FROM RETROSPECTIVE');
  console.log('═'.repeat(60));
  console.log(`Retrospective ID: ${retroId}\n`);

  // Get retrospective details
  const { data: retro, error: retroError } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('id', retroId)
    .single();

  if (retroError || !retro) {
    throw new Error(`Retrospective not found: ${retroId}`);
  }

  // SD-LEO-INFRA-LEARNING-ARCHITECTURE-001: Idempotency check
  if (retro.learning_extracted_at) {
    console.log(`  ⏭️  Already extracted at ${retro.learning_extracted_at}`);
    return {
      success: true,
      skipped: true,
      retrospective_id: retroId,
      extracted_at: retro.learning_extracted_at,
      message: 'Pattern extraction already completed for this retrospective'
    };
  }

  console.log(`Title: ${retro.title}`);
  console.log(`SD: ${retro.sd_id}`);
  console.log(`Type: ${retro.retro_type}`);

  // Get SD details
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('id', retro.sd_id)
    .single();

  const sdKey = sd?.sd_key || 'UNKNOWN';
  console.log(`SD Key: ${sdKey}`);

  // GAP-007: Query linked feedback IDs for bidirectional pattern linkage
  let linkedFeedbackIds = [];
  if (retro.sd_id) {
    const { data: linkedFeedback } = await supabase
      .from('feedback')
      .select('id')
      .or(`strategic_directive_id.eq.${retro.sd_id},resolution_sd_id.eq.${retro.sd_id}`);
    linkedFeedbackIds = (linkedFeedback || []).map(f => f.id);
    if (linkedFeedbackIds.length > 0) {
      console.log(`Linked feedback: ${linkedFeedbackIds.length} item(s)`);
    }
  }

  // Extract patterns from improvements
  console.log('\n📊 Extracting patterns from improvement items...');
  const improvementPatterns = await extractPatternsFromImprovements(
    retro,
    retro.sd_id,
    sdKey,
    linkedFeedbackIds
  );

  // Extract success patterns
  console.log('\n🌟 Extracting success patterns...');
  const successPatterns = await extractSuccessPatternsFromAchievements(
    retro,
    retro.sd_id
  );

  // Summary
  const created = improvementPatterns.filter(p => p.action === 'created').length;
  const updated = improvementPatterns.filter(p => p.action === 'updated').length;
  const preventions = successPatterns.length;

  console.log('\n✨ EXTRACTION COMPLETE');
  console.log(`   Patterns created: ${created}`);
  console.log(`   Patterns updated: ${updated}`);
  console.log(`   Prevention items: ${preventions}`);
  console.log(`   Total processed: ${created + updated + preventions}`);

  // Update retrospective metadata + SD-LEO-INFRA-LEARNING-ARCHITECTURE-001: Idempotency stamp
  await supabase
    .from('retrospectives')
    .update({
      status: 'PUBLISHED',
      learning_extracted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', retroId);

  // SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 / FR-3 — CORRECTED AT EXEC AFTER TESTING PROVED MY
  // FIRST ATTEMPT DID NOT WORK.
  //
  // I had attached the failures as `patterns.destroyed` on the returned ARRAY. Spreading an array
  // copies its ELEMENTS, not its custom properties, so `[...improvementPatterns]` silently dropped
  // it and the return object never carried a destroyed key at all. TESTING ran it live three
  // times: a retrospective in which 100% of lessons were destroyed exited 0 and printed
  // {"patterns_created":0,"all_patterns":[]} — byte-identical to a healthy run with nothing to do.
  //
  // So my fix for "a destroyed lesson is indistinguishable from nothing-to-create" was itself
  // indistinguishable from nothing-to-create. That is this SD's own defect, reproduced by the
  // person fixing it, and it survived because I verified the claim by reading my code instead of
  // running it.
  //
  // Now carried as a first-class field, and success is FALSE when anything was destroyed, so the
  // exit code changes too — AC-4 asks for the exit code AND the structured output, and stderr
  // alone satisfied neither.
  return {
    retrospective_id: retroId,
    patterns_updated: updated,
    prevention_items: preventions,
    ...assembleExtractionResult(improvementPatterns, successPatterns, created)
  };
}

/**
 * Assemble the destruction-aware result. EXPORTED SO THE TEST BINDS TO THIS CODE rather than to a
 * copy of it — a test that re-implements the logic it checks agrees with whatever its author
 * believed, which is precisely how the original defect survived review.
 *
 * @param {Array} improvementPatterns results from the improvements loop, possibly carrying .destroyed
 * @param {Array} successPatterns     results from the successes loop, possibly carrying .destroyed
 * @param {number} created            count of newly created patterns
 */
function assembleExtractionResult(improvementPatterns, successPatterns, created) {
  // Read .destroyed off each source BEFORE spreading. Spreading an array copies ELEMENTS, not
  // custom properties, so doing this after the spread silently loses every failure — which is the
  // bug this function exists to make impossible to reintroduce quietly.
  const destroyed = [
    ...(improvementPatterns.destroyed || []),
    ...(successPatterns.destroyed || []),
  ];

  return {
    success: destroyed.length === 0,
    patterns_created: created,
    lessons_destroyed: destroyed.length,
    destroyed,
    all_patterns: [...improvementPatterns, ...successPatterns]
  };
}

/**
 * CLI usage
 */
async function main() {
  const retroId = process.argv[2];

  if (!retroId) {
    console.error('Usage: node auto-extract-patterns-from-retro.js <RETROSPECTIVE_UUID>');
    console.error('');
    console.error('This script:');
    console.error('  1. Reads retrospective from database');
    console.error('  2. Analyzes "What Needs Improvement" items');
    console.error('  3. Creates or updates issue patterns');
    console.error('  4. Extracts success patterns for prevention checklists');
    console.error('  5. Updates pattern database automatically');
    console.error('');
    console.error('Typically called by: Continuous Improvement Coach');
    console.error('After: Retrospective generation completes');
    console.error('');
    process.exit(1);
  }

  try {
    const result = await extractPatternsFromRetrospective(retroId);
    console.log('\n' + JSON.stringify(result, null, 2));
    // FR-3 — exit NON-ZERO when lessons were destroyed. AC-4 asks for the exit code AND the
    // structured output; a run that loses every lesson previously exited 0, so any caller checking
    // only the status code saw success. This is the second half of the same fix, and I missed it
    // the first time because I checked the output channel and stopped there.
    process.exit(result?.lessons_destroyed > 0 ? 2 : 0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for programmatic use
// extractPatternsFromImprovements is exported for tests/unit/learning/batch-resilience.test.js.
// FR-2 is this SD's headline mechanism and the live production writer, and it was resting entirely
// on one-off manual probes with no CI-visible guard. Exporting the real function is deliberate: a
// test that reconstructs the loop can only confirm its author's belief, which is how the FR-3 fix
// shipped broken the first time.
export { extractPatternsFromRetrospective, assembleExtractionResult, extractPatternsFromImprovements };

// Run if called directly
if (process.argv[1].endsWith('auto-extract-patterns-from-retro.js')) {
  main();
}
