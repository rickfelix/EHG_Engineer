/**
 * One-shot loop_registry registration for the governance-situation loop
 * (SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001 FR-5). Data INSERT, no DDL.
 *
 * Closure predicate: every captured situation reaches verified-or-escalated
 * within 14 days — evidenced by the situation ledger's freshness edge (the most
 * recent capture/disposition write). Gated through assertLoopRegistrationHasPredicate
 * (FR-4 of the loop-governance spine) so the governor can never enroll a loop
 * without a machine-checkable probe. The existing verifier surfaces stalls as
 * OPEN/STARVED — no new watcher.
 *
 * Usage: node scripts/governance/register-governance-situation-loop.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { assertLoopRegistrationHasPredicate } from '../../lib/loop-governance/governance.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const LOOP_ROW = {
  loop_key: 'GOVERNANCE-SITUATION-LOOP',
  display_name: 'Governance-situation continuous-learning loop: capture (issue_patterns convention) -> adjudicate (Solomon consult lane) -> harden (probe-registry INSERT) -> GT-verify (shadow-trial sealed replay) -> watch recurrence (auto-reopen). The governor watches the governor-improver.',
  trigger: 'A governance situation is captured (chairman_correction | near_miss | adherence_drift | decision_retro) as an issue_patterns row with category=governance_situation',
  closure_edge: 'The captured situation reaches verified-or-escalated: hardening_ref set + replay-caught, or escalated to re-adjudication — within 14 days',
  constituent_operators: ['governance-situation-loop', 'solomon-consult-lane', 'shadow-trial-replay', 'probe-runner'],
  predicate_type: 'edge_freshness',
  closure_predicate: {
    window_seconds: 14 * 86400,
    // Evidence provenance (maker/checker separation): only the capture/disposition
    // path writes the ledger edge; the verifier merely reads it.
    authorized_writer: 'governance-situation-loop',
  },
};

async function main() {
  const gate = assertLoopRegistrationHasPredicate(LOOP_ROW);
  if (!gate.ok) {
    console.error(`Fatal: ${gate.reason}`);
    process.exit(1);
  }
  const { data, error } = await supabase
    .from('loop_registry')
    .upsert(LOOP_ROW, { onConflict: 'loop_key' })
    .select('id, loop_key, status')
    .single();
  if (error) {
    console.error(`Fatal: loop_registry upsert failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Registered ${data.loop_key} (id ${data.id}, status ${data.status || 'unknown'}) — predicate gate: ${gate.reason}`);
}

main();
