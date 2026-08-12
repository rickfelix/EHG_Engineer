#!/usr/bin/env node
/**
 * orchestrator-20260711-parity-status.mjs
 * SD-LEO-INFRA-RECONCILE-20260711-ORCHESTRATOR-001
 *
 * READ-ONLY per-object live-vs-file parity check for the objects declared in
 * database/migrations/20260711_orchestrator_terminal_status_sql_parity.sql sections
 * (a),(b),(d),(e). Mirrors the sanctioned pattern in
 * scripts/orchestrator-rpc-enforcement-status.mjs (inspect live pg_proc.prosrc /
 * pg_get_triggerdef rather than trusting a migration file or the apply ledger alone --
 * "migration files that exist and are git-tracked are NOT evidence they were applied").
 *
 * (c) complete_orchestrator_sd is intentionally NOT checked here -- it is owned by
 * database/migrations/20260712_orchestrator_ghost_complete_lead_final.sql, which already
 * supersedes 20260711's own (c) (see that file's header, lines 15-19).
 *
 * Exit 0 always (status report, not a gate). Prints a verdict per object.
 */
import { createDatabaseClient } from './lib/supabase-connection.js';

const DEFERRED_TERMINAL_MARKER = "status IN ('completed', 'cancelled', 'deferred')";
const ROUND2_MARKER = "status IN ('completed', 'cancelled')";
const WIDENED_TRIGGER_MARKER = "ANY (ARRAY['completed'::text, 'cancelled'::text])";

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true });
  let allGood = true;
  try {
    const { rows: fns } = await client.query(
      `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosrc
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
      [['get_progress_breakdown', 'try_auto_complete_parent_orchestrator']]
    );

    for (const fn of fns) {
      if (fn.proname === 'get_progress_breakdown') {
        // (a)/(b): expected superseded-forward by 20260724 (deferred also counted).
        const ok = fn.prosrc.includes(DEFERRED_TERMINAL_MARKER);
        console.log(`${ok ? '✅' : '⚠️ '} get_progress_breakdown(${fn.args}): ${ok ? "superseded-forward by 20260724 (deferred counted) -- OK" : 'UNEXPECTED STATE -- re-verify, does not match the reconciled expectation'}`);
        if (!ok) allGood = false;
      } else if (fn.proname === 'try_auto_complete_parent_orchestrator') {
        // (d): expected round-2 (cancelled counted alongside completed).
        const ok = fn.prosrc.includes(ROUND2_MARKER);
        console.log(`${ok ? '✅' : '⚠️ '} try_auto_complete_parent_orchestrator(): ${ok ? 'round-2 (cancelled counted) -- OK, matches 20260711' : 'MISSING round-2 logic -- re-verify'}`);
        if (!ok) allGood = false;
      }
    }
    if (fns.length < 2) {
      console.log(`⚠️  Expected 2 function name(s) found, got ${fns.length} row(s) -- one or both may be missing entirely.`);
      allGood = false;
    }

    const { rows: trigs } = await client.query(
      `SELECT pg_get_triggerdef(t.oid) AS def
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE t.tgname = 'trg_auto_complete_parent_orchestrator' AND NOT t.tgisinternal`
    );
    if (trigs.length === 0) {
      console.log('⚠️  trg_auto_complete_parent_orchestrator: TRIGGER NOT FOUND');
      allGood = false;
    } else {
      // (e): expected widened WHEN clause (fires on transition into EITHER terminal state).
      const ok = trigs[0].def.includes(WIDENED_TRIGGER_MARKER);
      console.log(`${ok ? '✅' : '⚠️ '} trg_auto_complete_parent_orchestrator: ${ok ? 'widened WHEN clause -- OK, matches 20260711 round-2' : 'NOT widened -- re-verify'}`);
      if (!ok) allGood = false;
    }

    console.log('');
    console.log('(c) complete_orchestrator_sd: not checked here by design -- owned by');
    console.log('    database/migrations/20260712_orchestrator_ghost_complete_lead_final.sql');
    console.log('');
    console.log(allGood
      ? 'STATUS: RECONCILED -- all checked objects (a,b,d,e) match the expected reconciled state.'
      : 'STATUS: UNEXPECTED -- one or more objects diverged from the LEAD-phase (2026-08-12) findings; re-investigate before trusting SD-LEO-INFRA-RECONCILE-20260711-ORCHESTRATOR-001s conclusions.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ERROR', err.message);
  process.exit(1);
});
