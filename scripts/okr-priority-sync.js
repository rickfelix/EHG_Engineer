#!/usr/bin/env node
/**
 * OKR Priority Sync - Persists OKR-driven priority adjustments
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-004 (FR-005: okr_priority_auto_adjustment)
 *
 * Queries sd_key_result_alignment, fetches KR status/deadline,
 * calculates OKR boost with deadline proximity, and persists
 * updated priority_score to strategic_directives_v2.
 *
 * Usage:
 *   npm run okr:sync
 *   npm run okr:sync -- --dry-run
 *   npm run okr:sync -- --sd-id SD-XXX-001
 *   npm run okr:sync -- --json
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getDeadlineProximityFactor } from './lib/priority-scorer.js';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { args.dryRun = true; continue; }
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[++i];
    }
  }
  return args;
}

function showHelp() {
  console.log(`
OKR Priority Sync - Persist OKR-driven priority adjustments

Usage: npm run okr:sync -- [options]

Options:
  --dry-run          Preview changes without persisting
  --sd-id <key>      Sync priority for a specific SD only
  --json             Output results as JSON
  --verbose, -v      Show detailed scoring breakdown
  --help, -h         Show this help

How it works:
  1. Queries sd_key_result_alignment for all linked SDs
  2. Fetches key_result status, deadline, and progress
  3. Calculates deadline proximity factor (0.0-1.0)
  4. Computes OKR boost: urgency × contribution × proximity × weight
  5. Persists updated priority_score to strategic_directives_v2

Deadline Proximity Factor:
  At deadline:    1.0 (maximum urgency)
  45 days out:    0.5
  90+ days out:   0.0 (no urgency boost)
`);
}

// KR urgency multipliers (same as priority-scorer.js)
const KR_URGENCY = {
  off_track: 3.0,
  at_risk: 2.0,
  on_track: 1.0,
  pending: 1.0,
  achieved: 0.0,
  missed: 0.0,
};

const CONTRIBUTION_MULT = {
  direct: 1.5,
  enabling: 1.0,
  supporting: 0.5,
};

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { showHelp(); return; }

  const dryRun = args.dryRun || false;

  // 1. Fetch all alignments (sd_id is UUID, not sd_key)
  let alignQuery = supabase
    .from('sd_key_result_alignment')
    .select('sd_id, key_result_id, contribution_type, contribution_weight');

  const { data: alignments, error: alignErr } = await alignQuery;
  if (alignErr) {
    console.error('Alignment query error:', alignErr.message);
    process.exit(1);
  }

  if (!alignments || alignments.length === 0) {
    console.log(dryRun ? '  [DRY RUN] ' : '  ', 'No OKR alignments found.');
    return;
  }

  // 1b. Resolve sd_id UUIDs to sd_key via strategic_directives_v2
  const sdIds = [...new Set(alignments.map(a => a.sd_id))];
  const { data: sds, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .in('id', sdIds);

  if (sdErr) {
    console.error('SD lookup error:', sdErr.message);
    process.exit(1);
  }

  const sdIdToKey = {};
  for (const sd of (sds || [])) {
    sdIdToKey[sd.id] = sd.sd_key;
  }

  // If filtering by sd-id, resolve and filter
  if (args['sd-id']) {
    const targetKey = args['sd-id'];
    const targetIds = Object.entries(sdIdToKey)
      .filter(([, key]) => key === targetKey)
      .map(([id]) => id);
    if (targetIds.length === 0) {
      console.log(`  SD not found in alignments: ${targetKey}`);
      return;
    }
    // Filter alignments to matching sd_ids
    const targetSet = new Set(targetIds);
    alignments.splice(0, alignments.length, ...alignments.filter(a => targetSet.has(a.sd_id)));
  }

  // 2. Get unique KR IDs and fetch their status + objective period for deadline
  const krIds = [...new Set(alignments.map(a => a.key_result_id))];
  const { data: keyResults, error: krErr } = await supabase
    .from('key_results')
    .select('id, code, status, current_value, target_value, objective_id')
    .in('id', krIds);

  if (krErr) {
    console.error('Key results query error:', krErr.message);
    process.exit(1);
  }

  // Fetch objectives for period-based deadline calculation
  const objIds = [...new Set((keyResults || []).map(kr => kr.objective_id).filter(Boolean))];
  let objMap = {};
  if (objIds.length > 0) {
    const { data: objectives } = await supabase
      .from('objectives')
      .select('id, cadence, period')
      .in('id', objIds);
    for (const obj of (objectives || [])) {
      objMap[obj.id] = obj;
    }
  }

  // Derive deadline from objective period (e.g., "Q1 2026" → end of quarter)
  function deriveDeadline(objective) {
    if (!objective?.period) return null;
    const match = objective.period.match(/Q(\d)\s*(\d{4})/);
    if (match) {
      const quarter = parseInt(match[1]);
      const year = parseInt(match[2]);
      const endMonth = quarter * 3; // Q1=3, Q2=6, Q3=9, Q4=12
      return new Date(year, endMonth, 0); // Last day of end month
    }
    return null;
  }

  const krMap = {};
  for (const kr of (keyResults || [])) {
    const obj = objMap[kr.objective_id];
    kr.deadline = deriveDeadline(obj);
    krMap[kr.id] = kr;
  }

  // 3. Group alignments by SD key and calculate OKR boost
  const sdAlignments = {};
  for (const a of alignments) {
    const sdKey = sdIdToKey[a.sd_id];
    if (!sdKey) continue;
    if (!sdAlignments[sdKey]) sdAlignments[sdKey] = [];
    sdAlignments[sdKey].push(a);
  }

  const results = [];
  const now = new Date();

  for (const [sdKey, sdAligns] of Object.entries(sdAlignments)) {
    let okrBoost = 0;
    const details = [];

    for (const align of sdAligns) {
      const kr = krMap[align.key_result_id];
      if (!kr) continue;

      const urgencyMult = KR_URGENCY[kr.status] || 1.0;
      const contribMult = CONTRIBUTION_MULT[align.contribution_type] || 0.5;
      const weight = align.contribution_weight || 1.0;
      const proximityFactor = getDeadlineProximityFactor(kr.deadline, now);

      // OKR boost with deadline proximity
      const points = 10 * urgencyMult * contribMult * weight * (1 + proximityFactor);
      okrBoost += points;

      details.push({
        kr: kr.code || kr.id,
        status: kr.status,
        deadline: kr.deadline,
        proximity: proximityFactor,
        contribution: align.contribution_type,
        points: Math.round(points * 10) / 10,
      });
    }

    // Cap OKR boost at 50 (max OKR impact)
    okrBoost = Math.min(Math.round(okrBoost), 50);

    results.push({ sdKey, okrBoost, alignmentCount: sdAligns.length, details });
  }

  // 4. Persist updated priority scores
  let updated = 0;
  let errors = 0;

  for (const r of results) {
    if (!dryRun) {
      const { error: updateErr } = await supabase
        .from('strategic_directives_v2')
        .update({
          priority_score: r.okrBoost,
          metadata: supabase.rpc ? undefined : undefined, // metadata update handled separately if needed
        })
        .eq('sd_key', r.sdKey);

      if (updateErr) {
        errors++;
        if (args.verbose) console.error(`  Error updating ${r.sdKey}:`, updateErr.message);
      } else {
        updated++;
      }
    }
  }

  // 5. Output results
  if (args.json) {
    console.log(JSON.stringify({ dryRun, results, updated, errors }, null, 2));
    return;
  }

  console.log(`\n  OKR Priority Sync ${dryRun ? '[DRY RUN]' : ''}\n`);
  console.log(`  Alignments: ${alignments.length}`);
  console.log(`  SDs affected: ${results.length}`);
  console.log(`  Key Results: ${Object.keys(krMap).length}\n`);

  // Sort by OKR boost descending
  results.sort((a, b) => b.okrBoost - a.okrBoost);

  for (const r of results) {
    console.log(`  ${r.sdKey.padEnd(45)} OKR boost: ${String(r.okrBoost).padStart(3)} (${r.alignmentCount} KRs)`);

    if (args.verbose) {
      for (const d of r.details) {
        const proximityStr = d.proximity > 0 ? ` proximity=${d.proximity}` : '';
        console.log(`    ${d.kr}: ${d.status} × ${d.contribution}${proximityStr} = ${d.points} pts`);
      }
    }
  }

  if (!dryRun) {
    console.log(`\n  Updated: ${updated}, Errors: ${errors}`);
  } else {
    console.log('\n  [DRY RUN] No changes persisted. Run without --dry-run to apply.');
  }
  console.log();
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
