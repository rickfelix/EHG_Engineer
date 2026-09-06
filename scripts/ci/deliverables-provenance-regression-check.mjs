#!/usr/bin/env node
// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G (FR-5): going-forward regression watchdog for the two
// provenance fixes this SD ships (FR-2/FR-3 handoff score_source, FR-4 deliverables producer).
//
// Modeled directly on scripts/ci/bypass-ledger-handoff-join-check.mjs's shape: a cutover-anchored
// census (not a rolling window -- the exit bar is "every row written after this ships", not a
// percentage over history), a pure I/O-free classifier per bucket, fetchAllPaginated for a
// complete (non-truncated) read, and Observe-Only-First non-blocking wiring in CI.
//
// TWO independent buckets:
//   (a) sd_phase_handoffs rows accepted after cutover with no validation_details.score_source --
//       this is FR-1's census turned into a going-forward pass/fail instead of a point-in-time
//       report; a regression here means a NEW handoff writer shipped without the shared builder.
//   (b) sd_scope_deliverables rows completed after cutover with no metadata.producer -- reuses
//       FR-4's own isUnprovenancedPostCutover() classifier. Runtime gates already block this for
//       SD types where DELIVERABLES_COMPLETENESS/SCOPE_AUDIT run REQUIRED, but those gates are
//       OPT/SKIP for some SD types (e.g. documentation, orchestrator) -- an unprovenanced
//       completion can still land for those without ever failing a gate. This census reads the
//       raw table, independent of which gate mode ran, so it is real defense-in-depth, not a
//       duplicate of the gate check.
//
// The client is CONSTRUCTED lazily, inside main() -- these imports are static but createClient()
// itself is not called until main() runs, so both classifiers can be imported and unit-tested
// without ever touching Supabase or requiring process.env to be populated.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { isUnprovenancedPostCutover } from '../modules/handoff/validation/semantic-gate-utils.js';

/**
 * Pure classifier, bucket (a): sd_phase_handoffs rows already filtered to accepted +
 * post-cutover by the caller's query.
 * @param {Array<{id: string, handoff_type: string, validation_details: object|null}>} rows
 * @returns {{compliant: Array, missing_score_source: Array}}
 */
export function classifyHandoffProvenance(rows) {
  const compliant = [];
  const missing_score_source = [];
  for (const row of rows) {
    if (row.validation_details?.score_source) compliant.push(row);
    else missing_score_source.push(row);
  }
  return { compliant, missing_score_source };
}

/**
 * Pure classifier, bucket (b): sd_scope_deliverables rows, any completion state / any
 * completed_at -- isUnprovenancedPostCutover itself decides applicability (non-completed rows
 * and pre-cutover completions are never flagged).
 * @param {Array<{id: string, completion_status: string, completed_at: string|null, metadata: object|null}>} rows
 * @param {string} cutoverIso
 * @returns {{compliant: Array, missing_producer: Array}}
 */
export function classifyDeliverableProvenance(rows, cutoverIso) {
  const compliant = [];
  const missing_producer = [];
  for (const row of rows) {
    if (isUnprovenancedPostCutover(row, cutoverIso)) missing_producer.push(row);
    else compliant.push(row);
  }
  return { compliant, missing_producer };
}

function parseArgs(argv) {
  // Deliberately errs EARLY (same convention as bypass-ledger-handoff-join-check.mjs's
  // --cutover default) -- an early cutover only costs a few extra rows briefly examined that
  // predate this SD's fixes, a late one would hide a real regression.
  const out = { cutover: '2026-09-05T00:00:00.000Z' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cutover') out.cutover = argv[++i];
  }
  return out;
}

async function main() {
  config();

  const args = parseArgs(process.argv.slice(2));
  const cutoverIso = process.env.DELIVERABLES_PROVENANCE_REGRESSION_CUTOVER || args.cutover;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let handoffRows;
  let deliverableRows;
  try {
    [handoffRows, deliverableRows] = await Promise.all([
      fetchAllPaginated(() =>
        supabase
          .from('sd_phase_handoffs')
          .select('id, handoff_type, validation_details')
          .eq('status', 'accepted')
          .gte('created_at', cutoverIso)
      ),
      fetchAllPaginated(() =>
        supabase
          .from('sd_scope_deliverables')
          .select('id, sd_id, completion_status, completed_at, metadata')
          .gte('completed_at', cutoverIso)
      ),
    ]);
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exit(1);
  }

  const handoffBuckets = classifyHandoffProvenance(handoffRows);
  const deliverableBuckets = classifyDeliverableProvenance(deliverableRows, cutoverIso);

  const status =
    handoffBuckets.missing_score_source.length === 0 && deliverableBuckets.missing_producer.length === 0
      ? 'pass'
      : 'fail';

  const result = {
    status,
    cutover: cutoverIso,
    handoffs: {
      total: handoffRows.length,
      compliant: handoffBuckets.compliant.length,
      missing_score_source: handoffBuckets.missing_score_source.length,
      missing_score_source_ids: handoffBuckets.missing_score_source.map((r) => r.id),
    },
    deliverables: {
      total_examined: deliverableRows.length,
      compliant: deliverableBuckets.compliant.length,
      missing_producer: deliverableBuckets.missing_producer.length,
      missing_producer_ids: deliverableBuckets.missing_producer.map((r) => r.id),
    },
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(status === 'pass' ? 0 : 1);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(JSON.stringify({ status: 'error', error: e.message })); process.exit(1); });
}
