#!/usr/bin/env node
/**
 * Orphan-writers count CLI (SD-LEO-INFRA-ORPHAN-WRITERS-REGISTRY-001, FR-3 + FR-5).
 *
 * Computes the known-orphan count LIVE from lib/governance/orphan-writers-registry.js's
 * ORPHAN_ENTRIES predicates, on every run — never a hardcoded number. The SD's own
 * originally-cited "93 disagreeing periodic-liveness rows" was measured by the VALIDATION
 * sub-agent to NOT reproduce against any of 7 plausible predicates; this script exists so
 * the number is always falsifiable against the exact predicate it names, not prose.
 *
 * TESTING sub-agent finding F-5: verdicts are computed BEFORE self-stamping
 * periodic_process_registry (this script must not mutate the rows it measures), and the
 * triage pass's own self-registration row is excluded from the reported count.
 *
 * Usage: node scripts/orphan-writers-count.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ORPHAN_ENTRIES } from '../lib/governance/orphan-writers-registry.js';
import { DRAIN_DESCRIPTORS } from '../lib/governance/gauge-registry.js';
import { classifyStructural } from '../lib/governance/drain-inventory.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import createDatabaseClient from '../lib/supabase-connection.js';

const SELF_ENTRY_ID = 'orphan-writers-triage-pass';
const SELF_PROCESS_KEY = 'standard_loop:orphan-writers-triage';

/**
 * Evaluate the no-stamper-wired predicate for a periodic_process_registry-backed entry.
 * ORPHANED means the process is expected active, self_stamped, and has never fired.
 */
async function evaluateNoStamperWired(supabase, entry) {
  const processKey = entry.writer?.process_key;
  if (!processKey) return { verdict: 'UNAVAILABLE', reason: 'no process_key declared' };
  const { data, error } = await supabase
    .from('periodic_process_registry')
    .select('process_key, last_fired_at, liveness_source, currently_expected_active')
    .eq('process_key', processKey)
    .maybeSingle();
  if (error) return { verdict: 'UNAVAILABLE', reason: `query error: ${error.message}` };
  if (!data) return { verdict: 'UNAVAILABLE', reason: 'not registered' };
  const orphaned = data.liveness_source === 'self_stamped'
    && data.currently_expected_active === true
    && data.last_fired_at == null;
  return { verdict: orphaned ? 'ORPHANED' : 'PASS', row: data };
}

/**
 * shipped-but-not-applied is a one-time boolean latch. Per-specimen check functions live in
 * SHIPPED_BUT_NOT_APPLIED_CHECKS keyed by entry id — each queries the concrete DDL effect via
 * a direct pg client (createDatabaseClient), the same pattern scripts/verify-migration-apply-
 * state.mjs already uses for constraint introspection (TESTING F-3: a hardcoded MANUAL_CHECK_
 * REQUIRED with no query is unimplementable per FR-4a AC-2, "once true, no further advisories").
 * An entry with no registered check function falls back to MANUAL_CHECK_REQUIRED honestly.
 */
