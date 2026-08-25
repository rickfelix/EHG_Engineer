#!/usr/bin/env node
// SD-LEO-INFRA-STAGE-GATE-RETRY-001 -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier with real file:line citations for mechanism claims about
// lib/eva/stage-execution-worker.js and lib/eva/eva-orchestrator.js.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8077da1b-7888-4a91-aba8-bfe459e61334';

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
        claim: 'No automatic retry ceiling/backoff exists on the stage-processing poll loop -- _tick/_processVenture run on a fixed setInterval cadence with no per-venture attempt-count gate.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'lib/eva/stage-execution-worker.js:261',
      },
      {
        claim: 'The only kill-switch against repeated re-evaluation is a MANUAL, binary metadata.gating_decision.parked flag checked at the top of _processVenture -- not a systemic bounded-retry mechanism.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'lib/eva/stage-execution-worker.js:610',
      },
      {
        claim: '_handleChairmanGate resolves a chairman_decisions row (via createOrReusePendingDecision/waitForDecision) but no evidence found that a resolved override durably marks the underlying gate as terminal/satisfied for future poll cycles.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'lib/eva/stage-execution-worker.js:2407',
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
