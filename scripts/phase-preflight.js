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
import { enforceChildProgressionGate } from './modules/child-progression-gate.js';
import { validateDecompositionGate, _checkParentReadyForChildren } from './modules/decomposition-gate.js';
import dotenv from 'dotenv';

dotenv.config();

// FIX: Use service role key for server-side scripts that need full database access
// The anon key may have RLS restrictions or be invalid for backend operations
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, exploration_summary, metadata')
    .eq('directive_id', sdId)
    .single();

  // Also check SD metadata for exploration evidence
  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('exploration_summary, metadata')
    .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
    .single();

  // Count files from exploration_summary (check multiple locations for backward compatibility)
  let filesExplored = [];
  let source = 'none';

  // FIX: Check sd.exploration_summary.files_explored FIRST (standard location)
  if (sd?.exploration_summary?.files_explored && Array.isArray(sd.exploration_summary.files_explored)) {
    filesExplored = sd.exploration_summary.files_explored;
    source = 'sd.exploration_summary.files_explored';
  } else if (prd?.exploration_summary && Array.isArray(prd.exploration_summary)) {
    filesExplored = prd.exploration_summary;
    source = 'prd.exploration_summary';
  } else if (prd?.metadata?.exploration_summary && Array.isArray(prd.metadata.exploration_summary)) {
    // SYSTEMIC FIX: Also check metadata.exploration_summary (common storage location)
    filesExplored = prd.metadata.exploration_summary;
    source = 'prd.metadata.exploration_summary';
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
 * FIX: Use separate queries to avoid PostgREST filter parsing issues with dots in SD IDs
 * Root cause: .or() filter interprets dots as syntax delimiters, not literal characters
 */
async function getSDMetadata(sdId) {
  // Detect if input is UUID format
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  let sd = null;
  let error = null;

  if (isUUID) {
    // Query by UUID id column
    const result = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();
    sd = result.data;
    error = result.error;
  } else {
    // Note: legacy_id column was deprecated and removed - using sd_key instead
    // Try id column first (handles SD-PARENT-4.0 format)
    let result = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();

    if (!result.data) {
      // Try sd_key column (handles SD-PARENT-4-0 format with hyphens)
      result = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('sd_key', sdId)
        .maybeSingle();
    }

    sd = result.data;
    error = result.error;
  }

  if (error || !sd) {
    throw new Error(`SD not found: ${sdId}`);
  }

  return sd;
}

/**
 * PAT-PARENT-DET: Parent/Child SD Detection (INTELLIGENT)
 * Detects parent/child relationships from MULTIPLE signals, not just flags.
 *
 * Signals checked:
 * 1. metadata.is_parent (explicit flag)
 * 2. metadata.child_sds (array of defined children)
 * 3. metadata.child_count (count of intended children)
 * 4. metadata.phases (phase-based decomposition)
 * 5. metadata.dependency_graph (child dependency mapping)
 * 6. parent_sd_id (for child detection)
 */
async function detectParentChildHierarchy(sd) {
  console.log('\n🔗 PARENT/CHILD SD DETECTION (Intelligent)');
  console.log('='.repeat(60));

  // Check multiple signals for parent status - not just a boolean flag
  const parentSignals = {
    explicitFlag: sd.metadata?.is_parent === true,
    hasChildDefinitions: Array.isArray(sd.metadata?.child_sds) && sd.metadata.child_sds.length > 0,
    hasChildCount: (sd.metadata?.child_count || 0) > 0,
    hasPhases: Array.isArray(sd.metadata?.phases) && sd.metadata.phases.length > 1,
    hasDependencyGraph: sd.metadata?.dependency_graph && Object.keys(sd.metadata.dependency_graph).length > 0,
    hasExecutionOrder: Array.isArray(sd.metadata?.execution_order) && sd.metadata.execution_order.length > 0
  };

  // Count how many parent signals are present
  const activeSignals = Object.entries(parentSignals).filter(([_, v]) => v);
  const isLikelyParent = activeSignals.length >= 1; // Any signal indicates parent intent

  const hasParent = !!sd.parent_sd_id;

  // Display detection reasoning
  // Note: legacy_id was deprecated - using sd_key instead
  if (isLikelyParent && !hasParent) {
    console.log('   🎯 SD Type: PARENT ORCHESTRATOR (detected from metadata)');
    console.log(`   📋 SD: ${sd.sd_key || sd.id}`);
    console.log(`   📄 Title: ${sd.title}`);
    console.log('\n   📊 DETECTION SIGNALS:');

    if (parentSignals.hasChildDefinitions) {
      const childCount = sd.metadata.child_sds.length;
      console.log(`      ✅ child_sds: ${childCount} children defined in metadata`);
      sd.metadata.child_sds.forEach((child, i) => {
        const childId = typeof child === 'string' ? child : (child.sd_id || child.id || child.title);
        console.log(`         ${i + 1}. ${childId}`);
      });
    }
    if (parentSignals.hasChildCount) {
      console.log(`      ✅ child_count: ${sd.metadata.child_count} children intended`);
    }
    if (parentSignals.hasPhases) {
      console.log(`      ✅ phases: ${sd.metadata.phases.join(', ')}`);
    }
    if (parentSignals.hasDependencyGraph) {
      const depCount = Object.keys(sd.metadata.dependency_graph).length;
      console.log(`      ✅ dependency_graph: ${depCount} child dependencies mapped`);
    }
    if (parentSignals.hasExecutionOrder) {
      console.log('      ✅ execution_order: Sequenced execution defined');
    }
    if (parentSignals.explicitFlag) {
      console.log('      ✅ is_parent: Explicitly flagged as parent');
    }

    // Check if children exist in database yet
    // Note: legacy_id was deprecated - using sd_key instead
    const { data: existingChildren } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, progress_percentage')
      .eq('parent_sd_id', sd.id)
      .order('sd_key', { ascending: true });

    const childrenInDb = existingChildren?.length || 0;
    const childrenDefined = sd.metadata?.child_sds?.length || sd.metadata?.child_count || 0;

    console.log('\n   👶 CHILDREN STATUS:');
    console.log(`      Defined in metadata: ${childrenDefined}`);
    console.log(`      Created in database: ${childrenInDb}`);

    if (childrenInDb === 0 && childrenDefined > 0) {
      console.log('\n   ⚠️  CHILDREN NOT YET CREATED');
      console.log('      Children are defined but not in database yet.');
      console.log('      They will be created during PLAN phase.');
      console.log('      LEAD should validate strategic intent of child decomposition.');
    } else if (childrenInDb > 0) {
      console.log('\n   📋 EXISTING CHILDREN:');
      let completedCount = 0;
      existingChildren.forEach(c => {
        const icon = c.status === 'completed' ? '✅' :
                     c.status === 'in_progress' ? '🔄' : '📋';
        if (c.status === 'completed') completedCount++;
        console.log(`      ${icon} ${c.sd_key || c.id} [${c.status}] ${c.progress_percentage || 0}%`);
      });
      console.log(`\n   📊 Progress: ${completedCount}/${childrenInDb} children completed`);
    }

    console.log('\n' + '='.repeat(60));
    return {
      type: 'parent',
      sd,
      children: existingChildren || [],
      definedChildren: sd.metadata?.child_sds || [],
      signals: parentSignals
    };
  }

  if (!isLikelyParent && !hasParent) {
    console.log('   📋 SD Type: STANDALONE (no parent/child relationship detected)');
    console.log('   No parent signals found in metadata.');
    console.log('='.repeat(60));
    return { type: 'standalone', sd };
  }

  // Child SD detection (has a parent)
  if (hasParent) {
    console.log('   🔗 SD Type: CHILD SD');
    console.log(`   📋 SD: ${sd.sd_key || sd.id}`);
    console.log(`   📄 Title: ${sd.title}`);

    // Get parent info
    // Note: legacy_id was deprecated - using sd_key instead
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase')
      .eq('id', sd.parent_sd_id)
      .single();

    if (parent) {
      console.log('\n   👆 PARENT SD:');
      console.log(`      📋 ${parent.sd_key || parent.id}`);
      console.log(`      📄 ${parent.title}`);
      console.log(`      📊 Status: ${parent.status} | Phase: ${parent.current_phase}`);

      // LEO Protocol rule: Parent must be in EXEC phase for child to be activated
      // (per PAT-PARENT-CHILD-001 in CLAUDE_LEAD.md)
      if (parent.status !== 'in_progress' && parent.current_phase !== 'EXEC') {
        console.log('\n   ⚠️  PARENT STATUS WARNING:');
        console.log('      LEO Protocol requires parent to be in EXEC phase');
        console.log('      before child SDs can be activated.');
        console.log(`      Current parent status: ${parent.status} / ${parent.current_phase}`);
        console.log('      Consider: node scripts/handoff.js execute PLAN-TO-EXEC ' + (parent.sd_key || parent.id));
      }
    }

    console.log('\n' + '='.repeat(60));
    return { type: 'child', sd, parent };
  }
}

/**
 * Display workflow guidance for PARENT orchestrator SDs
 */
function displayParentWorkflowGuidance(sd, children, _currentPhase) {
  console.log('\n📖 PARENT ORCHESTRATOR WORKFLOW GUIDANCE');
  console.log('─'.repeat(60));
  console.log(`
  PARENT SD LIFECYCLE:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. LEAD → PLAN    : Get approval, create PRD with child decomposition
  2. PLAN → EXEC    : Parent enters ORCHESTRATOR/WAITING state
  3. Children work  : Each child goes through full LEAD→PLAN→EXEC
  4. Auto-complete  : Parent completes when all children finish

  CURRENT STATE: ${sd.status} / ${sd.current_phase}
  `);

  // Determine next action based on state
  const completedChildren = (children || []).filter(c => c.status === 'completed').length;
  const totalChildren = (children || []).length;

  if (sd.status === 'draft' && sd.current_phase === 'LEAD_APPROVAL') {
    console.log('  📍 NEXT ACTION: Run LEAD-TO-PLAN handoff for parent');
    console.log(`     node scripts/handoff.js execute LEAD-TO-PLAN ${sd.sd_key || sd.id}`);
  } else if (sd.status === 'planning' || sd.current_phase === 'PLAN') {
    console.log('  📍 NEXT ACTION: Complete PRD, then run PLAN-TO-EXEC');
    console.log(`     node scripts/handoff.js execute PLAN-TO-EXEC ${sd.sd_key || sd.id}`);
    console.log('     This puts parent in ORCHESTRATOR/WAITING state');
  } else if (sd.status === 'in_progress' || sd.current_phase === 'EXEC') {
    console.log('  📍 PARENT IS IN ORCHESTRATOR/WAITING STATE');
    console.log(`     Children completed: ${completedChildren}/${totalChildren}`);
    if (completedChildren < totalChildren) {
      const nextChild = (children || []).find(c => c.status === 'draft' || c.status === 'planning');
      if (nextChild) {
        console.log(`\n     Next child to work on: ${nextChild.sd_key}`);
        console.log(`     node scripts/phase-preflight.js --phase LEAD --sd-id ${nextChild.sd_key}`);
      }
    } else {
      console.log('\n     All children completed! Parent can be finalized.');
      console.log(`     node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sd.sd_key || sd.id}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
}

/**
 * Display workflow guidance for CHILD SDs
 */
function displayChildWorkflowGuidance(sd, parent, _currentPhase) {
  console.log('\n📖 CHILD SD WORKFLOW GUIDANCE');
  console.log('─'.repeat(60));
  console.log(`
  CHILD SD LIFECYCLE:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PREREQUISITE: Parent must be in EXEC phase (orchestrator state)

  1. LEAD approval  : Validate strategic value for this child
  2. PLAN phase     : Create child-specific PRD
  3. EXEC phase     : Implement child deliverables
  4. Completion     : PLAN-TO-LEAD → LEAD-FINAL-APPROVAL

  PARENT STATE: ${parent?.status || 'UNKNOWN'} / ${parent?.current_phase || 'UNKNOWN'}
  `);

  // Check if parent blocks child work
  if (parent && parent.status !== 'in_progress' && parent.current_phase !== 'EXEC') {
    console.log('  ⛔ BLOCKED: Parent is NOT in EXEC phase');
    console.log('     Child SDs cannot be activated until parent is in orchestrator state.');
    console.log('\n     TO UNBLOCK: Progress parent SD first:');
    console.log(`     node scripts/handoff.js execute PLAN-TO-EXEC ${parent.sd_key || parent.id}`);
  } else {
    console.log('  ✅ Parent is in EXEC (orchestrator) state - child can proceed');

    // Determine next action
    if (sd.status === 'draft') {
      console.log('\n  📍 NEXT ACTION: Run LEAD-TO-PLAN for this child');
      console.log(`     node scripts/handoff.js execute LEAD-TO-PLAN ${sd.sd_key || sd.id}`);
    } else if (sd.status === 'planning') {
      console.log('\n  📍 NEXT ACTION: Complete PRD, then run PLAN-TO-EXEC');
      console.log(`     node scripts/handoff.js execute PLAN-TO-EXEC ${sd.sd_key || sd.id}`);
    } else if (sd.status === 'in_progress') {
      console.log('\n  📍 NEXT ACTION: Implement, then run EXEC-TO-PLAN');
      console.log(`     node scripts/handoff.js execute EXEC-TO-PLAN ${sd.sd_key || sd.id}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
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
      // key_learnings can be array of strings OR array of objects {learning: "...", evidence: "...", category: "..."}
      if (retro.key_learnings && retro.key_learnings.length > 0) {
        const firstLearning = typeof retro.key_learnings[0] === 'string'
          ? retro.key_learnings[0]
          : retro.key_learnings[0]?.learning || JSON.stringify(retro.key_learnings[0]);
        console.log(`   Key Learning: ${firstLearning.substring(0, 70)}${firstLearning.length > 70 ? '...' : ''}`);
      }

      // Show success or failure pattern (context-dependent)
      // Patterns can be array of strings OR array of objects {pattern: "...", ...}
      const extractPatternText = (pattern) => {
        if (typeof pattern === 'string') return pattern;
        return pattern?.pattern || pattern?.description || JSON.stringify(pattern);
      };
      if (phase === 'PLAN' && retro.success_patterns && retro.success_patterns.length > 0) {
        const patternText = extractPatternText(retro.success_patterns[0]);
        console.log(`   Success Pattern: ${patternText.substring(0, 70)}${patternText.length > 70 ? '...' : ''}`);
      } else if (retro.failure_patterns && retro.failure_patterns.length > 0) {
        const patternText = extractPatternText(retro.failure_patterns[0]);
        console.log(`   Failure Pattern: ${patternText.substring(0, 70)}${patternText.length > 70 ? '...' : ''}`);
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

    // PAT-PARENT-DET: Detect parent/child hierarchy FIRST
    // This ensures proper workflow handling before any phase work begins
    const hierarchy = await detectParentChildHierarchy(sd);

    // Display workflow guidance based on SD type
    if (hierarchy.type === 'parent') {
      displayParentWorkflowGuidance(sd, hierarchy.children, phase);
    } else if (hierarchy.type === 'child') {
      displayChildWorkflowGuidance(sd, hierarchy.parent, phase);
    }

    // CHILD PROGRESSION GATE: Enforce sequential completion for child SDs
    // HARD BLOCK: Cannot start LEAD phase on P(N) until P(N-1) is verified complete
    // This prevents the "Pending Approval Trap" where handoffs are skipped
    if (hierarchy.type === 'child' && phase === 'LEAD') {
      const progressionResult = await enforceChildProgressionGate(sdId);

      if (!progressionResult.canProceed) {
        console.log('\n❌ CHILD PROGRESSION GATE BLOCKED');
        console.log('   Cannot start LEAD phase until predecessor is fully complete.');
        console.log(`   Blocked by: ${progressionResult.blockedBy?.sd_key || progressionResult.blockedBy?.sd_key || 'unknown'}`);
        console.log('\n   Required action:');
        console.log(`   ${progressionResult.requiredAction}`);
        console.log('\n   Then re-run: node scripts/phase-preflight.js --phase LEAD --sd-id ' + sdId);
        process.exit(1); // HARD BLOCK
      }

      console.log('\n✅ Child Progression Gate: PASSED (predecessor verified complete)');
    }

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

      // DECOMPOSITION GATE: Check if SD should have children (Layer 2)
      // This runs for parent SDs or SDs that meet decomposition criteria
      const decompositionResult = await validateDecompositionGate(sdId, 'PLAN-ENTRY');
      if (decompositionResult.decompositionAssessment?.shouldDecompose) {
        console.log('\n📊 DECOMPOSITION ASSESSMENT:');
        console.log(`   Should decompose: ${decompositionResult.decompositionAssessment.shouldDecompose}`);
        console.log(`   Current children: ${decompositionResult.childCount}`);
        if (!decompositionResult.hasChildren) {
          console.log('\n   💡 REMINDER: Create child SDs during this PLAN phase');
          console.log('      See CLAUDE_PLAN.md "Child SD Pattern: When to Decompose"');
        }
      }
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
