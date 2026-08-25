#!/usr/bin/env node
// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier with real file:line citations for the mechanism claims in the SD spine about
// Stage22DistributionSetup.tsx, Stage21VisualAssets.tsx, 20260607_swap_stage_21_22_full_content.sql,
// and 20260322_stage_renumbering_blueprint_review.sql (the corrected citation this SD's own LEAD
// Explore pass fixed -- see sub_agent_execution_results id dc5c27b7-f8d9-4b8b-ab92-93367321063e).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '97447674-35bb-4af1-ba65-089f76beee08';

async function run() {
  const supabase = createSupabaseServiceClient();
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_UUID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    mechanism_verifications: [
      ...(current.metadata?.mechanism_verifications || []),
      {
        claim: '20260607_swap_stage_21_22_full_content.sql asserts (POST-SWAP FAILED preflight) that stage_number=21 must carry component_path=\'Stage22DistributionSetup.tsx\' after the swap -- this is the live negative-control mismatch the census instrument must detect.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'database/migrations/20260607_swap_stage_21_22_full_content.sql:126',
      },
      {
        claim: 'The same migration asserts (POST-SWAP FAILED preflight) that stage_number=22 must carry component_path=\'Stage21VisualAssets.tsx\' after the swap -- the second half of the negative-control pair.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'database/migrations/20260607_swap_stage_21_22_full_content.sql:139',
      },
      {
        claim: '20260322_stage_renumbering_blueprint_review.sql shifts lifecycle_stage_config.stage_number rows (17-25 -> 18-26) -- it never touches venture_stages or component_path, so it is NOT the cause of the stage 21/22 negative control (the SD description originally cited it in error; corrected this LEAD pass).',
        verified_by: 'Explore (premise verification)',
        verified_at: 'database/migrations/20260322_stage_renumbering_blueprint_review.sql:26',
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMetadata })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
  console.log('mechanism_verifications added.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
