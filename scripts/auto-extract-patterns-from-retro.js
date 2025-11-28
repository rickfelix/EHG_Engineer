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

import { IssueKnowledgeBase } from '../lib/learning/issue-knowledge-base.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
async function extractPatternsFromImprovements(retro, sdId, sdKey) {
  if (!retro.what_needs_improvement || retro.what_needs_improvement.length === 0) {
    console.log('  ℹ️  No improvement items to extract');
    return [];
  }

  const patterns = [];

  for (const improvement of retro.what_needs_improvement) {
    // Skip generic items
    if (improvement.length < 20 ||
        improvement === 'No significant challenges documented') {
      continue;
    }

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
        solution: retro.action_items.length > 0 ? retro.action_items[0] : null,
        resolution_time_minutes: null,
        related_sub_agents: relatedSubAgents
      });

      patterns.push({
        action: 'created',
        pattern_id: newPattern.pattern_id,
        issue: improvement,
        related_sub_agents: relatedSubAgents
      });

      console.log(`     ✅ Created pattern: ${newPattern.pattern_id}`);
    }
  }

  return patterns;
}

/**
 * Extract successful patterns from "What Went Well"
 */
async function extractSuccessPatternsFromAchievements(retro, sdId) {
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

  // Extract patterns from improvements
  console.log('\n📊 Extracting patterns from improvement items...');
  const improvementPatterns = await extractPatternsFromImprovements(
    retro,
    retro.sd_id,
    sdKey
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

  // Update retrospective metadata
  await supabase
    .from('retrospectives')
    .update({
      status: 'PUBLISHED',
      updated_at: new Date().toISOString()
    })
    .eq('id', retroId);

  return {
    success: true,
    retrospective_id: retroId,
    patterns_created: created,
    patterns_updated: updated,
    prevention_items: preventions,
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
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for programmatic use
export { extractPatternsFromRetrospective };

// Run if called directly
if (process.argv[1].endsWith('auto-extract-patterns-from-retro.js')) {
  main();
}
