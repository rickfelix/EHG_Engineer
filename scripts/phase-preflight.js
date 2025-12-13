#!/usr/bin/env node
/**
 * PHASE PREFLIGHT - Proactive Knowledge Retrieval
 * SD-LEO-LEARN-001: Proactive Learning Integration
 *
 * Retrieves relevant historical lessons before starting a LEO Protocol phase.
 * Queries retrospectives and issue patterns based on SD category and phase.
 *
 * Usage:
 *   node scripts/phase-preflight.js --phase EXEC --sd-id <UUID>
 *   node scripts/phase-preflight.js --phase PLAN --sd-id <UUID>
 *   node scripts/phase-preflight.js --phase LEAD --sd-id <UUID>
 *
 * Output: Ranked table of relevant patterns with success rates and recommendations
 */

import { createClient } from '@supabase/supabase-js';
import { IssueKnowledgeBase } from '../lib/learning/issue-knowledge-base.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const kb = new IssueKnowledgeBase();

/**
 * Phase-specific search strategies
 */
const PHASE_STRATEGIES = {
  EXEC: {
    name: 'Implementation',
    categories: ['database', 'testing', 'build', 'code_structure', 'performance', 'security'],
    retrospective_focus: ['what_needs_improvement', 'failure_patterns', 'key_learnings'],
    context: 'You are about to start implementation. These patterns show common issues encountered during coding.'
  },
  PLAN: {
    name: 'Planning & Design',
    categories: ['protocol', 'testing', 'over_engineering', 'code_structure'],
    retrospective_focus: ['success_patterns', 'key_learnings', 'what_went_well'],
    context: 'You are creating a PRD. These patterns show proven approaches and pitfalls to avoid in design.'
  },
  LEAD: {
    name: 'Strategic Approval',
    categories: ['over_engineering', 'protocol', 'general'],
    retrospective_focus: ['failure_patterns', 'what_needs_improvement', 'business_value_delivered'],
    context: 'You are evaluating an SD. These patterns show strategic issues and over-engineering risks.'
  }
};

/**
 * SD-LEO-GEMINI-001: Discovery Gate (US-001)
 *
 * Validates that ≥5 files have been read before PRD creation begins.
 * This gate ensures PLAN agents explore the codebase before writing PRDs.
 *
 * @param {string} sdId - The Strategic Directive ID
 * @returns {Object} Discovery gate result with pass/fail and file count
 */
