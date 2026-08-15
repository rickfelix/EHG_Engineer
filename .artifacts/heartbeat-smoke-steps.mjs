import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';

async function main() {
  const smoke_test_steps = [
    {
      step_number: 1,
      instruction: 'Manually invoke the backstop sweep once with a mocked/stubbed Supabase client showing no heartbeat_status or heartbeat_status_backstop row created within the current chairman-zone hour (node scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs --once, or run its unit test suite).',
      expected_outcome: 'The sweep calls sendChairmanSMS exactly once with kind=heartbeat_status_backstop and a backstop-tagged content line -- demonstrating the missed-hour fill (this is the 30-second demo that proves the SD delivers value: an hourly SLA that no longer silently breaks when the local Adam machine loses power).',
    },
    {
      step_number: 2,
      instruction: 'Re-run the same sweep invocation, this time with the stub showing an existing heartbeat_status row already created within the current chairman-zone hour.',
      expected_outcome: 'The sweep makes zero send calls (present-hour no-op) -- demonstrating no double-send against a live heartbeat.',
    },
    {
      step_number: 3,
      instruction: 'Run the FR-5 unit test file (tests/unit/cron/chairman-hourly-heartbeat-backstop-sweep.test.js).',
      expected_outcome: 'Both the missed-hour-fills-once and present-hour-no-ops tests pass as a matched pair, and the full existing chairman-comms test suite (morning-brief, morning-review, sms-bridge, chairman-sms-gate, enqueue-is-not-sent) continues to pass unchanged.',
    },
  ];

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();

  if (error) {
    console.error('UPDATE ERROR:', error);
    process.exit(1);
  }
  console.log('Updated smoke_test_steps:', JSON.stringify(data, null, 2));
}

main();
