#!/usr/bin/env node
// Correct user stories 002/003/004/005 to match the PRD correction (fix-prd-fleet-down-alert-v2.mjs)
// after PLAN-phase prospective TESTING review #2 (3c884934-19b2-47f6-9221-dfbcfa2a13e4).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-FLEET-DOWN-ALERT-001';

const updates = [
  {
    story_key: `${SD_KEY}:US-002`,
    title: 'Add a per-host, heartbeat-only liveness check alongside the existing global dead-man verdict',
    user_want: 'checkFleetDeadMan to gain a NEW per-host, heartbeat-only check (not a combined Leg A+Leg B group-by-host, which would never fire since completions have no per-host attribution)',
    user_benefit: 'when a cloud pilot introduces a second host, one live host cannot silently hide the other one being fully dead -- without breaking the existing global verdict that already protects against a fleet-wide stuck state',
    acceptance_criteria: [
      'A new per-host check reads ONLY heartbeat presence (Leg A), grouped by hostname, and never consults strategic_directives_v2 completions',
      'The existing global evaluateFleetDeadManPredicate (Leg A + Leg B) is unmodified',
      'Hostname eligibility uses a minimum-activity floor, not pattern-matching alone (catches unrecognized one-off hosts like the measured single-row "h" hostname)',
      'A 2-host fixture (one all-stale-heartbeat, one healthy) produces a down-verdict only for the stale host',
    ],
    implementation_context: {
      technical_approach: 'Add a NEW, separate function alongside (not inside) evaluateFleetDeadManPredicate in scripts/fleet-down-alert.mjs, grouped by hostname with a minimum-activity-floor filter; reuse the existing dedupeKey convention for any SMS send',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-down-alert.mjs'],
      dependencies: ['None -- self-contained, additive new code path'],
      estimated_effort: 'medium',
    },
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Export recordFleetDeadManVerdict with host parameter threading and scope its dedup read by host',
    user_want: 'recordFleetDeadManVerdict to accept and be scoped by an explicit host parameter, on both its read and its write',
    user_benefit: 'two hosts cannot scramble each other\'s alarm-transition state, so pages are neither missed nor duplicated across hosts',
    acceptance_criteria: [
      'recordFleetDeadManVerdict is exported and accepts an optional host parameter',
      'The read query filters by host when provided, matching the host-qualified write',
      'A 2-host test (now importable) proves independent transition tracking',
      'Calling with no host argument (the existing global caller) is unaffected',
    ],
    implementation_context: {
      technical_approach: 'Export the function, add the host parameter, thread it from the new per-host check (Story 002) into both the read filter and write payload',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-down-alert.mjs'],
      dependencies: ['Story 002 must land first -- there is no host value to thread until the per-host check exists and calls this function with one'],
      estimated_effort: 'small',
    },
  },
  {
    story_key: `${SD_KEY}:US-004`,
    title: 'Document (not fix) fetchPulseSessions\' shared row limit as currently safe',
    user_want: 'a clear code comment explaining the CORRECT risk direction for fetchPulseSessions\' shared .limit(60) and today\'s measured safety margin',
    user_benefit: 'future maintainers understand this is a monitored, currently-non-issue rather than assuming (incorrectly) that it hides dead hosts',
    acceptance_criteria: [
      'A comment documents the corrected risk direction (crowd-out of a live host by another live host, not truncation of an already-filtered dead host)',
      'The comment cites the measured safety margin (11 concurrent sessions vs. limit 60, 60th-newest row ~21 days old)',
      'No behavior change is made without new evidence of risk',
    ],
    implementation_context: {
      technical_approach: 'Add a docblock comment at scripts/fleet-worker-pulse.mjs:44; no functional change',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-worker-pulse.mjs'],
      dependencies: ['None'],
      estimated_effort: 'small',
    },
  },
  {
    story_key: `${SD_KEY}:US-005`,
    title: 'Correct the checkFleetDeadMan/freeze-chain division-of-labor documentation, including the email-vs-SMS channel distinction',
    user_want: 'code comments that correctly state checkFleetDeadMan/the new per-host check are heartbeat-writer/host-death signals, the freeze/pager chain is the clock-frozen-while-present signal, and checkWorkerFleetDown sends email (not SMS)',
    user_benefit: 'a future worker does not assume a nonexistent triple-SMS-paging risk (the original framing of this story, corrected: checkWorkerFleetDown sends email via Resend, never SMS)',
    acceptance_criteria: [
      'Docblock comments state the corrected division of labor and cross-reference each other by function name',
      'The comment explicitly notes checkWorkerFleetDown\'s email-only delivery channel',
      'No behavioral test changes -- comments only',
    ],
    implementation_context: {
      technical_approach: 'Add/update docblock comments in scripts/fleet-down-alert.mjs and lib/fleet/genuine-worker.mjs',
      files_to_create: [],
      files_to_modify: ['scripts/fleet-down-alert.mjs', 'lib/fleet/genuine-worker.mjs'],
      dependencies: ['Best done last, once Stories 002/003 stabilize'],
      estimated_effort: 'small',
    },
  },
];

async function main() {
  for (const u of updates) {
    const { story_key, ...patch } = u;
    const { data, error } = await supabase.from('user_stories').update(patch).eq('story_key', story_key).select('story_key').single();
    if (error) { console.error(`UPDATE FAILED for ${story_key}:`, error.message); process.exit(1); }
    console.log('Updated', data.story_key);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
