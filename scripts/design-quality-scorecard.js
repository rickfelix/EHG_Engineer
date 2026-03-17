#!/usr/bin/env node

/**
 * Design Quality Scorecard Calculator
 * SD: SD-LEO-INFRA-DESIGN-COMPETITIVE-ADVANTAGE-001
 *
 * Reads DESIGN sub-agent results from sub_agent_execution_results,
 * extracts dimensional scores, calculates weighted composite, and
 * stores in design_quality_scores table.
 *
 * Composite formula:
 *   35% accessibility + 25% token compliance + 20% component reuse + 20% visual polish
 *
 * Usage:
 *   node scripts/design-quality-scorecard.js --sd-id SD-KEY-HERE
 *   node scripts/design-quality-scorecard.js --batch
 *   node scripts/design-quality-scorecard.js --batch --days 60
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();


const supabase = createSupabaseServiceClient();

// Composite score weights (must sum to 1.0)
const WEIGHTS = {
  accessibility: 0.35,
  token_compliance: 0.25,
  component_reuse: 0.20,
  visual_polish: 0.20
};

/**
 * Extract accessibility dimension score from findings.
 * Based on: accessibility_check issues, contrast issues, touch target issues.
 */
function scoreAccessibility(findings, confidence) {
  const a11y = findings?.accessibility_check;
  if (!a11y || a11y.skipped) return null;
  if (a11y.error && !a11y.checked) return null;

  let score = 100;
  const issueCount = a11y.issues || 0;
  const affectedFiles = a11y.affected_files?.length || 0;

  // Deduct per issue: HIGH=10, MEDIUM=5
  score -= issueCount * 7;
  score -= affectedFiles * 3;

  return Math.max(0, Math.min(100, score));
}

/**
 * Extract token/design-system compliance score from findings.
 * Based on: design_system_check violations, inline style usage.
 */
