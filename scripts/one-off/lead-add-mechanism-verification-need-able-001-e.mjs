// GATE_MECHANISM_CLAIM_VERIFIER fix for SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E: the SD's
// description names altifyai/lib/events/track.js as a mechanism (recordUsageEvent's D1 write,
// dual-write target). This SD's own EXEC work already read and modified that exact file directly
// (in the isolated altifyai worktree), and an independent Explore sub-agent pass re-verified it
// (sub_agent_execution_results id a6d1db2a-be22-4c46-9666-2c884b3d9af1, LEAD_TO_PLAN, PASS) --
// this records that verification in the format the gate reads.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr || !sd) {
    console.error('SD_FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  const metadata = {
    ...sd.metadata,
    mechanism_verifications: [
      {
        verified_by: 'LEAD phase direct file read + independent EXPLORE sub-agent re-verification (sub_agent_execution_results id a6d1db2a-be22-4c46-9666-2c884b3d9af1)',
        verified_at: 'altifyai/lib/events/track.js:173',
        note: 'recordUsageEvent(db, input) confirmed as the existing D1-write function (untouched by this SD -- the dual-write forward call was added in recordEventHandler, src/routes/events.js, not here). Verified in the isolated altifyai worktree at C:\\Users\\rickf\\Projects\\_EHG\\altifyai\\.worktrees\\SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E, branch feat/SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E.',
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) {
    console.error('SD_UPDATE_FAILED', updateErr);
    process.exit(1);
  }
  console.log('MECHANISM_VERIFICATION_ADDED');
}

if (isMainModule(import.meta.url)) {
  main();
}