// Object.create(null): SECURITY sub-agent finding, EXEC-TO-PLAN — a plain-object-literal map
// keyed by entry.id would resolve 'constructor'/'toString' via the prototype chain.
const SHIPPED_BUT_NOT_APPLIED_CHECKS = Object.assign(Object.create(null), {
  async 'competitive-observed-tag-migration'(pgClient) {
    const { rows } = await pgClient.query(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
         JOIN pg_namespace ns ON ns.oid = c.connamespace
        WHERE ns.nspname = 'public' AND c.conname = 'competitive_baselines_epistemic_tag_check'`
    );
    if (rows.length === 0) return { applied: false, detail: 'constraint not found' };
    return { applied: /OBSERVED/.test(rows[0].def), detail: rows[0].def };
  },
  // SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B: ALL-columns semantics, not ANY -- the two source
  // migrations can land independently, so a partial-apply must still report ORPHANED (PLAN-phase
  // TESTING finding, evidence dfc9ef51).
  async 'context-usage-log-leo-phase-tagging-migration'(pgClient) {
    const expected = ['loop_name', 'sd_key', 'leo_phase'];
    const { rows } = await pgClient.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`,
      ['context_usage_log', expected]
    );
    const found = rows.map((r) => r.column_name);
    return { applied: found.length === expected.length, detail: `found=[${found.join(',')}] expected=[${expected.join(',')}]` };
  },
  async 'operator-cash-burn-manual-revenue-provenance-migration'(pgClient) {
    const expected = ['manual_revenue_usd', 'manual_revenue_last_synced_at'];
    const { rows } = await pgClient.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`,
      ['operator_cash_burn_monthly', expected]
    );
    const found = rows.map((r) => r.column_name);
    return { applied: found.length === expected.length, detail: `found=[${found.join(',')}] expected=[${expected.join(',')}]` };
  },
});

async function evaluateShippedButNotApplied(entry, pgClientFactory) {
  const checkFn = SHIPPED_BUT_NOT_APPLIED_CHECKS[entry.id];
  if (!checkFn) {
    return { verdict: 'MANUAL_CHECK_REQUIRED', reason: entry.predicate?.description || 'no predicate description' };
  }
  let pgClient;
  try {
    pgClient = await pgClientFactory();
    const { applied, detail } = await checkFn(pgClient);
    return { verdict: applied ? 'PASS' : 'ORPHANED', reason: detail };
  } catch (err) {
    return { verdict: 'UNAVAILABLE', reason: `applied-check query failed: ${err.message}` };
  } finally {
    if (pgClient) await pgClient.end().catch(() => {});
  }
}

function evaluateRefsDrainDescriptor(entry) {
  const descriptor = DRAIN_DESCRIPTORS[entry.refs_drain_descriptor];
  const structural = classifyStructural(descriptor);
  return { verdict: structural || 'NEEDS_LIVE_READ', reason: `delegates to DRAIN_DESCRIPTORS['${entry.refs_drain_descriptor}']` };
}

async function evaluateEntry(supabase, entry) {
  if (entry.refs_drain_descriptor) return evaluateRefsDrainDescriptor(entry);
  if (entry.entry_type === 'no-stamper-wired' && entry.writer?.process_key) {
    return evaluateNoStamperWired(supabase, entry);
  }
  if (entry.entry_type === 'shipped-but-not-applied') {
    return evaluateShippedButNotApplied(entry, () => createDatabaseClient('engineer', { verify: false }));
  }
  return { verdict: 'MANUAL_CHECK_REQUIRED', reason: 'no automated evaluator for this entry shape' };
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const asJson = process.argv.includes('--json');

  // Compute verdicts FIRST (F-5: never mutate before measuring).
  const results = [];
  for (const entry of ORPHAN_ENTRIES) {
    if (entry.id === SELF_ENTRY_ID) continue; // FR-5: self-registration excluded from the count
    const evaluation = await evaluateEntry(supabase, entry);
    results.push({ id: entry.id, entry_type: entry.entry_type, ...evaluation });
  }

  const orphanedCount = results.filter((r) => r.verdict === 'ORPHANED').length;
  const manualCheckCount = results.filter((r) => r.verdict === 'MANUAL_CHECK_REQUIRED').length;
  const unavailableCount = results.filter((r) => r.verdict === 'UNAVAILABLE').length;

  // FR-5: self-stamp AFTER measuring.
  const stampResult = await stampLastFired(supabase, SELF_PROCESS_KEY).catch((err) => ({ stamped: false, reason: err.message }));

  const summary = {
    computed_at: new Date().toISOString(),
    total_entries_evaluated: results.length,
    orphaned_count: orphanedCount,
    manual_check_required_count: manualCheckCount,
    unavailable_count: unavailableCount,
    self_stamp: stampResult,
    results,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\nOrphan-writers count: ${orphanedCount} ORPHANED / ${results.length} evaluated`);
    console.log(`  (${manualCheckCount} require manual check, ${unavailableCount} unavailable)`);
    for (const r of results) {
      console.log(`  [${r.verdict}] ${r.id} (${r.entry_type})${r.reason ? ` — ${r.reason}` : ''}`);
    }
    console.log(`\nSelf-stamp (${SELF_PROCESS_KEY}): ${stampResult.stamped ? 'stamped' : `no-op (${stampResult.reason})`}`);
  }

  return summary;
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { evaluateEntry, evaluateNoStamperWired, evaluateShippedButNotApplied, evaluateRefsDrainDescriptor };