async function validateDiscoveryGate(sdId) {
  console.log('\n🔍 DISCOVERY GATE: Exploration Verification');
  console.log('='.repeat(60));

  const MINIMUM_FILES = 5;
  const ADEQUATE_FILES = 10;

  // Check for existing PRD with exploration evidence
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, exploration_summary, metadata')
    .eq('directive_id', sdId)
    .single();

  // Also check SD metadata for exploration evidence
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
    .single();

  // Count files from exploration_summary (preferred) or metadata
  let filesExplored = [];
  let source = 'none';

  if (prd?.exploration_summary && Array.isArray(prd.exploration_summary)) {
    filesExplored = prd.exploration_summary;
    source = 'prd.exploration_summary';
  } else if (prd?.metadata?.files_explored && Array.isArray(prd.metadata.files_explored)) {
    filesExplored = prd.metadata.files_explored;
    source = 'prd.metadata.files_explored';
  } else if (sd?.metadata?.exploration_files && Array.isArray(sd.metadata.exploration_files)) {
    filesExplored = sd.metadata.exploration_files;
    source = 'sd.metadata.exploration_files';
  }

  const fileCount = filesExplored.length;

  console.log('\n📊 Discovery Gate Assessment:');
  console.log(`   Files documented: ${fileCount}`);
  console.log(`   Minimum required: ${MINIMUM_FILES}`);
  console.log(`   Source: ${source}`);

  // Determine rating and status
  let rating, passed, message;

  if (fileCount >= ADEQUATE_FILES) {
    rating = 'COMPREHENSIVE';
    passed = true;
    message = `🎉 Excellent exploration! ${fileCount} files documented.`;
    console.log(`\n✅ ${message}`);
  } else if (fileCount >= MINIMUM_FILES) {
    rating = 'ADEQUATE';
    passed = true;
    message = `✅ Adequate exploration (${fileCount} files). Consider exploring more for complex SDs.`;
    console.log(`\n⚠️  ${message}`);
  } else if (fileCount > 0) {
    rating = 'INSUFFICIENT';
    passed = false;
    message = `❌ Insufficient exploration: ${fileCount} files documented, minimum ${MINIMUM_FILES} required.`;
    console.log(`\n${message}`);
    console.log('\n📋 TO PROCEED:');
    console.log(`   1. Read at least ${MINIMUM_FILES - fileCount} more relevant files`);
    console.log('   2. Document exploration in PRD metadata or exploration_summary');
    console.log('   3. Re-run phase preflight');
  } else {
    rating = 'NONE';
    passed = false;
    message = `❌ No exploration documented. Read ≥${MINIMUM_FILES} files before creating PRD.`;
    console.log(`\n${message}`);
    console.log('\n📋 REQUIRED ACTIONS:');
    console.log('   1. Use Glob/Read tools to explore codebase');
    console.log('   2. Document findings in exploration_summary');
    console.log(`   3. Minimum ${MINIMUM_FILES} files with documented findings`);
  }

  // Show explored files if any
  if (fileCount > 0 && fileCount <= 15) {
    console.log('\n📁 Files Explored:');
    filesExplored.slice(0, 15).forEach((f, i) => {
      const filePath = typeof f === 'string' ? f : f.file_path || f.path;
      console.log(`   ${i + 1}. ${filePath}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  return {
    passed,
    rating,
    fileCount,
    minimumRequired: MINIMUM_FILES,
    message,
    filesExplored: filesExplored.map(f => typeof f === 'string' ? f : f.file_path || f.path),
    source
  };
}

/**
 * Get SD metadata
 */
async function getSDMetadata(sdId) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    throw new Error(`SD not found: ${sdId}`);
  }

  return sd;
}

/**
 * Search issue patterns relevant to phase and SD category
 */
async function searchIssuePatterns(sdCategory, phaseStrategy) {
  const results = [];

  for (const category of phaseStrategy.categories) {
    const patterns = await kb.search(sdCategory, {
      category,
      limit: 3,
      minSuccessRate: 0
    });

    results.push(...patterns);
  }

  // De-duplicate by pattern_id
  const uniquePatterns = Array.from(
    new Map(results.map(p => [p.pattern_id, p])).values()
  );

  // Sort by overall score
  uniquePatterns.sort((a, b) => b.overall_score - a.overall_score);

  return uniquePatterns.slice(0, 5); // Top 5 patterns
}

/**
 * Search retrospectives relevant to SD category
 */
async function searchRetrospectives(sdCategory, phaseStrategy, limit = 3) {
  const { data: retrospectives, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('status', 'PUBLISHED')
    .gte('quality_score', 70)
    .order('conducted_date', { ascending: false })
    .limit(20); // Get recent 20 to filter

  if (error || !retrospectives) {
    console.log('  ℹ️  No retrospectives found');
    return [];
  }

  // Calculate relevance based on category match and quality
  const scored = retrospectives.map(retro => {
    const categoryMatch = retro.learning_category?.toLowerCase().includes(sdCategory.toLowerCase()) ? 1.0 : 0.3;
    const qualityScore = retro.quality_score / 100;
    const recency = new Date(retro.conducted_date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) ? 1.0 : 0.5;

    return {
      ...retro,
      relevance_score: categoryMatch * 0.5 + qualityScore * 0.3 + recency * 0.2
    };
  });

  // Sort by relevance
  scored.sort((a, b) => b.relevance_score - a.relevance_score);

  return scored.slice(0, limit);
}

/**
 * Format and display results
 */
function displayResults(sd, phase, strategy, patterns, retrospectives) {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║          🔍 PHASE PREFLIGHT - Knowledge Retrieval Results            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📋 SD: ${sd.sd_key} - ${sd.title}`);
  console.log(`🎯 Phase: ${strategy.name} (${phase})`);
  console.log(`📂 Category: ${sd.category}`);
  console.log(`\n💡 Context: ${strategy.context}\n`);

  console.log('─'.repeat(75));

  // Display issue patterns
  if (patterns.length > 0) {
    console.log('\n📊 RELEVANT ISSUE PATTERNS:\n');

    patterns.forEach((pattern, idx) => {
      const matchPercent = Math.round(pattern.similarity * 100);
      const successRate = Math.round(pattern.success_rate);

      // Determine recommendation level
      let recommendation = '';
      let emoji = '';
      if (successRate >= 85) {
        recommendation = 'HIGH SUCCESS - Apply preemptively';
        emoji = '✅';
      } else if (successRate >= 50) {
        recommendation = 'MODERATE - Be aware, prepare contingency';
        emoji = '⚠️';
      } else {
        recommendation = 'LOW SUCCESS - Known failure mode, avoid';
        emoji = '❌';
      }

      console.log(`${idx + 1}. ${emoji} ${pattern.pattern_id} [${matchPercent}% match, ${successRate}% success]`);
      console.log(`   Issue: ${pattern.issue_summary.substring(0, 70)}${pattern.issue_summary.length > 70 ? '...' : ''}`);
      console.log(`   Category: ${pattern.category} | Severity: ${pattern.severity}`);
      console.log(`   Recommendation: ${recommendation}`);

      // Show best solution
      if (pattern.proven_solutions && pattern.proven_solutions.length > 0) {
        const bestSolution = pattern.proven_solutions
          .sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0))[0];

        console.log(`   Solution: ${bestSolution.solution.substring(0, 80)}${bestSolution.solution.length > 80 ? '...' : ''}`);
        console.log(`   Avg Time: ${Math.round(bestSolution.avg_resolution_time_minutes || 0)} min`);
      }

      // Show prevention checklist (first item only)
      if (pattern.prevention_checklist && pattern.prevention_checklist.length > 0) {
        console.log(`   Prevention: ${pattern.prevention_checklist[0].substring(0, 70)}${pattern.prevention_checklist[0].length > 70 ? '...' : ''}`);
      }

      console.log('');
    });
  } else {
    console.log('\n  ℹ️  No issue patterns found for this category\n');
  }

  // Display retrospectives
  if (retrospectives.length > 0) {
    console.log('─'.repeat(75));
    console.log('\n📚 RELEVANT RETROSPECTIVES:\n');

    retrospectives.forEach((retro, idx) => {
      console.log(`${idx + 1}. ${retro.title} (Quality: ${retro.quality_score}/100)`);
      console.log(`   SD: ${retro.sd_id} | Category: ${retro.learning_category || 'N/A'}`);
      console.log(`   Date: ${new Date(retro.conducted_date).toLocaleDateString()}`);

      // Show key learnings (first 2)
      if (retro.key_learnings && retro.key_learnings.length > 0) {
        console.log(`   Key Learning: ${retro.key_learnings[0].substring(0, 70)}${retro.key_learnings[0].length > 70 ? '...' : ''}`);
      }

      // Show success or failure pattern (context-dependent)
      if (phase === 'PLAN' && retro.success_patterns && retro.success_patterns.length > 0) {
        console.log(`   Success Pattern: ${retro.success_patterns[0].substring(0, 70)}${retro.success_patterns[0].length > 70 ? '...' : ''}`);
      } else if (retro.failure_patterns && retro.failure_patterns.length > 0) {
        console.log(`   Failure Pattern: ${retro.failure_patterns[0].substring(0, 70)}${retro.failure_patterns[0].length > 70 ? '...' : ''}`);
      }

      console.log('');
    });
  } else {
    console.log('\n  ℹ️  No retrospectives found for this category\n');
  }

  // Summary and next steps
  console.log('─'.repeat(75));
  console.log('\n📝 RECOMMENDED ACTIONS:\n');

  if (phase === 'EXEC') {
    console.log('  1. Review high-success patterns (✅) and apply solutions preemptively');
    console.log('  2. Add prevention checklist items to your implementation plan');
    console.log('  3. Note low-success patterns (❌) and avoid those approaches');
    console.log('  4. Document consulted patterns in your handoff (see below)');
  } else if (phase === 'PLAN') {
    console.log('  1. Incorporate success patterns into PRD technical approach');
    console.log('  2. Add prevention measures to acceptance criteria');
    console.log('  3. Reference proven solutions in "Reference Materials" section');
    console.log('  4. Flag known pitfalls in "Risks & Mitigations" section');
  } else if (phase === 'LEAD') {
    console.log('  1. Check for over-engineering patterns in this category');
    console.log('  2. Review historical complexity vs. actual implementation time');
    console.log('  3. Apply simplicity-first lens if red flags found');
    console.log('  4. Reference historical context in approval notes');
  }

  console.log('\n📋 HANDOFF DOCUMENTATION FORMAT:\n');
  console.log('  Add to handoff under "Patterns Consulted":');
  patterns.slice(0, 3).forEach(p => {
    console.log(`  - ${p.pattern_id}: ${p.issue_summary.substring(0, 50)}... (Success: ${Math.round(p.success_rate)}%, Applied: Yes/No)`);
  });

  console.log('\n╚═══════════════════════════════════════════════════════════════════════╝\n');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const phaseIndex = args.indexOf('--phase');
  const sdIdIndex = args.indexOf('--sd-id');

  if (phaseIndex === -1 || sdIdIndex === -1) {
    console.error('\n❌ Usage: node scripts/phase-preflight.js --phase <LEAD|PLAN|EXEC> --sd-id <UUID>\n');
    console.error('Examples:');
    console.error('  node scripts/phase-preflight.js --phase EXEC --sd-id SD-LEO-LEARN-001');
    console.error('  node scripts/phase-preflight.js --phase PLAN --sd-id SD-RETRO-ENHANCE-001');
    console.error('  node scripts/phase-preflight.js --phase LEAD --sd-id SD-KNOWLEDGE-001\n');
    process.exit(1);
  }

  const phase = args[phaseIndex + 1]?.toUpperCase();
  const sdId = args[sdIdIndex + 1];

  if (!['LEAD', 'PLAN', 'EXEC'].includes(phase)) {
    console.error(`\n❌ Invalid phase: ${phase}. Must be LEAD, PLAN, or EXEC\n`);
    process.exit(1);
  }

  if (!sdId) {
    console.error('\n❌ SD ID is required\n');
    process.exit(1);
  }

  try {
    console.log('\n🔄 Retrieving knowledge for phase start...\n');

    // Get SD metadata
    const sd = await getSDMetadata(sdId);
    const strategy = PHASE_STRATEGIES[phase];

    // SD-LEO-GEMINI-001 (US-001): Discovery Gate for PLAN phase
    // Validates that ≥5 files have been explored before PRD creation
    if (phase === 'PLAN') {
      const discoveryResult = await validateDiscoveryGate(sdId);

      if (!discoveryResult.passed) {
        console.log('\n❌ DISCOVERY GATE FAILED');
        console.log('   Cannot proceed to PLAN phase without adequate codebase exploration.');
        console.log(`   Status: ${discoveryResult.rating}`);
        console.log(`   Files documented: ${discoveryResult.fileCount}/${discoveryResult.minimumRequired}`);
        console.log('\n💡 Run exploration first:');
        console.log('   1. Use Glob to find relevant files');
        console.log('   2. Use Read to examine ≥5 files');
        console.log('   3. Document findings in exploration_summary');
        console.log('   4. Re-run: node scripts/phase-preflight.js --phase PLAN --sd-id ' + sdId);
        process.exit(1);
      }

      console.log(`\n✅ Discovery Gate: ${discoveryResult.rating} (${discoveryResult.fileCount} files)`);
    }

    // Search issue patterns
    const patterns = await searchIssuePatterns(sd.category || sd.title, strategy);

    // Search retrospectives
    const retrospectives = await searchRetrospectives(sd.category || sd.title, strategy);

    // Display results
    displayResults(sd, phase, strategy, patterns, retrospectives);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Verify SD ID exists in database');
    console.error('  2. Check .env has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    console.error('  3. Ensure issue_patterns and retrospectives tables exist\n');
    process.exit(1);
  }
}

main();
