#!/usr/bin/env node
// SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001 -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier for file-path mechanism claims. Citing the LEAD-phase VALIDATION + Explore
// investigation of scripts/apply-chairman-decision-captures.mjs's category-widening,
// resolve-shape, and scheduling-probe mechanisms.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001';

async function run() {
  const supabase = createSupabaseServiceClient();
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    mechanism_verifications: [
      ...(current.metadata?.mechanism_verifications || []),
      {
        claim: 'CATEGORIES widened to [chairman_decision_capture, chairman_ruling_capture] and queried via .in(), confirmed present in merged main (PR #8074).',
        verified_by: 'VALIDATION (LEAD-TO-PLAN evidence)',
        verified_at: 'scripts/apply-chairman-decision-captures.mjs:42',
      },
      {
        claim: 'RPC-applied resolve routes through the canonical resolveFeedback() helper (resolution_notes populated), replacing the CHECK-constraint-violating bare update.',
        verified_by: 'VALIDATION (LEAD-TO-PLAN evidence)',
        verified_at: 'scripts/apply-chairman-decision-captures.mjs:153',
      },
      {
        claim: 'isFixApplied() originally called createDatabaseClient() (needs SUPABASE_DB_PASSWORD/EHG_DB_PASSWORD, which no *cron*.yml in this repo injects), which would have permanently reported FR-1 UNKNOWN on the new scheduled workflow and blocked every RPC capture. Fixed to route through the exec_sql RPC on the existing supabase-js client, matching the pooler-fallback pattern already used in scripts/audit-rpc-execute-grants.mjs.',
        verified_by: 'VALIDATION (LEAD-TO-PLAN evidence, follow-up commit)',
        verified_at: 'scripts/apply-chairman-decision-captures.mjs:56',
      },
      {
        claim: 'fn_chairman_decide (FR-1, database/chairman-gated/20260803_chairman_decide_null_safe_and_type_honest.sql) is live in the database -- verified directly against pg_proc, not assumed from the script comment.',
        verified_by: 'Explore (LEAD-TO-PLAN evidence)',
        verified_at: 'scripts/apply-chairman-decision-captures.mjs:56',
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMetadata })
    .eq('id', current.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
  console.log('mechanism_verifications added.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
