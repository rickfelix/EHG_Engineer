#!/usr/bin/env node
// SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier with real file:line citations for the mechanism claims in the spine about
// lib/sub-agents/testing/phases/phase3-execution.js, scripts/execute-subagent.js,
// lib/sub-agents/testing/index.js.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '0cc08da3-c137-4a8e-8d60-2f688026bf62';

const NEW_VERIFICATIONS = [
  {
    claim: 'DEFAULT_E2E_TIMEOUT_MS is a hardcoded 30-minute ceiling with no CLI-reachable override -- the exact mechanism this SD plumbs a flag through.',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'lib/sub-agents/testing/phases/phase3-execution.js:22',
  },
  {
    claim: 'phase3-execution.js already reads options.e2e_timeout_ms as an override with DEFAULT_E2E_TIMEOUT_MS as fallback -- the receiving end already exists, only the CLI-to-options plumbing is missing.',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'lib/sub-agents/testing/phases/phase3-execution.js:185',
  },
  {
    claim: 'scripts/execute-subagent.js exposes --full-e2e as a boolean flag but has no --e2e-timeout-ms (or any e2e_timeout_ms-forwarding) flag anywhere in its CLI surface -- confirmed by grepping the full file for e2e_timeout_ms/e2e-timeout, zero matches outside --full-e2e.',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'scripts/execute-subagent.js:88',
  },
];

async function run() {
  const supabase = createSupabaseServiceClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: current, error: fetchErr } = await supabase
      .from('strategic_directives_v2')
      .select('metadata, updated_at')
      .eq('id', SD_UUID)
      .single();
    if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

    const newMetadata = {
      ...current.metadata,
      mechanism_verifications: [
        ...(current.metadata?.mechanism_verifications || []),
        ...NEW_VERIFICATIONS,
      ],
    };

    const { data: updated, error: updateErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: newMetadata })
      .eq('id', SD_UUID)
      .eq('updated_at', current.updated_at)
      .select('id');
    if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
    if (updated && updated.length > 0) {
      console.log('mechanism_verifications added.');
      return;
    }
    console.log(`   [CAS] updated_at changed since read (attempt ${attempt + 1}/5) -- retrying`);
  }
  throw new Error('CAS retries exhausted -- another writer keeps winning the race');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
