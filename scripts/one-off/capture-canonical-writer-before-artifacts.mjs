// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4.
//
// Captures the LIVE body of every function this SD amends, via pg_get_functiondef(), into
// database/evidence/canonical-writer-choke/<name>.before.sql. Run from the repo root, BEFORE
// scripts/one-off/gen-canonical-writer-stamp-amendments.mjs, which derives the .after.sql and
// .diff.txt artifacts from these by exactly-once anchor substitution.
//
// Read-only: SELECT against pg_proc only. It is the provenance half of the claim that the
// migration amends the live bodies rather than a stale migration-file copy -- a stale copy of a
// live RPC produced a real authentication-bypass risk on a prior SD in this same session.
// Re-running it after a live function changes will make the DDL test's verbatim assertion fail,
// which is the intended signal, not a flake.
import { createDatabaseClient } from '../lib/supabase-connection.js';
import fs from 'fs';
const OUT = 'database/evidence/canonical-writer-choke';
const c = await createDatabaseClient('engineer', { verify: false });
const targets = [
  ['fn_atomic_lead_to_plan_transition', 'fn_atomic_lead_to_plan_transition'],
  ['fn_atomic_exec_to_plan_transition', 'fn_atomic_exec_to_plan_transition'],
  ['auto_transition_status', 'auto_transition_status'],
  ['complete_orchestrator_sd', 'complete_orchestrator_sd'],
  ['update_sd_after_exec_completion', 'update_sd_after_exec_completion'],
  ['update_sd_after_lead_evaluation', 'update_sd_after_lead_evaluation'],
  ['update_sd_after_plan_validation', 'update_sd_after_plan_validation'],
  ['update_sd_progress_from_phases', 'update_sd_progress_from_phases'],
];
const stamp = new Date().toISOString();
for (const [proname, file] of targets) {
  const { rows } = await c.query(
    `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=$1`, [proname]);
  if (rows.length !== 1) throw new Error(`expected exactly 1 definition for ${proname}, got ${rows.length}`);
  const header = `-- CAPTURED LIVE via pg_get_functiondef() at ${stamp}\n`
    + `-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 -- BEFORE artifact.\n`
    + `-- Source: live consolidated engineer DB. NOT copied from any migration file (a stale\n`
    + `-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD\n`
    + `-- this session -- see FR-4's description).\n--\n`;
  fs.writeFileSync(`${OUT}/${file}.before.sql`, header + rows[0].def + '\n');
  console.log('WROTE ' + file + '.before.sql len=' + rows[0].def.length);
}
await c.end();
console.log('CAPTURED_AT=' + stamp);
