#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';
const SD_UUID = '0784cc1b-05d6-4a31-9b8f-c79e2aa1736d';

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Lane-appropriate TTL registry keyed by payload.kind, homed in lib/coordination/lane-contract.cjs',
    description: 'Add a per-lane TTL entry (directive/advisory/reply/suggestion) to lib/coordination/lane-contract.cjs (already the payload.kind-keyed module) as a re-keying of the existing per-message deadline machinery in lib/coordinator/reply-class.cjs (computeReplyExpectedBy, findOverdueReplyNeeded, DEFAULT_REPLY_WINDOW_MS) from its current 3-value reply_class axis to the 4-lane payload.kind axis. Do NOT introduce a second lane-keyed representation (e.g. lib/governance/gauge-registry.js) -- single representation only.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'lane-contract.cjs exports one TTL entry per payload.kind lane (directive/advisory/reply/suggestion)',
      'TTL computation reuses computeReplyExpectedBy()-equivalent logic, not a duplicate implementation',
      'No second lane-keyed TTL table/array is introduced anywhere else in the codebase'
    ]
  },
  {
    id: 'FR-2',
    requirement: 'Payload-only expired-unread stamping on TTL breach',
    description: 'When a session_coordination row exceeds its lane TTL unread, stamp it with a payload-only marker (e.g. payload.dead_letter_reason=\'ttl_expired_unread\') mirroring lib/coordination/dead-letter-drain.js\'s buildStampPatch()/isPurgeEligible() pattern verbatim. NEVER write acknowledged_at or read_at -- those columns arm cleanup_expired_coordination()\'s purge (deletes rows where acknowledged_at IS NOT NULL OR read_at <= now()-7d) or start an unrelated 7-day clock this module does not own. The row must survive a cleanup_expired_coordination() pass so the dead-letter rate stays measurable.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'Regression test: a row stamped expired-unread survives a cleanup_expired_coordination() pass unchanged',
      'The stamp function writes payload only -- zero writes to acknowledged_at or read_at columns',
      'Uses a distinct payload marker key (not payload.dead_letter, already owned by the dead/gone-session orphan-detection sweep in dead-letter-drain.js) to avoid double-counting in FR-4\'s gauge'
    ]
  },
  {
    id: 'FR-3',
    requirement: 'Dead-letter alarm paging the sender\'s successor/owner via a surface OTHER than session_coordination',
    description: 'When a lane\'s unread-past-TTL count breaches a configured threshold, page the message SENDER\'s successor/owner (not the recipient/target) through one of: the quiet-tick summary line (scripts/coordinator-quiet-tick.mjs), an sms_outbound_obligations row, or the ladder (lib/periodic-liveness/ladder-escalation.mjs). This is a HARD, LOAD-BEARING constraint (Solomon + coordinator both flagged it): the alarm must never write a new session_coordination row, or it collapses into the same undrained path it exists to catch failing. lib/escalation/inbox-sla.js already does RECIPIENT-side overdue-inbox watching feeding the ladder -- FR-3\'s genuinely novel piece is the paging DIRECTION (sender-side); it must not be silently absorbed into the existing recipient-side watcher.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'Negative test: seeding a synthetic breached lane triggers an alarm event verified to land on a surface OTHER than session_coordination (asserted by table/emit-target, not by absence of error)',
      'The same test asserts the paged party is the SENDER\'s successor/owner, not the message recipient/target -- direction is explicitly checked, not assumed',
      'Alarm ships with a threshold configuration that starts OBSERVE-ONLY (log/gauge only, no live paging) for an initial soak period before paging is enabled, mirroring this codebase\'s existing default-OFF-flag rollout pattern'
    ]
  },
  {
    id: 'FR-4',
    requirement: 'Per-lane dead-letter gauge sourced from coordination_receipts',
    description: 'Publish a per-lane dead-letter rate gauge/metric sourced from coordination_receipts (lane/state/disposition/is_retention/source_age_ms columns) rather than the live, retention-pruned session_coordination table. LEAD-phase VALIDATION (evidence 74c605e7) measured that the live session_coordination table is only 10.1% of all-time volume because cleanup_expired_coordination() preferentially deletes ANSWERED rows (survivorship bias) -- a gauge sourced from the live table would measure the retention policy, not delivery conduct. Align the gauge\'s lane taxonomy with the existing lib/coordination/lane-pending-gauge.cjs reader rather than inventing a parallel one.',
    priority: 'HIGH',
    acceptance_criteria: [
      'Gauge query reads coordination_receipts, not live session_coordination, for its dead-letter denominator/numerator',
      'Gauge lane buckets match lib/coordination/lane-pending-gauge.cjs\'s existing taxonomy (no parallel/competing bucket scheme)',
      'dispatch_suggestion lane is excluded from a naive read_at-IS-NULL dead-letter count, or explicitly annotated as structurally 100% by classification (that kind is in no DRAIN_SET/DIRECTIVE_KINDS/INFORMATIONAL_KINDS bucket) rather than reported as a real delivery failure'
    ]
  },
  {
    id: 'FR-5',
    requirement: 'Corrected baseline re-measurement methodology (supersedes the SD\'s original, disproven 62%/100% figures)',
    description: 'The SD\'s originally-stated pre-fix baseline (62% coordinator-directive, 100% dispatch_suggestion dead-letter) does NOT reproduce against the live session_coordination table (VALIDATION measured 45.8% live for coordinator_directive) and must not be carried forward as ground truth. PLAN records a fresh baseline via the SAME coordination_receipts-based measurement method FR-4 implements, at PRD time, for later 30-day comparison -- using an identical lane/state/disposition filter on both measurement dates so the comparison is apples-to-apples.',
    priority: 'HIGH',
    acceptance_criteria: [
      'A baseline measurement query (coordination_receipts-sourced) is run and its output recorded in the PRD/SD metadata before EXEC begins',
      '30-day re-measurement uses the identical query/filter as the baseline measurement',
      'The original 62%/100% figures are documented as disproven-per-VALIDATION, not silently dropped or silently kept as the reported baseline'
    ]
  }
];

