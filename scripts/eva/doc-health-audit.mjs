#!/usr/bin/env node
/**
 * doc-health-audit.mjs — Documentation Health Audit
 *
 * Mirrors the /heal pattern: score → persist → generate corrective SDs → re-score until grade A.
 *
 * Subcommands:
 *   run      — Full pipeline: score → persist → generate (DEFAULT, no-arg behavior)
 *   score    — Scan filesystem, compute 13-dimension scores, print report
 *   persist  — Write score JSON to eva_vision_scores (mode: 'doc-audit')
 *   generate — Query latest doc-audit score, create corrective SDs for failing dimensions
 *   status   — Query latest doc-audit score from DB, print summary
 *
 * Usage:
 *   node scripts/eva/doc-health-audit.mjs [run] [--verbose] [--structural-only] [--no-auto-fix]
 *   node scripts/eva/doc-health-audit.mjs score [--json] [--verbose] [--structural-only]
 *   node scripts/eva/doc-health-audit.mjs persist '<json>'
 *   node scripts/eva/doc-health-audit.mjs persist --file <path>
 *   node scripts/eva/doc-health-audit.mjs generate [<score-id>]
 *   node scripts/eva/doc-health-audit.mjs status
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

import { scanDocs } from '../modules/doc-audit/scanner.js';
import { scoreAllDimensions, scoreAllDimensionsAsync, enrichGapsWithImpact } from '../modules/doc-audit/scorer.js';
import { GRADE_THRESHOLDS, classifyScore } from '../modules/doc-audit/rubric.js';
import { printReport, printSignals, printStatus, printTrend, printAutoFixSummary, toJSON } from '../modules/doc-audit/reporter.js';
import { autoFixAll } from '../modules/doc-audit/auto-fixer.js';
import { generateSDKey } from '../modules/sd-key-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../..');
config({ path: join(ROOT_DIR, '.env') });

// Sentinel vision document for portfolio-level audits
const PORTFOLIO_VISION_KEY = 'VISION-PORTFOLIO-SYSTEM-001';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ─── SCORE subcommand ───────────────────────────────────────────────────────

async function cmdScore(args) {
  const jsonMode = args.includes('--json');
  const verbose = args.includes('--verbose');
  const structuralOnly = args.includes('--structural-only');

  const log = jsonMode ? process.stderr.write.bind(process.stderr) : (m) => console.log(m);
  log('\n  Scanning documentation files...\n');
  const scanResult = scanDocs(ROOT_DIR);
  const stats = {
    fileCount: scanResult.files.length,
    dirCount: scanResult.directories.length,
  };

  log(`  Found ${stats.fileCount} files in ${stats.dirCount} directories.\n\n`);

  let scoreResult;
  let mode = 'structural';

  if (structuralOnly) {
    scoreResult = scoreAllDimensions(scanResult, ROOT_DIR);
  } else {
    // Try full scoring with coverage dimensions
    let supabase = null;
    try {
      supabase = getSupabase();
    } catch {
      // Supabase unavailable — fall back to structural-only
    }

    if (supabase) {
      mode = 'full';
      log('  Querying database for coverage dimensions (D11-D13)...\n');
      scoreResult = await scoreAllDimensionsAsync(scanResult, ROOT_DIR, supabase);
    } else {
      log('  Supabase unavailable — scoring structural dimensions only (D01-D10).\n');
      scoreResult = scoreAllDimensions(scanResult, ROOT_DIR);
    }
  }

  const jsonOutput = toJSON(scoreResult, stats);
  jsonOutput.mode_used = mode;

  if (jsonMode) {
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    printReport(scoreResult, stats);

    if (verbose) {
      console.log('\n  GAPS BY DIMENSION:');
      for (const dim of scoreResult.dimensions) {
        if (dim.gaps.length > 0) {
          console.log(`\n  ${dim.id}: ${dim.name} (${dim.gaps.length} gaps)`);
          for (const gap of dim.gaps.slice(0, 10)) {
            console.log(`    - ${gap}`);
          }
          if (dim.gaps.length > 10) {
            console.log(`    ... and ${dim.gaps.length - 10} more`);
          }
        }
      }
      console.log('');
    }

    printSignals(scoreResult.totalScore, null);
  }

  // Return JSON for piping to persist
  return jsonOutput;
}

// ─── PERSIST subcommand ─────────────────────────────────────────────────────

/**
 * Persist score data to database.
 * @param {string[]|object} argsOrData - CLI args array OR score data object (for internal chaining)
 * @returns {Promise<string>} The inserted score ID
 */
