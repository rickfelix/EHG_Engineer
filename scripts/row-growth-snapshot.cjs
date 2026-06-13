#!/usr/bin/env node
/**
 * Row-growth snapshot + anomaly gauge CLI — SD-LEO-INFRA-STANDING-ROW-GROWTH-001.
 *
 * Daily standing SRE gauge for the governance tables:
 *   1. Due-gate: skip unless the latest ROW_GROWTH_SNAPSHOT coordination event
 *      is older than ~22h (or --force).
 *   2. Snapshot estimated row counts (PostgREST head+estimated — pg statistics,
 *      no COUNT(*)) for lib/coordinator/row-growth.cjs GOVERNANCE_TABLES.
 *   3. Persist the snapshot as a coordination_events row (the baseline series).
 *   4. Run the pure anomaly detector vs the previous snapshot; on anomalies,
 *      write a ROW_GROWTH_ANOMALY event AND a coordinator-inbox row
 *      (session_coordination INFO) so the alert lands where the coordinator looks.
 *
 * Scheduling: armed daily by the coordinator (see coordinator-startup-check.mjs
 * cron specs). Safe to run ad-hoc: npm run sre:row-growth [-- --force]
 * ALWAYS exits 0 on operational paths (a gauge must never break its host loop).
 */
'use strict';
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const {
  GOVERNANCE_TABLES,
  SNAPSHOT_EVENT_TYPE,
  ANOMALY_EVENT_TYPE,
  detectRowGrowthAnomalies,
  isSnapshotDue,
  readTableEstimates,
  readLatestSnapshot,
  emitRowGrowthAnomalyAlert,
} = require('../lib/coordinator/row-growth.cjs');

async function resolveCoordinatorId(sb) {
  try {
    const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
    return await getActiveCoordinatorId(sb);
  } catch { return null; }
}

async function main() {
  const force = process.argv.includes('--force');
  const sb = createSupabaseServiceClient();

  const prev = await readLatestSnapshot(sb);
  if (!force && prev && !isSnapshotDue(prev.captured_at, Date.now())) {
    console.log(`[row-growth] not due (last snapshot ${prev.captured_at}) — no-op`);
    return;
  }

  const tables = await readTableEstimates(sb, GOVERNANCE_TABLES);
  const tableCount = Object.keys(tables).length;
  if (tableCount === 0) {
    console.warn('[row-growth] no table estimates readable — skipping (fail-open)');
    return;
  }
  const captured_at = new Date().toISOString();
  const snapshot = { captured_at, tables };

  // Persist the baseline point (non-fatal on failure — next run retries).
  try {
    const { error } = await sb.from('coordination_events').insert({
      event_type: SNAPSHOT_EVENT_TYPE,
      severity: 'info',
      payload: snapshot,
    });
    if (error) console.warn(`[row-growth] snapshot persist failed (non-fatal): ${error.message}`);
  } catch (e) { console.warn(`[row-growth] snapshot persist threw (non-fatal): ${e.message}`); }

  console.log(`[row-growth] snapshot captured: ${tableCount} tables @ ${captured_at}${prev ? ` (prev ${prev.captured_at})` : ' (first baseline — no anomaly check)'}`);

  if (!prev) return;

  const anomalies = detectRowGrowthAnomalies(prev, snapshot);
  if (anomalies.length === 0) {
    console.log('[row-growth] no growth anomalies');
    return;
  }

  console.log(`[row-growth] ⚠️  ${anomalies.length} growth anomalie(s):`);
  for (const a of anomalies) {
    console.log(`   - ${a.table}: ${a.prev} -> ${a.curr} (+${a.delta}${a.factor ? `, x${a.factor.toFixed(2)}` : ''}) [${a.trigger}]`);
  }

  // Alert leg 1: durable detector event.
  try {
    await sb.from('coordination_events').insert({
      event_type: ANOMALY_EVENT_TYPE,
      severity: 'warning',
      payload: { captured_at, anomalies, window: { prev: prev.captured_at, curr: captured_at } },
    });
  } catch (e) { console.warn(`[row-growth] anomaly event failed (non-fatal): ${e.message}`); }

  // Alert leg 2: coordinator inbox row (where the fleet actually looks).
  try {
    const coordinatorId = await resolveCoordinatorId(sb);
    const top = anomalies[0];
    await sb.from('session_coordination').insert({
      target_session: coordinatorId, // null => broadcast row, still visible in inbox scans
      message_type: 'INFO',
      subject: `[ROW_GROWTH] ${anomalies.length} table(s) growing abnormally — top: ${top.table} +${top.delta}`,
      body: anomalies.map((a) => `${a.table}: ${a.prev} -> ${a.curr} (+${a.delta}${a.factor ? `, x${a.factor.toFixed(2)}` : ''}) [${a.trigger}]`).join('\n'),
      payload: { kind: 'row_growth_anomaly', anomalies },
      sender_type: 'system',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    });
  } catch (e) { console.warn(`[row-growth] inbox alert failed (non-fatal): ${e.message}`); }

  // Alert leg 3 (SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-C FR-C3): surface to system_alerts via the
  // frozen break-class write-contract so the chairman breakage surface (child E) + catch-rate harness
  // (child F) see it. Fail-soft by construction (emitRowGrowthAnomalyAlert never throws).
  await emitRowGrowthAnomalyAlert(sb, anomalies);
}

if (require.main === module) {
  // Graceful bounded exit (SD-FDBK-INFRA-SWEEP-CLI-EXIT-001 primitive): a direct
  // process.exit() after Supabase/undici queries aborts on Windows (UV_HANDLE_CLOSING),
  // and no exit at all risks hanging to the caller's timeout. armCliTeardown closes idle
  // sockets and lets the loop drain naturally, with an unref'd 8s backstop. Exit code is
  // always 0 — a gauge never breaks its host loop.
  main()
    .catch((e) => { console.warn(`[row-growth] unexpected error (non-fatal): ${e.message}`); })
    .finally(async () => {
      try {
        const { armCliTeardown } = await import('../lib/cli-graceful-exit.js');
        await armCliTeardown(0);
      } catch { process.exitCode = 0; /* helper missing — natural drain */ }
    });
}

module.exports = { main };