const technical_requirements = [
  { id: 'TR-1', requirement: 'FR-2\'s expired-unread stamp mutation must be payload-only; zero writes to acknowledged_at or read_at columns', rationale: 'Those two columns are the exact predicate cleanup_expired_coordination() uses for purge eligibility -- writing either would delete the evidence FR-2 exists to preserve.' },
  { id: 'TR-2', requirement: 'FR-1\'s TTL registry must live in lib/coordination/lane-contract.cjs, not a new file or lib/governance/gauge-registry.js', rationale: 'lane-contract.cjs is already the payload.kind-keyed module (validateOnSend); a second lane-keyed representation would violate single-representation and create drift risk between two configs.' },
  { id: 'TR-3', requirement: 'FR-4/FR-5\'s dead-letter measurement must query coordination_receipts, never the live session_coordination table, for rate calculations', rationale: 'The live table is retention-pruned (10.1% of all-time volume, survivorship-biased toward unanswered rows) -- any rate computed against it measures the cleanup job, not delivery conduct.' },
  { id: 'TR-4', requirement: 'FR-3\'s alarm implementation must not write any new session_coordination row as its paging mechanism', rationale: 'A new session_coordination row would page through the exact undrained path the alarm is meant to catch failing, collapsing the check-satisfied-without-changing-the-harm class this SD exists to close.' }
];

