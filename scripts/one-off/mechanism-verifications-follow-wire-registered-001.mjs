import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001';

// GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications as an ARRAY of
// { verified_by, verified_at: "path/to/file.js:LINE" } records -- distinct from the narrative
// object already stored under this same key by the round-1/round-2 scope corrections. Each
// line below was read directly (not assumed) to confirm it is the genuine unstamped write site
// named in the SD spine's key_changes text.
const VERIFICATIONS = [
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'lib/sd-park.js:90' },
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'scripts/stale-session-sweep.cjs:709' },
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'lib/sd/revert.js:91' },
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'lib/fleet/release-work-item.mjs:295' },
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'lib/eva/bridge/reap-orphaned-provisioning.js:82' },
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'lib/eva/lifecycle-sd-bridge.js:1324' },
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'lib/utils/orchestrator-child-completion.js:216' },
  { verified_by: 'LEAD (Explore-dispatched premise verification)', verified_at: 'scripts/modules/shipping/SDGitStateReconciler.js:424' },
  { verified_by: 'VALIDATION (evidence d041e68a)', verified_at: 'scripts/handoff.js:13' },
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: sd, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();

  if (fetchError) throw fetchError;

  const updatedMetadata = {
    ...sd.metadata,
    // GATE_MECHANISM_CLAIM_VERIFIER's findVerifiers() requires this exact key to be an array;
    // the narrative object from prior corrections is preserved under a distinct key.
    mechanism_verifications_narrative: sd.metadata.mechanism_verifications,
    mechanism_verifications: VERIFICATIONS,
  };

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: updatedMetadata })
    .eq('sd_key', SD_KEY);

  if (updateError) throw updateError;

  console.log(`mechanism_verifications array written for ${SD_KEY}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
