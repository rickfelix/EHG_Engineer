#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001's spine, which names specific live DB
 * objects (triggers, functions, RPCs) on strategic_directives_v2. This SD's own direct
 * live-DB investigation (pg_get_triggerdef/pg_get_functiondef reads + empirical UPDATE-
 * RETURNING-ROLLBACK probes) plus VALIDATION/RISK sub-agent evidence are the verifiers.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1); }

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'sub_agent_execution_results:27a70b6c-cc1f-4ba4-b5dc-50bc4e8edd02 (VALIDATION, phase=LEAD)',
      verified_at: 'tests/unit/governance/canonical-helper-bypass-guard.test.js, tests/quarantine-manifest.json:757-764, scripts/lib/lead-precheck-helpers.js:300-421 (verifyHelperCoverage)',
      claim: 'The quarantined guard test is a GENERIC registry-driven test covering TWO rows (strategic_directives_v2->handoff.js AND feedback->emit-feedback.js), quarantined because the feedback row failed (13 unexempted sites) -- but the SD-v2 row independently fails too (16 unexempted sites, live-verified via a direct verifyHelperCoverage() run). The scanner is a per-line regex requiring .from() and .insert/upsert/update( on the SAME physical line, with 0% recall on the dominant multi-line Supabase chain style and zero .rpc() awareness.',
      reproduction: 'Direct read of both files; live invocation of verifyHelperCoverage() confirming 16 unexempted sites, none of which are lifecycle-column writes.'
    },
    {
      verified_by: 'sub_agent_execution_results:bf101a14-4b4c-4bf0-a98d-ec97a4ad41c0 (RISK, phase=LEAD)',
      verified_at: 'Live pg_proc/pg_trigger catalog queries (2026-08-24) against the engineer project via createDatabaseClient; scripts/modules/handoff/executors/{lead-to-plan,exec-to-plan}/atomic-transitions.js',
      claim: '20 non-trigger RPC functions UPDATE lifecycle columns at trigger depth 1, including the entire fleet claim machinery (claim_sd, release_sd, switch_sd_claim, release_session, set_working_sd, create_or_replace_session, cleanup_stale_sessions). handoff.js\'s own LEAD-TO-PLAN/EXEC-TO-PLAN transitions route through fn_atomic_lead_to_plan_transition/fn_atomic_exec_to_plan_transition (SECURITY DEFINER RPCs), NOT SDRepository.js -- an SDRepository-only stamp would reject handoff.js\'s own writes for these two transitions.',
      reproduction: 'Live pg_proc catalog query cross-checked independently by this session (found 15 of the same functions via a separate, cruder grep-based query -- confirming the finding\'s direction, with the remaining count difference itself evidence that exhaustive enumeration needs systematic PLAN-phase database-agent work, not ad-hoc LEAD-phase grep).'
    },
    {
      verified_by: 'Direct live investigation by this session (2026-08-24), independent of both sub-agents',
      verified_at: 'auto_calculate_progress() function body (pg_get_functiondef), 54 live triggers on strategic_directives_v2 (pg_get_triggerdef), two empirical UPDATE-RETURNING-ROLLBACK probes',
      claim: 'auto_calculate_progress_trigger (BEFORE UPDATE, no WHEN clause, fires on every update) unconditionally attempts NEW.progress_percentage := calculate_sd_progress(NEW.id) whenever the caller does not explicitly set progress_percentage in its own UPDATE. Confirmed this is a genuine DB-side recalculation (not dead code) via direct function-body read; confirmed on a live probe against SD-LEO-INFRA-LEO-LAUNCHER-LIVE-ACTIVATION-CHECKPOINT-3-001 (a real, non-zero-progress, terminal/cancelled SD, chosen specifically to avoid interfering with any actively-claimed SD) that a metadata-only write in a BEGIN/ROLLBACK transaction correctly round-trips progress_percentage (30 before and after) for a row with internally-consistent completion data -- confirming the recalculation is real but idempotent when the underlying data has not drifted, and confirming this SD\'s decision to drop progress/progress_percentage from the protected column set entirely rather than trying to out-order this trigger.',
      reproduction: 'Live SQL: SELECT pg_get_functiondef((SELECT tgfoid FROM pg_trigger WHERE tgname=\'auto_calculate_progress_trigger\' AND tgrelid=\'public.strategic_directives_v2\'::regclass)); plus two BEGIN/UPDATE.../RETURNING/ROLLBACK probes via createDatabaseClient(\'engineer\'), both rolled back cleanly with zero persisted side effects.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);
if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }
console.log('mechanism_verifications recorded for', SD_KEY);
