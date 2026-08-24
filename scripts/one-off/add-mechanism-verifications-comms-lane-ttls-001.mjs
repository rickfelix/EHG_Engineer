#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-INFRA-COMMS-LANE-TTLS-001's spine, which names specific file mechanisms
 * (gauge-registry.js, lane-pending-gauge.cjs, lane-contract.cjs, reply-class.cjs,
 * dead-letter-drain.js, inbox-sla.js, ladder-escalation.mjs, coordinator-quiet-tick.mjs).
 * The Explore + VALIDATION sub-agents' own genuine, live-verified investigation is the
 * verifier (mirrors the precedent in add-mechanism-verifications-cargo-instruments-001.mjs).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1); }

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'sub_agent_execution_results:92bf923f-eaed-49a3-ac89-766203983ffa (Explore, phase=LEAD)',
      verified_at: 'lib/coordinator/dispatch.cjs:1216 (flat 24h DISPATCH_TTL_MS fallback, no per-kind lane keying)',
      claim: 'No existing per-kind TTL registry exists on session_coordination (schema has one flat expires_at column; TTL today is set ad hoc, not lane-keyed) -- FR-1 requires new registry logic, not a config change to an existing one.',
      reproduction: 'Explore agent read the live schema-reference-snapshot.json and lib/coordinator/dispatch.cjs:1216-1219, plus scripts/adam-advisory.cjs, finding only ad hoc flat 24h/60min defaults, no lane-keyed table.'
    },
    {
      verified_by: 'sub_agent_execution_results:92bf923f-eaed-49a3-ac89-766203983ffa (Explore, phase=LEAD)',
      verified_at: 'lib/governance/gauge-registry.js:49 (GAUGE_REGISTRY array, data-as-code id/detectorFn/thresholdConfig/ownerRole/remediation/enabled shape)',
      claim: 'Initially proposed as FR-1\'s registry-pattern precedent; SUPERSEDED by the VALIDATION finding below (lane-contract.cjs is the correct home instead).',
      reproduction: 'Explore agent read the file header, STUB-ROW ADOPTION CONTRACT comment, and the GAUGE_REGISTRY export at line 49.'
    },
    {
      verified_by: 'sub_agent_execution_results:74c605e7-7c8a-408c-a5e3-7d98458ad799 (VALIDATION, phase=LEAD)',
      verified_at: 'lib/coordination/lane-contract.cjs:57 (validateOnSend, payload.kind-required SEND contract)',
      claim: 'This is the CORRECT home for FR-1\'s registry, not lib/governance/gauge-registry.js -- using gauge-registry.js would create a second, competing lane-keyed representation (violating single-representation). VALIDATION independently re-derived this after the Explore agent\'s initial (superseded) suggestion.',
      reproduction: 'VALIDATION sub-agent direct source read of lane-contract.cjs:57 (validateOnSend), confirming it is already keyed on payload.kind and is the natural extension point.'
    },
    {
      verified_by: 'sub_agent_execution_results:74c605e7-7c8a-408c-a5e3-7d98458ad799 (VALIDATION, phase=LEAD)',
      verified_at: 'lib/coordinator/reply-class.cjs:43 (computeReplyExpectedBy), :60 (findOverdueReplyNeeded), :19 (DEFAULT_REPLY_WINDOW_MS=2h)',
      claim: 'FR-1 is a RE-KEYING of this already-shipped per-message-deadline machinery from the 3-value reply_class axis to the 4-lane payload.kind axis, not greenfield work.',
      reproduction: 'VALIDATION sub-agent direct source read of reply-class.cjs:19,43,60 confirming the existing deadline/breach-detector functions and their current reply_class keying.'
    },
    {
      verified_by: 'sub_agent_execution_results:92bf923f-eaed-49a3-ac89-766203983ffa (Explore, phase=LEAD); sub_agent_execution_results:74c605e7-7c8a-408c-a5e3-7d98458ad799 (VALIDATION, phase=LEAD)',
      verified_at: 'lib/coordination/dead-letter-drain.js:132 (isPurgeEligible), :162 (buildStampPatch)',
      claim: 'This existing dead-letter machinery solves a DIFFERENT problem (dead/gone-SESSION orphan detection) than this SD (unread-past-TTL to a LIVE recipient) -- confirmed no overlap by two independent sub-agents. Its buildStampPatch()/isPurgeEligible() pattern (payload-only mutation, no timestamp-column writes) is the correct template for FR-1\'s expired-unread stamp to avoid accidentally arming the cleanup purge.',
      reproduction: 'Both agents independently read dead-letter-drain.js:132 (isPurgeEligible) and :162 (buildStampPatch); VALIDATION additionally traced cleanup_expired_coordination()\'s purge-eligibility criteria (acknowledged_at IS NOT NULL OR read_at <= now()-7d) to confirm why a timestamp-column write would be unsafe here.'
    },
    {
      verified_by: 'sub_agent_execution_results:74c605e7-7c8a-408c-a5e3-7d98458ad799 (VALIDATION, phase=LEAD)',
      verified_at: 'lib/escalation/inbox-sla.js:71 (asStall, stall_type:\'inbox_sla\'), feeds lib/periodic-liveness/ladder-escalation.mjs',
      claim: 'FR-2\'s ladder-paging path is PARTLY already built (recipient-side overdue-inbox watching); the genuinely novel piece FR-2 must add is paging DIRECTION -- the SENDER\'s successor/owner, not the recipient/target, which this existing watcher does not do.',
      reproduction: 'VALIDATION sub-agent direct source read of inbox-sla.js:71 (asStall) and its ladder-escalation.mjs consumer, confirming the direction of who gets paged today.'
    },
    {
      verified_by: 'sub_agent_execution_results:74c605e7-7c8a-408c-a5e3-7d98458ad799 (VALIDATION, phase=LEAD)',
      verified_at: 'lib/coordination/dead-letter-drain.js:132 (isPurgeEligible purge-window predicate) applied against live coordination_receipts (2830 rows) and session_coordination (6631 live / 59274 archived = 10.1% of all-time)',
      claim: 'The SD\'s originally-stated 62% coordinator-directive dead-letter baseline does NOT reproduce against the live session_coordination table (VALIDATION measured 45.8% live) due to survivorship bias from the retention/cleanup job; coordination_receipts is the durable, retention-immune measurement source FR-3 must use instead.',
      reproduction: 'VALIDATION sub-agent ran a live count query against session_coordination (coordinator_directive: 27/59 unread = 45.8%), cross-referenced isPurgeEligible()\'s predicate at dead-letter-drain.js:132, and queried coordination_receipts row counts (2830) and live/archived table sizes (6631/59274).'
    },
    {
      verified_by: 'sub_agent_execution_results:74c605e7-7c8a-408c-a5e3-7d98458ad799 (VALIDATION, phase=LEAD)',
      verified_at: 'scripts/dispatch-suggestion-report.mjs (read-only reader, no read_at/acknowledged_at writes) cross-referenced against lib/fleet/worker-status.cjs classifyCoordinationRow (DRAIN_SET/DIRECTIVE_KINDS/INFORMATIONAL_KINDS bucket definitions, consumed at lib/coordination/lane-pending-gauge.cjs:41)',
      claim: 'dispatch_suggestion\'s stated 100% dead-letter baseline is a structural classification artifact, not evidence of failed delivery -- read_at IS NULL is guaranteed by construction for this kind (n=14) regardless of whether anyone actually saw the message.',
      reproduction: 'VALIDATION sub-agent traced the kind through classifyCoordinationRow (imported at lane-pending-gauge.cjs:41) and confirmed dispatch-suggestion-report.mjs never writes read_at/acknowledged_at; queried the live 14-row count for the kind.'
    },
    {
      verified_by: 'sub_agent_execution_results:92bf923f-eaed-49a3-ac89-766203983ffa (Explore, phase=LEAD)',
      verified_at: 'scripts/coordinator-quiet-tick.mjs:499 (QUIET_TICK= summary line), :52 (require of lib/coordination/lane-pending-gauge.cjs)',
      claim: 'The quiet-tick summary line named in the plan as a candidate different-surface paging channel genuinely exists and is already a cross-surface reporting mechanism (not session_coordination itself).',
      reproduction: 'Explore agent read coordinator-quiet-tick.mjs:52 (require) and :499 (QUIET_TICK= emit), confirming it composes lane-pending-gauge.cjs output into one emitted line, separate from session_coordination writes.'
    },
    {
      verified_by: 'sub_agent_execution_results:92bf923f-eaed-49a3-ac89-766203983ffa (Explore, phase=LEAD)',
      verified_at: 'lib/coordination/lane-pending-gauge.cjs:54 (summarizePendingLane), :81 (module.exports)',
      claim: 'An existing per-lane gauge reader already exists that FR-3\'s new dead-letter gauge should align with (same lane taxonomy) rather than duplicate.',
      reproduction: 'Explore agent read lane-pending-gauge.cjs:54 (summarizePendingLane) and its lane bucket definitions.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);
if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }
console.log('mechanism_verifications recorded for', SD_KEY);