const system_architecture = {
  overview: 'Additive extension to the existing coordination-lane machinery: lane-contract.cjs gains a TTL registry (re-keyed from reply-class.cjs\'s deadline logic), a new expired-unread stamping pass mirrors dead-letter-drain.js\'s payload-only pattern, a new alarm module composes inbox-sla.js-style breach detection with sender-successor paging routed to an existing cross-surface channel (quiet-tick, sms_outbound_obligations, or the ladder), and a new gauge reads coordination_receipts aligned to lane-pending-gauge.cjs\'s taxonomy. No new tables; no changes to session_coordination schema or the prompt-boundary drain mechanism.',
  components: [
    { name: 'Lane TTL Registry', responsibility: 'Per-payload.kind TTL lookup, re-keyed from reply-class.cjs', technology: 'CommonJS module (lib/coordination/lane-contract.cjs extension)' },
    { name: 'Expired-Unread Stamper', responsibility: 'Payload-only stamp on TTL breach, purge-survival guaranteed', technology: 'CommonJS module mirroring dead-letter-drain.js\'s buildStampPatch/isPurgeEligible' },
    { name: 'Dead-Letter Alarm', responsibility: 'Threshold breach detection + sender-successor paging on a non-session_coordination surface', technology: 'New module composing existing quiet-tick/sms_outbound_obligations/ladder paging primitives' },
    { name: 'Per-Lane Dead-Letter Gauge', responsibility: 'coordination_receipts-sourced rate computation, lane-pending-gauge.cjs-aligned taxonomy', technology: 'CommonJS module' }
  ],
  data_flow: 'session_coordination row created -> lane TTL registry determines its deadline -> on breach, Expired-Unread Stamper writes a payload-only marker (row persists, never deleted by TTL logic) -> Dead-Letter Alarm polls breach counts per lane, and when threshold crossed, pages sender successor via quiet-tick/SMS/ladder (NOT a new session_coordination row) -> Per-Lane Dead-Letter Gauge separately reads coordination_receipts (the durable, retention-immune ledger) to compute and publish the measurable rate.',
  integration_points: [
    'lib/coordination/lane-contract.cjs (TTL registry host)',
    'lib/coordinator/reply-class.cjs (source pattern for TTL/deadline logic)',
    'lib/coordination/dead-letter-drain.js (source pattern for payload-only stamping)',
    'lib/escalation/inbox-sla.js + lib/periodic-liveness/ladder-escalation.mjs (one candidate paging surface)',
    'scripts/coordinator-quiet-tick.mjs (another candidate paging surface)',
    'sms_outbound_obligations table (third candidate paging surface)',
    'coordination_receipts table (measurement source)',
    'lib/coordination/lane-pending-gauge.cjs (gauge taxonomy alignment)'
  ]
};

const test_scenarios = [
  { id: 'TS-1', scenario: 'A session_coordination row past its lane TTL, unread, gets stamped expired-unread', test_type: 'unit', given: 'A directive-lane row older than the directive TTL, read_at IS NULL', when: 'The expiry-stamping pass runs', then: 'payload carries the expired-unread marker; acknowledged_at and read_at remain NULL' },
  { id: 'TS-2', scenario: 'A stamped expired-unread row survives cleanup_expired_coordination()', test_type: 'integration', given: 'A row stamped expired-unread per TS-1', when: 'cleanup_expired_coordination() runs a purge pass', then: 'the row is NOT deleted (its acknowledged_at/read_at predicate was never satisfied)' },
  { id: 'TS-3', scenario: 'Negative test: alarm fires on a synthetic breached lane and lands outside session_coordination', test_type: 'integration', given: 'A lane with unread-past-TTL count exceeding the configured threshold', when: 'the dead-letter alarm check runs', then: 'an alarm event is emitted on the quiet-tick line, an sms_outbound_obligations row, or the ladder -- and specifically NO new session_coordination row is created as the paging mechanism' },
  { id: 'TS-4', scenario: 'Alarm pages the sender\'s successor/owner, not the message recipient', test_type: 'integration', given: 'A breached lane where sender and recipient are different identities', when: 'the alarm fires', then: 'the paged party matches the sender\'s successor/owner role, verified distinct from the original message\'s target/recipient' },
  { id: 'TS-5', scenario: 'Per-lane gauge reads coordination_receipts, not live session_coordination', test_type: 'unit', given: 'A coordination_receipts table with known lane/state/disposition rows', when: 'the gauge computes the dead-letter rate for a lane', then: 'the computed rate matches a direct coordination_receipts query for that lane, independent of live session_coordination row counts' },
  { id: 'TS-6', scenario: 'dispatch_suggestion lane is not misreported as a real delivery failure', test_type: 'unit', given: 'dispatch_suggestion rows with read_at IS NULL by structural design (no drain-set membership)', when: 'the gauge computes dead-letter rate', then: 'dispatch_suggestion is excluded or explicitly annotated as a classification artifact, not reported as a delivery-failure rate' },
  { id: 'TS-7', scenario: 'Alarm ships observe-only by default (no live paging until explicitly enabled)', test_type: 'integration', given: 'Default configuration, no explicit enable flag set', when: 'a lane breaches threshold', then: 'the breach is logged/gauged but no page is sent -- matching the codebase\'s default-OFF-flag rollout convention' }
];

