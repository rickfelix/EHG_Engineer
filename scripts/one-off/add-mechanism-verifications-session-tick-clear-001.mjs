#!/usr/bin/env node
// SD-LEO-INFRA-SESSION-TICK-CLEAR-001 -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier with real file:line citations for mechanism claims about session-tick.cjs,
// capture-session-id.cjs, session-register.cjs, lib/sessions/rotation-closure.cjs.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '7eee0052-1da3-4bfb-9509-a090c52b0d25';

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
        claim: 'lib/sessions/rotation-closure.cjs\'s readTickMarkers() builds its ENTIRE candidate session_id set from currently-existing tick-*.json marker files -- a session_id whose marker was already deleted by a sibling daemon is never even a closure candidate.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'scripts/hooks/session-register.cjs:344',
      },
      {
        claim: 'session-tick.cjs\'s deleteMarker() unconditionally unlinks the shared marker path with no tick_pid===process.pid ownership check, and cleanupAndExit() (wired to SIGINT/SIGTERM/uncaughtException) calls it unconditionally on every daemon exit.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'scripts/session-tick.cjs:528',
      },
      {
        claim: 'cc_parent_pid is NOT a column on claude_sessions -- the DB query only selects session_id,status, and cc_parent_pid is attached post-query purely from the marker-file map, so the marker is currently the ONLY join key with zero DB-native fallback when it is missing.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'scripts/hooks/session-register.cjs:376',
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
