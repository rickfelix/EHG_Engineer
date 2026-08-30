#!/usr/bin/env node
/**
 * Ranked rejection-cause measurement (SD-LEO-INFRA-CLOSE-PHASE-TRANSITION-001, FR-3 + FR-4).
 *
 * Queries sd_phase_handoffs.rejection_reason over a trailing 30-day window, parses known
 * gate/code tokens out of the free-text reason, and reports a ranked table of "sole blocker"
 * counts (rows where exactly one known code appears) alongside "touched" counts (rows where
 * the code appears at all, possibly alongside others). Excludes known info-severity codes
 * (SMOKE_TEST_BYPASSED, USER_STORIES_BYPASSED) from the ranking entirely -- they are not
 * rejection causes (VALIDATION sub-agent finding: the SD's own original illustrative list
 * wrongly included USER_STORIES_BYPASSED as if it were one).
 *
 * Usage: node scripts/one-off/measure-phase-transition-rejection-causes.mjs [--days N] [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// Canonical single representation per cause. GATE_SUBAGENT_EVIDENCE always co-occurs with
// SUBAGENT_EVIDENCE_MISSING (the gate name + its own emitted issue code in one message) and
// MECHANISM_CLAIM_UNVERIFIED always co-occurs with GATE_MECHANISM_CLAIM_VERIFIER (same
// pattern) -- live-verified 2026-08-30 across sample rows. Listing both would double-count
// ONE cause as two, inflating the ranking. Use only the canonical gate-name code for each.
const KNOWN_CODES = [
  'SUBAGENT_EVIDENCE_MISSING',
  'GATE_MECHANISM_CLAIM_VERIFIER',
  'RETROSPECTIVE_QUALITY_GATE',
  'SMOKE_TEST_SPECIFICATION',
  'PRE_PLAN_ADVERSARIAL_CRITIQUE',
  'PREREQUISITE_PREFLIGHT_FAILED',
];

// Known info-severity codes -- never rejection causes, excluded even if matched by accident.
const INFO_CODES = new Set(['SMOKE_TEST_BYPASSED', 'USER_STORIES_BYPASSED']);

function parseArgs(argv) {
  const days = argv.includes('--days') ? Number(argv[argv.indexOf('--days') + 1]) || 30 : 30;
  const asJson = argv.includes('--json');
  return { days, asJson };
}

function extractCodes(reason) {
  if (!reason) return [];
  return KNOWN_CODES.filter((code) => !INFO_CODES.has(code) && reason.includes(code));
}

async function main() {
  const { days, asJson } = parseArgs(process.argv.slice(2));
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, rejection_reason, created_at')
    .not('rejection_reason', 'is', null)
    .gte('created_at', since);
  if (error) throw error;

  const touched = new Map();
  const soleBlocker = new Map();
  for (const code of KNOWN_CODES) {
    if (INFO_CODES.has(code)) continue;
    touched.set(code, 0);
    soleBlocker.set(code, 0);
  }

  let nonAccepted = 0;
  for (const row of rows) {
    const codes = extractCodes(row.rejection_reason);
    if (codes.length === 0) continue;
    nonAccepted += 1;
    for (const code of codes) touched.set(code, (touched.get(code) || 0) + 1);
    if (codes.length === 1) soleBlocker.set(codes[0], (soleBlocker.get(codes[0]) || 0) + 1);
  }

  const ranked = [...touched.keys()]
    .map((code) => ({ code, touched: touched.get(code), soleBlocker: soleBlocker.get(code) }))
    .filter((r) => r.touched > 0)
    .sort((a, b) => b.soleBlocker - a.soleBlocker);

  const summary = {
    measured_at: new Date().toISOString(),
    window_days: days,
    total_non_accepted_rows: nonAccepted,
    ranked,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\nRejection-cause ranking (trailing ${days}d, measured ${summary.measured_at})`);
    console.log(`Total non-accepted rows: ${nonAccepted}\n`);
    for (const r of ranked) {
      const pct = nonAccepted > 0 ? ((r.soleBlocker / nonAccepted) * 100).toFixed(1) : '0.0';
      console.log(`  ${r.code}: sole=${r.soleBlocker} touched=${r.touched} (${pct}% sole-blocker share)`);
    }
  }

  return summary;
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { extractCodes, KNOWN_CODES, INFO_CODES };
