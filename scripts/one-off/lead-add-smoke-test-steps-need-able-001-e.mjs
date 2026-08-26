import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const smoke_test_steps = [
  {
    instruction: 'Run `npx vitest run tests/events-forward.test.js` in the altifyai worktree',
    expected_outcome: 'All 10 tests pass, including outbound RPC payload shape, venture_id spoof resistance, event_type translation (conversion_event -> custom_event), 28000/53400 rejected mapping, and not_configured/network_error fail-soft behavior',
  },
  {
    instruction: 'Run `npx vitest run tests/events-route.test.js` in the altifyai worktree',
    expected_outcome: 'TS-8 (forward not configured is a complete no-op) and TS-8b (forward configured but failing) both pass, proving POST /api/events still returns 201, the D1 row is still written, and GET /api/events still returns it',
  },
  {
    instruction: 'POST a valid event body to /api/events with a Bearer token, using the stub-D1 test harness and env WITHOUT the forward secrets configured (matching production today)',
    expected_outcome: 'Returns 201 with an id/createdAt, and fetch is never called (forwardUsageEventToSupabase short-circuits on not_configured)',
  },
  {
    instruction: 'Read `docs/usage-event-ingest-secret-provisioning.md` in the altifyai repo',
    expected_outcome: 'Documents both a local `wrangler secret put` option and a one-shot CI workflow option for provisioning VENTURE_ID/EHG_ENGINEER_INGEST_SECRET, citing verified evidence from deploy.yml rather than the SD\'s original (now-corrected) false premise',
  },
];

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps })
    .eq('sd_key', SD_KEY);
  if (error) {
    console.error('SD_UPDATE_FAILED', error);
    process.exit(1);
  }
  console.log('SMOKE_TEST_STEPS_ADDED');
}

if (isMainModule(import.meta.url)) {
  main();
}
