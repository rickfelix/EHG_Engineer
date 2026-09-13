#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001's spine, which names 3 file mechanisms
 * (lib/eva/uat-robustness-gate.js, lib/chairman/sms-outbound-worker.js,
 * database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql).
 * The Explore + VALIDATION + RISK sub-agents' own genuine, live-verified investigation
 * is the verifier.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001';

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
      verified_by: 'sub_agent_execution_results:00facc95-51d9-4b07-86e1-bfbca4730296 (Explore, phase=LEAD)',
      verified_at: 'lib/eva/uat-robustness-gate.js:141-145 (if (!run.metadata?.control_pack_evaluated) keys the stage-23 acceptance predicate on the boolean, per a QF-20260830-666 comment at line 142)',
      claim: 'This reader was already DELIBERATELY changed by QF-20260830-666 to key on the boolean control_pack_evaluated rather than absence-of-failures -- this SD\'s scope item (3), which wants readers to key on the detail (control_pack_failures) instead, must design a genuine reconciliation with that prior fix, not a blind revert.',
      reproduction: 'Direct source read of lib/eva/uat-robustness-gate.js lines 134-155.'
    },
    {
      verified_by: 'sub_agent_execution_results:00facc95-51d9-4b07-86e1-bfbca4730296 (Explore, phase=LEAD); sub_agent_execution_results:594115a9-a49c-4a0c-b1af-68f62c38676a (RISK, phase=LEAD)',
      verified_at: 'lib/chairman/sms-outbound-worker.js:825-831 (claims a row via status=sending before any provider receipt exists), :92 and :654-663 (QF-20260912-394\'s already-merged terminal-carrier-error-code fast path)',
      claim: 'sms_outbound_obligations is a live worker CLAIM QUEUE, not a passive record table. A receipt-derived trigger on .status risks overwriting an in-flight status=sending claim, causing the sweep to re-claim and re-send -- an unbounded resend loop against a real phone number, amplifying rather than closing the QF-394 class this SD exists to fix. Part of instance 3\'s remedy (terminal carrier-code handling) is already shipped via QF-20260912-394; PRD must re-verify what remains before designing new reader/trigger changes here.',
      reproduction: 'Direct source read of the claim and terminal-transition call sites; cross-checked against the merged QF-20260912-394 commit (88b8277bdb7, PR #8807).'
    },
    {
      verified_by: 'sub_agent_execution_results:00facc95-51d9-4b07-86e1-bfbca4730296 (Explore, phase=LEAD); sub_agent_execution_results:594115a9-a49c-4a0c-b1af-68f62c38676a (RISK, phase=LEAD)',
      verified_at: 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql:21-35 (path correction: chairman-gated/, not migrations/ as the SD spine states)',
      claim: 'strategic_directives_v2 (instance 1\'s home table for fence_status_2026_08_17) is documented in-repo as trigger-hazardous: CREATE TRIGGER takes ACCESS EXCLUSIVE (blocks reads too), service_role/postgres have no lock_timeout configured, seq_scan=377,874 measured. Any new trigger for this SD\'s instance 1 must include the same SET lock_timeout=\'3s\' mitigation this migration already documents, and must account for >=8 existing triggers firing in alphabetical name order (a BEFORE trigger returning NULL silently cancels the write -- the real bug mode, not infinite recursion).',
      reproduction: 'Direct source read of the migration file\'s header/comment block.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);
if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }
console.log('mechanism_verifications recorded for', SD_KEY);
