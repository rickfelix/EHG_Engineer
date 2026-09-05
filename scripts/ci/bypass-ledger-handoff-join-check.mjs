#!/usr/bin/env node
// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B (FR-B4): bypass_ledger.handoff_id join-back census.
//
// Modeled on scripts/ci/audit-log-parity-check.mjs's CLI/exit-code shape, but with a
// cutover-timestamp design (like lib/sub-agent-executor/evidence-provenance.js's
// PROVENANCE_CUTOVER_AT) rather than a rolling window, since the exit bar is "every row
// written after this ships", not a percentage over history including the 158 pre-existing
// legacy rows this SD does not reconcile.
//
// THREE buckets, not two -- a bypass_ledger row with no sd_phase_handoffs row at all (refused
// before any handoff row was minted, e.g. workflow-sequence enforcement) is a LEGITIMATE
// outcome, not a violation. Only a row where a corresponding sd_phase_handoffs row DOES exist
// but handoff_id is still null is a genuine defect.
//
// The client is CONSTRUCTED lazily, inside main() -- these imports are static (matching
// audit-log-parity-check.mjs's own style) but createClient() itself is not called until
// main() runs, so classifyBypassLedgerRows can be imported and unit-tested without ever
// touching Supabase or requiring process.env to be populated.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

/**
 * Pure classifier: no I/O, no ambient Date.now() call -- only new Date(row.created_at)
 * on already-supplied timestamps.
 *
 * @param {Array<{id: string, created_at: string, handoff_id: string|null, sd_id: string|null, sd_key: string|null}>} ledgerRows
 * @param {Record<string, Array<{created_at: string}>>} handoffRowsBySdKey - sd_phase_handoffs rows, keyed by sd_id (or sd_key fallback)
 * @param {{windowMs?: number}} [opts]
 * @returns {{joined: Array, refused_before_handoff: Array, unjoined_defect: Array}}
 */
export function classifyBypassLedgerRows(ledgerRows, handoffRowsBySdKey = {}, { windowMs = 5 * 60 * 1000 } = {}) {
  const buckets = { joined: [], refused_before_handoff: [], unjoined_defect: [] };
  for (const row of ledgerRows) {
    if (row.handoff_id) {
      buckets.joined.push(row);
      continue;
    }
    const candidates = handoffRowsBySdKey[row.sd_id] || handoffRowsBySdKey[row.sd_key] || [];
    const rowTime = new Date(row.created_at).getTime();
    const hasNearbyHandoff = candidates.some((h) => Math.abs(new Date(h.created_at).getTime() - rowTime) <= windowMs);
    if (hasNearbyHandoff) buckets.unjoined_defect.push(row);
    else buckets.refused_before_handoff.push(row);
  }
  return buckets;
}

// SECURITY finding MEDIUM (evidence dcf8dab7): sd_id/sd_key are interpolated directly into a
// PostgREST .or() filter STRING -- a comma (or other PostgREST-grammar character) in a value
// would inject an additional OR term, widening the match set and reclassifying a real
// unjoined_defect as the legitimate refused_before_handoff bucket (audit evasion via the
// census's own instrument). Every real sd_id/sd_key observed matches this pattern; anything
// else is dropped rather than interpolated, never silently included. Exported (pure, no I/O)
// so the sanitization boundary is independently testable, not just exercised end to end.
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;
export function filterSafeIds(values) {
  return [...new Set(values.filter((v) => typeof v === 'string' && v.length > 0 && SAFE_ID_RE.test(v)))];
}

function parseArgs(argv) {
  // Deliberately errs EARLY (like PROVENANCE_CUTOVER_AT) -- an early cutover only costs a
  // few extra rows briefly excluded from the census, a late one would wrongly flag rows
  // written before this fix as defects.
  const out = { cutover: '2026-09-05T06:00:00.000Z' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cutover') out.cutover = argv[++i];
  }
  return out;
}

async function main() {
  config();

  const args = parseArgs(process.argv.slice(2));
  const cutoverIso = process.env.BYPASS_HANDOFF_ID_CUTOVER_AT || args.cutover;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // A census must be COMPLETE -- a silent truncation here would give a false "pass" when
  // real defects exist beyond the cap. fetchAllPaginated() ranges until a short page rather
  // than relying on a single bounded select().
  let rows;
  try {
    rows = await fetchAllPaginated(() =>
      supabase.from('bypass_ledger').select('id, created_at, handoff_id, sd_id, sd_key').gte('created_at', cutoverIso)
    );
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exit(1);
  }

  const sdIds = filterSafeIds(rows.map((r) => r.sd_id));
  const sdKeys = filterSafeIds(rows.map((r) => r.sd_key));

  const handoffRowsBySdKey = {};
  if (sdIds.length > 0 || sdKeys.length > 0) {
    const orClauses = [
      ...sdIds.map((id) => `sd_id.eq.${id}`),
      ...sdKeys.map((key) => `sd_id.eq.${key}`),
    ].join(',');
    let handoffRows;
    try {
      handoffRows = await fetchAllPaginated(() =>
        supabase.from('sd_phase_handoffs').select('sd_id, created_at').or(orClauses).gte('created_at', cutoverIso)
      );
    } catch (e) {
      console.error(JSON.stringify({ status: 'error', error: e.message }));
      process.exit(1);
    }
    for (const h of handoffRows) {
      if (!handoffRowsBySdKey[h.sd_id]) handoffRowsBySdKey[h.sd_id] = [];
      handoffRowsBySdKey[h.sd_id].push(h);
    }
  }

  const buckets = classifyBypassLedgerRows(rows, handoffRowsBySdKey);
  const status = buckets.unjoined_defect.length === 0 ? 'pass' : 'fail';

  const result = {
    status,
    cutover: cutoverIso,
    total_rows: rows.length,
    joined: buckets.joined.length,
    refused_before_handoff: buckets.refused_before_handoff.length,
    unjoined_defect: buckets.unjoined_defect.length,
    unjoined_defect_ids: buckets.unjoined_defect.map((r) => r.id),
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(status === 'pass' ? 0 : 1);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(JSON.stringify({ status: 'error', error: e.message })); process.exit(1); });
}