const acceptance_criteria = [
  'TTL registry merged into lib/coordination/lane-contract.cjs, one entry per payload.kind lane; expired-unread stamping live and payload-only (verified to survive a cleanup_expired_coordination() pass) -- TS-1, TS-2',
  'Negative test passes: an alarm fires on a synthetic breached lane and lands on a surface OUTSIDE session_coordination, and specifically pages the SENDER\'s successor/owner (not the message target) -- TS-3, TS-4',
  '30-day re-measure of the per-lane dead-letter rate, sourced from coordination_receipts (not live session_coordination), against a baseline recorded at PRD time via the identical coordination_receipts-based method -- not the SD\'s original, disproven 62%/100% figures -- TS-5, TS-6',
  'Alarm ships observe-only (no live paging) by default, matching this codebase\'s existing default-OFF-flag rollout pattern -- TS-7'
];

const risks = [
  {
    risk: 'A miscalibrated dead-letter threshold could produce alarm noise (false pages) or, if set too high, fail to page on a genuine dead-letter spike.',
    probability: 'MEDIUM', impact: 'MEDIUM',
    mitigation: 'Start with a conservative threshold informed by the RE-MEASURED (coordination_receipts-sourced) baseline; land the alarm observe-only for an initial soak before enabling live paging.',
    rollback_plan: 'Flip the alarm\'s enable flag back to observe-only; no data loss since expired-unread rows are never deleted.'
  },
  {
    risk: 'FR-3\'s hard "different surface" constraint is easy to violate by accident -- an implementation that pages by writing a new session_coordination row would silently fail the constraint while looking correct.',
    probability: 'MEDIUM', impact: 'HIGH',
    mitigation: 'TS-3/TS-4 assert the surface and paging direction explicitly as blocking acceptance criteria, not optional/informational tests.',
    rollback_plan: 'Disable the alarm module entirely (feature-flag off); TTL stamping (FR-1/FR-2) and the gauge (FR-4) continue functioning independently.'
  },
  {
    risk: 'Overlap/confusion with the EXISTING, differently-scoped dead-letter machinery (dead-letter-drain.js, orphan-detection for dead/gone sessions) could cause a naming collision or double-counting in the gauge.',
    probability: 'LOW', impact: 'MEDIUM',
    mitigation: 'Use a distinct payload marker key for this SD\'s expired-unread state; FR-4\'s gauge explicitly excludes/labels rows already marked by the orphan-detection path.',
    rollback_plan: 'Rename the payload marker key if a collision is discovered post-deploy; no schema migration required since this is payload-only.'
  },
  {
    risk: 'FR-2\'s expired-unread stamp could accidentally write acknowledged_at or read_at, silently deleting the exact evidence this SD exists to preserve.',
    probability: 'LOW', impact: 'HIGH',
    mitigation: 'Copy dead-letter-drain.js\'s buildStampPatch()/isPurgeEligible() pattern verbatim; TS-2 is a blocking regression test asserting purge survival.',
    rollback_plan: 'Revert the stamping function to a no-op; existing rows are unaffected since no destructive migration occurred.'
  },
  {
    risk: 'lib/escalation/inbox-sla.js already ladder-escalates overdue inbox rows RECIPIENT-side; FR-3 built without distinguishing its sender-side direction risks being silently absorbed into the existing recipient-side watcher, leaving the actual target gap unaddressed.',
    probability: 'MEDIUM', impact: 'HIGH',
    mitigation: 'TS-4 explicitly tests paging direction (sender\'s successor, not recipient), not just "an alarm fires somewhere".',
    rollback_plan: 'If direction confusion is found post-deploy, disable FR-3\'s alarm module and re-scope as a follow-up SD rather than patching the shared inbox-sla.js watcher.'
  }
];

