#!/usr/bin/env node
/**
 * Handoff Content Quality Analysis Script
 *
 * Analyzes existing handoffs for boilerplate content usage.
 * Used to retroactively flag low-quality handoffs.
 *
 * @see SD-CAPABILITY-LIFECYCLE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validateHandoffContentQuality } from './modules/handoff-content-quality-validation.js';

// Load .env first, then .env.test.local for overrides
dotenv.config();
dotenv.config({ path: '.env.test.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeHandoffs() {
  console.log('='.repeat(70));
  console.log('HANDOFF CONTENT QUALITY ANALYSIS');
  console.log('SD-CAPABILITY-LIFECYCLE-001 - Boilerplate Detection');
  console.log('='.repeat(70));

  // Fetch all handoffs
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select(`
      id,
      sd_id,
      handoff_type,
      status,
      executive_summary,
      deliverables_manifest,
      key_decisions,
      known_issues,
      resource_utilization,
      action_items,
      completeness_report,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching handoffs:', error.message);
    process.exit(1);
  }

  console.log(`\nFound ${handoffs.length} handoffs\n`);

  const results = {
    total: handoffs.length,
    passing: 0,
    failing: 0,
    byScore: {
      excellent: 0,  // 90-100
      good: 0,       // 80-89
      acceptable: 0, // 60-79
      poor: 0        // <60
    },
    byHandoffType: {},
    byStatus: {},
    failingHandoffs: [],
    scoreDistribution: [],
    boilerplateMetrics: {
      action_items_boilerplate: 0,
      deliverables_boilerplate: 0,
      no_sd_specific_content: 0
    }
  };

  for (const handoff of handoffs) {
    const result = validateHandoffContentQuality(handoff);
    results.scoreDistribution.push(result.score);

    // Track by type
    const type = handoff.handoff_type || 'UNKNOWN';
    if (!results.byHandoffType[type]) {
      results.byHandoffType[type] = { total: 0, passing: 0, failing: 0 };
    }
    results.byHandoffType[type].total++;

    // Track by status
    const status = handoff.status || 'unknown';
    if (!results.byStatus[status]) {
      results.byStatus[status] = { total: 0, passing: 0, failing: 0 };
    }
    results.byStatus[status].total++;

    // Track boilerplate metrics
    if (result.boilerplateDetails?.action_items?.isBoilerplate) {
      results.boilerplateMetrics.action_items_boilerplate++;
    }
    if (result.boilerplateDetails?.deliverables_manifest?.isBoilerplate) {
      results.boilerplateMetrics.deliverables_boilerplate++;
    }
    if (!result.boilerplateDetails?.has_sd_specific_content) {
      results.boilerplateMetrics.no_sd_specific_content++;
    }

    // Score distribution
    if (result.score >= 90) results.byScore.excellent++;
    else if (result.score >= 80) results.byScore.good++;
    else if (result.score >= 60) results.byScore.acceptable++;
    else results.byScore.poor++;

    // Pass/fail (60% minimum for handoffs)
    if (result.score >= 60) {
      results.passing++;
      results.byHandoffType[type].passing++;
      results.byStatus[status].passing++;
    } else {
      results.failing++;
      results.byHandoffType[type].failing++;
      results.byStatus[status].failing++;
      results.failingHandoffs.push({
        sd_id: handoff.sd_id,
        handoff_type: type,
        status: status,
        score: result.score,
        issues: result.issues,
        warnings: result.warnings.slice(0, 3)
      });
    }
  }

  // Calculate average score
  const avgScore = results.scoreDistribution.length > 0
    ? Math.round(results.scoreDistribution.reduce((a, b) => a + b, 0) / results.scoreDistribution.length)
    : 0;

  // Print results
  console.log('=== SUMMARY ===');
  console.log(`Total Handoffs: ${results.total}`);
  console.log(`Average Quality Score: ${avgScore}%`);
  console.log(`Passing (score>=60): ${results.passing} (${results.total > 0 ? Math.round(results.passing / results.total * 100) : 0}%)`);
  console.log(`Failing: ${results.failing} (${results.total > 0 ? Math.round(results.failing / results.total * 100) : 0}%)`);

  console.log('\n=== SCORE DISTRIBUTION ===');
  console.log(`Excellent (90-100): ${results.byScore.excellent}`);
  console.log(`Good (80-89): ${results.byScore.good}`);
  console.log(`Acceptable (60-79): ${results.byScore.acceptable}`);
  console.log(`Poor (<60): ${results.byScore.poor}`);

  console.log('\n=== BY HANDOFF TYPE ===');
  for (const [type, stats] of Object.entries(results.byHandoffType)) {
    const passRate = stats.total > 0 ? Math.round(stats.passing / stats.total * 100) : 0;
    console.log(`${type}: ${stats.total} total, ${stats.passing} passing (${passRate}%)`);
  }

  console.log('\n=== BY STATUS ===');
  for (const [status, stats] of Object.entries(results.byStatus)) {
    const passRate = stats.total > 0 ? Math.round(stats.passing / stats.total * 100) : 0;
    console.log(`${status}: ${stats.total} total, ${stats.passing} passing (${passRate}%)`);
  }

  console.log('\n=== BOILERPLATE METRICS ===');
  console.log(`Boilerplate action_items: ${results.boilerplateMetrics.action_items_boilerplate} (${results.total > 0 ? Math.round(results.boilerplateMetrics.action_items_boilerplate / results.total * 100) : 0}%)`);
  console.log(`Boilerplate deliverables: ${results.boilerplateMetrics.deliverables_boilerplate} (${results.total > 0 ? Math.round(results.boilerplateMetrics.deliverables_boilerplate / results.total * 100) : 0}%)`);
  console.log(`Missing SD-specific content: ${results.boilerplateMetrics.no_sd_specific_content} (${results.total > 0 ? Math.round(results.boilerplateMetrics.no_sd_specific_content / results.total * 100) : 0}%)`);

  if (results.failingHandoffs.length > 0) {
    console.log('\n=== HANDOFFS THAT WOULD FAIL NEW VALIDATION ===');
    // Sort by score (worst first)
    results.failingHandoffs.sort((a, b) => a.score - b.score);

    for (const handoff of results.failingHandoffs.slice(0, 10)) {
      console.log(`\n${handoff.sd_id} (${handoff.handoff_type}): ${handoff.score}%`);
      console.log(`  Status: ${handoff.status}`);
      if (handoff.issues.length > 0) {
        console.log(`  Issues:`);
        for (const issue of handoff.issues.slice(0, 2)) {
          console.log(`    - ${issue}`);
        }
      }
    }

    if (results.failingHandoffs.length > 10) {
      console.log(`\n... and ${results.failingHandoffs.length - 10} more failing handoffs`);
    }
  }

  console.log('\n=== COMMON BOILERPLATE PATTERNS FOUND ===');
  console.log('1. action_items: Same generic checklist for every handoff');
  console.log('2. deliverables_manifest: Copy-paste checkmark lists');
  console.log('3. executive_summary: Template with only SD ID varied');
  console.log('4. key_decisions: Metadata placeholders, no actual decisions');

  console.log('\n=== RECOMMENDATION ===');
  if (results.failing > results.total * 0.3) {
    console.log('WARNING: >30% of handoffs would fail new validation.');
    console.log('Consider:');
    console.log('  1. Updating unified-handoff-system.js to generate SD-specific content');
    console.log('  2. Adding SD context to handoff templates');
    console.log('  3. Requiring manual review for handoff content');
  } else {
    console.log('Quality level acceptable. New validation will encourage better handoff content.');
  }

  console.log('\n' + '='.repeat(70));
}

analyzeHandoffs().catch(console.error);
