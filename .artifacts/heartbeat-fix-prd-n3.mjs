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
    .select('functional_requirements,executive_summary,system_architecture,metadata')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) { console.error('FETCH ERROR:', fetchErr); process.exit(1); }

  const frs = existing.functional_requirements.map((fr) => {
    if (fr.id === 'FR-2c') {
      return {
        ...fr,
        description: 'REVISED post-merge, EXEC-phase SECURITY sub-agent finding SEC-H1 (merge-blocking, sub_agent_execution_results id=094291c6-3266-4875-abf9-6b9a877785be): the backstop ENQUEUES ONLY via enqueueChairmanSms (lib/chairman/sms-bridge.js) -- it does NOT call sendChairmanSMS. The new GHA workflow carries no Twilio credentials (matching the enqueue-only morning-brief/morning-review precedents); calling sendChairmanSMS\'s inline dispatch anyway would reach reconcileOutboundSms\'s unfiltered status=owed claim and burn/dead-letter unrelated owed obligations during the exact outage this SD covers. The resulting owed row is drained by whatever credentialed process next calls sendChairmanSMS for any reason -- the same dispatch dependency the already-shipped morning-brief/morning-review sweeps have, not a new one.',
        acceptance_criteria: ['Backstop calls enqueueChairmanSms(), never sendChairmanSMS() (confirmed: zero code references, only explanatory comments)', 'dedupeKey passed to enqueueChairmanSms is derived by a pure function, scoped to the backstop\'s own kind (heartbeat_status_backstop), millisecond-timestamped per real attempt', 'GHA workflow env carries no Twilio credentials (SUPABASE_* + CHAIRMAN_PHONE only, matching the enqueue-only precedents)'],
      };
    }
    if (fr.id === 'FR-3') {
      return {
        ...fr,
        description: 'REVISED post-merge (SEC-H1 remediation, same finding as FR-2c): since sendChairmanSMS is no longer called, its rubric-gate quiet-hours check is no longer inherited for free. The sweep now applies an EXPLICIT chairman-zone-aware quiet-hours gate (isSmsQuietHour from lib/time/chairman-et-wall-clock.js -- reused, not reimplemented) before enqueueing. The coarse pre-filter is deliberately WIDER than the quiet-hours boundary (05:00-22:59 zone-local, not an exact 06:00-22:00 match) so the explicit check is reachable and not shadowed into dead code by the pre-filter -- mirroring QF-20260722-277\'s identical GHA-lag-buffer rationale for the morning-brief sweep. A chairman-authorized allowQuietHours override still applies.',
        acceptance_criteria: [...fr.acceptance_criteria, 'The coarse pre-filter band (05:00-22:59) is strictly wider than the quiet-hours boundary (22:00-06:00), so the explicit isSmsQuietHour check is reachable, not dead code'],
      };
    }
    return fr;
  });

  const update = {
    functional_requirements: frs,
    executive_summary: existing.executive_summary + ' POST-MERGE REVISION: an EXEC-phase SECURITY sub-agent review (SEC-H1, merge-blocking) found the originally-planned sendChairmanSMS-based send path would reach a Twilio dispatcher with no credentials configured in the new GHA workflow, risking dead-lettered unrelated obligations during the exact outage this SD covers. The shipped design instead enqueues only (matching the already-proven morning-brief/morning-review precedents) with an explicit quiet-hours gate, since the rubric gate is no longer inherited.',
    system_architecture: existing.system_architecture + ' POST-MERGE: the actual send path is enqueue-only (enqueueChairmanSms), not sendChairmanSMS -- see FR-2c/FR-3 for the SEC-H1 remediation rationale.',
    metadata: {
      ...existing.metadata,
      post_merge_revisions: {
        source: 'EXEC-phase SECURITY + TESTING sub-agent reviews after initial merge-ready state (SEC-H1 sub_agent_execution_results id=094291c6-3266-4875-abf9-6b9a877785be; TESTING re-verification ids eea516f5/82416e2a/6c2fb9c3)',
        changes: [
          'FR-2c/FR-3: send path pivoted from sendChairmanSMS (inline Twilio dispatch) to enqueue-only via enqueueChairmanSms, with an explicit quiet-hours gate added',
          'Coverage read pivoted from a fixed calendar-hour bucket to a trailing LOOKBACK_MS window (F1, merge-blocking)',
          'classifyRowCoverage made kind-aware (ownKind) so the backstop\'s own still-owed prior attempt never expires into a duplicate re-enqueue (F6, merge-blocking, discovered by the enqueue-only pivot itself)',
          'buildBackstopBody now includes the hourKey so a multi-hour outage recovery burst is distinguishable per hour (N2)',
        ],
      },
    },
  };

  const { error } = await supabase.from('product_requirements_v2').update(update).eq('id', PRD_ID);
  if (error) { console.error('UPDATE ERROR:', error); process.exit(1); }
  console.log('PRD updated with post-merge revision notes (N3 fix).');
}

main();
