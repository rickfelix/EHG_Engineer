#!/usr/bin/env node
/**
 * orchestrator-rpc-enforcement-status.mjs
 * SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001 (FR-4 / TS-7)
 *
 * READ-ONLY check of whether the staged migration
 * database/migrations/20260712_orchestrator_ghost_complete_lead_final.sql
 * has been applied to the live database. Migration files that exist and are
 * git-tracked are NOT evidence they were applied (retro 8d83c6a2) — this
 * script inspects the live function body.
 *
 * Exit 0 always (status report, not a gate). Prints APPLIED or STAGED.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const ENFORCEMENT_MARKERS = [
  { fn: 'complete_orchestrator_sd', marker: 'LEAD-FINAL-APPROVAL', meaning: 'requires accepted LEAD-FINAL-APPROVAL row' },
  { fn: 'complete_orchestrator_sd', marker: "retro_type = 'SD_COMPLETION'", meaning: 'canonical retro filter' },
  { fn: 'check_handoff_bypass', marker: 'ORCHESTRATOR_AUTO_COMPLETE', meaning: 'fabrication whitelist (must be ABSENT)', mustBeAbsent: true }
];

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true });
  try {
    const functionBodyQuery = 'SELECT proname, prosrc FROM pg_proc WHERE proname = ANY($1::text[])';
    const { rows } = await client.query(functionBodyQuery, [[...new Set(ENFORCEMENT_MARKERS.map(m => m.fn))]]);
    const bodies = Object.fromEntries(rows.map(r => [r.proname, r.prosrc]));

    let applied = true;
    for (const check of ENFORCEMENT_MARKERS) {
      const body = bodies[check.fn];
      if (!body) {
        console.log(`❌ ${check.fn}: function not found in live DB`);
        applied = false;
        continue;
      }
      const present = body.includes(check.marker);
      const ok = check.mustBeAbsent ? !present : present;
      console.log(`${ok ? '✅' : '⚠️ '} ${check.fn}: ${check.meaning} — ${check.mustBeAbsent ? (present ? 'STILL PRESENT' : 'absent (good)') : (present ? 'present' : 'MISSING')}`);
      if (!ok) applied = false;
    }

    console.log('');
    if (applied) {
      console.log('STATUS: APPLIED — live RPC enforces LEAD-FINAL + SD_COMPLETION retro.');
    } else {
      console.log('STATUS: STAGED — live RPC still permissive (ghost-complete possible via SQL path).');
      console.log('        JS-path enforcement is independent and already active once the PR merges.');
      console.log('        Chairman apply: node scripts/apply-migration.js database/migrations/20260712_orchestrator_ghost_complete_lead_final.sql --prod-deploy');
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Verification failed to run (this is a connectivity/read error, not an enforcement verdict):', err.message);
  process.exit(0);
});
