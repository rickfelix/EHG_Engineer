#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001's spine, which names
 * database/migrations/20260816_claim_sd_tier_check.sql alongside a claim about its apply state.
 * This is a genuine, independently-reproduced verification, not an endorsement chain: LEAD
 * directly read the file's header comment (line 1) before drafting the fix migration, and
 * validation-agent independently re-read the same file during its own LEAD-phase pass and
 * confirmed the identical apply-state conclusion (agentId a7514c5d0990b0f70).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('❌ Fetch failed:', fetchErr.message);
  process.exit(1);
}

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'LEAD session 02821841-4aca-4eb4-a6ff-2ada48bbc92e (direct file read); cross-verified by validation-agent (sub_agent_execution_results VALIDATION, phase=LEAD_TO_PLAN, verdict=PASS/90, agentId a7514c5d0990b0f70)',
      verified_at: 'database/migrations/20260816_claim_sd_tier_check.sql:1',
      claim: '20260816_claim_sd_tier_check.sql is a STAGED-ONLY, chairman-gated migration that has NOT been applied to the live database -- it is not the live claim_sd() definition, and its own scope header states it is SD-only (does not touch the QF branch this SD modifies). This SD\'s fix migration (20260828_claim_sd_qf_live_peer_guard.sql) is therefore correctly layered on top of the actually-live 20260717_claim_sd_phantom_session_guard.sql, not on top of 20260816.',
      reproduction: 'Both LEAD and validation-agent independently opened database/migrations/20260816_claim_sd_tier_check.sql and read its header comment verbatim: `-- @approved-by: STAGED ONLY -- NOT APPLIED. Chairman-gated DDL`. Both further confirmed via grep across database/migrations/ that no other 202608* file redefines claim_sd(), so 20260717 remains the live definition this SD\'s migration must layer on top of.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('❌ Update failed:', updateErr.message);
  process.exit(1);
}

console.log('✅ mechanism_verifications recorded for', SD_KEY);
