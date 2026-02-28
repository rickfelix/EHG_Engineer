#!/usr/bin/env node
/**
 * doc-health-audit.mjs — Documentation Health Audit
 *
 * Mirrors the /heal pattern: score → persist → generate corrective SDs → re-score until grade A.
 *
 * Subcommands:
 *   score    — Scan filesystem, compute 10-dimension scores, print report
 *   persist  — Write score JSON to eva_vision_scores (mode: 'doc-audit')
 *   generate — Query latest doc-audit score, create corrective SDs for failing dimensions
 *   status   — Query latest doc-audit score from DB, print summary
 *
 * Usage:
 *   node scripts/eva/doc-health-audit.mjs score [--json] [--verbose]
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
import { scoreAllDimensions } from '../modules/doc-audit/scorer.js';
import { GRADE_THRESHOLDS, classifyScore } from '../modules/doc-audit/rubric.js';
import { printReport, printSignals, printStatus, toJSON } from '../modules/doc-audit/reporter.js';

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

  const log = jsonMode ? process.stderr.write.bind(process.stderr) : (m) => console.log(m);
  log('\n  Scanning documentation files...\n');
  const scanResult = scanDocs(ROOT_DIR);
  const stats = {
    fileCount: scanResult.files.length,
    dirCount: scanResult.directories.length,
  };

  log(`  Found ${stats.fileCount} files in ${stats.dirCount} directories.\n\n`);

  const scoreResult = scoreAllDimensions(scanResult, ROOT_DIR);
  const jsonOutput = toJSON(scoreResult, stats);

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

async function cmdPersist(args) {
  let scoreData;

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

// ─── GENERATE subcommand ────────────────────────────────────────────────────

async function cmdGenerate(args) {
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

  for (const [id, dim] of Object.entries(dims)) {
    if (dim.score >= GRADE_THRESHOLDS.ACCEPT) continue;

    if (dim.score < GRADE_THRESHOLDS.GAP_CLOSURE) {
      tiers.escalation.push({ id, ...dim });
    } else if (dim.score < GRADE_THRESHOLDS.MINOR) {
      tiers.gap_closure.push({ id, ...dim });
    } else {
      tiers.minor.push({ id, ...dim });
    }
  }

  const createdSDs = [];

  // Create one SD per non-empty tier
  for (const [tier, dimensions] of Object.entries(tiers)) {
    if (dimensions.length === 0) continue;

    const dimNames = dimensions.map(d => d.name || d.id).join(', ');
    const dimIds = dimensions.map(d => d.id);
    const lowestScore = Math.min(...dimensions.map(d => d.score));
    const priority = tier === 'escalation' ? 'critical' : tier === 'gap_closure' ? 'high' : 'medium';
    const sdType = tier === 'minor' ? 'enhancement' : 'corrective';

    // Build success criteria
    const successCriteria = dimensions.map(d =>
      `Re-run /doc-audit shows ${d.id} (${d.name}) >= ${GRADE_THRESHOLDS.ACCEPT}`
    );

    // Build title
    const title = dimensions.length === 1
      ? `Documentation Audit: Fix ${dimensions[0].name} (score ${dimensions[0].score}/100)`
      : `Documentation Audit: Fix ${dimensions.length} dimensions (${tier}, lowest ${lowestScore}/100)`;

    // Dynamically import createSD
    const { createSD } = await import('../leo-create-sd.js');

    const result = await createSD({
      title,
      type: sdType,
      category: 'documentation',
      priority,
      description: `Corrective SD generated by doc-health-audit. Addresses failing dimensions: ${dimNames}.`,
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
    console.log('\n  No corrective SDs created (all dimensions above threshold or no gaps detected).');
  }

  console.log('  DOC_AUDIT_STATUS=NEEDS_CORRECTION');
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
  const subcommand = args[0] || 'score';
  const subArgs = args.slice(1);

  try {
    switch (subcommand) {
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
        console.error(`Unknown subcommand: ${subcommand}`);
        console.error('Usage: doc-health-audit.mjs [score|persist|generate|status] [options]');
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

export { cmdScore, cmdPersist, cmdGenerate, cmdStatus };