const implementation_approach = {
  phases: [
    { phase: 'Phase 1', description: 'FR-1/FR-2: extend lane-contract.cjs with the TTL registry (re-keyed from reply-class.cjs) and add the payload-only expired-unread stamper (mirroring dead-letter-drain.js)', deliverables: ['lane-contract.cjs TTL registry', 'expired-unread stamping function', 'TS-1, TS-2 tests'] },
    { phase: 'Phase 2', description: 'FR-4/FR-5: build the coordination_receipts-sourced per-lane gauge, aligned with lane-pending-gauge.cjs taxonomy, and record the corrected baseline measurement', deliverables: ['dead-letter gauge module', 'baseline measurement recorded in SD/PRD metadata', 'TS-5, TS-6 tests'] },
    { phase: 'Phase 3', description: 'FR-3: build the dead-letter alarm (breach detection + sender-successor paging via quiet-tick/SMS/ladder), observe-only by default', deliverables: ['alarm module', 'default-OFF paging flag', 'TS-3, TS-4, TS-7 tests'] }
  ],
  technical_decisions: [
    'Registry lives in lane-contract.cjs (not a new file/gauge-registry.js) to preserve single-representation, per LEAD-phase VALIDATION',
    'Stamping is payload-only (never acknowledged_at/read_at) to avoid arming the retention purge, per LEAD-phase VALIDATION',
    'Measurement sources coordination_receipts (not live session_coordination) to avoid survivorship bias, per LEAD-phase VALIDATION',
    'Alarm ships observe-only by default, matching this codebase\'s established default-OFF-flag rollout convention (e.g. PATH_INTEGRITY_EXIT_GATE_ENFORCE)'
  ]
};

const integration_operationalization = {
  consumers: [
    { name: 'Coordinator (session_coordination sender role)', interaction: 'Its own directives become measurable via the gauge; it receives alarm pages when its own successor needs to act on a dead-lettered lane it owns', frequency: 'Continuous, per-message' },
    { name: 'Adam / Solomon / worker successors', interaction: 'Paged via quiet-tick/SMS/ladder when a lane they own breaches the dead-letter threshold', frequency: 'On threshold breach only (rare, by design)' }
  ],
  dependencies: [
    { name: 'lib/coordinator/reply-class.cjs', type: 'upstream', contract: 'FR-1 re-keys its deadline computation logic', failure_handling: 'If reply-class.cjs\'s window logic changes incompatibly, lane-contract.cjs\'s TTL registry must be updated in lockstep (no silent drift)' },
    { name: 'lib/coordination/dead-letter-drain.js', type: 'upstream', contract: 'FR-2 mirrors its payload-only stamp pattern; must NOT reuse its payload.dead_letter key', failure_handling: 'A key collision would double-count in the gauge -- FR-2 uses a distinct marker key by design' },
    { name: 'coordination_receipts', type: 'upstream', contract: 'FR-4/FR-5 read lane/state/disposition/is_retention/source_age_ms', failure_handling: 'If this table\'s schema changes, the gauge query must be updated; no fallback to live session_coordination (would reintroduce survivorship bias)' },
    { name: 'scripts/coordinator-quiet-tick.mjs / sms_outbound_obligations / lib/periodic-liveness/ladder-escalation.mjs', type: 'downstream', contract: 'FR-3 emits alarm events to ONE of these existing surfaces', failure_handling: 'If the chosen surface is unreachable, the alarm must fail loudly (not silently retry into session_coordination)' }
  ],
  data_contracts: [
    { contract_name: 'Expired-unread payload marker', schema: 'payload.dead_letter_reason (or equivalent distinct key) on session_coordination rows', validation: 'Never co-occurs with a write to acknowledged_at/read_at in the same stamp operation', versioning: 'Additive payload key; no migration required' }
  ],
  runtime_config: {
    environment_variables: [],
    feature_flags: ['Dead-letter alarm live-paging enable flag (default OFF/observe-only)'],
    deployment_considerations: 'No new tables or schema migrations; purely additive to existing session_coordination payload and read-only against coordination_receipts.'
  },
  observability_rollout: {
    monitoring: ['Per-lane dead-letter rate gauge (FR-4)', 'Alarm fire count and target-surface log line'],
    alerts: ['Dead-letter alarm itself (FR-3) is the alert mechanism for this SD\'s own domain'],
    rollout_strategy: 'Observe-only default (gauge + logging, no paging) for an initial soak period, then explicit flag flip to enable live paging',
    rollback_trigger: 'Alarm noise (false-positive page rate) exceeding an acceptable threshold during the soak period',
    rollback_procedure: 'Flip the live-paging flag back to observe-only; TTL stamping and the gauge continue functioning unaffected since they are independent of the alarm\'s paging step'
  }
};