function scoreTokenCompliance(findings, confidence) {
  const ds = findings?.design_system_check;
  if (!ds || ds.skipped) return null;
  if (ds.error && !ds.checked) return null;

  let score = 100;
  const violations = ds.violations || 0;
  score -= violations * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Extract component reuse score from findings.
 * Based on: component_analysis (large components, total), consistency_check.
 */
function scoreComponentReuse(findings, confidence) {
  const comp = findings?.component_analysis;
  const consistency = findings?.consistency_check;

  if ((!comp || comp.skipped) && (!consistency || consistency.skipped)) return null;
  if (comp?.error && !comp?.checked && consistency?.error && !consistency?.checked) return null;

  let score = 100;

  if (comp && comp.checked !== false) {
    const largeComponents = comp.large_components || 0;
    score -= largeComponents * 8; // Large components reduce reuse score
  }

  if (consistency && consistency.checked !== false) {
    const inconsistencies = consistency.inconsistencies || 0;
    score -= inconsistencies * 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Extract visual polish score from findings.
 * Based on: responsive_check, ux_contract_compliance, CVA patterns.
 */
function scoreVisualPolish(findings, confidence) {
  const responsive = findings?.responsive_check;
  const ux = findings?.ux_contract_compliance;

  if ((!responsive || responsive.skipped) && !ux) return null;
  if (responsive?.error && !responsive?.checked && !ux) return null;

  let score = 100;

  if (responsive && responsive.checked !== false) {
    const missingBreakpoints = responsive.missing_breakpoints || 0;
    score -= missingBreakpoints * 10;
  }

  if (ux) {
    const violations = ux.violations?.length || 0;
    score -= violations * 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate composite score from dimension scores.
 * Missing dimensions are scored as 0 per PRD requirement.
 */
function calculateComposite(accessibility, tokenCompliance, componentReuse, visualPolish) {
  const a = accessibility ?? 0;
  const t = tokenCompliance ?? 0;
  const c = componentReuse ?? 0;
  const v = visualPolish ?? 0;

  return Math.round(
    a * WEIGHTS.accessibility +
    t * WEIGHTS.token_compliance +
    c * WEIGHTS.component_reuse +
    v * WEIGHTS.visual_polish
  );
}

/**
 * Score a single SD from its DESIGN sub-agent result.
 */
async function scoreSingleSD(sdId, resultRow) {
  const findings = resultRow.metadata?.findings || {};

  const accessibility = scoreAccessibility(findings, resultRow.confidence);
  const tokenCompliance = scoreTokenCompliance(findings, resultRow.confidence);
  const componentReuse = scoreComponentReuse(findings, resultRow.confidence);
  const visualPolish = scoreVisualPolish(findings, resultRow.confidence);

  // If all dimensions are null (infra SD with skipped checks), use confidence as composite
  const allNull = accessibility === null && tokenCompliance === null &&
                  componentReuse === null && visualPolish === null;

  const composite = allNull
    ? resultRow.confidence
    : calculateComposite(accessibility, tokenCompliance, componentReuse, visualPolish);

  const record = {
    sd_id: sdId,
    accessibility_score: accessibility,
    token_compliance_score: tokenCompliance,
    component_reuse_score: componentReuse,
    visual_polish_score: visualPolish,
    composite_score: composite,
    dimensions: findings,
    source_result_id: resultRow.id,
    calculated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('design_quality_scores')
    .upsert(record, { onConflict: 'sd_id' })
    .select();

  if (error) {
    // Upsert may fail if no unique constraint on sd_id — use insert instead
    const { data: inserted, error: insertErr } = await supabase
      .from('design_quality_scores')
      .insert(record)
      .select();

    if (insertErr) {
      console.error(`  Error storing score for ${sdId}:`, insertErr.message);
      return null;
    }
    return inserted?.[0];
  }

  return data?.[0];
}

/**
 * Get the SD key from an SD UUID.
 */
async function getSDKey(sdUuid) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('id', sdUuid)
    .single();
  return data?.sd_key || sdUuid;
}

/**
 * Resolve SD key to UUID.
 */
async function resolveSDId(sdKey) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sdKey)
    .single();
  return data?.id;
}

/**
 * Score a single SD by key.
 */
async function scoreByKey(sdKey) {
  console.log(`\nScoring SD: ${sdKey}`);

  const sdUuid = await resolveSDId(sdKey);
  if (!sdUuid) {
    console.error(`  SD not found: ${sdKey}`);
    return null;
  }

  // Get latest DESIGN result for this SD
  const { data: results } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sd_id, confidence, metadata, created_at')
    .eq('sd_id', sdUuid)
    .eq('sub_agent_code', 'DESIGN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!results?.length) {
    console.log(`  No DESIGN sub-agent results found for ${sdKey}`);
    return null;
  }

  const result = results[0];
  const score = await scoreSingleSD(sdUuid, result);

  if (score) {
    console.log(`  Composite: ${score.composite_score}/100`);
    console.log(`  Accessibility: ${score.accessibility_score ?? 'N/A'} | Token: ${score.token_compliance_score ?? 'N/A'} | Component: ${score.component_reuse_score ?? 'N/A'} | Polish: ${score.visual_polish_score ?? 'N/A'}`);
  }

  return score;
}

/**
 * Batch score all SDs with DESIGN results but no design_quality_scores entry.
 */
async function batchScore(days = 60) {
  console.log(`\nBatch scoring SDs from last ${days} days...`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Get all DESIGN results within timeframe
  const { data: designResults, error: drErr } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sd_id, confidence, metadata, created_at')
    .eq('sub_agent_code', 'DESIGN')
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false });

  if (drErr) {
    console.error('Error fetching DESIGN results:', drErr.message);
    return;
  }

  console.log(`Found ${designResults.length} DESIGN result(s) in timeframe`);

  // Get existing scores to skip already-scored SDs
  const { data: existingScores } = await supabase
    .from('design_quality_scores')
    .select('sd_id');

  const scoredSdIds = new Set((existingScores || []).map(s => s.sd_id));

  // Deduplicate: keep latest result per SD
  const latestBySD = new Map();
  for (const result of designResults) {
    if (!result.sd_id) continue;
    if (!latestBySD.has(result.sd_id)) {
      latestBySD.set(result.sd_id, result);
    }
  }

  let scored = 0;
  let skipped = 0;
  let errors = 0;

  for (const [sdId, result] of latestBySD) {
    if (scoredSdIds.has(sdId)) {
      skipped++;
      continue;
    }

    const sdKey = await getSDKey(sdId);
    try {
      const score = await scoreSingleSD(sdId, result);
      if (score) {
        scored++;
        console.log(`  ${sdKey}: ${score.composite_score}/100`);
      } else {
        errors++;
      }
    } catch (e) {
      errors++;
      console.error(`  Error scoring ${sdKey}:`, e.message);
    }
  }

  console.log(`\nBatch complete: ${scored} scored, ${skipped} skipped (already scored), ${errors} errors`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const sdKeyIdx = args.indexOf('--sd-id');
  const batchMode = args.includes('--batch');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 60;

  console.log('Design Quality Scorecard Calculator');
  console.log('===================================');
  console.log(`Weights: accessibility=${WEIGHTS.accessibility}, token=${WEIGHTS.token_compliance}, component=${WEIGHTS.component_reuse}, polish=${WEIGHTS.visual_polish}`);

  if (sdKeyIdx !== -1 && args[sdKeyIdx + 1]) {
    await scoreByKey(args[sdKeyIdx + 1]);
  } else if (batchMode) {
    await batchScore(days);
  } else {
    console.log('\nUsage:');
    console.log('  node scripts/design-quality-scorecard.js --sd-id SD-KEY-HERE');
    console.log('  node scripts/design-quality-scorecard.js --batch');
    console.log('  node scripts/design-quality-scorecard.js --batch --days 60');
    process.exit(1);
  }
}

// ESM entry point with Windows compatibility
const isMainModule = import.meta.url === `file://${process.argv[1]}`
  || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  main().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
  });
}

export { scoreSingleSD, scoreByKey, batchScore, calculateComposite, WEIGHTS };
