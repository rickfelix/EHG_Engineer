#!/usr/bin/env node
// LEAD-phase spine for SD-LEO-INFRA-CLOSE-PUBLIC-READ-001.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLOSE-PUBLIC-READ-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const update = {
    key_changes: [
      {
        type: 'db_migration',
        change: "Drop 23 confirmed-dead backup/snapshot tables (chairman-approved, ratification 49686fd3, 'approve the drops') that were publicly readable by the anon key with zero RLS -- database/migrations/20260915_close_public_read_drop_dead_snapshots.sql (already authored and committed; APPLY VERIFIED PENDING per this SD's own LEAD-phase re-check -- see risks). No FK references any of the 23 tables; each is a stale partial duplicate of a live source table that remains populated.",
        impact: 'Removes roughly 13,000 of the ~15,356 publicly-exposed rows the chairman\'s Advisors scan originally flagged, permanently, by eliminating the tables rather than adding policies to dead data nobody uses.',
      },
    ],
    strategic_objectives: [
      'Execute the chairman-approved drop of the 23 confirmed-dead snapshot tables (ratification 49686fd3) to close the largest single slice of the public-read exposure.',
      'Land the already-authored migration file honestly -- do not claim the DB action is complete until independently re-verified against the live database, not merely against DB metadata claiming a prior execution.',
    ],
    risks: [
      {
        risk: "SD metadata.chairman_drop_execution claimed this migration was ALREADY applied (0/23 present, verified) as of 2026-09-15T11:10:13Z by coordinator 3616c697 via PR #9024 -- but a direct LEAD-phase re-verification against the live DB (this session, ~13:2xZ) found ALL 23 tables STILL PRESENT. The claimed verification was false or never actually ran the apply step.",
        mitigation: 'Filed a critical harness-bug signal (0acc7431) flagging the discrepancy. The migration file itself is unchanged (same chairman-approved scope, same sha256 d14e106e...) and safe to apply -- attempted via scripts/apply-migration.js myself but was blocked by the permission-classifier (DROP TABLE correctly treated as a high-consequence, hard-to-reverse action). Per standing protocol, not hammer-retrying a blocked irreversible action -- awaiting coordinator/differently-permissioned application, or explicit clearance, while continuing the SD\'s protocol paperwork honestly (this handoff does NOT claim the DB rows are dropped -- EXEC-TO-PLAN and later phases must independently re-verify against the live DB before claiming completion).',
        severity: 'high',
        rollback: 'N/A for the LEAD-phase spine itself; the migration\'s own header documents its rollback is not applicable (DROP TABLE on confirmed-dead, FK-free, duplicated data -- the live source tables are the actual system of record and are untouched).',
      },
    ],
    smoke_test_steps: [
      {
        instruction: 'Query the live database directly (service-role select, count only) for all 23 table names in the migration file.',
        expected_outcome: 'Zero of the 23 tables exist (either 42P01/PGRST205 not-found errors, or information_schema absence) -- confirmed independently, not read from SD metadata.',
      },
    ],
    success_criteria: [
      { criterion: 'The 23 chairman-approved dead-snapshot tables no longer exist in the live database', measure: 'Direct live-DB re-check (not metadata) shows 0/23 present', verification: 'Automated: a service-role select against each of the 23 table names returns not-found for all 23' },
    ],
    metadata: {
      ...(sdRow.metadata || {}),
      lead_scoping_decision: {
        decision: "Scoped THIS SD narrowly to exactly what the already-committed migration file covers: dropping the 23 confirmed-dead snapshot tables. The remaining scope named in metadata.chairman_drop_execution.remaining_scope (13 live tables needing per-table RLS protection, plus key rotation) is explicitly out of scope here -- the migration file's own header and the original commit message both state this directly ('Live tables and key rotation are explicitly out of scope (follow-up work)'). That remaining work needs per-table chairman/Adam triage (some of the 13 may be deliberately public for a dashboard) and is a separate, later item.",
        evidence: 'database/migrations/20260915_close_public_read_drop_dead_snapshots.sql header + git commit 8e800a642799e8e3fc2535031413845f54a872b0 message, both already scoped this way before this LEAD spine was written.',
        discrepancy_found: 'metadata.chairman_drop_execution claims live verification of 0/23 present at 2026-09-15T11:10:13Z -- independently re-checked this session and found all 23 STILL PRESENT. Flagged via critical signal 0acc7431. This SD\'s own success_criteria and smoke_test_steps require a FRESH re-verification before any downstream phase claims completion.',
      },
    },
  };

  const { error: updErr } = await supabase.from('strategic_directives_v2').update(update).eq('id', sdRow.id);
  if (updErr) throw updErr;
  console.log('LEAD spine populated for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