async function cmdPersist(argsOrData) {
  let scoreData;

  if (argsOrData && typeof argsOrData === 'object' && !Array.isArray(argsOrData)) {
    // Direct object passed from cmdRun pipeline
    scoreData = argsOrData;
  } else {
    const args = argsOrData || [];
    // Parse input: --file <path> or inline JSON
    const fileIdx = args.indexOf('--file');
    if (fileIdx !== -1 && args[fileIdx + 1]) {
      const filePath = args[fileIdx + 1];
      scoreData = JSON.parse(readFileSync(filePath, 'utf-8'));
    } else {
      // Find first arg that looks like JSON
      const jsonArg = args.find(a => a.startsWith('{'));
      if (jsonArg) {
        scoreData = JSON.parse(jsonArg);
      } else {
        console.error('Usage: doc-health-audit.mjs persist --file <path> | persist \'<json>\'');
        process.exit(1);
      }
    }
  }

  const supabase = getSupabase();

  // Resolve the portfolio vision document ID
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('id')
    .eq('vision_key', PORTFOLIO_VISION_KEY)
    .single();

  if (!vision) {
    console.error(`Portfolio vision document ${PORTFOLIO_VISION_KEY} not found. Create it first.`);
    process.exit(1);
  }

  // Build dimension_scores in the format expected by eva_vision_scores
  const dimensionScores = scoreData.dimensions || {};

  const thresholdAction = classifyScore(scoreData.total_score);

  const { data: inserted, error } = await supabase
    .from('eva_vision_scores')
    .insert({
      vision_id: vision.id,
      sd_id: null, // portfolio-level, not SD-specific
      total_score: scoreData.total_score,
      dimension_scores: dimensionScores,
      threshold_action: thresholdAction,
      rubric_snapshot: {
        mode: 'doc-audit',
        criteria_count: Object.keys(dimensionScores).length,
        summary: `Documentation health audit: ${scoreData.total_score}/100 (Grade ${scoreData.grade})`,
        gaps: Object.entries(dimensionScores)
          .filter(([, d]) => d.score < GRADE_THRESHOLDS.ACCEPT)
          .map(([id, d]) => `${id}: ${d.name} = ${d.score}/100`),
        scored_by: 'doc-health-audit',
        files_scanned: scoreData.files_scanned,
        directories_scanned: scoreData.directories_scanned,
      },
      created_by: 'doc-health-audit',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to persist score:', error.message);
    process.exit(1);
  }

  console.log(`\n  Score persisted: ${inserted.id}`);
  console.log(`  Total: ${scoreData.total_score}/100 (${thresholdAction})`);

  printSignals(scoreData.total_score, inserted.id);

  return inserted.id;
}

// ─── Helpers: Trend + Dedup ──────────────────────────────────────────────────

/**
 * Fetch the most recent previous doc-audit score for trend comparison.
 * @returns {{ data: object|null, roundNumber: number }}
 */
async function fetchPreviousScore(supabase) {
  try {
    const { data: previous } = await supabase
      .from('eva_vision_scores')
      .select('total_score, dimension_scores, scored_at')
      .filter('rubric_snapshot->>mode', 'eq', 'doc-audit')
      .order('scored_at', { ascending: false })
      .limit(1)
      .single();

    const { count } = await supabase
      .from('eva_vision_scores')
      .select('id', { count: 'exact', head: true })
      .filter('rubric_snapshot->>mode', 'eq', 'doc-audit');

    return { data: previous, roundNumber: (count || 0) + 1 };
  } catch {
    return { data: null, roundNumber: 1 };
  }
}

/**
 * Check for existing active corrective SDs covering the same dimensions.
 * Returns the set of dimension IDs already covered and the existing SD keys.
 */
async function checkExistingCorrectives(supabase, failingDimIds) {
  try {
    const { data: existingSDs, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, metadata, status')
      .filter('metadata->>source', 'eq', 'doc-health-audit')
      .not('status', 'in', '("completed","cancelled","rejected")');

    if (error || !existingSDs) {
      console.log('  Warning: Could not check for existing corrective SDs. Proceeding with creation.');
      return { coveredDims: new Set(), existingKeys: [] };
    }

    const coveredDims = new Set();
    const existingKeys = [];

    for (const sd of existingSDs) {
      const sdDims = sd.metadata?.dimensions || [];
      const overlap = sdDims.filter(d => failingDimIds.includes(d));
      if (overlap.length > 0) {
        for (const d of overlap) coveredDims.add(d);
        existingKeys.push({ sdKey: sd.sd_key || sd.id, dims: overlap });
      }
    }

    return { coveredDims, existingKeys };
  } catch {
    console.log('  Warning: Dedup check failed. Proceeding with creation.');
    return { coveredDims: new Set(), existingKeys: [] };
  }
}

// ─── GENERATE subcommand ────────────────────────────────────────────────────

async function cmdGenerate(args, opts = {}) {
  const supabase = getSupabase();

  let scoreId = args[0];

  // If no score ID provided, get the latest doc-audit score
  if (!scoreId) {
    const { data: latest } = await supabase
      .from('eva_vision_scores')
      .select('id, total_score, dimension_scores, threshold_action, generated_sd_ids, rubric_snapshot')
      .filter('rubric_snapshot->>mode', 'eq', 'doc-audit')
      .order('scored_at', { ascending: false })
      .limit(1)
      .single();

    if (!latest) {
      console.error('No doc-audit scores found. Run: node scripts/eva/doc-health-audit.mjs score');
      process.exit(1);
    }
    scoreId = latest.id;
  }

  // Load the score record
  const { data: score, error } = await supabase
    .from('eva_vision_scores')
    .select('*')
    .eq('id', scoreId)
    .single();

  if (error || !score) {
    console.error(`Score ${scoreId} not found.`);
    process.exit(1);
  }

  // Idempotency: skip if already generated
  if (score.generated_sd_ids && score.generated_sd_ids.length > 0) {
    console.log(`\n  Corrective SDs already generated for score ${scoreId}:`);
    for (const sdId of score.generated_sd_ids) {
      console.log(`    - ${sdId}`);
    }
    return;
  }

  // If score is passing, no correctives needed
  if (score.total_score >= GRADE_THRESHOLDS.ACCEPT) {
    console.log(`\n  Score ${score.total_score}/100 >= ${GRADE_THRESHOLDS.ACCEPT}. No corrective SDs needed.`);
    console.log('  DOC_AUDIT_STATUS=PASS');
    return;
  }

  // Group failing dimensions by tier
  const dims = score.dimension_scores;
  const tiers = { escalation: [], gap_closure: [], minor: [] };
  const failingDimIds = [];

  for (const [id, dim] of Object.entries(dims)) {
    if (dim.score >= GRADE_THRESHOLDS.ACCEPT) continue;
    failingDimIds.push(id);

    if (dim.score < GRADE_THRESHOLDS.GAP_CLOSURE) {
      tiers.escalation.push({ id, ...dim });
    } else if (dim.score < GRADE_THRESHOLDS.MINOR) {
      tiers.gap_closure.push({ id, ...dim });
    } else {
      tiers.minor.push({ id, ...dim });
    }
  }

  // ── Dedup: Check for existing corrective SDs ──
  const { coveredDims, existingKeys } = await checkExistingCorrectives(supabase, failingDimIds);

  if (existingKeys.length > 0) {
    console.log('  Existing corrective SDs detected:');
    for (const { sdKey, dims: covDims } of existingKeys) {
      console.log(`    ${sdKey} already covers ${covDims.join(', ')} — skipping`);
    }
  }

  if (coveredDims.size === failingDimIds.length && failingDimIds.length > 0) {
    console.log('\n  All failing dimensions covered by existing corrective SDs. No new SDs needed.');

    // Back-link current score to existing SDs
    for (const { sdKey } of existingKeys) {
      await backLinkScoreToSD(supabase, sdKey, scoreId);
    }

    console.log('  DOC_AUDIT_STATUS=NEEDS_CORRECTION');
    return;
  }

  // ── Build prioritized gap description ──
  const { scanResult: scanData } = opts;
  let prioritizedGapText = '';
  if (scanData) {
    const enriched = enrichGapsWithImpact(
      { dimensions: Object.entries(dims).map(([id, d]) => ({ id, ...d })) },
      scanData.files, ROOT_DIR,
    );

    // Flatten all gaps across failing dimensions, sort by impact, take top 50
    const allGaps = [];
    for (const dim of enriched.dimensions) {
      if (dim.score >= GRADE_THRESHOLDS.ACCEPT) continue;
      for (const eg of (dim.enrichedGaps || [])) {
        allGaps.push({ dimId: dim.id, ...eg });
      }
    }
    allGaps.sort((a, b) => b.impactScore - a.impactScore);
    const top50 = allGaps.slice(0, 50);

    if (top50.length > 0) {
      prioritizedGapText = '\n\nPrioritized gaps (by impact score):\n' +
        top50.map((g, i) => `${i + 1}. [${g.dimId}] (impact ${g.impactScore}) ${g.text}`).join('\n');
    }
  }

  const createdSDs = [];

  // Create one SD per non-empty tier (skip dimensions already covered)
  for (const [tier, dimensions] of Object.entries(tiers)) {
    // Filter out already-covered dimensions
    const uncovered = dimensions.filter(d => !coveredDims.has(d.id));
    if (uncovered.length === 0) continue;

    const dimNames = uncovered.map(d => d.name || d.id).join(', ');
    const dimIds = uncovered.map(d => d.id);
    const lowestScore = Math.min(...uncovered.map(d => d.score));
    const priority = tier === 'escalation' ? 'critical' : tier === 'gap_closure' ? 'high' : 'medium';
    const sdType = 'documentation';

    const successCriteria = uncovered.map(d =>
      `Re-run /doc-audit shows ${d.id} (${d.name}) >= ${GRADE_THRESHOLDS.ACCEPT}`
    );

    const title = uncovered.length === 1
      ? `Documentation Audit: Fix ${uncovered[0].name} (score ${uncovered[0].score}/100)`
      : `Documentation Audit: Fix ${uncovered.length} dimensions (${tier}, lowest ${lowestScore}/100)`;

    const sdKey = await generateSDKey({
      source: 'MANUAL',
      type: 'documentation',
      title,
      skipLeadValidation: true,
    });

    const { createSD } = await import('../leo-create-sd.js');

    const description = `Corrective SD generated by doc-health-audit. Addresses failing dimensions: ${dimNames}.${prioritizedGapText}`;

    const result = await createSD({
      sdKey,
      title,
      type: sdType,
      category: 'documentation',
      priority,
      rationale: `Doc-audit scored ${lowestScore}/100 on ${dimNames}. ${tier === 'escalation' ? 'Critical remediation needed.' : tier === 'gap_closure' ? 'Gap closure needed to reach Grade A.' : 'Minor improvements to reach Grade A.'}`,
      description,
      success_criteria: successCriteria,
      metadata: {
        source: 'doc-health-audit',
        score_id: scoreId,
        dimensions: dimIds,
        tier,
        lowest_score: lowestScore,
      },
    });

    if (result && result.id) {
      createdSDs.push(result.id);
      console.log(`\n  Created SD: ${result.sd_key || result.id} (${tier}, ${priority})`);
      console.log(`    Dimensions: ${dimIds.join(', ')}`);
    }
  }

  // Back-link: update score record with created SD IDs
  if (createdSDs.length > 0) {
    await supabase
      .from('eva_vision_scores')
      .update({ generated_sd_ids: createdSDs })
      .eq('id', scoreId);

    console.log(`\n  ${createdSDs.length} corrective SD(s) created and linked to score ${scoreId}.`);
  } else {
    console.log('\n  No corrective SDs created (all dimensions above threshold or already covered).');
  }

  console.log('  DOC_AUDIT_STATUS=NEEDS_CORRECTION');
}

/**
 * Back-link a score ID to an existing SD's metadata.linked_score_ids.
 */
async function backLinkScoreToSD(supabase, sdKey, scoreId) {
  try {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, metadata')
      .eq('sd_key', sdKey)
      .single();

    if (sd) {
      const linked = sd.metadata?.linked_score_ids || [];
      if (!linked.includes(scoreId)) {
        linked.push(scoreId);
        await supabase
          .from('strategic_directives_v2')
          .update({ metadata: { ...sd.metadata, linked_score_ids: linked } })
          .eq('id', sd.id);
      }
    }
  } catch {
    // Non-critical — don't fail the pipeline
  }
}

// ─── RUN subcommand (full 5-step pipeline) ───────────────────────────────────

/**
 * Full audit pipeline: score → auto-fix → re-score → persist → generate.
 * This is the default no-arg behavior and the primary entry point.
 */
async function cmdRun(args) {
  const verbose = args.includes('--verbose');
  const structuralOnly = args.includes('--structural-only');
  const noAutoFix = args.includes('--no-auto-fix');

  console.log('\n  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║  DOC-AUDIT: Full Pipeline (score → fix → re-score → persist → generate) ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝\n');

  let supabase = null;
  if (!structuralOnly) {
    try {
      supabase = getSupabase();
    } catch {
      // Supabase unavailable
    }
  }

  // Helper: run scoring
  async function runScoring(scan) {
    const stats = { fileCount: scan.files.length, dirCount: scan.directories.length };
    let result;
    if (supabase && !structuralOnly) {
      result = await scoreAllDimensionsAsync(scan, ROOT_DIR, supabase);
    } else {
      result = scoreAllDimensions(scan, ROOT_DIR);
    }
    return { scoreResult: result, stats };
  }

  function printGaps(scoreResult) {
    if (!verbose) return;
    console.log('\n  GAPS BY DIMENSION:');
    for (const dim of scoreResult.dimensions) {
      if (dim.gaps.length > 0) {
        console.log(`\n  ${dim.id}: ${dim.name} (${dim.gaps.length} gaps)`);
        for (const gap of dim.gaps.slice(0, 10)) {
          console.log(`    - ${gap}`);
        }
        if (dim.gaps.length > 10) {
          console.log(`    ... and ${dim.gaps.length - 10} more`);
        }
      }
    }
    console.log('');
  }

  // ── [1/5] SCORE ──
  console.log('  [1/5] Scoring documentation...\n');
  let scanResult = scanDocs(ROOT_DIR);
  console.log(`  Found ${scanResult.files.length} files in ${scanResult.directories.length} directories.\n`);

  if (supabase && !structuralOnly) {
    console.log('  Querying database for coverage dimensions (D11-D13)...\n');
  }

  let { scoreResult, stats } = await runScoring(scanResult);
  printReport(scoreResult, stats);
  printGaps(scoreResult);

  // ── [2/5] AUTO-FIX ──
  let fixResult = null;
  if (!noAutoFix && scoreResult.totalScore < GRADE_THRESHOLDS.ACCEPT) {
    console.log('\n  [2/5] Auto-fixing trivial issues (D02, D06, D07)...\n');
    fixResult = autoFixAll(scanResult, ROOT_DIR, scoreResult);
    printAutoFixSummary(fixResult);

    // ── [3/5] RE-SCORE ──
    if (fixResult.fixed.length > 0) {
      console.log('\n  [3/5] Re-scoring after auto-fix...\n');
      scanResult = scanDocs(ROOT_DIR);
      ({ scoreResult, stats } = await runScoring(scanResult));
      printReport(scoreResult, stats);
      printGaps(scoreResult);
    } else {
      console.log('\n  [3/5] No fixes applied — skipping re-score.\n');
    }
  } else if (noAutoFix) {
    console.log('\n  [2/5] Auto-fix skipped (--no-auto-fix).');
    console.log('  [3/5] Re-score skipped.\n');
  } else {
    console.log('\n  [2/5] Grade A — auto-fix not needed.');
    console.log('  [3/5] Re-score skipped.\n');
  }

  const jsonOutput = toJSON(scoreResult, stats);

  // ── Check: Grade A? ──
  if (scoreResult.totalScore >= GRADE_THRESHOLDS.ACCEPT) {
    console.log(`\n  Grade A achieved (${scoreResult.totalScore}/100). No corrective action needed.\n`);
    console.log('  DOC_AUDIT_STATUS=PASS');
    console.log('═'.repeat(59));
    return;
  }

  // ── TREND DISPLAY ──
  if (supabase) {
    const { data: previous, roundNumber } = await fetchPreviousScore(supabase);
    printTrend(scoreResult, previous, roundNumber);
  }

  // ── [4/5] PERSIST ──
  if (!supabase) {
    console.log('\n  Supabase unavailable — cannot persist or generate corrective SDs.');
    console.log('  Run individual subcommands when database is available:');
    console.log('    node scripts/eva/doc-health-audit.mjs score --json > score.json');
    console.log('    node scripts/eva/doc-health-audit.mjs persist --file score.json');
    console.log('    node scripts/eva/doc-health-audit.mjs generate');
    printSignals(scoreResult.totalScore, null);
    return;
  }

  console.log('\n  [4/5] Persisting score to database...\n');
  const scoreId = await cmdPersist(jsonOutput);

  // ── [5/5] GENERATE (with dedup + prioritization) ──
  console.log('\n  [5/5] Generating corrective SDs for failing dimensions...\n');
  await cmdGenerate([scoreId], { scanResult });

  // ── Final signals ──
  console.log('');
  console.log('═'.repeat(59));
  console.log('  DOC-AUDIT PIPELINE COMPLETE');
  console.log('═'.repeat(59));
  console.log(`  Score: ${scoreResult.totalScore}/100 (Grade ${jsonOutput.grade})`);
  console.log(`  Score ID: ${scoreId}`);
  if (fixResult && fixResult.fixed.length > 0) {
    console.log(`  Auto-fixed: ${fixResult.fixed.length} issues`);
  }
  console.log('');
  console.log('  Corrective SDs have been created and queued.');
  console.log('  After they are executed, re-run to verify improvement:');
  console.log('    node scripts/eva/doc-health-audit.mjs run');
  console.log('');
  console.log('  DOC_AUDIT_STATUS=NEEDS_CORRECTION');
  console.log(`  DOC_AUDIT_SCORE_ID=${scoreId}`);
  console.log('  DOC_AUDIT_NEXT_CMD=node scripts/eva/doc-health-audit.mjs run');
  console.log('═'.repeat(59));
}

// ─── STATUS subcommand ──────────────────────────────────────────────────────

async function cmdStatus() {
  const supabase = getSupabase();

  const { data: latest } = await supabase
    .from('eva_vision_scores')
    .select('*')
    .filter('rubric_snapshot->>mode', 'eq', 'doc-audit')
    .order('scored_at', { ascending: false })
    .limit(1)
    .single();

  printStatus(latest);
}

// ─── CLI Router ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0] || 'run';
  // If first arg is a flag (starts with --), treat as 'run' with flags
  const isFlag = subcommand.startsWith('--');
  const actualCommand = isFlag ? 'run' : subcommand;
  const subArgs = isFlag ? args : args.slice(1);

  try {
    switch (actualCommand) {
      case 'run':
      case 'audit':
        await cmdRun(subArgs);
        break;
      case 'score':
        await cmdScore(subArgs);
        break;
      case 'persist': {
        await cmdPersist(subArgs);
        break;
      }
      case 'generate':
      case 'fix':
        await cmdGenerate(subArgs);
        break;
      case 'status':
        await cmdStatus();
        break;
      default:
        console.error(`Unknown subcommand: ${actualCommand}`);
        console.error('Usage: doc-health-audit.mjs [run|score|persist|generate|status] [options]');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

// ESM entry point (handles Windows path differences)
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  main();
}

export { cmdRun, cmdScore, cmdPersist, cmdGenerate, cmdStatus };
