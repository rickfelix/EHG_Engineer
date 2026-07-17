#!/usr/bin/env node
/**
 * outcome-effectiveness-summary.mjs — SD-LEO-INFRA-FIX-RECURRENCE-REWIRING-001 (FR-3)
 *
 * CLI wrapper for getOutcomeSummary(): prints an SD's fix-effectiveness signals
 * (completion signal, resolved feedback count, recurrence count, latest pre/post
 * effectiveness delta) computed against the real `feedback` table (FR-1 retable).
 * Sequenced strictly after FR-1 — run before that landed, this would have
 * surfaced fabricated pre=0/post=0/pct=null rows as if they were real data.
 *
 * Usage: node scripts/outcome-effectiveness-summary.mjs <SD-KEY> [--json]
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { getOutcomeSummary } from '../lib/learning/outcome-tracker.js';

function renderHuman(sdKey, summary) {
  const lines = [`=== OUTCOME EFFECTIVENESS SUMMARY - ${sdKey} ===`, ''];
  lines.push(`SD status:              ${summary.sd_status}`);
  lines.push(`Completion signal:       ${summary.completion_signal ? 'yes' : 'MISSING'}`);
  lines.push(`Resolved feedback:       ${summary.resolved_feedback_count}`);
  lines.push(`Recurrence signals:      ${summary.recurrence_signal_count}`);
  if (summary.latest_metrics) {
    const m = summary.latest_metrics;
    lines.push('');
    lines.push(`Latest effectiveness window: ${m.window_start} -> ${m.window_end}`);
    lines.push(`  pre_feedback_count:  ${m.pre_feedback_count}`);
    lines.push(`  post_feedback_count: ${m.post_feedback_count}`);
    lines.push(`  delta_count:         ${m.delta_count}`);
    lines.push(`  pct_change:          ${m.pct_change === null || m.pct_change === undefined ? 'n/a' : `${Number(m.pct_change).toFixed(1)}%`}`);
  } else {
    lines.push('', 'No effectiveness metrics computed yet for this SD.');
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const sdKey = args.find((a) => !a.startsWith('--'));
  if (!sdKey) {
    console.error('Usage: node scripts/outcome-effectiveness-summary.mjs <SD-KEY> [--json]');
    process.exit(1);
  }

  const supabase = await createSupabaseServiceClient('engineer');
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sdKey)
    .single();

  if (error || !sd) {
    console.error(`OUTCOME_SUMMARY_ERROR: SD not found for key ${sdKey}`);
    process.exit(1);
  }

  const summary = await getOutcomeSummary({ supabase, sdId: sd.id });
  console.log(asJson ? JSON.stringify(summary) : renderHuman(sdKey, summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('OUTCOME_SUMMARY_ERROR', err && err.message ? err.message : err);
    process.exit(1);
  });
}
