#!/usr/bin/env node
/**
 * Critique Catch-Rate Monitor
 * SD: SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-4)
 *
 * Reports what the pre-PLAN adversarial critique has been doing — SEPARATING
 * "checked and found nothing" (pass) from "could not check" (could_not_check),
 * because a monitor that folds those together is the guard-observability defect
 * the critic itself had (five fail-open paths returning pass, skip paths
 * returning before persisting).
 *
 * HONESTY RULES:
 * - could_not_check = 0 is AMBIGUOUS until the 20260810 widening migration is
 *   applied: the constraint refuses the value, so absence of rows is not absence
 *   of blind runs. The monitor reads the live constraint over the pooler and
 *   says which of the three states it is in (accepts / refuses / could-not-look).
 * - Rates are labeled with their denominators. A ratio whose numerator and
 *   denominator span different extents lies.
 *
 * Usage: node scripts/critique-catch-rate-monitor.js [--days 30] [--json]
 */

import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const SEVERITIES = ['block', 'warn', 'note', 'pass', 'could_not_check'];

function parseArgs() {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  return {
    days: daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) || 30 : 30,
    json: args.includes('--json'),
  };
}

/**
 * Three outcomes, never two: accepts / refuses / could-not-look.
 * Read the live CHECK over the pooler — a write probe would leave rows behind,
 * and a doc or migration file is a lead, never proof of a live object.
 */
async function readCouldNotCheckAcceptance() {
  const url = process.env.SUPABASE_POOLER_URL;
  if (!url) {
    return { state: 'could_not_look', detail: 'SUPABASE_POOLER_URL not set — cannot read the catalog' };
  }
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const r = await client.query(
        "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'plan_critiques_overall_severity_check'"
      );
      if (r.rows.length === 0) {
        return { state: 'accepts', detail: 'no severity CHECK constraint exists (unconstrained column)' };
      }
      const def = r.rows[0].def;
      return def.includes('could_not_check')
        ? { state: 'accepts', detail: def }
        : { state: 'refuses', detail: `constraint not yet widened — apply database/migrations/20260810_plan_critiques_could_not_check.sql. Live: ${def}` };
    } finally {
      await client.end();
    }
  } catch (err) {
    return { state: 'could_not_look', detail: `catalog read failed: ${err.message}` };
  }
}

async function main() {
  const { days, json } = parseArgs();
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const counts = {};
  for (const sev of SEVERITIES) {
    const { count, error } = await supabase
      .from('plan_critiques')
      .select('*', { count: 'exact', head: true })
      .eq('overall_severity', sev)
      .gte('created_at', since);
    counts[sev] = error ? null : count;
  }

  const { count: overridesUsed } = await supabase
    .from('plan_critiques')
    .select('*', { count: 'exact', head: true })
    .eq('overall_severity', 'block')
    .not('override_reason', 'is', null)
    .not('override_by', 'is', null)
    .gte('created_at', since);

  const acceptance = await readCouldNotCheckAcceptance();

  const total = SEVERITIES.reduce((s, k) => s + (counts[k] || 0), 0);
  const checkedClean = counts.pass || 0;
  const couldNotCheck = counts.could_not_check || 0;
  const blocks = counts.block || 0;

  const report = {
    window_days: days,
    since,
    total_critiques: total,
    by_severity: counts,
    checked_clean: checkedClean,
    could_not_check: couldNotCheck,
    could_not_check_caveat:
      acceptance.state === 'accepts'
        ? null
        : acceptance.state === 'refuses'
          ? 'could_not_check=0 is NOT evidence of no blind runs: the live constraint REFUSES the value, so blind runs could not persist. ' + acceptance.detail
          : 'could_not_check count is UNVERIFIABLE this run: ' + acceptance.detail,
    blocks,
    overrides_used: overridesUsed || 0,
    blocks_sustained: blocks - (overridesUsed || 0),
    // Denominator stated: of all persisted critiques in the window.
    could_not_check_rate_of_persisted: total > 0 ? +(couldNotCheck / total).toFixed(3) : null,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n📊 Critique Catch-Rate Monitor');
  console.log('══════════════════════════════════════════════════');
  console.log(`Window: last ${days} days (since ${since})`);
  console.log(`Total persisted critiques: ${total}`);
  console.log('\nBy severity:');
  for (const sev of SEVERITIES) {
    console.log(`  ${sev.padEnd(16)} ${counts[sev] === null ? 'UNREADABLE' : counts[sev]}`);
  }
  console.log(`\nChecked-clean (pass):     ${checkedClean}`);
  console.log(`Could-not-check:          ${couldNotCheck}${report.could_not_check_caveat ? '\n  ⚠️  ' + report.could_not_check_caveat : ''}`);
  console.log(`Blocks:                   ${blocks} (${report.blocks_sustained} sustained, ${report.overrides_used} downgraded by audited override)`);
  if (report.could_not_check_rate_of_persisted !== null) {
    console.log(`Could-not-check rate:     ${(report.could_not_check_rate_of_persisted * 100).toFixed(1)}% of persisted critiques in window`);
  }
  console.log('\nLEARNING LOOP: a gap that escaped both the LLM pass and the invariant');
  console.log('library and was later caught (retro/incident/chairman review) is admitted');
  console.log('into lib/eva/invariant-library.js WITH its citation — that is the only');
  console.log('admission path (anti-Goodhart).');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
