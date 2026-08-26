// LEAD-phase fixes for SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E, per an independent
// validation-agent review (CONDITIONAL_PASS, confidence 85) of the LEAD self-correction commit.
// Three findings, all applied here:
//  1. `dependencies` was empty despite the description's documented hard dependency on Child A
//     (RPC must exist) and coordination with Child D -- queue tooling (sd:next, AUTO-PROCEED
//     skip/process, worker claim lanes, prio:top3) only reads the structured column, never prose.
//  2. `risks[0].rollback_plan` named the wrong function/file: the new call lives in
//     recordEventHandler (src/routes/events.js), not recordUsageEvent (lib/events/track.js),
//     which is untouched.
//  3. `success_criteria` was unpopulated boilerplate ("[UNPOPULATED]" x3) that didn't encode the
//     done-vs-deferred split the description is careful about, risking an overclaim at a future
//     LEAD-FINAL-APPROVAL under time pressure.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const dependencies = [
  {
    type: 'predecessor',
    sd_id: 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A',
    description: 'fn_submit_venture_usage_event RPC + venture_usage_events schema must exist and be named consistently before this SD\'s dual-write can be live-verified end-to-end (code + mocked-RPC tests do not require this).',
  },
  {
    type: 'coordination',
    sd_id: 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-D',
    description: 'Coordinates on which repo location (lib/ vs src/) the witness call lands in, since venture-stack-scan.js\'s walker only scans src/ -- Child D\'s own PLAN phase must resolve this before its REQUIRED[] entry can match.',
  },
];

const risks = [
  {
    risk: 'A write-only cutover of recordUsageEvent would silently break the live, previously-incident-prone UsageDashboard.jsx read path (GET /api/events -> listUsageEventsForUser -> D1 usage_events)',
    impact: 'HIGH',
    mitigation: 'Dual-write: keep the existing D1 write in recordUsageEvent unchanged, and additionally call the new fn_submit_venture_usage_event RPC from recordEventHandler (src/routes/events.js), never from recordUsageEvent itself. Verify the dashboard still returns non-empty results post-change (TS-8/TS-8b), not just that the new RPC succeeds.',
    probability: 'MEDIUM',
    rollback_plan: 'If the dual-write introduces any regression, remove the forwardUsageEventToSupabase call (and its try/catch block) from recordEventHandler in src/routes/events.js. recordUsageEvent (lib/events/track.js) and UsageDashboard.jsx are untouched by that rollback, since they were never modified, only added to.',
  },
  {
    risk: "AltifyAI's local event_type vocabulary ('page_view'/'conversion_event') does not match Child A's shared venture_usage_events enum, which Child A's own scope text says is ('page_view', 'custom_event') -- verbatim pass-through would make the RPC's CHECK constraint permanently reject every non-page_view event once live, silently defeating this dual-write's purpose for real conversion signal (fail-soft on the HTTP response, but a silent no-op for the data).",
    impact: 'MEDIUM',
    mitigation: "Added an explicit RPC_EVENT_TYPE translation map in lib/events/track.js ('conversion_event' -> 'custom_event'), tested in tests/events-forward.test.js. Documented as a re-verify-once-Child-A-ships item, since Child A has not shipped a PRD or migration yet and could still change this enum.",
    probability: 'MEDIUM',
    rollback_plan: 'If Child A\'s actual shipped enum differs from this mapping, update the RPC_EVENT_TYPE Map in lib/events/track.js to match -- an isolated, single-map change, not a structural rollback.',
  },
];

const success_criteria = [
  {
    criterion: 'lib/events/track.js exports forwardUsageEventToSupabase(input, env, fetchImpl), following forwardFeedbackToSupabase\'s exact fail-soft contract (ok/not_configured/network_error/rejected/server_error), with venture_id and ingest secret sourced ONLY from env, never from input',
    measure: 'tests/events-forward.test.js passes (10/10): outbound payload shape, venture_id spoof resistance, 28000/53400 rejected mapping, network-failure/non-JSON-body/not-configured fail-soft behavior, and the event_type translation (conversion_event -> custom_event)',
  },
  {
    criterion: 'The dual-write call in recordEventHandler (src/routes/events.js) never regresses the pre-existing D1-backed POST /api/events response or the GET /api/events (UsageDashboard.jsx) read path, whether the forward is unconfigured (today\'s real state) or configured-but-failing',
    measure: 'tests/events-route.test.js TS-8 (not-configured no-op) and TS-8b (configured-but-failing) both assert POST still returns 201, the D1 row is still written, and GET /api/events still returns it',
  },
  {
    criterion: 'A documented, actionable runbook exists for a human to provision the live secrets (VENTURE_ID, EHG_ENGINEER_INGEST_SECRET) once Child A\'s RPC ships, correcting this SD\'s own original false premise that this was not fixable within current tooling',
    measure: 'altifyai/docs/usage-event-ingest-secret-provisioning.md exists, cites verified evidence (deploy.yml\'s existing authenticated wrangler access, the Stripe-secret sibling precedent), and documents both a local and CI-based provisioning option',
  },
  {
    criterion: 'EXPLICITLY NOT claimed as met by this SD alone: live signal queryability (the original success_criteria #2, "AltifyAI signals queryable") -- this remains UNMET pending the human/chairman secret-provisioning follow-up and a real end-to-end verification, per this SD\'s own description',
    measure: 'No test in this SD asserts a real Supabase row was written by a live deployed Worker; live verification is deferred, not claimed',
  },
];

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ dependencies, risks, success_criteria })
    .eq('sd_key', SD_KEY);
  if (error) {
    console.error('SD_UPDATE_FAILED', error);
    process.exit(1);
  }
  console.log('SD_VALIDATION_FINDINGS_FIXED');
}

if (isMainModule(import.meta.url)) {
  main();
}
