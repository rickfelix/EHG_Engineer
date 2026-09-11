import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001';

/**
 * G3 activation evidence for the INVOCATION_PATH_PROOF gate. This SD's fix (stampInboxReadAt,
 * merged in PRs #8518 and #8520) was verified as a REAL, live invocation, not merely
 * merged-and-untested: ran `node scripts/fleet-dashboard.cjs inbox --coordinator` against
 * production from a worktree confirmed byte-identical to origin/main (git diff origin/main --
 * empty for both touched files), and it genuinely stamped session_coordination row
 * 3656ba99-567b-4fdf-83f2-548d30d0172a (a real worker_signal row, sender Golf-3, created
 * 2026-09-07T16:47:26Z) with read_at=2026-09-07T16:49:52.92Z via the fixed, idempotent
 * stampInboxReadAt() path inside printInbox().
 */
async function main() {
  const { data: sd, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  const { data, error } = await supabase
    .from('scope_completion_chain')
    .insert({
      entity_type: 'sd',
      entity_id: sd.id,
      actual_phase: 'LEAD_FINAL',
      chain_status: 'completed',
      runtime_observed_at: '2026-09-07T16:49:52.920Z',
      evidence_kind: 'real_event',
      real_event_ref: JSON.stringify({
        session_coordination_row_id: '3656ba99-567b-4fdf-83f2-548d30d0172a',
        write_site: 'scripts/fleet-dashboard.cjs printInbox() -> stampInboxReadAt()',
        invocation: 'node scripts/fleet-dashboard.cjs inbox --coordinator',
        merged_prs: ['#8518', '#8520'],
        verified_worktree_matches_main: true,
      }),
    })
    .select('id');
  if (error) { console.error('INSERT FAILED:', error.message); process.exit(1); }
  console.log('scope_completion_chain row inserted:', data[0].id);
}

if (isMainModule(import.meta.url)) {
  main();
}
