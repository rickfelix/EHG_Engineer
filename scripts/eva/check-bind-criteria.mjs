#!/usr/bin/env node
/**
 * SD-LEO-INFRA-BIND-OBSERVE-ONLY-001, FR-7.
 *
 * Read-only CLI report: for each of the 5 observe-only exit-gate strings, and the symmetric
 * VENTURE_STACK check, prints whether the bind criterion (>=25 rows, >=48h span, zero false
 * MarketLens rejects) is currently met. Never flips anything -- a LEAD reviewer reads this
 * report before hand-authoring any future bind change (a separate, later action).
 *
 * Usage:
 *   node scripts/eva/check-bind-criteria.mjs           # human-readable table
 *   node scripts/eva/check-bind-criteria.mjs --json    # machine-readable JSON
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  CANDIDATE_GATE_STRINGS,
  fetchExitGateObserveRows,
  fetchVentureStackObserveRows,
  groupRowsByGateString,
  evaluateExitGateCriterion,
  evaluateVentureStackCriterion,
  crossCheckCandidateGateStrings,
} from '../../lib/eva/lifecycle/bind-criterion-checker.js';

const DISCLAIMER =
  'venture-2-cohort portion of the bind criterion is NOT implemented -- no resolvable data ' +
  'definition exists in the current schema (no cohort column/table anywhere). MarketLens is ' +
  'checked by known venture_id only.';

function formatRate(rate) {
  return rate === null ? 'n/a' : `${rate.toFixed(1)}%`;
}

async function buildReport(supabase) {
  const exitRows = await fetchExitGateObserveRows(supabase);
  const { groups, malformed } = groupRowsByGateString(exitRows);
  const exitGateResults = CANDIDATE_GATE_STRINGS.map((c) => {
    const key = `${c.stage_number}::${c.gate_string}`;
    const rows = groups.get(key) || [];
    return { stage_number: c.stage_number, gate_string: c.gate_string, ...evaluateExitGateCriterion(rows) };
  });

  const stackRows = await fetchVentureStackObserveRows(supabase);
  const ventureStackResult = evaluateVentureStackCriterion(stackRows);

  const configCrossCheck = await crossCheckCandidateGateStrings(supabase);

  return {
    generated_at: new Date().toISOString(),
    exit_gate_results: exitGateResults,
    venture_stack_result: ventureStackResult,
    malformed_row_count: malformed.length,
    config_cross_check: configCrossCheck,
    disclaimer: DISCLAIMER,
  };
}

function printHumanReadable(report) {
  console.log('\nObserve-Only Exit Gate Bind-Criterion Report');
  console.log('='.repeat(60));
  console.log(`Generated: ${report.generated_at}\n`);

  console.log('Exit Gate Candidates:');
  for (const r of report.exit_gate_results) {
    const verdictSuffix = r.reason ? ` (${r.reason})` : '';
    console.log(`  stage=${r.stage_number} gate="${r.gate_string}"`);
    console.log(
      `    rows=${r.row_count} span=${r.span_hours.toFixed(1)}h marketlens=${r.marketlens_status} -> ${r.verdict}${verdictSuffix}`
    );
  }

  console.log('\nVENTURE_STACK Symmetric Check:');
  const s = report.venture_stack_result;
  const stackSuffix = s.reason ? ` (${s.reason})` : '';
  console.log(
    `  rows=${s.row_count} span=${s.span_hours.toFixed(1)}h fp_rate=${formatRate(s.false_positive_proxy_rate)} -> ${s.verdict}${stackSuffix}`
  );

  if (report.malformed_row_count > 0) {
    console.log(`\n  ${report.malformed_row_count} malformed EXIT_GATE_OBSERVE_ONLY row(s) excluded (missing stage_number/gate_string)`);
  }

  // Adversarial-review fix: crossCheckCandidateGateStrings returns ok=true even in its own
  // catch branch (fail-open by design, per its own doc comment) -- so `error` and `!ok` are NOT
  // mutually exclusive with `ok`, and gating the error print behind `!ok` made it unreachable.
  // Check error independently.
  if (report.config_cross_check.error) {
    console.log(`\n  ⚠️  Could not cross-check live venture_stages config: ${report.config_cross_check.error}`);
  } else if (!report.config_cross_check.ok) {
    if (report.config_cross_check.missing_from_checker.length > 0) {
      console.log(`\n  ⚠️  Live config declares observe-only strings this checker does NOT know about: ${report.config_cross_check.missing_from_checker.join(', ')}`);
    }
    if (report.config_cross_check.extra_in_checker.length > 0) {
      console.log(`  ⚠️  This checker tracks strings no longer in the live observe-only config: ${report.config_cross_check.extra_in_checker.join(', ')}`);
    }
  }

  console.log(`\n${report.disclaimer}\n`);
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const report = await buildReport(supabase);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReadable(report);
  }
}

main().catch((e) => {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
});
