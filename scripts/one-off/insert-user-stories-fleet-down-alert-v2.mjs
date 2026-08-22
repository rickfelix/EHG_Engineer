#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'c7b9020f-d7ee-4b27-b395-272c69f0a1a1';
const SD_KEY = 'SD-LEO-INFRA-FLEET-DOWN-ALERT-001';
const PRD_ID = 'PRD-SD-LEO-INFRA-FLEET-DOWN-ALERT-001';

const stories = [
  {
    n: '001',
    title: 'Recalibrate the shared freeze-detection threshold',
    user_role: 'chairman',
    user_want: 'the fleet-down alarm to page me within minutes of a real freeze instead of ~3 hours later',
    user_benefit: 'I can respond to a genuine fleet outage while it is still actionable, not after the damage window has already passed',
    acceptance_criteria: [
      'FLEET_FREEZE_CUT_MINUTES is recalibrated from a measured false-positive sample (n>=50)',
      'The same value is observed by all 3 call sites (pager, drive-health axis, dashboard)',
      'The regression-latency test shows a materially faster page than the ~166-181min baseline',
    ],
    implementation_context: {
      technical_approach: 'Change FLEET_FREEZE_CUT_MINUTES value (env/config), verified against lib/fleet/genuine-worker.mjs:59-62; add a cross-site consistency test',
      files_to_create: [],
      files_to_modify: ['lib/fleet/genuine-worker.mjs', '.github/workflows or env config for fleet-down-alert-cron.yml'],
      dependencies: ['A larger false-positive sample measurement (script or query) precedes locking the value'],
      estimated_effort: 'small',
    },
  },
  {
    n: '002',
    title: 'Group the dead-man alarm by host so a live host cannot mask a dead one',
    user_role: 'coordinator',
    user_want: 'checkFleetDeadMan to evaluate liveness per-host instead of fleet-wide',
    user_benefit: 'when a cloud pilot introduces a second host, one live host cannot silently hide the other one being fully dead',
    acceptance_criteria: [
      'checkFleetDeadMan groups Leg A/Leg B by claude_sessions.hostname',
      'runnervm*, test-fixture, and NULL hostnames are excluded from grouping',
      'A 2-host fixture produces an isolated verdict per host',
    ],
    implementation_context: {
      technical_approach: 'Add GROUP BY hostname to checkFleetDeadMan (scripts/fleet-down-alert.mjs:381-433) with an exclusion filter (/^runnervm/i, fixture denylist, NULL check)',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-down-alert.mjs'],
      dependencies: ['None -- self-contained within fleet-down-alert.mjs'],
      estimated_effort: 'medium',
    },
  },
  {
    n: '003',
    title: 'Fix the per-host dedup read to match the per-host write',
    user_role: 'coordinator',
    user_want: 'the edge-trigger dedup for the dead-man verdict to read the SAME host it writes',
    user_benefit: 'two hosts cannot scramble each other\'s alarm-transition state, so pages are neither missed nor duplicated across hosts',
    acceptance_criteria: [
      'The system_events read for the prior verdict filters by the same host as the write',
      'A 2-host test proves independent transition tracking',
      'The pre-existing global/single-host test suite still passes',
    ],
    implementation_context: {
      technical_approach: 'Add .eq(\'payload->>host\', host) to recordFleetDeadManVerdict\'s read query (scripts/fleet-down-alert.mjs:348-376), matching the host-qualified write',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-down-alert.mjs'],
      dependencies: ['Story 002 (host-grouping) must land first so a host value exists to scope by'],
      estimated_effort: 'small',
    },
  },
  {
    n: '004',
    title: 'Verify the shared session-fetch limit cannot hide a quiet-dead host',
    user_role: 'coordinator',
    user_want: 'fetchPulseSessions\' shared row limit to not silently drop a quiet-dead host\'s rows behind a noisy live host\'s rows',
    user_benefit: 'the pager chain cannot go blind to an outage purely because another host is generating a lot of session activity',
    acceptance_criteria: [
      'Live concurrent session counts are measured against the current .limit(60)',
      'The limit is raised or the query made host-aware if measurement shows real risk',
      'A 61+-row, 2-host test proves the quiet host\'s row survives',
    ],
    implementation_context: {
      technical_approach: 'Measure via a live count query first; then either raise scripts/fleet-worker-pulse.mjs:44\'s limit or restructure the fetch to be host-aware',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-worker-pulse.mjs'],
      dependencies: ['None -- independently measurable and fixable'],
      estimated_effort: 'small',
    },
  },
  {
    n: '005',
    title: 'Prevent triple-paging for a single-host outage',
    user_role: 'chairman',
    user_want: 'to receive one clear page for a single outage, not three independent pages from three arms',
    user_benefit: 'I can trust the alarm volume as a signal of severity instead of learning to ignore noisy duplicate pages',
    acceptance_criteria: [
      'A documented rule states which arm pages (or how pages are distinguished) when one host-outage trips more than one arm',
      'runAlertArms\' existing per-arm isolation is preserved unchanged',
      'A simulated single-host-down test confirms the actual SMS send count matches the documented rule',
    ],
    implementation_context: {
      technical_approach: 'Add a coordination check inside checkFleetDeadMan\'s send decision (not a change to checkWorkerFleetDown/checkDeadCoordinator or the arm-isolation harness)',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-down-alert.mjs'],
      dependencies: ['Story 002 (per-host verdicts) must exist before a suppression rule can reference them'],
      estimated_effort: 'medium',
    },
  },
  {
    n: '006',
    title: 'Document the corrected division of labor between the two alarm classes',
    user_role: 'future LEO worker',
    user_want: 'clear code comments explaining why checkFleetDeadMan and the freeze/pager chain both exist and are not redundant',
    user_benefit: 'I do not mistakenly delete one arm thinking it duplicates the other, silently losing coverage of a real outage class',
    acceptance_criteria: [
      'checkFleetDeadMan and checkWorkerFleetDown/liveFleetWorkers each carry a docblock cross-referencing the other\'s distinct role',
      'The framing is heartbeat-writer-death vs. clock-frozen-while-present, not "row absence" (corrected from this SD\'s own earlier draft)',
      'No behavioral test changes -- comments only',
    ],
    implementation_context: {
      technical_approach: 'Add/update docblock comments in scripts/fleet-down-alert.mjs and lib/fleet/genuine-worker.mjs',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-down-alert.mjs', 'lib/fleet/genuine-worker.mjs'],
      dependencies: ['Best done last, once the actual implementation stabilizes'],
      estimated_effort: 'small',
    },
  },
];

async function main() {
  const rows = stories.map((s) => ({
    story_key: `${SD_KEY}:US-${s.n}`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: s.title,
    user_role: s.user_role,
    user_want: s.user_want,
    user_benefit: s.user_benefit,
    acceptance_criteria: s.acceptance_criteria,
    implementation_context: s.implementation_context,
    status: 'ready',
    priority: 'high',
  }));

  const { data, error } = await supabase.from('user_stories').insert(rows).select('story_key, status');
  if (error) { console.error('INSERT FAILED:', error.message); process.exit(1); }
  console.log('Inserted', data.length, 'user stories:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
