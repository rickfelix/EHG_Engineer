#!/usr/bin/env node
/**
 * SD-LEO-INFRA-GUARD-FIRING-RECORDS-001 / FR-4 — is this guard's zero READABLE?
 *
 * The SD asks to characterize safety-guard recorders so a zero count can be interpreted. The
 * trap TS-6 guards against is a report that lists guards and their event types: that leaves the
 * reader exactly where the SD started, because the question was never "what does it record" but
 * "can I believe the zero". So every row here ends in a verdict about the ZERO, not a description.
 *
 * THE STATES THAT MUST NOT COLLAPSE:
 *   FIRES                   — acted N times. Working, and visibly so.
 *   NEVER_FIRED             — ran N times, acted 0 times. Readable, and probably healthy.
 *   NO_EVALUATIONS_RECORDED — ran 0 recorded times. Either the guard never ran, OR its denominator
 *                             is not deployed yet. This instrument deliberately does NOT guess
 *                             between those two: claiming "never ran" when the truth is "not
 *                             deployed" would be this report committing the very ambiguity the SD
 *                             exists to remove.
 *   UNREADABLE              — no denominator exists at all, so nothing above can be told apart.
 *
 * A GUARD WITH NO DENOMINATOR IS NOT REPORTED AS HEALTHY. It is reported as unreadable, which is
 * a finding rather than a pass — the whole point of the SD.
 *
 * WHY THE COUNTS DIE ON ERROR: a failed count that defaults to 0 renders as "never fired", which
 * is the exact misreading this SD exists to prevent. An unknown must never print as a zero.
 *
 * Usage: node scripts/guard-firing-characterization.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/**
 * Guards in scope. `action` is the event a guard writes WHEN IT FIRES; `denominator` is the event
 * proving it RAN. A null denominator is the defect, not a missing config field.
 */
export const GUARD_REGISTRY = [
  {
    guard: 'claimant_liveness',
    what: 'refuses a claim write when the claiming session is not live',
    action: { table: 'system_events', column: 'event_type', value: 'claim_write_refused_claimant_not_live' },
    denominator: { table: 'system_events', column: 'event_type', value: 'claim_fence_evaluated' },
    denominator_shipped_by: 'FR-2 (hourly aggregate — evaluations are a hot path)',
  },
  {
    guard: 'singleton_relaunch',
    what: 'schedules a fresh-checkout relaunch of a stale Adam / Solomon / coordinator',
    action: { table: 'session_coordination', column: 'payload->>kind', value: 'singleton_relaunch_scheduled', json: true },
    denominator: { table: 'system_events', column: 'event_type', value: 'singleton_relaunch_evaluated' },
    denominator_shipped_by: 'FR-3 (one row per sweep — ~4 sweeps/hour, not a hot path)',
  },
];

export function verdictFor({ actions, evaluations }) {
  if (evaluations === null) {
    return { verdict: 'UNREADABLE', because: 'no denominator: never-fired and never-ran are indistinguishable' };
  }
  if (evaluations === 0) {
    // DO NOT COLLAPSE THESE TWO. A zero here means EITHER the guard never ran, OR its denominator
    // is not deployed yet and has therefore never emitted. Reporting the first alone would be an
    // instrument committing the very ambiguity this SD exists to remove — so the verdict names
    // what is observed (no evaluations recorded) and the note names both causes.
    return {
      verdict: 'NO_EVALUATIONS_RECORDED',
      because: 'either the guard never ran, or its denominator is not deployed yet — this instrument '
        + 'cannot tell those apart from the database alone; confirm the denominator is live before '
        + 'reading this as an alarm',
    };
  }
  if (actions === 0) {
    return { verdict: 'NEVER_FIRED', because: `ran ${evaluations} time(s) and never needed to act — the zero is readable` };
  }
  return { verdict: 'FIRES', because: `acted ${actions} time(s) across ${evaluations} evaluation(s)` };
}

async function countOf(sb, spec) {
  if (!spec) return null;
  let q = sb.from(spec.table).select('*', { count: 'exact', head: true });
  q = spec.json ? q.filter(spec.column, 'eq', spec.value) : q.eq(spec.column, spec.value);
  const { count, error } = await q;
  // Never coerce a failed read to 0 — that would print as "never fired".
  if (error) throw new Error(`count failed for ${spec.table}.${spec.column}=${spec.value}: ${error.message}`);
  return count;
}

export async function characterize(sb, registry = GUARD_REGISTRY) {
  const out = [];
  for (const g of registry) {
    const actions = await countOf(sb, g.action);
    const evaluations = await countOf(sb, g.denominator);
    out.push({ guard: g.guard, what: g.what, actions, evaluations, ...verdictFor({ actions, evaluations }), denominator_shipped_by: g.denominator_shipped_by });
  }
  return out;
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const rows = await characterize(sb);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log('\nGUARD FIRING CHARACTERIZATION — can each guard\'s zero be believed?\n');
  for (const r of rows) {
    console.log(`  ${r.guard}  [${r.verdict}]`);
    console.log(`    ${r.what}`);
    console.log(`    fired ${r.actions} time(s); evaluated ${r.evaluations === null ? 'UNRECORDED' : r.evaluations} time(s)`);
    console.log(`    ${r.because}`);
    console.log(`    denominator: ${r.denominator_shipped_by}\n`);
  }
  const unreadable = rows.filter((r) => r.verdict === 'UNREADABLE' || r.verdict === 'NO_EVALUATIONS_RECORDED');
  console.log(unreadable.length
    ? `  ${unreadable.length} guard(s) still cannot be believed: ${unreadable.map((r) => r.guard).join(', ')}`
    : '  every guard in scope now has an interpretable zero.');
  console.log('\n  SCOPE: the two guards this SD examined. The missing-denominator convention is');
  console.log('  TABLE-WIDE — all 8 event types in the newest 1000 system_events rows are refusals');
  console.log('  or terminal outcomes; not one records that something ran and passed. The rest of');
  console.log('  that surface is NOT covered here and is named in the completion flags.\n');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('guard-firing-characterization.mjs')) {
  main().catch((e) => { console.error('FATAL:', e.message); process.exitCode = 1; });
}
