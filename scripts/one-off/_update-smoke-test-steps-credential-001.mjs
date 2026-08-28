import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: "Query chairman_decisions for id a94f88c8-bf97-4c04-a11a-084817cdc185 and read its status column.",
    expected_outcome: "status is either 'pending' (decision still open, this SD stays deferred) or 'approved'/'answered' with a recorded answer to the Private-vs-Unlisted question.",
  },
  {
    step_number: 2,
    instruction: "Once answered YES (Unlisted): trigger a workflow_dispatch run of eva-idea-sync-cron.yml and check the YouTube step's log output for an item count, not just a green exit code.",
    expected_outcome: "The log shows a real playlist pull (N items fetched via RSS/API-key), with zero references to OAuth/oauth-manager.js in the call path.",
  },
  {
    step_number: 3,
    instruction: "Query eva_youtube_intake row count before and after the same workflow_dispatch run.",
    expected_outcome: "Row count increases by the number of new videos in the playlist since last sync -- proving a real data pull, not merely a successful exit code (mirrors the sibling workflow's known false-green failure mode).",
  },
];

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001')
  .maybeSingle();

if (fetchErr || !sd) { console.log('FETCH_FAILED', fetchErr?.message); process.exit(1); }

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps: smokeTestSteps })
  .eq('id', sd.id)
  .select('id');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
