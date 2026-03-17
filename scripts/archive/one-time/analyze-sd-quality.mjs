#!/usr/bin/env node
/**
 * SD Quality & Retrospective Gate Analysis Script
 *
 * Analyzes existing Strategic Directives for quality issues and
 * checks retrospective gate enforcement.
 *
 * @see SD-CAPABILITY-LIFECYCLE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validateSDQuality, validateRetrospectiveQuality, validateSDCompletionReadiness } from './modules/sd-quality-validation.js';

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

async function analyzeSDQuality() {
  console.log('='.repeat(70));
  console.log('STRATEGIC DIRECTIVE QUALITY ANALYSIS');
  console.log('SD-CAPABILITY-LIFECYCLE-001 - Quality & Retrospective Gate');
  console.log('='.repeat(70));

  // Fetch all SDs
  const { data: sds, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select(`
      id,
      title,
      description,
      status,
      strategic_objectives,
      success_metrics,
      risks,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false });

  if (sdError) {
    console.error('Error fetching SDs:', sdError.message);
    process.exit(1);
  }

  // Fetch all retrospectives
  const { data: retrospectives, error: retroError } = await supabase
    .from('retrospectives')
    .select(`
      id,
      sd_id,
      key_learnings,
      action_items,
      what_went_well,
      what_needs_improvement,
      quality_score,
      quality_issues,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (retroError) {
    console.error('Error fetching retrospectives:', retroError.message);
    process.exit(1);
  }

  // Create lookup map for retrospectives by sd_id
  const retroBySD = {};
  for (const retro of retrospectives || []) {
    if (!retroBySD[retro.sd_id]) {
      retroBySD[retro.sd_id] = retro;
    }
  }

  console.log(`\nFound ${sds.length} Strategic Directives`);
  console.log(`Found ${retrospectives?.length || 0} Retrospectives\n`);

  const results = {
    total: sds.length,
    passing: 0,
    failing: 0,
    byScore: {
      excellent: 0,  // 90-100
      good: 0,       // 80-89
      acceptable: 0, // 70-79
      poor: 0        // <70
    },
    byStatus: {},
    failingSDs: [],
    scoreDistribution: [],
    retroGate: {
      completed_with_retro: 0,
      completed_without_retro: 0,
      active_with_retro: 0,
      active_without_retro: 0
    },
    sdQualityMetrics: {
      no_description: 0,
      no_objectives: 0,
      no_metrics: 0,
      no_risks: 0,
      boilerplate_description: 0
    },
    retroQualityMetrics: {
      total_retros: retrospectives?.length || 0,
      passing_retros: 0,
      failing_retros: 0,
      no_key_learnings: 0,
      boilerplate_learnings: 0,
      no_improvements: 0
    }
  };

  for (const sd of sds) {
    const retrospective = retroBySD[sd.id];
    const completionResult = validateSDCompletionReadiness(sd, retrospective);

    results.scoreDistribution.push(completionResult.score);

    // Track by status
    const status = sd.status || 'unknown';
    if (!results.byStatus[status]) {
      results.byStatus[status] = { total: 0, passing: 0, failing: 0, with_retro: 0, without_retro: 0 };
    }
    results.byStatus[status].total++;

    // Track retro gate
    if (status === 'completed') {
      if (retrospective) {
        results.retroGate.completed_with_retro++;
        results.byStatus[status].with_retro++;
      } else {
        results.retroGate.completed_without_retro++;
        results.byStatus[status].without_retro++;
      }
    } else if (status === 'active') {
      if (retrospective) {
        results.retroGate.active_with_retro++;
        results.byStatus[status].with_retro++;
      } else {
        results.retroGate.active_without_retro++;
        results.byStatus[status].without_retro++;
      }
    }

    // Track SD quality issues
    const sdQuality = completionResult.sdQuality;
    if (sdQuality) {
      if (sdQuality.details?.description_length === 0) results.sdQualityMetrics.no_description++;
      if (sdQuality.details?.objectives_count === 0) results.sdQualityMetrics.no_objectives++;
      if (sdQuality.details?.metrics_count === 0) results.sdQualityMetrics.no_metrics++;
      if (sdQuality.details?.risks_count === 0) results.sdQualityMetrics.no_risks++;
      if (sdQuality.warnings.some(w => w.includes('boilerplate'))) results.sdQualityMetrics.boilerplate_description++;
    }

    // Score distribution
    if (completionResult.score >= 90) results.byScore.excellent++;
    else if (completionResult.score >= 80) results.byScore.good++;
    else if (completionResult.score >= 70) results.byScore.acceptable++;
    else results.byScore.poor++;

    // Pass/fail (70% minimum)
    if (completionResult.valid && completionResult.score >= 70) {
      results.passing++;
      results.byStatus[status].passing++;
    } else {
      results.failing++;
      results.byStatus[status].failing++;
      results.failingSDs.push({
        sd_id: sd.id,
        title: sd.title?.substring(0, 50) || 'No title',
        status: status,
        score: completionResult.score,
        has_retro: !!retrospective,
        issues: completionResult.issues.slice(0, 3),
        warnings: completionResult.warnings.slice(0, 2)
      });
    }
  }

  // Analyze retrospective quality separately
  for (const retro of retrospectives || []) {
    const retroQuality = validateRetrospectiveQuality(retro);
    if (retroQuality.valid && retroQuality.score >= 70) {
      results.retroQualityMetrics.passing_retros++;
    } else {
      results.retroQualityMetrics.failing_retros++;
    }

    if (retroQuality.details?.key_learnings_count === 0) {
      results.retroQualityMetrics.no_key_learnings++;
    }
    if (retroQuality.issues.some(i => i.includes('boilerplate'))) {
      results.retroQualityMetrics.boilerplate_learnings++;
    }
    if (retroQuality.details?.improvements_count === 0) {
      results.retroQualityMetrics.no_improvements++;
    }
  }

  // Calculate average score
  const avgScore = results.scoreDistribution.length > 0
    ? Math.round(results.scoreDistribution.reduce((a, b) => a + b, 0) / results.scoreDistribution.length)
    : 0;

  // Print results
  console.log('=== SD QUALITY SUMMARY ===');
  console.log(`Total SDs: ${results.total}`);
  console.log(`Average Quality Score: ${avgScore}%`);
  console.log(`Passing (score>=70, valid): ${results.passing} (${results.total > 0 ? Math.round(results.passing / results.total * 100) : 0}%)`);
  console.log(`Failing: ${results.failing} (${results.total > 0 ? Math.round(results.failing / results.total * 100) : 0}%)`);

  console.log('\n=== SCORE DISTRIBUTION ===');
  console.log(`Excellent (90-100): ${results.byScore.excellent}`);
  console.log(`Good (80-89): ${results.byScore.good}`);
  console.log(`Acceptable (70-79): ${results.byScore.acceptable}`);
  console.log(`Poor (<70): ${results.byScore.poor}`);

  console.log('\n=== BY STATUS ===');
  for (const [status, stats] of Object.entries(results.byStatus)) {
    const passRate = stats.total > 0 ? Math.round(stats.passing / stats.total * 100) : 0;
    const retroRate = stats.total > 0 ? Math.round(stats.with_retro / stats.total * 100) : 0;
    console.log(`${status}: ${stats.total} total, ${stats.passing} passing (${passRate}%), ${stats.with_retro} with retro (${retroRate}%)`);
  }

  console.log('\n=== RETROSPECTIVE GATE ENFORCEMENT ===');
  console.log(`Completed SDs with retrospective: ${results.retroGate.completed_with_retro}`);
  console.log(`Completed SDs WITHOUT retrospective: ${results.retroGate.completed_without_retro} ⚠️`);
  console.log(`Active SDs with retrospective: ${results.retroGate.active_with_retro}`);
  console.log(`Active SDs without retrospective: ${results.retroGate.active_without_retro}`);

  if (results.retroGate.completed_without_retro > 0) {
    console.log(`\n⚠️  ${results.retroGate.completed_without_retro} completed SDs are missing retrospectives!`);
    console.log('   With new validation, these would be blocked from completion.');
  }

  console.log('\n=== SD QUALITY METRICS ===');
  console.log(`Missing description: ${results.sdQualityMetrics.no_description} (${results.total > 0 ? Math.round(results.sdQualityMetrics.no_description / results.total * 100) : 0}%)`);
  console.log(`Missing objectives: ${results.sdQualityMetrics.no_objectives} (${results.total > 0 ? Math.round(results.sdQualityMetrics.no_objectives / results.total * 100) : 0}%)`);
  console.log(`Missing success_metrics: ${results.sdQualityMetrics.no_metrics} (${results.total > 0 ? Math.round(results.sdQualityMetrics.no_metrics / results.total * 100) : 0}%)`);
  console.log(`Missing risks: ${results.sdQualityMetrics.no_risks} (${results.total > 0 ? Math.round(results.sdQualityMetrics.no_risks / results.total * 100) : 0}%)`);
  console.log(`Boilerplate description: ${results.sdQualityMetrics.boilerplate_description} (${results.total > 0 ? Math.round(results.sdQualityMetrics.boilerplate_description / results.total * 100) : 0}%)`);

  console.log('\n=== RETROSPECTIVE QUALITY METRICS ===');
  console.log(`Total retrospectives: ${results.retroQualityMetrics.total_retros}`);
  console.log(`Passing quality: ${results.retroQualityMetrics.passing_retros} (${results.retroQualityMetrics.total_retros > 0 ? Math.round(results.retroQualityMetrics.passing_retros / results.retroQualityMetrics.total_retros * 100) : 0}%)`);
  console.log(`Failing quality: ${results.retroQualityMetrics.failing_retros} (${results.retroQualityMetrics.total_retros > 0 ? Math.round(results.retroQualityMetrics.failing_retros / results.retroQualityMetrics.total_retros * 100) : 0}%)`);
  console.log(`Missing key_learnings: ${results.retroQualityMetrics.no_key_learnings}`);
  console.log(`Boilerplate learnings: ${results.retroQualityMetrics.boilerplate_learnings}`);
  console.log(`No improvement areas: ${results.retroQualityMetrics.no_improvements}`);

  if (results.failingSDs.length > 0) {
    console.log('\n=== SDs THAT WOULD FAIL NEW VALIDATION ===');
    // Sort by score (worst first)
    results.failingSDs.sort((a, b) => a.score - b.score);

    for (const sd of results.failingSDs.slice(0, 10)) {
      console.log(`\n${sd.sd_id}: ${sd.score}%`);
      console.log(`  Title: ${sd.title}`);
      console.log(`  Status: ${sd.status}`);
      console.log(`  Has Retrospective: ${sd.has_retro ? 'Yes' : 'No ⚠️'}`);
      if (sd.issues.length > 0) {
        console.log(`  Issues:`);
        for (const issue of sd.issues) {
          console.log(`    - ${issue}`);
        }
      }
    }

    if (results.failingSDs.length > 10) {
      console.log(`\n... and ${results.failingSDs.length - 10} more failing SDs`);
    }
  }

  console.log('\n=== RECOMMENDATION ===');
  if (results.retroGate.completed_without_retro > 0) {
    console.log('CRITICAL: Completed SDs missing retrospectives detected!');
    console.log('  1. Retroactively create retrospectives for these SDs');
    console.log('  2. Enable gate enforcement in unified-handoff-system.js');
  }

  if (results.failing > results.total * 0.3) {
    console.log('WARNING: >30% of SDs would fail new validation.');
    console.log('Consider:');
    console.log('  1. Adding strategic_objectives to SDs during LEAD phase');
    console.log('  2. Requiring success_metrics before PLAN approval');
    console.log('  3. Auto-generating at least one risk assessment');
  } else {
    console.log('Quality level acceptable. New validation will improve future SD quality.');
  }

  console.log('\n' + '='.repeat(70));
}

analyzeSDQuality().catch(console.error);