const exploration_summary = {
  files_read: [
    'database/schema-reference-snapshot.json (session_coordination schema)',
    'lib/coordinator/dispatch.cjs',
    'scripts/adam-advisory.cjs',
    'lib/governance/gauge-registry.js',
    'lib/coordination/lane-contract.cjs',
    'lib/coordinator/reply-class.cjs',
    'lib/coordination/dead-letter-drain.js',
    'lib/escalation/inbox-sla.js',
    'lib/periodic-liveness/ladder-escalation.mjs',
    'scripts/coordinator-quiet-tick.mjs',
    'lib/coordination/lane-pending-gauge.cjs',
    'scripts/dispatch-suggestion-report.mjs',
    'lib/fleet/worker-status.cjs'
  ],
  patterns_identified: [
    'Payload-only stamping pattern (dead-letter-drain.js buildStampPatch/isPurgeEligible) for mutations that must survive retention purges',
    'payload.kind-keyed lane taxonomy already established in lane-contract.cjs and lane-pending-gauge.cjs',
    'Existing per-message deadline machinery (reply-class.cjs) that FR-1 re-keys rather than reinventing',
    'coordination_receipts as the durable, retention-immune measurement ledger vs. the retention-pruned live session_coordination table'
  ],
  key_decisions: [
    'Registry homed in lane-contract.cjs, not gauge-registry.js, per LEAD-phase VALIDATION (evidence 74c605e7)',
    'Measurement sourced from coordination_receipts, not live session_coordination, per the same VALIDATION finding',
    'FR-3\'s alarm explicitly distinguishes sender-successor paging direction from the existing recipient-side inbox-sla.js/ladder watcher'
  ],
  exploration_date: '2026-08-24'
};

const prd = {
  id: `PRD-${SD_KEY}`,
  directive_id: SD_KEY,
  sd_id: SD_UUID,
  title: 'Comms Lane TTLs + Dead-Letter Alarm PRD',
  status: 'approved',
  category: 'infrastructure',
  priority: 'high',
  executive_summary: 'Adds per-lane TTLs, payload-only expired-unread stamping, a sender-successor dead-letter alarm paging outside session_coordination, and a coordination_receipts-sourced gauge to close a measured cross-session directive dead-letter gap.',
  functional_requirements,
  technical_requirements,
  system_architecture,
  test_scenarios,
  acceptance_criteria,
  risks,
  implementation_approach,
  integration_operationalization,
  exploration_summary,
  document_type: 'prd',
  phase: 'PLAN',
  progress: 20,
};

if (prd.executive_summary.length > 300 || prd.executive_summary.length < 100) {
  console.error(`executive_summary length ${prd.executive_summary.length} out of [100,300] bounds`);
  process.exit(1);
}

const { data, error } = await supabase.from('product_requirements_v2').insert(prd).select('id, sd_id, directive_id, status');
if (error) { console.error('INSERT ERR', error.message); process.exit(1); }
console.log('PRD inserted:', JSON.stringify(data, null, 2));
