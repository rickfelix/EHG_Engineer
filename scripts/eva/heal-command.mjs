#!/usr/bin/env node
/**
 * heal-command.mjs — Unified Heal Command
 *
 * Two modes:
 *   1. VISION heal — Delegates to existing vision-heal.js
 *   2. SD heal     — Score codebase against completed Strategic Directives
 *
 * Usage:
 *   node scripts/eva/heal-command.mjs vision [score|persist|generate|status|loop]
 *   node scripts/eva/heal-command.mjs sd [--today|--sd-id X|--last N]
 *   node scripts/eva/heal-command.mjs sd persist '<JSON>'
 *   node scripts/eva/heal-command.mjs sd persist --file <path>
 *   node scripts/eva/heal-command.mjs sd generate <score-id>
 *   node scripts/eva/heal-command.mjs sd generate-all [--score-ids id1,id2]
 *   node scripts/eva/heal-command.mjs sd close-loop [--apply]
 *   node scripts/eva/heal-command.mjs status
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { ensureFresh, getGitMeta, warnIfWorktree } from './git-freshness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const ACCEPT_THRESHOLD = 93;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ─── VISION: Delegate to vision-heal.js ──────────────────────────────────────

function cmdVision(args) {
  const visionScript = join(__dirname, 'vision-heal.js');
  try {
    execFileSync('node', [visionScript, ...args], { stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
}

// ─── SD HEAL: Score codebase against completed SDs ───────────────────────────

function parseSDArgs(args) {
  const opts = { mode: 'query', today: false, sdId: null, last: 5, since: null, until: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'persist') {
      opts.mode = 'persist';
      // Check for --file flag first, then inline JSON
      const nextArg = args[i + 1];
      if (nextArg === '--file' && args[i + 2]) {
        opts.persistFile = args[i + 2];
      } else if (nextArg) {
        opts.persistJson = nextArg;
      }
      break;
    }
    if (arg === 'generate') {
      opts.mode = 'generate';
      opts.scoreId = args[i + 1];
      break;
    }
    if (arg === 'close-loop') {
      opts.mode = 'close-loop';
      opts.apply = args.includes('--apply');
      break;
    }
    if (arg === 'generate-all') {
      opts.mode = 'generate-all';
      // Optional: --score-ids id1,id2,id3
      const nextArg = args[i + 1];
      if (nextArg === '--score-ids' && args[i + 2]) {
        opts.scoreIds = args[i + 2].split(',');
      }
      // --batch-size N override (SD-MAN-INFRA-ENFORCE-PER-DIMENSION-003)
      const bsIdx = args.indexOf('--batch-size');
      if (bsIdx !== -1 && args[bsIdx + 1]) {
        opts.batchSize = parseInt(args[bsIdx + 1], 10);
      }
      break;
    }
    if (arg === '--today') opts.today = true;
    if (arg === '--sd-id' && args[i + 1]) { opts.sdId = args[i + 1]; i++; }
    if (arg === '--last' && args[i + 1]) { opts.last = parseInt(args[i + 1], 10) || 5; i++; }
    if (arg === '--since' && args[i + 1]) { opts.since = args[i + 1]; i++; }
    if (arg === '--until' && args[i + 1]) { opts.until = args[i + 1]; i++; }
  }

  return opts;
}

async function cmdSDQuery(opts) {
  // ─── Git Freshness Check (prevents stale-codebase scoring) ───
  const gitMeta = getGitMeta();
  warnIfWorktree(gitMeta);
  const freshness = ensureFresh();
  if (freshness.pulled) {
    console.log(`   📝 Git state refreshed before SD heal scoring.`);
  }
  if (!freshness.fresh && !freshness.pulled) {
    console.warn(`   ⚠️  STALE WARNING: SD heal scores may not reflect latest merged work.`);
  }
  console.log(`   🔍 Scoring codebase at: ${gitMeta.shortSha} (${gitMeta.branch})\n`);

  const supabase = getSupabase();

  let query = supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, key_changes, success_criteria, success_metrics, strategic_objectives, smoke_test_steps, delivers_capabilities, completion_date, status')
    .eq('status', 'completed')
    .order('completion_date', { ascending: false });

  if (opts.sdId) {
    query = query.eq('sd_key', opts.sdId);
  } else if (opts.today) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    query = query.gte('completion_date', todayStart.toISOString());
  } else if (opts.since) {
    const sinceDate = new Date(opts.since);
    sinceDate.setHours(0, 0, 0, 0);
    query = query.gte('completion_date', sinceDate.toISOString());
    if (opts.until) {
      const untilDate = new Date(opts.until);
      untilDate.setHours(23, 59, 59, 999);
      query = query.lte('completion_date', untilDate.toISOString());
    }
  } else {
    query = query.limit(opts.last);
  }

  const { data: sds, error } = await query;

  if (error) {
    console.error(`Error querying SDs: ${error.message}`);
    process.exit(1);
  }

  if (!sds || sds.length === 0) {
    console.log('\nNo completed SDs found matching the filter.');
    if (opts.today) console.log('  (No SDs completed today)');
    if (opts.sdId) console.log(`  (SD ${opts.sdId} not found or not completed)`);
    process.exit(0);
  }

  console.log(`\nFound ${sds.length} completed SD(s) to heal against:\n`);
  for (const sd of sds) {
    console.log(`  ${sd.sd_key} — ${sd.title}`);
    console.log(`    Completed: ${sd.completion_date || 'unknown'}`);
  }

  // Build inline scoring context
  const scoringContext = {
    mode: 'SD_HEAL_SCORE',
    instruction: [
      'Claude Code: For each SD below, verify that its PROMISES were actually delivered in the codebase.',
      'Score each SD on the dimensions listed. Check the actual codebase files, not just metadata.',
      '',
      'IMPORTANT — Relevance Classification (reduces false positives):',
      'For each unimplemented item, BEFORE penalizing, classify it:',
      '  1. Search the codebase for callers/consumers of the item (grep for references)',
      '  2. Check if the functionality exists under a different name or in a different module',
      '  3. Check if another completed SD already delivered this capability',
      '',
      'Classifications:',
      '  - MISSING: Item has active callers/consumers but no implementation — FULL PENALTY',
      '  - RELOCATED: Functionality exists but was moved to a different module/pattern — NO PENALTY',
      '  - DESCOPED: Item has zero callers in the codebase — intentionally omitted — PARTIAL PENALTY (-10 instead of full)',
      '  - SUPERSEDED: Another SD already delivered this capability — NO PENALTY',
      '',
      'Scoring dimensions per SD:',
      '  - key_changes_delivered (0-100): Were the stated key_changes actually implemented?',
      '  - success_criteria_met (0-100): Are the success_criteria verifiable in the codebase?',
      '  - success_metrics_achieved (0-100): Do the success_metrics hold true?',
      '  - smoke_tests_pass (0-100): Would the smoke_test_steps pass if executed?',
      '    NOTE: If smoke_test_steps is empty/null/[], score 100 with reasoning "N/A: no smoke test steps defined".',
      '  - capabilities_present (0-100): Are delivers_capabilities actually functional?',
      '',
      'Include the classification in each dimension\'s reasoning field (e.g., "DESCOPED: zero callers in codebase").',
      'The gaps array should ONLY contain items classified as MISSING — not DESCOPED, RELOCATED, or SUPERSEDED.',
      '',
      'After scoring, write JSON to a file and run:',
      '  node scripts/eva/heal-command.mjs sd persist --file <path-to-json>',
    ].join('\n'),
    sds: sds.map(sd => ({
      sd_key: sd.sd_key,
      title: sd.title,
      completion_date: sd.completion_date,
      promises: {
        key_changes: sd.key_changes,
        success_criteria: sd.success_criteria,
        success_metrics: sd.success_metrics,
        strategic_objectives: sd.strategic_objectives,
        smoke_test_steps: sd.smoke_test_steps,
        delivers_capabilities: sd.delivers_capabilities,
      },
    })),
    responseFormat: {
      sd_scores: [
        {
          sd_key: 'SD-XXX-001',
          dimensions: [
            { id: 'key_changes_delivered', score: 0, reasoning: '...' },
            { id: 'success_criteria_met', score: 0, reasoning: '...' },
            { id: 'success_metrics_achieved', score: 0, reasoning: '...' },
            { id: 'smoke_tests_pass', score: 0, reasoning: '...' },
            { id: 'capabilities_present', score: 0, reasoning: '...' },
          ],
          item_classifications: [
            { item: 'exampleFunction', classification: 'DESCOPED|MISSING|RELOCATED|SUPERSEDED', evidence: 'brief evidence' },
          ],
          total_score: 0,
          gaps: ['only items classified as MISSING'],
          summary: '1-2 sentence assessment',
        },
      ],
      overall_score: 0,
      overall_summary: '1-2 sentence overall assessment',
    },
  };

  console.log('\n===SD_HEAL_SCORE_CONTEXT===');
  console.log(JSON.stringify(scoringContext, null, 2));
  console.log('===END_CONTEXT===');
}

async function cmdSDPersist(scoreJson, filePath) {
  const supabase = getSupabase();
  const gitMeta = getGitMeta();
  let rawJson = scoreJson;
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    rawJson = readFileSync(filePath, 'utf8');
  }
  const parsed = JSON.parse(rawJson);

  if (!parsed.sd_scores || !Array.isArray(parsed.sd_scores)) {
    console.error('Invalid format: expected { sd_scores: [...], overall_score: N }');
    process.exit(1);
  }

  // ─── Per-Dimension Schema Validation (SD-MAN-INFRA-ENFORCE-PER-DIMENSION-003) ───
  const REQUIRED_DIMENSIONS = [
    'key_changes_delivered',
    'success_criteria_met',
    'success_metrics_achieved',
    'smoke_tests_pass',
    'capabilities_present',
  ];
  const MIN_RATIONALE_LENGTH = 20;

  const validationErrors = [];
  for (const sdScore of parsed.sd_scores) {
    const dims = sdScore.dimensions || [];
    const dimIds = dims.map(d => d.id);

    // Check all 5 required dimensions are present
    const missing = REQUIRED_DIMENSIONS.filter(r => !dimIds.includes(r));
    if (missing.length > 0) {
      validationErrors.push({
        sdKey: sdScore.sd_key,
        rule: 'MISSING_DIMENSIONS',
        details: `Missing ${missing.length} of 5 required dimensions: ${missing.join(', ')}`,
        fix: 'Re-score this SD with all 5 dimensions',
      });
    }

    // Check for unknown dimension keys
    const unknown = dimIds.filter(d => !REQUIRED_DIMENSIONS.includes(d));
    if (unknown.length > 0) {
      validationErrors.push({
        sdKey: sdScore.sd_key,
        rule: 'UNKNOWN_DIMENSIONS',
        details: `Unknown dimension keys: ${unknown.join(', ')}`,
        fix: 'Use only: ' + REQUIRED_DIMENSIONS.join(', '),
      });
    }

    // Check rationale quality per dimension
    for (const dim of dims) {
      const reasoning = (dim.reasoning || '').trim();
      if (reasoning.length < MIN_RATIONALE_LENGTH) {
        validationErrors.push({
          sdKey: sdScore.sd_key,
          rule: 'INSUFFICIENT_RATIONALE',
          details: `Dimension '${dim.id}' has rationale of ${reasoning.length} chars (minimum: ${MIN_RATIONALE_LENGTH})`,
          fix: 'Provide meaningful reasoning for each dimension (>= 20 characters)',
        });
      }
    }
  }

  if (validationErrors.length > 0) {
    console.error('\n❌ SCORE VALIDATION FAILED');
    console.error(`   ${validationErrors.length} validation error(s) found:\n`);
    for (const err of validationErrors) {
      console.error(`   [${err.rule}] ${err.sdKey}: ${err.details}`);
      console.error(`     Fix: ${err.fix}\n`);
    }
    console.error('HEAL_STATUS=VALIDATION_FAILED');
    process.exit(1);
  }

  // Resolve vision/arch keys — use SD metadata if available, else default to L1
  let visionKey = 'VISION-EHG-L1-001';
  let archKey = 'ARCH-EHG-L1-001';
  if (parsed.sd_scores?.[0]?.sd_key) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', parsed.sd_scores[0].sd_key)
      .single();
    if (sd?.metadata?.vision_key) visionKey = sd.metadata.vision_key;
    if (sd?.metadata?.arch_key) archKey = sd.metadata.arch_key;
  }

  // Load vision doc IDs for the foreign key
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('id')
    .eq('vision_key', visionKey)
    .single();

  const { data: arch } = await supabase
    .from('eva_architecture_plans')
    .select('id')
    .eq('plan_key', archKey)
    .single();

  const insertedIds = [];

  for (const sdScore of parsed.sd_scores) {
    const dimensionScores = {};
    for (const dim of sdScore.dimensions) {
      dimensionScores[dim.id] = {
        name: dim.id,
        score: dim.score,
        reasoning: dim.reasoning,
        source: 'sd-heal',
      };
    }

    let thresholdAction = 'accept';
    if (sdScore.total_score < 70) thresholdAction = 'escalate';
    else if (sdScore.total_score < 83) thresholdAction = 'gap_closure_sd';
    else if (sdScore.total_score < 93) thresholdAction = 'minor_sd';

    const { data: inserted, error } = await supabase
      .from('eva_vision_scores')
      .insert({
        vision_id: vision?.id || null,
        arch_plan_id: arch?.id || null,
        sd_id: sdScore.sd_key,
        total_score: sdScore.total_score,
        dimension_scores: dimensionScores,
        threshold_action: thresholdAction,
        rubric_snapshot: {
          mode: 'sd-heal',
          sd_key: sdScore.sd_key,
          gaps: sdScore.gaps || [],
          summary: sdScore.summary,
          scored_by: 'claude-code-inline',
          git_sha: gitMeta.sha,
          git_branch: gitMeta.branch,
          git_short_sha: gitMeta.shortSha,
          is_worktree: gitMeta.isWorktree,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Failed to persist score for ${sdScore.sd_key}: ${error.message}`);
      continue;
    }

    insertedIds.push({ sdKey: sdScore.sd_key, scoreId: inserted.id, score: sdScore.total_score, action: thresholdAction });

    // Per-SD output
    console.log(`\n  ${sdScore.sd_key}: ${sdScore.total_score}/100 (${thresholdAction})`);
    for (const dim of sdScore.dimensions) {
      const bar = '\u2588'.repeat(Math.round(dim.score / 10)) + '\u2591'.repeat(10 - Math.round(dim.score / 10));
      console.log(`    ${dim.id.padEnd(28)} ${bar} ${dim.score}/100`);
    }
    if (sdScore.gaps?.length > 0) {
      console.log(`    Gaps: ${sdScore.gaps.join('; ')}`);
    }
  }

  // Summary
  console.log('\n\u2500\u2500\u2500 SD Heal Summary \u2500\u2500\u2500');
  console.log(`  Overall: ${parsed.overall_score}/100`);
  console.log(`  SDs scored: ${insertedIds.length}`);

  const needsCorrection = insertedIds.filter(s => s.action !== 'accept');
  if (needsCorrection.length > 0) {
    console.log(`\n  ${needsCorrection.length} SD(s) below threshold (${ACCEPT_THRESHOLD}):`);
    for (const s of needsCorrection) {
      console.log(`    ${s.sdKey}: ${s.score}/100 — run: node scripts/eva/heal-command.mjs sd generate ${s.scoreId}`);
    }
    console.log(`\nHEAL_STATUS=NEEDS_CORRECTION`);
    console.log(`HEAL_SCORE_IDS=${needsCorrection.map(s => s.scoreId).join(',')}`);
    console.log(`HEAL_NEXT_CMD=node scripts/eva/heal-command.mjs sd generate ${needsCorrection[0].scoreId}`);
  } else {
    console.log(`\n  All SDs pass threshold! No corrective action needed.`);
    console.log(`\nHEAL_STATUS=PASS`);
  }
}

async function cmdSDGenerate(scoreId) {
  const { generateCorrectiveSD } = await import('./corrective-sd-generator.mjs');
  const result = await generateCorrectiveSD(scoreId);
  console.log(JSON.stringify(result, null, 2));

  if (result.created && result.sds) {
    console.log(`\nCorrective SDs created (${result.sds.length}):`);
    for (const sd of result.sds) {
      console.log(`  ${sd.sdKey} \u2014 ${sd.label} (${sd.dims.map(d => d.dimId).join(', ')})`);
    }
    console.log('\n  Work each SD through LEAD\u2192PLAN\u2192EXEC\u2192completion,');
    console.log('  then run: node scripts/eva/heal-command.mjs sd --today');
  } else if (!result.created) {
    console.log(`\n  No SDs created: ${result.reason || result.action}`);
  }
}

async function cmdSDGenerateAll(scoreIds, options = {}) {
  const supabase = getSupabase();
  const { generateCorrectiveSD } = await import('./corrective-sd-generator.mjs');

  // Batch size: CLI flag > env var > default of 8 (SD-MAN-INFRA-ENFORCE-PER-DIMENSION-003)
  const DEFAULT_BATCH_SIZE = 8;
  const batchSize = options.batchSize
    || (process.env.HEAL_BATCH_SIZE ? parseInt(process.env.HEAL_BATCH_SIZE, 10) : null)
    || DEFAULT_BATCH_SIZE;
  console.log(`  batch_size=${batchSize}`);

  // If no score IDs provided, query recent non-accept scores
  let ids = scoreIds;
  if (!ids || ids.length === 0) {
    const { data: scores } = await supabase
      .from('eva_vision_scores')
      .select('id, sd_id, total_score, threshold_action')
      .not('sd_id', 'is', null)
      .in('threshold_action', ['escalate', 'gap_closure_sd', 'minor_sd'])
      .is('generated_sd_ids', null)
      .order('scored_at', { ascending: false })
      .limit(batchSize);

    if (!scores || scores.length === 0) {
      console.log('\nNo unprocessed failing scores found.');
      console.log('HEAL_STATUS=PASS');
      return;
    }
    ids = scores.map(s => s.id);
    console.log(`\nFound ${ids.length} failing score(s) to generate correctives for:\n`);
    for (const s of scores) {
      console.log(`  ${(s.sd_id || '?').padEnd(50)} ${s.total_score}/100 (${s.threshold_action})`);
    }
  }

  const results = { created: [], deferred: [], failed: [], needsRescore: [] };

  for (const scoreId of ids) {
    try {
      const result = await generateCorrectiveSD(scoreId);
      if (result.created) {
        results.created.push(result);
        const sdList = result.sds || [{ sdKey: result.sdKey }];
        for (const sd of sdList) {
          console.log(`  \u2705 ${sd.sdKey} created`);
        }
      } else if (result.needsRescore) {
        results.needsRescore.push({ scoreId, reason: result.reason });
        console.log(`  \u26A0  ${scoreId.substring(0, 8)}... needs re-score (${result.reason})`);
      } else {
        results.deferred.push({ scoreId, reason: result.reason || result.action });
        console.log(`  \u23ED  ${scoreId.substring(0, 8)}... deferred (${result.reason || result.action})`);
      }
    } catch (err) {
      results.failed.push({ scoreId, error: err.message });
      console.error(`  \u274C ${scoreId.substring(0, 8)}... failed: ${err.message}`);
    }
  }

  // Summary
  console.log('\n\u2500\u2500\u2500 Batch Generate Summary \u2500\u2500\u2500');
  console.log(`  Created:       ${results.created.length}`);
  console.log(`  Deferred:      ${results.deferred.length}`);
  console.log(`  Needs rescore: ${results.needsRescore.length}`);
  console.log(`  Failed:        ${results.failed.length}`);

  if (results.created.length > 0) {
    console.log('\n  Corrective SDs created:');
    for (const r of results.created) {
      const sdList = r.sds || [{ sdKey: r.sdKey }];
      for (const sd of sdList) {
        console.log(`    ${sd.sdKey}`);
      }
    }
    console.log('\n  Work corrective SDs via: npm run sd:next');
    console.log('\nHEAL_STATUS=CORRECTIVES_CREATED');
    console.log(`HEAL_CORRECTIVE_COUNT=${results.created.length}`);
  } else if (results.deferred.length > 0) {
    console.log('\n  All scores deferred (below min-occurrences threshold).');
    console.log('\nHEAL_STATUS=ALL_DEFERRED');
  } else {
    console.log('\nHEAL_STATUS=PASS');
  }

  // Signal incomplete scores needing re-score (SD-MAN-INFRA-ENFORCE-PER-DIMENSION-003)
  if (results.needsRescore.length > 0) {
    console.log(`\nHEAL_RESCORE_NEEDED=${results.needsRescore.length}`);
    console.log(`HEAL_RESCORE_IDS=${results.needsRescore.map(r => r.scoreId).join(',')}`);
  }
}

// ─── SD CLOSE-LOOP: Back-link corrective SDs to origin heal scores ──────────

async function cmdSDCloseLoop(apply) {
  const supabase = getSupabase();
  const { findUnlinkedScores, findCorrectiveSDs, matchScoresToCorrectives, applyLinks } = await import('./heal-loop-linker.mjs');

  const unlinked = await findUnlinkedScores(supabase);
  const correctives = await findCorrectiveSDs(supabase);

  console.log('\n=== Heal Loop Close ===');
  console.log(`  Unlinked non-accept scores: ${unlinked.length}`);
  console.log(`  Corrective SDs found: ${correctives.length}`);

  if (unlinked.length === 0) {
    console.log('\n  All non-accept scores already linked. Nothing to do.');
    return;
  }

  const { matches, unmatched } = await matchScoresToCorrectives(unlinked, correctives);

  if (matches.length > 0) {
    console.log(`\n  Matches (${matches.length}):`);
    for (const m of matches) {
      console.log(`    ${m.originalSdKey} (${m.score}/100) \u2192 ${m.correctiveSdKey} [${m.correctiveTitle}] (${m.confidence})`);
    }
  }

  if (unmatched.length > 0) {
    console.log(`\n  Unmatched (${unmatched.length}):`);
    for (const u of unmatched) {
      console.log(`    ${u.sdKey}: ${u.score}/100 (${u.action})`);
    }
  }

  if (apply && matches.length > 0) {
    const result = await applyLinks(matches, supabase);
    console.log(`\n  Applied: ${result.linked} linked, ${result.failed} failed`);
  } else if (matches.length > 0) {
    console.log('\n  Run with --apply to persist links');
  }
}

// ─── STATUS: Combined vision + SD heal status ───────────────────────────────

async function cmdStatus() {
  const supabase = getSupabase();

  // Latest vision score (sd_id IS NULL = portfolio-level)
  const { data: latestVision } = await supabase
    .from('eva_vision_scores')
    .select('id, total_score, threshold_action, scored_at, rubric_snapshot')
    .is('sd_id', null)
    .order('scored_at', { ascending: false })
    .limit(1)
    .single();

  // Latest SD heal scores (sd_id IS NOT NULL)
  const { data: sdScores } = await supabase
    .from('eva_vision_scores')
    .select('id, sd_id, total_score, threshold_action, scored_at, rubric_snapshot')
    .not('sd_id', 'is', null)
    .order('scored_at', { ascending: false })
    .limit(10);

  console.log('\n\u2500\u2500\u2500 Heal Status \u2500\u2500\u2500\n');

  // Vision section
  console.log('  Vision Heal:');
  if (latestVision) {
    console.log(`    Score: ${latestVision.total_score}/100 (${latestVision.threshold_action})`);
    console.log(`    Date:  ${latestVision.scored_at}`);
    if (latestVision.rubric_snapshot?.git_short_sha) {
      console.log(`    Git:   ${latestVision.rubric_snapshot.git_short_sha} (${latestVision.rubric_snapshot.git_branch || '?'})`);
    }
  } else {
    console.log('    No vision scores. Run: /heal vision');
  }

  // SD section
  console.log('\n  SD Heal:');
  if (sdScores?.length > 0) {
    for (const s of sdScores) {
      const mode = s.rubric_snapshot?.mode || 'unknown';
      console.log(`    ${(s.sd_id || '?').padEnd(45)} ${s.total_score}/100 (${s.threshold_action}) ${s.scored_at}`);
    }
  } else {
    console.log('    No SD heal scores. Run: /heal sd --today');
  }

  // Active corrective SDs
  const { data: correctives } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, progress')
    .not('vision_origin_score_id', 'is', null)
    .not('status', 'in', '("completed","cancelled")')
    .order('created_at', { ascending: false })
    .limit(10);

  if (correctives?.length > 0) {
    console.log(`\n  Active Corrective SDs (${correctives.length}):`);
    for (const sd of correctives) {
      console.log(`    ${sd.sd_key} [${sd.status}] ${sd.progress || 0}% \u2014 ${sd.title?.substring(0, 55)}`);
    }
  }

  console.log('');
}

// ─── CLI Router ──────────────────────────────────────────────────────────────

const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  const cmd = process.argv[2];
  const rest = process.argv.slice(3);

  switch (cmd) {
    case 'vision':
      cmdVision(rest);
      break;

    case 'sd': {
      const opts = parseSDArgs(rest);
      if (opts.mode === 'persist') {
        if (!opts.persistJson && !opts.persistFile) {
          console.error('Usage: heal sd persist \'<JSON>\' OR heal sd persist --file <path>');
          process.exit(1);
        }
        cmdSDPersist(opts.persistJson, opts.persistFile).catch(e => { console.error(e.message); process.exit(1); });
      } else if (opts.mode === 'generate') {
        if (!opts.scoreId) { console.error('Usage: heal sd generate <score-id>'); process.exit(1); }
        cmdSDGenerate(opts.scoreId).catch(e => { console.error(e.message); process.exit(1); });
      } else if (opts.mode === 'close-loop') {
        cmdSDCloseLoop(opts.apply).catch(e => { console.error(e.message); process.exit(1); });
      } else if (opts.mode === 'generate-all') {
        cmdSDGenerateAll(opts.scoreIds, { batchSize: opts.batchSize }).catch(e => { console.error(e.message); process.exit(1); });
      } else {
        cmdSDQuery(opts).catch(e => { console.error(e.message); process.exit(1); });
      }
      break;
    }

    case 'status':
      cmdStatus().catch(e => { console.error(e.message); process.exit(1); });
      break;

    default:
      console.log('Usage: node scripts/eva/heal-command.mjs <command>\n');
      console.log('Commands:');
      console.log('  vision [subcommand]                    Vision heal (delegates to vision-heal.js)');
      console.log('  sd [--today|--sd-id|--last|--since]    SD heal (verify completed SD promises)');
      console.log('  sd persist <JSON>                      Persist SD heal scores (inline JSON)');
      console.log('  sd persist --file <path>               Persist SD heal scores (from file)');
      console.log('  sd generate <score-id>                 Create corrective SD from one score');
      console.log('  sd generate-all                        Batch-create correctives for all failing scores');
      console.log('  sd generate-all --score-ids a,b,c      Batch-create for specific score IDs');
      console.log('  sd generate-all --batch-size N          Override batch size (default: 8, env: HEAL_BATCH_SIZE)');
      console.log('  sd close-loop                          Back-link corrective SDs to origin heal scores (dry-run)');
      console.log('  sd close-loop --apply                  Persist the links');
      console.log('  status                                 Combined heal status');
      console.log('');
      console.log('SD filters:');
      console.log('  --today                  SDs completed today');
      console.log('  --sd-id <key>            Specific SD by key');
      console.log('  --last <N>               Last N completed SDs (default 5)');
      console.log('  --since <YYYY-MM-DD>     SDs completed on or after date');
      console.log('  --until <YYYY-MM-DD>     SDs completed on or before date (use with --since)');
      process.exit(1);
  }
}
