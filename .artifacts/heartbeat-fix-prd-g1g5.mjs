import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';

async function main() {
  const { data: existing, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements,test_scenarios,acceptance_criteria,metadata')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) { console.error('FETCH ERROR:', fetchErr); process.exit(1); }

  const frs = existing.functional_requirements.map((fr) => {
    if (fr.id === 'FR-2') {
      return {
        ...fr,
        description: 'Status-decision read-check dedupe (revised per PLAN-phase TESTING sub-agent finding G1: a naive "any row exists this hour" check would treat a stuck owed row -- enqueued but never delivered -- as filled, silently defeating the backstop in exactly the failure mode it exists to prevent). Query sms_outbound_obligations for the MOST RECENT row per kind (heartbeat_status, heartbeat_status_backstop) created within the current chairman-zone hour, and classify hour coverage via an explicit status-decision table over ALL 8 statuses in the DDL CHECK (owed, sending, sent, delivered, undelivered, failed, canceled, owed_escalate): sent/delivered -> FILLED (no send); owed/sending AND younger than the grace floor -> IN_FLIGHT (wait, do not send this tick -- gives the live path right of first refusal per G10); owed/sending AND older than the grace floor, OR failed/undelivered (any age) -> UNFILLED (send); canceled/owed_escalate -> DO NOT RETRY (treat as human/escalation-machinery-handled, no backstop send this hour). This is deliberately NOT a shared write-time dedupe key with the live path.',
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'A live heartbeat_status row with status=owed (enqueued but not yet/never dispatched) does NOT count as filled -- the backstop still evaluates it via the grace-floor/staleness rule, not via mere row existence',
          'A row with status IN (canceled, owed_escalate) is never retried by the backstop (escalation-machinery already handling it)',
        ],
      };
    }
    if (fr.id === 'FR-2b') {
      return {
        ...fr,
        description: 'Retry-by-status, resolved as part of FR-2\'s status-decision table (not a separate second read) per PLAN-phase TESTING sub-agent finding G2/G4 (dedupe-key-vs-retry tension): each backstop send attempt uses a fresh, attempt-suffixed dedupeKey (e.g. heartbeat_status_backstop:<zone>:<hour>:<attemptN>) so a retry is never blocked by an UPSERT-ignoreDuplicates collision on a prior failed attempt\'s exact key; "how many attempts / what happened" is determined by the FR-2 read-check (latest row for the hour+kind, by created_at), not by key matching. The grace-floor/staleness threshold is applied consistently to both the live path\'s stuck-owed case and the backstop\'s own failed-retry case (same constant, one decision table).',
        acceptance_criteria: [
          'Retry attempts never collide on dedupe_key with a prior attempt in the same hour (each attempt has a distinct key)',
          'The staleness/grace-floor threshold is a single named constant used for both the live-owed-stuck case and the backstop-failed-retry case',
        ],
      };
    }
    return fr;
  });

  const test_scenarios = [
    'Missed-hour (no prior row for the current chairman-zone hour, any kind) -> UNFILLED -> sendChairmanSMS called exactly once with kind=heartbeat_status_backstop.',
    'Present-hour, live delivered (heartbeat_status row, status=delivered, this hour) -> FILLED -> zero send calls.',
    'Present-hour, live sent (heartbeat_status row, status=sent, this hour) -> FILLED -> zero send calls.',
    'Present-hour, live stuck-owed WITHIN the grace floor (heartbeat_status row, status=owed, created <grace-floor-minutes ago) -> IN_FLIGHT -> zero send calls this tick (right of first refusal).',
    'Present-hour, live stuck-owed PAST the grace floor (heartbeat_status row, status=owed, created >grace-floor-minutes ago, still no sent/delivered) -> UNFILLED -> sendChairmanSMS called exactly once (this is the G1 fix: mere row existence must not suppress the backstop).',
    'Present-hour, live failed (heartbeat_status row, status=failed, this hour) -> UNFILLED -> sendChairmanSMS called exactly once.',
    'Present-hour, live canceled/owed_escalate (heartbeat_status row, this hour) -> DO NOT RETRY -> zero send calls (escalation machinery already engaged).',
    'Present-hour, backstop already filled (heartbeat_status_backstop row, status=sent/delivered, this hour) -> FILLED -> zero send calls.',
    'Stale backstop retry (heartbeat_status_backstop row, status=failed, created >grace-floor-minutes ago, this hour) -> UNFILLED -> a retry sendChairmanSMS call is made with a fresh (attempt-suffixed) dedupeKey, distinct from the failed attempt\'s key.',
    'Negative control (hour selectivity): a heartbeat_status row from the PREVIOUS hour must NOT suppress the current hour\'s send.',
    'Negative control (kind selectivity): a morning_brief or decision_question kind row in the current hour must NOT suppress the backstop send.',
    'Quiet-hours pass-through: sendChairmanSMS stub returns its REAL production shape for a rubric-blocked send ({sent:false, held:true, reason:"blocked", verdict:<not pass>}) -- sweep surfaces no-send correctly (not swallowed as a success), and does not write any state that would suppress a legitimate later-hour attempt.',
    'Coarse window pre-filter: hours outside 06:00-22:00 chairman-zone -> sweep is inert, zero DB reads/writes attempted (spied on the injected client, not merely asserted by return value).',
    'Read-error branch (injected client returns {data:null, error}) -> sweep fails closed (no send) or fails open per an explicit documented decision, and the behavior is pinned by a test either way -- not left undefined.',
  ];

  const acceptance_criteria = [
    'A missed live heartbeat is filled by the backstop within one self-healing window tick.',
    'A live heartbeat stuck at status=owed past the grace floor (delivered nothing) is correctly treated as UNFILLED and triggers a backstop send -- mere obligation-row existence never suppresses the backstop.',
    'No double-send occurs against a live heartbeat that actually reached sent/delivered, or against a prior successful backstop fill, in the same chairman-zone hour.',
    'A failed backstop attempt is retried later in the same window via a fresh dedupeKey, never blocked by its own prior attempt\'s UPSERT key.',
    'Quiet-hours (chairman-zone 22:00-06:00) produces no backstop sends, via the existing sendChairmanSMS gate.',
    'FR-5\'s full status-decision-table test matrix passes, including both negative selectivity controls (hour and kind), and the full existing chairman-comms test suite passes unchanged.',
  ];

  const update = {
    functional_requirements: frs,
    test_scenarios,
    acceptance_criteria,
    metadata: {
      ...existing.metadata,
      testing_subagent_findings_incorporated: {
        source: 'TESTING sub-agent PLAN-phase review, sub_agent_execution_results id=e2532b50-1cdd-4c56-8eb8-5999ec6efd3d',
        gaps_closed_pre_handoff: ['G1 (status-decision table, not mere row existence)', 'G2 (dedupe-key-vs-retry tension, resolved via attempt-suffixed keys)', 'G3 (read-error branch pinned as an explicit test)', 'G4 (staleness threshold tested on both sides + shared constant)', 'G5 (hour and kind negative-selectivity controls added)'],
        deferred_to_exec_as_test_writing_detail: ['G6 (transportFailed handling detail)', 'G7 (chairman-zone injection hygiene)', 'G8 (export etHourWindowUtc / DST fixtures)', 'G9 (sibling-parity hygiene: PII-free logging, CHAIRMAN_PHONE unset, --dry-run)', 'G10 (GHA-lag grace floor -- folded into the grace-floor constant, already reflected above)'],
      },
    },
  };

  const { error } = await supabase.from('product_requirements_v2').update(update).eq('id', PRD_ID);
  if (error) { console.error('UPDATE ERROR:', error); process.exit(1); }
  console.log('PRD updated with G1-G5 fixes.');
}

main();
