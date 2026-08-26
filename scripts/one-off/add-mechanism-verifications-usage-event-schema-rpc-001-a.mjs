#!/usr/bin/env node
// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier with real file:line citations for the mechanism claims in the SD scope about
// lib/eva/stage-artifact-precondition.js and lib/eva/utils/validate-venture-default-capabilities.js.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';

async function run() {
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
        claim: "checkStageArtifactPrecondition() reads venture_stages.required_artifacts generically (no hardcoded artifact-type list) and joins on stage_number, not stage_key -- confirming both that appending a new artifact_type is data-only (no code edit needed) and that a pending stage-renumbering SD makes stage_number=23 an unsafe key to migrate against.",
        verified_by: 'validation-agent (row 668e925c-13dd-4ad0-bf8f-edf25610092b)',
        verified_at: 'lib/eva/stage-artifact-precondition.js:53',
      },
      {
        claim: 'checkStageArtifactPrecondition() falls back to venture_artifacts current-row lookup and treats a deviation-ledger record as an intentional documented skip rather than a hard block.',
        verified_by: 'Explore (LEAD-TO-PLAN discovery pass)',
        verified_at: 'lib/eva/stage-artifact-precondition.js:85',
      },
      {
        claim: "WIRED_CAPABILITY_FEEDBACK_TYPES only covers 'feedback-widget' and 'error-capture-middleware' -- telemetry-analytics has no wired-verification signal today, confirming the parent SD's stated gap.",
        verified_by: 'Explore (LEAD-TO-PLAN discovery pass)',
        verified_at: 'lib/eva/utils/validate-venture-default-capabilities.js:115',
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
