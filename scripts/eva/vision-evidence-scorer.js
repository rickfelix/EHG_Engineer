#!/usr/bin/env node
/**
 * vision-evidence-scorer.js — Deterministic Vision Evidence Scorer
 *
 * Replaces LLM-based vision scoring with deterministic evidence checks.
 * Each dimension (V01-V11, A01-A07) has 3-5 binary checkpoints verified
 * programmatically. Same codebase = same score, guaranteed.
 *
 * Usage:
 *   node scripts/eva/vision-evidence-scorer.js              # Score and output JSON
 *   node scripts/eva/vision-evidence-scorer.js --persist     # Score and persist to DB
 *   node scripts/eva/vision-evidence-scorer.js --verbose     # Show per-check evidence detail
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadAllRubrics } from './evidence-rubrics/index.js';
import { runRubricChecks, computeDimensionScore, generateReasoning, generateGaps } from './evidence-checks/check-runner.js';
import { ensureFresh, getGitMeta, warnIfWorktree } from './git-freshness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const ACCEPT_THRESHOLD = 93;
const DEFAULT_VISION_KEY = 'VISION-EHG-L1-001';
const DEFAULT_ARCH_KEY = 'ARCH-EHG-L1-001';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function parseArgs(argv) {
  const args = { persist: false, verbose: false, visionKey: DEFAULT_VISION_KEY, archKey: DEFAULT_ARCH_KEY };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--persist') args.persist = true;
    if (argv[i] === '--verbose') args.verbose = true;
    if (argv[i] === '--vision-key' && argv[i + 1]) args.visionKey = argv[++i];
    if (argv[i] === '--arch-key' && argv[i + 1]) args.archKey = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabase();

  // Git freshness check
  const gitMeta = getGitMeta();
  warnIfWorktree(gitMeta);
  const freshness = ensureFresh();
  if (freshness.pulled) {
    console.log('   Git state refreshed before evidence scoring.');
  }
  if (!freshness.fresh && !freshness.pulled) {
    console.warn('   STALE WARNING: Scores may not reflect latest merged work.');
  }
  console.log(`   Scoring codebase at: ${gitMeta.shortSha} (${gitMeta.branch})\n`);

  // 1. Load rubrics
  const rubrics = await loadAllRubrics();
  console.log(`   Loaded ${rubrics.size} evidence rubrics`);

  // 2. Load dimension metadata (weights) from DB
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('id, extracted_dimensions')
    .eq('vision_key', args.visionKey)
    .single();

  const { data: arch } = await supabase
    .from('eva_architecture_plans')
    .select('id, extracted_dimensions')
    .eq('plan_key', args.archKey)
    .single();

  if (!vision?.extracted_dimensions) {
    console.error(`Vision document not found for key: ${args.visionKey}`);
    process.exit(1);
  }

  // 3. Build dimension weight map from DB metadata
  const dbDimensions = [
    ...(vision.extracted_dimensions || []).map((d, i) => ({
      id: `V${String(i + 1).padStart(2, '0')}`,
      name: d.key || d.name,
      weight: d.weight || 0,
      source: 'vision',
    })),
    ...((arch?.extracted_dimensions || []).map((d, i) => ({
      id: `A${String(i + 1).padStart(2, '0')}`,
      name: d.key || d.name,
      weight: d.weight || 0,
      source: 'architecture',
    }))),
  ];

  const weightMap = new Map(dbDimensions.map(d => [d.id, d]));

  // 4. Run checks for each rubric
  const dimensionResults = [];
  for (const [dimId, rubric] of rubrics) {
    const dbDim = weightMap.get(dimId);
    if (!dbDim) {
      console.warn(`   Rubric ${dimId} has no matching DB dimension — skipping`);
      continue;
    }

    const checkResults = await runRubricChecks(rubric, { supabase });
    const score = computeDimensionScore(checkResults);
    const reasoning = generateReasoning(checkResults);
    const gaps = generateGaps(checkResults);

    dimensionResults.push({
      id: dimId,
      name: dbDim.name,
      score,
      weight: dbDim.weight,
      source: dbDim.source,
      reasoning,
      gaps,
      checks: checkResults,
    });

    // Display progress
    const bar = '\u2588'.repeat(Math.round(score / 10)) + '\u2591'.repeat(10 - Math.round(score / 10));
    const status = score >= ACCEPT_THRESHOLD ? 'PASS' : score >= 70 ? 'WARN' : 'FAIL';
    const src = dimId.startsWith('V') ? 'V' : 'A';
    console.log(`   ${dimId} [${src}] ${bar} ${String(score).padStart(3)}/100 ${status} ${dbDim.name}`);

    if (args.verbose) {
      for (const c of checkResults) {
        const icon = c.passed ? '+' : '-';
        console.log(`      [${icon}] ${c.label}: ${c.evidence}`);
      }
    }
  }

  // 5. Compute total_score as weighted average
  const totalWeight = dimensionResults.reduce((s, d) => s + d.weight, 0);
  const totalScore = totalWeight > 0
    ? Math.round(dimensionResults.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight)
    : 0;

  // 6. Build output JSON matching cmdPersist() format
  const output = {
    dimensions: dimensionResults.map(d => ({
      id: d.id,
      name: d.name,
      score: d.score,
      reasoning: d.reasoning,
      gaps: d.gaps,
    })),
    total_score: totalScore,
    summary: `Evidence-based scoring: ${dimensionResults.filter(d => d.score >= ACCEPT_THRESHOLD).length}/${dimensionResults.length} dimensions pass (>= ${ACCEPT_THRESHOLD}). Total: ${totalScore}/100.`,
  };

  // Threshold classification
  let thresholdAction = 'accept';
  if (totalScore < 70) thresholdAction = 'escalate';
  else if (totalScore < 83) thresholdAction = 'gap_closure_sd';
  else if (totalScore < 93) thresholdAction = 'minor_sd';

  console.log(`\n   Total Score: ${totalScore}/100 (${thresholdAction.toUpperCase()})`);
  console.log('   Scorer: evidence-scorer (deterministic)');

  const weak = dimensionResults.filter(d => d.score < ACCEPT_THRESHOLD).sort((a, b) => a.score - b.score);
  if (weak.length > 0) {
    console.log(`\n   ${weak.length} dimension(s) below threshold (${ACCEPT_THRESHOLD}):`);
    for (const d of weak) {
      console.log(`      ${d.id} ${d.name}: ${d.score}/100 (gap: ${ACCEPT_THRESHOLD - d.score}pts)`);
    }
  }

  // 7. Persist to DB if --persist
  if (args.persist) {
    const dimensionScores = {};
    for (const dim of dimensionResults) {
      dimensionScores[dim.id] = {
        name: dim.name,
        score: dim.score,
        weight: dim.weight,
        reasoning: dim.reasoning,
        gaps: dim.gaps,
        source: dim.source,
      };
    }

    const { data: inserted, error } = await supabase
      .from('eva_vision_scores')
      .insert({
        vision_id: vision.id,
        arch_plan_id: arch?.id || null,
        sd_id: null, // portfolio-level score
        total_score: totalScore,
        dimension_scores: dimensionScores,
        threshold_action: thresholdAction,
        rubric_snapshot: {
          vision_key: args.visionKey,
          arch_key: args.archKey,
          criteria_count: dimensionResults.length,
          summary: output.summary,
          scored_by: 'evidence-scorer',
          git_sha: gitMeta.sha,
          git_branch: gitMeta.branch,
          git_short_sha: gitMeta.shortSha,
          is_worktree: gitMeta.isWorktree,
          check_details: dimensionResults.map(d => ({
            id: d.id,
            checks: d.checks.map(c => ({ id: c.id, passed: c.passed, evidence: c.evidence })),
          })),
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error(`\n   Failed to persist: ${error.message}`);
      process.exit(1);
    }

    console.log(`\n   Score persisted: ${totalScore}/100`);
    console.log(`   Score ID: ${inserted.id}`);
    console.log('   Scored by: evidence-scorer');

    // Machine-readable output for heal loop
    console.log(`\nHEAL_STATUS=${thresholdAction === 'accept' ? 'PASS' : 'NEEDS_CORRECTION'}`);
    console.log(`HEAL_SCORE_ID=${inserted.id}`);
    if (thresholdAction !== 'accept') {
      console.log(`HEAL_NEXT_CMD=node scripts/eva/vision-heal.js generate ${inserted.id}`);
    }
  } else {
    // Output JSON to stdout for piping
    console.log('\n===EVIDENCE_SCORE_JSON===');
    console.log(JSON.stringify(output, null, 2));
    console.log('===END_JSON===');
  }
}

// CLI entrypoint
const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  main().catch(err => {
    console.error(`Evidence scorer error: ${err.message}`);
    process.exit(1);
  });
}
