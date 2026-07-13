#!/usr/bin/env node
/**
 * Coordinator relay/decision/review drop-gauge tick (FR-3).
 *
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001.
 *
 * Read/report always runs (fail-open, per lib/coordinator/relay-drop-gauge.cjs).
 * When a drop is flagged, writes a durable feedback row (category='relay_drop')
 * so it survives past this tick's stdout and is queryable by
 * coordinator-hourly-review.cjs / fleet-dashboard.cjs / coordinator-email-summary.mjs.
 * Idempotent per (correlationId): a row already flagged for the same correlation is
 * not re-inserted.
 *
 * Usage: node scripts/coordinator-relay-drop-gauge.cjs [--dry-run]
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { planRelayDrops } = require('../lib/coordinator/relay-drop-gauge.cjs');

const DRY_RUN = process.argv.includes('--dry-run');

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key);
}

/**
 * Fail-soft: write a durable feedback row for each newly-flagged drop, skipping dupes.
 *
 * KNOWN RACE (adversarial-review finding, deep-tier PR review, accepted -- no migration in
 * this SD's scope): the select-then-insert dedup below is not atomic. This script is fired by
 * two independent schedulers (coordinator-quiet-tick.mjs's COMPOSED_CORES + coordinator-
 * startup-check.mjs's cron), so two overlapping invocations racing on the same newly-aged-out
 * correlationId can both pass the `existing.length===0` check before either insert lands,
 * producing duplicate feedback rows for the same drop. Impact is bounded to a cosmetic
 * duplicate "issue" row -- it never loses a flag (the failure mode this SD exists to close),
 * only occasionally doubles one. A proper fix (a unique index on metadata->>correlation_id +
 * an upsert) requires a migration, out of scope here.
 */
async function recordFlags(supabase, decisions) {
  const flagged = decisions.filter((d) => d.action === 'flag' && d.correlationId);
  let written = 0;
  for (const d of flagged) {
    try {
      const { data: existing } = await supabase
        .from('feedback')
        .select('id')
        .eq('category', 'relay_drop')
        .contains('metadata', { correlation_id: d.correlationId })
        .limit(1);
      if (existing && existing.length) continue; // already flagged, idempotent skip
      const { error } = await supabase.from('feedback').insert({
        category: 'relay_drop',
        type: 'issue',
        status: 'new',
        source_application: 'EHG_Engineer',
        source_type: 'auto_capture',
        title: `Relay/decision/review drop: correlation ${String(d.correlationId).slice(0, 8)}`,
        description: d.reason,
        metadata: { correlation_id: d.correlationId, row_id: d.id, age_ms: d.ageMs },
      });
      if (!error) written++;
    } catch { /* fail-soft: one bad row doesn't block the rest */ }
  }
  return written;
}

async function main() {
  const supabase = getSupabase();
  const result = await planRelayDrops(supabase);
  console.log(`flagged=${result.flagged} ok=${result.ok} pending=${result.pending}${result.error ? ' error=' + result.error : ''}`);
  if (DRY_RUN) {
    console.log('[coordinator-relay-drop-gauge] --dry-run: no writes performed.');
    return;
  }
  // The RELAY_DROP_GAUGE_V1 kill-switch gates the write side ONLY (read/report above always
  // runs) -- adversarial-review finding, deep-tier PR review: `result.enabled` was previously
  // computed but never checked here, so setting the flag to 'false' had no actual effect.
  if (!result.enabled) {
    console.log('[coordinator-relay-drop-gauge] RELAY_DROP_GAUGE_V1=false: write side disabled, skipping recordFlags.');
    return;
  }
  const written = await recordFlags(supabase, result.decisions);
  if (written) console.log(`  recorded ${written} new flag(s) to feedback`);
}

if (require.main === module) {
  main().then(async () => {
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick,
    // regardless of which internal early-return branch main() took (--dry-run or the
    // RELAY_DROP_GAUGE_V1 kill-switch) — the read/report leg always ran.
    try {
      const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
      await stampLastFired(getSupabase(), 'standard_loop:relay-drop-gauge');
    } catch (err) {
      console.error(`[coordinator-relay-drop-gauge] stampLastFired failed (non-fatal): ${err.message}`);
    }
  }).catch((e) => {
    console.error('coordinator-relay-drop-gauge failed:', (e && e.message) || e);
    process.exit(1);
  });
}

module.exports = { recordFlags };
