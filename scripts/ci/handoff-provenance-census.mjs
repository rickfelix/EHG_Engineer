#!/usr/bin/env node
// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G (FR-1): census of every code path that inserts a
// status='accepted' row into sd_phase_handoffs, and whether it applies
// lib/handoff/bypass-stamp.js's deriveBypassAwareRecordFields.
//
// Modeled on scripts/ci/bypass-ledger-handoff-join-check.mjs's CLI/exit-code shape.
//
// SCOPE CORRECTION (Explore + VALIDATION, LEAD-TO-PLAN): the query MUST key on handoff_type,
// not to_phase -- LEAD-FINAL-APPROVAL rows store from_phase=LEAD, to_phase=LEAD, so a
// to_phase-keyed query would silently report a clean census.
//
// The 5 confirmed live writers, file:line as of this SD's authoring. This list is the census's
// OWN source of truth for "does this writer call the shared builder" -- it does not (and cannot)
// introspect the live code for that fact; it is corroborated instead by
// tests/unit/handoff/lead-final-bypass-provenance.test.js and HandoffRecorder's own tests.
export const KNOWN_WRITERS = [
  { name: 'HandoffRecorder.createArtifact', file: 'scripts/modules/handoff/recording/HandoffRecorder.js', line: 961, calls_shared_builder: true },
  { name: 'lead-final-approval canonical write', file: 'scripts/modules/handoff/executors/lead-final-approval/index.js', line: 658, calls_shared_builder: true },
  { name: 'lead-final-approval reconcile path (_reconcileCanonicalLfaRow)', file: 'scripts/modules/handoff/executors/lead-final-approval/index.js', line: 1220, calls_shared_builder: 'copies-from-sibling' },
  { name: 'orchestrator-completion-guardian.createHandoff', file: 'scripts/modules/handoff/orchestrator-completion-guardian.js', line: 538, calls_shared_builder: false },
  { name: 'plan-to-lead satisfyOrchestratorTemplateRequirements', file: 'scripts/modules/handoff/executors/plan-to-lead/state-transitions.js', line: 318, calls_shared_builder: false },
];

// Confirmed-dead insert attempts (Explore, LEAD-TO-PLAN): build rows for a different schema
// shape and fail silently on every call. Documented here so a future reader does not mistake
// silent-failure code for a 6th live writer.
export const CONFIRMED_DEAD_WRITERS = [
  { name: 'verify-l2p/handoff-execution.js createHandoffExecution', file: 'scripts/verify-l2p/handoff-execution.js', line: 18 },
  { name: 'plan-to-exec/workflow-validation.js', file: 'scripts/modules/handoff/verifiers/plan-to-exec/workflow-validation.js', line: 87 },
];

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

/**
 * Pure classifier: groups accepted sd_phase_handoffs rows by handoff_type, counting how many
 * carry validation_details.score_source. No I/O.
 * @param {Array<{handoff_type: string, validation_details: object|null}>} rows
 * @returns {Record<string, {total: number, with_score_source: number, without_score_source: number}>}
 */
export function censusByHandoffType(rows) {
  const byType = {};
  for (const row of rows) {
    const type = row.handoff_type || 'UNKNOWN';
    if (!byType[type]) byType[type] = { total: 0, with_score_source: 0, without_score_source: 0 };
    byType[type].total++;
    if (row.validation_details?.score_source) byType[type].with_score_source++;
    else byType[type].without_score_source++;
  }
  return byType;
}

function parseArgs(argv) {
  const out = { limit: 1000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') out.limit = Number(argv[++i]);
  }
  return out;
}

async function main() {
  config();
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let rows;
  try {
    rows = await fetchAllPaginated(() =>
      supabase
        .from('sd_phase_handoffs')
        .select('handoff_type, validation_details')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(args.limit)
    );
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exit(1);
  }

  const byType = censusByHandoffType(rows);

  const result = {
    status: 'ok',
    known_writers: KNOWN_WRITERS,
    confirmed_dead_writers: CONFIRMED_DEAD_WRITERS,
    rows_examined: rows.length,
    census_by_handoff_type: byType,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(JSON.stringify({ status: 'error', error: e.message })); process.exit(1); });
}
