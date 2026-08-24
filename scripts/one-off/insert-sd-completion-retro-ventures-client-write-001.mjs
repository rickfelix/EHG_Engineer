// Insert a retro_type='SD_COMPLETION' retrospective for SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001.
// The existing row (87c0e172) is retro_type='HANDOFF', auto-generated at the EXEC-TO-PLAN
// transition -- it doesn't satisfy the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE, which requires
// an SD_COMPLETION-typed row with SD-specific content, not metric-only learnings.

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

async function run() {
  const dotenv = await import('dotenv');
  dotenv.config();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const SD_UUID = '5b49d623-5bbb-4d39-b791-d7d6fabac5f9';

  const { error } = await supabase.from('retrospectives').insert({
    sd_id: SD_UUID,
    project_name: 'EHG_Engineer',
    retro_type: 'SD_COMPLETION',
    title: 'SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001: Ventures RLS integrity repair',
    description:
      'Chairman-commissioned architecture eval repair, originally scoped to close a claimed broad ' +
      'client UPDATE grant on ventures.current_lifecycle_stage. The premise was falsified during ' +
      'LEAD-phase due diligence: an unqualified pg_policies query (no schemaname filter) had ' +
      'matched an abandoned portfolio.ventures decoy table instead of the real, live public.ventures ' +
      '-- and this happened TWICE, independently, once in the original eval and again in a same-day ' +
      '"consumer census" meant to correct it. Escalated via /signal spec-conflict, held the claim, ' +
      're-scoped after coordinator acceptance + Adam ratification to what the measurement actually ' +
      'supported: retire the decoy, document the real policy posture, close two genuinely-measured ' +
      'gaps (a cross-tenant SELECT over-grant, and silent RLS-denied client UPDATEs of ' +
      'current_lifecycle_stage affecting ~15 live browser call sites in the EHG app).',
    what_went_well: [
      'Escalating a falsified premise via /signal instead of building against it, or unilaterally cancelling the chairman-commissioned SD, was the correct call -- the coordinator accepted the finding in full and Adam ratified the re-scope.',
      'The ESCALATE+HOLD+ARM+CASCADE pattern kept the fleet productive (completed QF-20260823-561) during the ~19h the escalation sat unacknowledged, without abandoning or losing the held claim.',
      'Caught a real scope error DURING EXEC, before it ever reached the client-code changes: the original FR-4 draft guarded all six nominally-governance ventures columns behind advance_venture_stage, but that RPC only models a stage transition and has no parameter path for the other five. Narrowing to current_lifecycle_stage-only avoided breaking every legitimate write of status/orchestrator_state/launched_at/workflow_status/recursion_state.',
      'Caught a real design bug in my own DO $verify$ block before it ever ran: the negative-case probe simulated the authenticated role via SET LOCAL ROLE but never faked the JWT claim that has_venture_access(id) reads -- without it, RLS would have denied the probe row at row-selection, never reaching the trigger, making the test assert nothing.',
      'Delegated the EHG app-side call-site changes to a fork with precise, prescriptive instructions (not "go fix it") -- it correctly identified and changed 5 files, and correctly LEFT 3 files unchanged with clear reasoning (no derivable from-stage / initialization-only writes) rather than guessing and risking a live production bug.',
      'Reviewed the delegated diff myself before committing, ran the EHG repo\'s test suite, and caught a real regression the fork introduced (evaRollback.test.ts\'s mock Supabase client had no .rpc() method) -- fixed the test fixture rather than shipping a broken test.',
      'CI caught a real, useful issue I had not anticipated: a pre-existing stage-advancement-chokepoint-lint flagged my own migration\'s verify-block probes as uncensused current_lifecycle_stage writes. Used the lint\'s own documented single-line disable pragma rather than a blanket allowlist entry.',
      'Filed the schema-qualification defect class as a durable, cross-session memory trap (reference_db_supabase_traps.md) so future evals/censuses querying pg_policies are warned before repeating the same mistake a third time.',
    ],
    what_needs_improvement: [
      'The ack-latency on the original 14:23Z escalation (2.5h unread, then ~19h total to disposition) was flagged twice via /signal feedback as a coordinator process gap -- the coordinator owned it as "a coordinator failure" and said the per-signal disposition gap was being fixed.',
      'FR-4\'s original scope (guard all six governance-adjacent columns behind one RPC) should have been checked against the RPC\'s actual signature during PLAN/PRD authoring, not discovered mid-EXEC while writing the trigger SQL -- a PLAN-phase step that reads the target RPC\'s pg_proc definition before finalizing an FR that assumes it exists would have caught this earlier.',
      'status/orchestrator_state/launched_at/workflow_status/recursion_state remain directly client-writable after this SD -- the original architecture eval\'s broader concern (client can write governance-adjacent state) is only partially closed. Each of those five needs its own governed RPC path in a follow-up SD; none exists today and TR-4 forbade inventing one inline here.',
      'The 3 disagreeing SECURITY DEFINER advance RPCs (advance_venture_stage / fn_advance_venture_stage / advance_venture_to_stage) corroborated by both the original eval and this SD\'s own investigation were deliberately left un-consolidated to avoid scope creep -- a real, flagged follow-up SD, not resolved here.',
    ],
    action_items: [
      'Follow-up SD: give status/orchestrator_state/launched_at/workflow_status/recursion_state each a governed write path (RPC or equivalent), then extend the ventures_block_client_governance_write_trg guard to cover them.',
      'Follow-up SD: consolidate or formally differentiate the 3 disagreeing advance RPCs (advance_venture_stage, fn_advance_venture_stage, advance_venture_to_stage).',
      'Chairman ceremony: apply database/chairman-gated/20260824_ventures_rls_integrity_repair.sql once the companion EHG app-code PR (rickfelix/ehg#797) has been reviewed/merged, sequenced app-code-first per the migration\'s own risk mitigation.',
      'Consider adding a PLAN-phase check that reads a target RPC\'s live pg_get_function_identity_arguments before an FR assumes it can route a given column\'s writes through that RPC.',
    ],
    key_learnings: [
      'An unqualified pg_policies query can silently match a same-named table in the wrong schema -- always filter by schemaname explicitly, never WHERE tablename=X alone (now durably filed in reference_db_supabase_traps.md).',
      'SET LOCAL ROLE authenticated does not populate auth.jwt() -- a policy predicate reading auth.jwt() (directly or via a wrapper like has_venture_access) needs an explicit set_config(\'request.jwt.claims\', ..., true) to be genuinely tested, or the probe silently tests nothing (0-row UPDATE, no exception).',
      'Before guarding a set of columns behind one RPC, verify the RPC\'s actual parameter signature matches every column in that set -- a plausible-looking column classification (all "governance-class") does not guarantee a matching write path exists.',
      'A repo-wide chokepoint lint can legitimately flag a migration\'s own verify-block test probes as violations of the very rule the migration is implementing -- the fix is the lint\'s documented single-line disable pragma on the probe lines, not a broader allowlist entry.',
    ],
    quality_score: 85,
    team_satisfaction: 8,
    objectives_met: true,
    on_schedule: true,
    within_scope: true,
    generated_by: 'MANUAL',
    trigger_event: 'PLAN-TO-LEAD',
    status: 'PUBLISHED',
    target_application: 'EHG_Engineer',
    learning_category: 'DATABASE_SCHEMA',
    related_prs: [
      'https://github.com/rickfelix/EHG_Engineer/pull/7471',
      'https://github.com/rickfelix/ehg/pull/797',
    ],
    related_files: [
      'database/chairman-gated/20260824_ventures_rls_integrity_repair.sql',
      'database/chairman-gated/20260824_ventures_rls_integrity_repair_DOWN.sql',
      'ehg/src/services/evaStateMachines.ts',
      'ehg/src/services/recursionEngine.ts',
      'ehg/src/services/evaRollback.ts',
      'ehg/src/pages/api/v2/chairman/decide.ts',
      'ehg/src/pages/api/v2/ventures/[id]/promote.ts',
    ],
  });
  if (error) {
    console.error('INSERT_ERROR', JSON.stringify(error, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('Inserted SD_COMPLETION retrospective for SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001');
}
