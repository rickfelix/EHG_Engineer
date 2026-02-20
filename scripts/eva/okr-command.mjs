#!/usr/bin/env node
/**
 * EVA OKR Command - Monthly OKR Management CLI
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-D (US-004)
 *
 * Manages the monthly OKR lifecycle: generation, review, history, and vision linkage.
 *
 * Subcommands:
 *   generate  [--dry-run]                   Trigger monthly OKR generation
 *   review                                  Show current period scorecard
 *   history   [--limit <n>]                 Show month-over-month trends
 *   link      --kr <kr-code> --dim <code>   Link KR to vision dimension
 *   archive   [--dry-run]                   Archive stale/expired OKRs
 *
 * Usage:
 *   node scripts/eva/okr-command.mjs generate
 *   node scripts/eva/okr-command.mjs generate --dry-run
 *   node scripts/eva/okr-command.mjs review
 *   node scripts/eva/okr-command.mjs history --limit 6
 *   node scripts/eva/okr-command.mjs link --kr KR-2026-03-01 --dim A05
 *   node scripts/eva/okr-command.mjs archive
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return { subcommand, opts };
}

// ============================================================================
// Supabase client
// ============================================================================

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  return createClient(url, key);
}

// ============================================================================
// Subcommand: generate
// ============================================================================

async function cmdGenerate(supabase, opts) {
  const { runOkrMonthlyGeneration } = await import('../../lib/eva/jobs/okr-monthly-generator.js');
  const result = await runOkrMonthlyGeneration({
    supabase,
    dryRun: !!opts.dryRun,
  });

  if (result.skipped) {
    console.log('\n  OKR generation already completed for this period.\n');
    return;
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  OKR Monthly Generation Results');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Generation ID: ${result.generationId || '(dry run)'}`);
  console.log(`  Objectives:    ${result.objectivesCreated}`);
  console.log(`  Key Results:   ${result.krsCreated}`);
  console.log(`  Ratio:         ${result.ratio.topDown} top-down / ${result.ratio.bottomUp} bottom-up`);
  if (opts.dryRun) {
    console.log('\n  (DRY RUN — no records inserted)');
  }
  console.log('══════════════════════════════════════════════════\n');
}

// ============================================================================
// Subcommand: review
// ============================================================================

async function cmdReview(supabase) {
  // Fetch active objectives with their KRs
  const { data: objectives } = await supabase
    .from('objectives')
    .select('id, code, title, period')
    .eq('is_active', true)
    .order('sequence');

  if (!objectives || objectives.length === 0) {
    console.log('\n  No active objectives found.\n');
    return;
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  OKR Scorecard — Active Period');
  console.log('══════════════════════════════════════════════════');

  for (const obj of objectives) {
    const { data: krs } = await supabase
      .from('key_results')
      .select('code, title, baseline_value, current_value, target_value, direction, status, vision_dimension_code, source_type')
      .eq('objective_id', obj.id)
      .eq('is_active', true)
      .order('sequence');

    console.log(`\n  ${obj.code}: ${obj.title} (${obj.period || 'ongoing'})`);
    console.log('  ' + '─'.repeat(50));

    if (!krs || krs.length === 0) {
      console.log('    (no key results)');
      continue;
    }

    for (const kr of krs) {
      const progress = computeProgress(kr);
      const bar = progressBar(progress);
      const dim = kr.vision_dimension_code ? ` [${kr.vision_dimension_code}]` : '';
      const src = kr.source_type && kr.source_type !== 'manual' ? ` (${kr.source_type})` : '';
      const statusIcon = kr.status === 'at_risk' ? '⚠️' : kr.status === 'achieved' ? '✅' : '●';
      console.log(`    ${statusIcon} ${kr.code}: ${kr.title}`);
      console.log(`      ${bar} ${progress}%${dim}${src}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════\n');
}

// ============================================================================
// Subcommand: history
// ============================================================================

async function cmdHistory(supabase, opts) {
  const limit = parseInt(opts.limit) || 6;

  const { data: logs } = await supabase
    .from('okr_generation_log')
    .select('*')
    .eq('status', 'completed')
    .order('generation_date', { ascending: false })
    .limit(limit);

  if (!logs || logs.length === 0) {
    console.log('\n  No generation history found.\n');
    return;
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  OKR Generation History');
  console.log('══════════════════════════════════════════════════');
  console.log('  Period    │ KRs │ Top-Down │ Bottom-Up │ Date');
  console.log('  ──────────┼─────┼──────────┼───────────┼──────────');

  for (const log of logs) {
    const td = String(log.top_down_count).padStart(3);
    const bu = String(log.bottom_up_count).padStart(3);
    const total = String(log.total_krs_generated).padStart(3);
    console.log(`  ${log.period.padEnd(10)}│ ${total} │ ${td}      │ ${bu}       │ ${log.generation_date}`);
  }

  console.log('══════════════════════════════════════════════════\n');
}

// ============================================================================
// Subcommand: link
// ============================================================================

async function cmdLink(supabase, opts) {
  if (!opts.kr || !opts.dim) {
    console.error('Usage: okr-command.mjs link --kr <kr-code> --dim <dimension-code>');
    process.exit(1);
  }

  const { data: kr, error } = await supabase
    .from('key_results')
    .update({ vision_dimension_code: opts.dim, updated_at: new Date().toISOString() })
    .eq('code', opts.kr)
    .select('code, title, vision_dimension_code')
    .single();

  if (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n  Linked ${kr.code} → ${kr.vision_dimension_code}`);
  console.log(`  KR: ${kr.title}\n`);
}

// ============================================================================
// Subcommand: archive
// ============================================================================

async function cmdArchive(supabase, opts) {
  const { archiveStaleOkrs } = await import('../../lib/eva/jobs/okr-archive-stale.js');
  const result = await archiveStaleOkrs({
    supabase,
    dryRun: !!opts.dryRun,
  });

  console.log('\n══════════════════════════════════════════════════');
  console.log('  OKR Archive Results');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Objectives archived: ${result.archivedObjectives}`);
  console.log(`  Key Results archived: ${result.archivedKRs}`);
  if (opts.dryRun) {
    console.log('\n  (DRY RUN — no records modified)');
  }
  console.log('══════════════════════════════════════════════════\n');
}

// ============================================================================
// Helpers
// ============================================================================

function computeProgress(kr) {
  const baseline = kr.baseline_value ?? 0;
  const current = kr.current_value ?? 0;
  const target = kr.target_value ?? 100;
  const range = target - baseline;
  if (range === 0) return current >= target ? 100 : 0;
  const raw = ((current - baseline) / range) * 100;
  const progress = kr.direction === 'decrease' ? 100 - raw : raw;
  return Math.round(Math.max(0, Math.min(100, progress)));
}

function progressBar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { subcommand, opts } = parseArgs(process.argv);
  const supabase = getSupabase();

  switch (subcommand) {
    case 'generate':
    case 'gen':
      await cmdGenerate(supabase, opts);
      break;
    case 'review':
    case 'rev':
      await cmdReview(supabase);
      break;
    case 'history':
    case 'hist':
      await cmdHistory(supabase, opts);
      break;
    case 'link':
      await cmdLink(supabase, opts);
      break;
    case 'archive':
    case 'arch':
      await cmdArchive(supabase, opts);
      break;
    default:
      console.log(`
  EVA OKR Command — Monthly OKR Management

  Usage: node scripts/eva/okr-command.mjs <subcommand> [options]

  Subcommands:
    generate  [--dry-run]                  Trigger monthly OKR generation
    review                                 Show current period scorecard
    history   [--limit <n>]                Show month-over-month trends
    link      --kr <code> --dim <code>     Link KR to vision dimension
    archive   [--dry-run]                  Archive stale/expired OKRs
      `);
      process.exit(subcommand ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
