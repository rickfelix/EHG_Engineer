import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';
const PRD_ID = `PRD-${SD_KEY}`;

async function main() {
  // --- SD success_criteria: rewrite measures to match the shipped enqueue-only, trailing-
  // window, kind-aware-staleness design (VERIFY-phase VALIDATION sub-agent finding, condition
  // 1 -- sub_agent_execution_results id=bdd0b607-4eef-4a3e-b028-dba7e69d0e00).
  const success_criteria = [
    { criterion: '[x] Hourly heartbeat delivered even when the Adam ScheduleWakeup lags past the hour (awake hours)', measure: 'tests/unit/cron/chairman-hourly-heartbeat-backstop-sweep.test.js TS-A / TS-C / TS-H: given no qualifying heartbeat_status/heartbeat_status_backstop row within the trailing LOOKBACK_MS (65min) window, the sweep calls enqueueChairmanSms exactly once with kind=heartbeat_status_backstop.' },
    { criterion: '[x] No double-send when Adam\'s live heartbeat already went out this hour (dedupe verified)', measure: 'tests/unit/cron/chairman-hourly-heartbeat-backstop-sweep.test.js TS-B / TS-E / TS-G / G5: given an existing heartbeat_status or heartbeat_status_backstop row within the trailing window (read-check, not a shared write-time key), zero enqueue calls are made; TS-J\'s 8-tick sustained-outage regression asserts exactly 2 enqueue calls (never 8, the pre-fix duplicate-per-tick defect).' },
    { criterion: '[x] Quiet-hours window respected; no overnight sends; morning flush intact', measure: 'tests/unit/cron/chairman-hourly-heartbeat-backstop-sweep.test.js "SEC-H1 remediation: explicit quiet-hours gate" describe block: an explicit chairman-zone-aware isSmsQuietHour check (not inherited from sendChairmanSMS, which this SD deliberately never calls) is proven reachable (a coarse pre-filter widened to 05:00-22:59, strictly wider than 22:00-06:00, so the check is not shadowed dead code); morning-brief/morning-review sweeps and their existing tests remain unmodified and passing (468 tests across neighboring chairman-comms suites, confirmed at VERIFY phase).' },
    { criterion: '[x] Two-sided control: missed-hour fills one, present-hour no-ops', measure: 'TS-A (missed-hour: exactly one enqueueChairmanSms call) and TS-B/TS-E/TS-G (present-hour: zero enqueue calls) run as a matched pair in the same test file; both hold across the full 8-status decision table (classifyRowCoverage), not just the sent/delivered case.' },
  ];

  const { error: sdErr } = await supabase.from('strategic_directives_v2').update({ success_criteria }).eq('sd_key', SD_KEY);
  if (sdErr) { console.error('SD UPDATE ERROR:', sdErr); process.exit(1); }
  console.log('SD success_criteria updated.');

  // --- PRD FR text: correct the stale calendar-bucket/sendChairmanSMS/06:00-22:00 references
  // and the FR-2b AC that claimed the staleness threshold was shared by both branches (F6 made
  // it live-path-only). FR-4 explicitly de-scoped to the shipped minimal-presence-only shape.
  const { data: prd, error: prdFetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements')
    .eq('id', PRD_ID)
    .single();
  if (prdFetchErr) { console.error('PRD FETCH ERROR:', prdFetchErr); process.exit(1); }

  const frs = prd.functional_requirements.map((fr) => {
    if (fr.id === 'FR-2') {
      return {
        ...fr,
        acceptance_criteria: [
          'Read-check queries the trailing LOOKBACK_MS (65min) window for kind IN (heartbeat_status, heartbeat_status_backstop) -- NOT a fixed calendar-hour bucket (F1 fix)',
          'Present-hour case (a qualifying row within the trailing window) makes zero enqueue calls',
          'Chairman-reply sends (kind=heartbeat_status, not backstop-originated) are never suppressed by this SD\'s logic since the backstop never writes that kind',
        ],
      };
    }
    if (fr.id === 'FR-2b') {
      return {
        ...fr,
        acceptance_criteria: [
          'The STALENESS_GRACE_MS threshold applies ONLY to the LIVE path\'s owed/sending row (a genuinely stuck live send warrants a backstop fill after the grace period)',
          'The backstop\'s OWN prior owed/sending row NEVER expires into unfilled regardless of age (classifyRowCoverage ownKind=true, F6 fix) -- enqueueing is this sweep\'s entire deliverable; a fresh fill still occurs once the trailing LOOKBACK_MS window genuinely ages past the prior attempt, which is correct hourly-SLA coverage, not a duplicate',
        ],
      };
    }
    if (fr.id === 'FR-3') {
      return {
        ...fr,
        acceptance_criteria: [
          'Sweep does not import or duplicate isSmsQuietHour/inQuietHours logic -- it calls the existing implementation directly',
          'The coarse pre-filter (05:00-22:59 chairman-zone) is strictly wider than the quiet-hours boundary (22:00-06:00), so the explicit isSmsQuietHour check is reachable, not shadowed dead code',
          'Existing quiet-hours tests (unaffected) continue to pass',
        ],
      };
    }
    if (fr.id === 'FR-4') {
      return {
        ...fr,
        description: fr.description + ' SHIPPED SCOPE (VERIFY-phase VALIDATION sub-agent finding, sub_agent_execution_results id=bdd0b607-4eef-4a3e-b028-dba7e69d0e00): buildBackstopBody emits a minimal, honest presence line only (tagged with the hourKey for per-hour distinguishability, N2 fix) -- it does NOT read durable state for a "last-known status" line. The never-fabricate-an-all-good half of this FR is fully delivered and tested; the last-hour-delta content half is explicitly DE-SCOPED for this SD (would have required reusing daily-cadence-shaped, Solomon-authority forecast content up to 16x/day from an unattended cron -- the exact risk this SD\'s design otherwise avoids). A richer content builder is a candidate follow-up, not required for this SD\'s SLA-delivery promise.',
      };
    }
    return fr;
  });

  const { error: prdErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: frs }).eq('id', PRD_ID);
  if (prdErr) { console.error('PRD UPDATE ERROR:', prdErr); process.exit(1); }
  console.log('PRD functional_requirements updated.');
}

main();
