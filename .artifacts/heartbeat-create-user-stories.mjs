import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';
const PRD_ID = `PRD-${SD_KEY}`;

async function main() {
  const { data: sd } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();

  const stories = [
    {
      story_key: `${SD_KEY}:US-001`,
      prd_id: PRD_ID,
      sd_id: sd.id,
      title: 'A missed hourly heartbeat is filled by a cloud-side backstop',
      user_role: 'chairman receiving Adam\'s hourly SMS status heartbeat',
      user_want: 'the hourly heartbeat to still arrive when Adam\'s local session/machine is unavailable (e.g. a hotel room power cut)',
      user_benefit: 'the hourly SLA no longer breaks silently, closing the D8 (interface_clarity) N=3 self-score escalation',
      priority: 'high',
      status: 'ready',
      acceptance_criteria: [
        'Given no heartbeat_status or heartbeat_status_backstop obligation exists for the current chairman-zone hour, when the backstop sweep runs, then it sends exactly one heartbeat via sendChairmanSMS with kind=heartbeat_status_backstop',
        'A failed backstop attempt earlier in the same hour is retried on a later self-healing tick (not treated as permanently satisfied)',
      ],
      implementation_context: JSON.stringify({
        affected_files: ['.github/workflows/chairman-hourly-heartbeat-backstop-cron.yml', 'scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs'],
        test_approach: 'DI-stub unit test asserting sendChairmanSMS call count, mirroring tests/unit/cron/chairman-morning-brief-sweep.test.js',
        dependencies: [],
      }),
    },
    {
      story_key: `${SD_KEY}:US-002`,
      prd_id: PRD_ID,
      sd_id: sd.id,
      title: 'The backstop never double-sends against a live heartbeat',
      user_role: 'chairman receiving Adam\'s hourly SMS status heartbeat',
      user_want: 'the backstop to stay silent whenever the live path (or a chairman reply, or a prior backstop fill) already sent something this hour',
      user_benefit: 'no duplicate/spam SMS traffic and no suppression of legitimate multi-send hours (chairman replies)',
      priority: 'high',
      status: 'ready',
      acceptance_criteria: [
        'Given a heartbeat_status row already exists for the current chairman-zone hour, when the backstop sweep runs, then it makes zero send calls',
        'Given a heartbeat_status_backstop row with status IN (sent, delivered) already exists for the current hour, when the backstop sweep runs, then it makes zero send calls',
        'The backstop never writes or reads a dedupe key/kind shared with the live heartbeat path',
      ],
      implementation_context: JSON.stringify({
        affected_files: ['scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs'],
        test_approach: 'DI-stub unit test with a present-hour fixture asserting zero send calls',
        dependencies: [],
      }),
    },
  ];

  const { data, error } = await supabase.from('user_stories').insert(stories).select('story_key,status');
  if (error) {
    console.error('INSERT ERROR:', error);
    process.exit(1);
  }
  console.log('Created:', JSON.stringify(data, null, 2));
}

main();
