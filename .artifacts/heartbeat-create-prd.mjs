import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';

async function main() {
  const { data: sd } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();

  const prd = {
    id: `PRD-${SD_KEY}`,
    directive_id: SD_KEY,
    sd_id: sd.id,
    title: 'Durable hourly-heartbeat SLA backstop — PRD',
    version: '1.0',
    status: 'approved',
    category: 'infrastructure',
    priority: 'medium',
    executive_summary: 'Add an additive, read-then-conditionally-act GHA-cron sweep that fills the chairman\'s hourly heartbeat when the live Adam session/machine is unavailable, without ever sharing a dedupe key or kind with the live heartbeat path. LEAD-phase due diligence found the morning-brief precedent originally proposed as the pattern to mirror has three blocking gaps (no measured always-on dispatcher for owed rows; a live measured dual-key double-send defect; a zone-less quiet-hours gate) -- this design avoids all three by sending through the existing sendChairmanSMS() gated pipeline and using a distinct kind (heartbeat_status_backstop) with read-check dedupe instead of a write-time key race.',
    functional_requirements: [
      {
        id: 'FR-1',
        priority: 'HIGH',
        description: 'New GHA-cron workflow (.github/workflows/chairman-hourly-heartbeat-backstop-cron.yml) + sweep script (scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs). Self-healing window active 06:00-22:00 chairman-zone (coarse pre-filter only, not the quiet-hours authority -- see FR-3). GHA concurrency group + cancel-in-progress (mirroring chairman-morning-brief-cron.yml:36-38) to prevent overlapping runs.',
        requirement: 'A heartbeat delivery path independent of any live Adam ScheduleWakeup or local machine state',
        acceptance_criteria: ['Workflow file exists with a self-healing cron schedule and concurrency group', 'Sweep script runs standalone via --once flag', 'Sweep does not import or modify any file under scripts/adam-*.mjs'],
      },
      {
        id: 'FR-2',
        priority: 'HIGH',
        description: 'Read-check dedupe: query sms_outbound_obligations for any row with kind IN (heartbeat_status, heartbeat_status_backstop) AND created_at within the current chairman-zone hour. If any row exists, no-op (zero send calls). If none exists, proceed to send. This is deliberately NOT a shared write-time dedupe key with the live path -- LEAD-phase measurement found 44% of heartbeat_status hours legitimately carry >1 send (chairman replies), which a shared per-hour key would suppress, and found the live heartbeat path currently passes no dedupe key at all.',
        requirement: 'No double-send against a live heartbeat or a prior backstop fill this hour, without suppressing legitimate multi-send hours',
        acceptance_criteria: ['Read-check queries both kind=heartbeat_status and kind=heartbeat_status_backstop for the current chairman-zone hour', 'Present-hour case makes zero send calls', 'Chairman-reply sends (kind=heartbeat_status, not backstop-originated) are never suppressed by this SD\'s logic since the backstop never writes that kind'],
      },
      {
        id: 'FR-2b',
        priority: 'MEDIUM',
        description: 'Stale-retry status readback: if a heartbeat_status_backstop row from the current chairman-zone hour is found but its status is failed or stuck at owed/sending past a short freshness threshold (e.g. 5 minutes), retry (attempt another send) rather than treating key/row existence as permanently satisfying the hour. Mirrors scripts/cron/drive-report-sms-sweep.mjs:299-305\'s findObligation status-branch pattern.',
        requirement: 'A single failed attempt early in the window does not permanently burn the hour',
        acceptance_criteria: ['A found row with status=failed older than the freshness threshold triggers a retry send attempt', 'A found row with status IN (sent, delivered) is treated as done (no retry)', 'A found row with status IN (owed, sending) younger than the freshness threshold is left alone (avoid duplicate in-flight attempts)'],
      },
      {
        id: 'FR-2c',
        priority: 'HIGH',
        description: 'The backstop send calls the existing sendChairmanSMS() function (lib/comms/adam-outbound/chairman-sms-gate/index.js) with kind=heartbeat_status_backstop and a code-derived dedupeKey scoped to that kind only (e.g. heartbeat_backstop:<chairman-zone-hour-key>), NOT a raw enqueueChairmanSms() call. This inherits inline dispatch-and-verify (reconcileOutboundSms) and the pre-send safety rubric (no-secrets, length cap) for free, closing the LEAD-phase-found gap that the morning-brief precedent has no measured always-on dispatcher for owed rows.',
        requirement: 'The backstop send is actually dispatched and verified, not merely enqueued',
        acceptance_criteria: ['Backstop calls sendChairmanSMS(), never enqueueChairmanSms() directly', 'dedupeKey passed to sendChairmanSMS is derived by a pure function, not composed inline or by an LLM prompt', 'dedupeKey namespace (heartbeat_backstop:*) never collides with any key format used by the live heartbeat or morning-brief paths'],
      },
      {
        id: 'FR-3',
        priority: 'HIGH',
        description: 'Quiet-hours is NOT reimplemented in the sweep. It is inherited from sendChairmanSMS\'s existing rubric gate (chairman-zone-aware isSmsQuietHour via lib/time/chairman-et-wall-clock.js, not a hardcoded ET check), which already establishes drop-not-queue behavior for heartbeat-class sends. The sweep\'s own 06:00-22:00 chairman-zone window is a coarse pre-filter only, to avoid pointless GHA runs -- it is not the authoritative quiet-hours enforcement.',
        requirement: 'Quiet-hours window respected using the existing, chairman-zone-aware authority; no divergent reimplementation',
        acceptance_criteria: ['Sweep does not import or duplicate isSmsQuietHour/inQuietHours logic itself', 'A stubbed sendChairmanSMS quiet-hours-block response is correctly surfaced as no-send in the sweep, not silently swallowed', 'Existing quiet-hours tests (unaffected) continue to pass'],
      },
      {
        id: 'FR-4',
        priority: 'MEDIUM',
        description: 'A new, dedicated last-hour-delta content builder for backstop fills -- distinct from buildMorningReviewBody (daily-cadence-shaped, touches Solomon-authority forecast content inappropriate to emit up to 16x/day from an unattended cron). Reads durable state relevant to the last hour for a backstop-tagged line; falls back to a minimal presence line if durable state is unreadable. Never fabricates an all-good.',
        requirement: 'Backstop content is honest and hour-appropriate, never invented',
        acceptance_criteria: ['Content builder is a new function, not a call into buildMorningReviewBody', 'When durable state is readable, content includes a real status line tagged as a backstop fill', 'When durable state is unreadable, content is a minimal presence line only, with no fabricated status claim'],
      },
      {
        id: 'FR-5',
        priority: 'HIGH',
        description: 'Two-sided positive-control unit tests using dependency-injected supabase/send stubs (mirroring tests/unit/cron/chairman-morning-brief-sweep.test.js\'s DI pattern): (a) missed-hour case (no qualifying row this chairman-zone hour) asserts sendChairmanSMS is called exactly once; (b) present-hour case (a qualifying row already exists) asserts zero send calls. Assertions must be on invocation COUNT, not merely on a stubbed return-value shape (the gap found in the precedent\'s own TS-2 test, which never exercised a real concurrent write).',
        requirement: 'Automated regression coverage for both failure directions (silent-drop and double-send)',
        acceptance_criteria: ['Test file tests/unit/cron/chairman-hourly-heartbeat-backstop-sweep.test.js exists', 'Missed-hour and present-hour tests both pass as a matched pair', 'All existing chairman-comms tests (morning-brief, morning-review, sms-bridge, chairman-sms-gate, enqueue-is-not-sent) continue to pass unchanged'],
      },
    ],
    non_functional_requirements: [
      'NFR-1: Zero modification to scripts/adam-chairman-sms.mjs, scripts/adam-startup-check.mjs, or any live heartbeat_status send path (deliberately additive design per LEAD-phase risk findings).',
      'NFR-2: No modification to the sms_outbound_obligations schema or to the morning-brief/morning-review sweeps.',
    ],
    technical_requirements: [
      'TR-1: New files only: .github/workflows/chairman-hourly-heartbeat-backstop-cron.yml, scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs, tests/unit/cron/chairman-hourly-heartbeat-backstop-sweep.test.js, plus a small shared content-builder module if the backstop body logic warrants its own file.',
      'TR-2: The sweep must accept a dependency-injected supabase client (and ideally an injectable send function) for testability, matching the DI shape of chairman-morning-brief-sweep.mjs.',
    ],
    system_architecture: 'Additive GHA-cron sweep sitting alongside the existing chairman-sms machinery. Reads sms_outbound_obligations for existence-in-current-hour (read-check dedupe across kind IN [heartbeat_status, heartbeat_status_backstop]); on a miss, calls the existing sendChairmanSMS() gated pipeline with a new, distinct kind (heartbeat_status_backstop) and its own dedupeKey namespace, so it never shares state or races with the live heartbeat path. No changes to the live send path, the dedupe/enqueue library, or the SMS provider integration.',
    data_model: { note: 'No schema change. Backstop writes use the existing sms_outbound_obligations table with a new kind value (heartbeat_status_backstop, no CHECK constraint on kind).' },
    api_specifications: [],
    ui_ux_requirements: [],
    implementation_approach: '1) Write a pure dedupeKey-derivation helper (chairman-zone-hour-keyed) scoped to the backstop kind. 2) Write the read-check query (kind IN [heartbeat_status, heartbeat_status_backstop], created_at within current chairman-zone hour). 3) Write the stale-retry status-branch logic (FR-2b). 4) Write the dedicated last-hour-delta content builder with minimal-presence fallback (FR-4). 5) Wire the sweep\'s main() to: coarse window pre-filter -> read-check -> (no-op | stale-retry | fresh send via sendChairmanSMS). 6) Write the GHA workflow mirroring chairman-morning-brief-cron.yml\'s concurrency-group pattern. 7) Write FR-5\'s two-sided DI-stub tests, asserting on send-call counts. 8) Run the full existing chairman-comms test suite to confirm zero regressions (no shared code path was modified).',
    technology_stack: ['Node.js (ESM)', 'GitHub Actions (scheduled workflow)', 'Supabase (sms_outbound_obligations)', 'Vitest (existing project test runner)'],
    dependencies: [],
    test_scenarios: [
      'Missed-hour: no heartbeat_status/heartbeat_status_backstop row for the current chairman-zone hour -> sendChairmanSMS called exactly once with kind=heartbeat_status_backstop.',
      'Present-hour (live already sent): a heartbeat_status row exists for the current hour -> zero send calls.',
      'Present-hour (backstop already filled): a heartbeat_status_backstop row (status=sent) exists for the current hour -> zero send calls.',
      'Stale-retry: a heartbeat_status_backstop row exists for the current hour with status=failed, created >5 min ago -> a retry send call is made.',
      'Quiet-hours pass-through: sendChairmanSMS stub returns a quiet-hours-blocked result -> sweep surfaces no-send correctly (not swallowed as a success).',
      'Coarse window pre-filter: hours outside 06:00-22:00 chairman-zone -> sweep is inert, zero DB reads/writes attempted.',
    ],
    acceptance_criteria: [
      'A missed live heartbeat is filled by the backstop within one self-healing window tick.',
      'No double-send occurs against a live heartbeat or a prior backstop fill in the same chairman-zone hour.',
      'Quiet-hours (chairman-zone 22:00-06:00) produces no backstop sends, via the existing sendChairmanSMS gate.',
      'FR-5\'s two-sided test pair both pass, and the full existing chairman-comms test suite passes unchanged.',
    ],
    performance_requirements: {},
    plan_checklist: [
      { text: 'PRD created and saved', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'Integration & operationalization documented', checked: true },
      { text: 'Exploration summary documented', checked: true },
      { text: 'Resource requirements estimated', checked: true },
      { text: 'Timeline and milestones set', checked: true },
      { text: 'Risk assessment completed', checked: true },
    ],
    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written', checked: false },
      { text: 'Integration tests completed', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
    ],
    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false },
    ],
    progress: 0,
    phase: 'LEAD_APPROVAL',
    phase_progress: {},
    risks: [
      { risk: 'Risk: GHA scheduled-workflow lag/drop under platform load could still delay a backstop fill within its own window. Mitigation: self-healing window with multiple ticks (mirroring the morning-brief precedent\'s own documented workaround), not a single-fire cron.', mitigation: 'Address during implementation (FR-1 self-healing window).' },
      { risk: 'Risk: a new kind value (heartbeat_status_backstop) on sms_outbound_obligations could surprise downstream consumers that enumerate/filter kind without expecting new values. Mitigation: grep all consumers of sms_outbound_obligations.kind during EXEC to confirm none hard-code an exhaustive allowlist that would silently drop the new kind.', mitigation: 'Address during implementation (EXEC-phase grep before shipping).' },
    ],
    constraints: [],
    assumptions: [],
    stakeholders: [],
    metadata: {
      validation_conditions: {
        'COND-1': 'Do not share a dedupe key/kind with the live heartbeat path — folded into FR-2/FR-2c',
        'COND-2': 'Send via sendChairmanSMS, not raw enqueueChairmanSms — folded into FR-2c',
        'COND-3': 'Stale-retry by status readback, not key-existence — folded into FR-2b',
      },
    },
    document_type: 'prd',
    reasoning_depth: 'standard',
  };

  const { data, error } = await supabase.from('product_requirements_v2').insert(prd).select('id,title').single();
  if (error) {
    console.error('PRD INSERT ERROR:', error);
    process.exit(1);
  }
  console.log('PRD created:', JSON.stringify(data, null, 2));
}

main();
