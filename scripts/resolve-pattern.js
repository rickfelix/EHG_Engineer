#!/usr/bin/env node
/**
 * RESOLVE PATTERN
 * LEO Protocol v4.3.2 Enhancement
 *
 * Marks an issue pattern as resolved with resolution notes.
 * Use this when you've fixed the root cause of a pattern.
 *
 * Usage: node scripts/resolve-pattern.js PAT-XXX "Resolution notes here"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Show pattern details
 */
async function showPatternDetails(patternId) {
  const { data: pattern, error } = await supabase
    .from('issue_patterns')
    .select('*')
    .eq('pattern_id', patternId)
    .single();

  if (error || !pattern) {
    console.error(`❌ Pattern ${patternId} not found`);
    return null;
  }

  console.log('\n📋 PATTERN DETAILS');
  console.log('═'.repeat(60));
  console.log(`Pattern ID:    ${pattern.pattern_id}`);
  console.log(`Category:      ${pattern.category}`);
  console.log(`Severity:      ${pattern.severity}`);
  console.log(`Status:        ${pattern.status}`);
  console.log(`Trend:         ${pattern.trend}`);
  console.log(`Occurrences:   ${pattern.occurrence_count}`);
  console.log(`First Seen:    ${pattern.first_seen_sd_id || 'N/A'}`);
  console.log(`Last Seen:     ${pattern.last_seen_sd_id || 'N/A'}`);
  console.log('─'.repeat(60));
  console.log('Issue Summary:');
  console.log(`  ${pattern.issue_summary}`);

  if (pattern.proven_solutions && pattern.proven_solutions.length > 0) {
    console.log(`\nProven Solutions (${pattern.proven_solutions.length}):`);
    pattern.proven_solutions.slice(0, 3).forEach((sol, idx) => {
      console.log(`  ${idx + 1}. ${sol.solution || sol.method || 'N/A'}`);
    });
  }

  if (pattern.prevention_checklist && pattern.prevention_checklist.length > 0) {
    console.log(`\nPrevention Checklist (${pattern.prevention_checklist.length}):`);
    pattern.prevention_checklist.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item}`);
    });
  }

  return pattern;
}

/**
 * Resolve a pattern
 */
async function resolvePattern(patternId, resolutionNotes) {
  console.log('\n🔧 RESOLVING PATTERN');
  console.log('═'.repeat(60));

  // First show current details
  const pattern = await showPatternDetails(patternId);
  if (!pattern) {
    return false;
  }

  if (pattern.status === 'resolved') {
    console.log('\n⚠️  Pattern is already resolved');
    console.log(`   Resolution date: ${pattern.resolution_date || 'N/A'}`);
    console.log(`   Resolution notes: ${pattern.resolution_notes || 'N/A'}`);
    return false;
  }

  console.log('\n📝 RESOLUTION');
  console.log(`   Notes: ${resolutionNotes}`);

  // Update pattern
  const updateData = {
    status: 'resolved',
    trend: 'decreasing',
    resolution_date: new Date().toISOString(),
    resolution_notes: resolutionNotes,
    updated_at: new Date().toISOString()
  };

  // Add resolution to proven_solutions as the final solution
  const provenSolutions = pattern.proven_solutions || [];
  provenSolutions.push({
    solution: `RESOLVED: ${resolutionNotes}`,
    method: 'Root cause fixed',
    success_rate: 100,
    times_applied: 1,
    times_successful: 1,
    resolution_date: new Date().toISOString()
  });
  updateData.proven_solutions = provenSolutions;

  const { error } = await supabase
    .from('issue_patterns')
    .update(updateData)
    .eq('pattern_id', patternId);

  if (error) {
    console.error(`\n❌ Failed to resolve pattern: ${error.message}`);
    return false;
  }

  console.log('\n✅ Pattern resolved successfully!');
  console.log('   The pattern will no longer appear in hot patterns');
  console.log('   Historical data is preserved for reference');

  return true;
}

/**
 * List active patterns for reference
 */
async function listActivePatterns() {
  const { data: patterns, error } = await supabase
    .from('issue_patterns')
    .select('pattern_id, category, severity, occurrence_count, issue_summary')
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false })
    .limit(10);

  if (error || !patterns || patterns.length === 0) {
    console.log('No active patterns found');
    return;
  }

  console.log('\n📊 ACTIVE PATTERNS (Top 10)');
  console.log('═'.repeat(60));
  console.log('ID          | Category       | Sev    | Count | Summary');
  console.log('─'.repeat(60));

  for (const p of patterns) {
    const summary = p.issue_summary.substring(0, 30) + (p.issue_summary.length > 30 ? '...' : '');
    console.log(`${p.pattern_id.padEnd(11)} | ${p.category.padEnd(14)} | ${p.severity.padEnd(6)} | ${String(p.occurrence_count).padEnd(5)} | ${summary}`);
  }
}

// CLI
async function main() {
  const patternId = process.argv[2];
  const resolutionNotes = process.argv.slice(3).join(' ');

  if (!patternId) {
    console.log('Usage: node scripts/resolve-pattern.js <PATTERN_ID> [resolution notes]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/resolve-pattern.js PAT-001 "Fixed by adding RLS policy validation"');
    console.log('  node scripts/resolve-pattern.js PAT-RLS-001 "Implemented PAT-RLS-001 automation script"');
    console.log('');

    // Show active patterns for reference
    await listActivePatterns();
    process.exit(0);
  }

  if (!resolutionNotes) {
    // Just show pattern details without resolving
    await showPatternDetails(patternId);
    console.log('\n⚠️  No resolution notes provided');
    console.log('   To resolve, add notes: node scripts/resolve-pattern.js PAT-XXX "Your notes"');
    process.exit(0);
  }

  const success = await resolvePattern(patternId, resolutionNotes);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
