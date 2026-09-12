import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';
const SD_ID = '4520716b-0603-46b5-bf7e-19fe4271fe3b';

const prd = {
  id: `PRD-${SD_KEY}`,
  directive_id: SD_KEY,
  sd_id: SD_ID,
  title: 'Demand Engine Go-Live Gate: Part A — Fail-Closed Predicate Arming and Mirror Site Extension',
  version: '1.0',
  status: 'approved',
  category: 'infrastructure',
  priority: 'high',
  document_type: 'prd',
  goal_summary: 'Arm and correct the existing go-live predicate at the publisher choke point so no real customer outreach occurs below go-live, and close the mock/real accounting gap that lets a simulated publish count as real.',
  executive_summary: 'Arms the existing stage-gate predicate (lib/governance/stage-gate-predicate.js), corrects it to stage>=24 AND launch_mode=\'live\' with is_demo forced to mock, fixes the return-contract gap where dry-run publishes are counted as real, and extends gating to 5 mirror sites.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Create and arm the STAGE_GATE_PREDICATE_ARMED feature flag in leo_feature_flags',
      description: 'leo_feature_flags currently has 25 rows and none of them is STAGE_GATE_PREDICATE_ARMED (or any STAGE_GATE_* key). isEnabled() fails safe to false for a missing flag, so shouldEnforceBlock() in lib/governance/stage-gate-predicate.js (line 309) returns false at every call site even when checkStageGate() correctly computes a BLOCK verdict. This FR creates the flag row and, ONLY after FR-7 (the STAGE-GATE-PREDICATE-001 obligation) is resolved or waived, sets is_enabled=true.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'A row exists in leo_feature_flags with flag_key=STAGE_GATE_PREDICATE_ARMED',
        'Before arming, shouldEnforceBlock() is live-probed against a real below-go-live venture (e.g. AltifyAI) and confirmed to still return false (documents the pre-fix baseline)',
        'After arming, the same probe returns true for the same venture',
      ],
    },
    {
      id: 'FR-2',
      requirement: "Correct the go-live predicate to stage>=24 AND launch_mode='live', with is_demo=true forced to mock rather than exempted",
      description: 'Measured: 141/171 ventures are is_demo=true and would stay permanently ungated by an is_demo-blind predicate; the only 2 non-demo ventures past stage 24 both carry launch_mode=\'simulated\'. A stage-only predicate (ignoring launch_mode) would incorrectly treat those as real-cleared. checkStageGate/shouldEnforceBlock in lib/governance/stage-gate-predicate.js must incorporate launch_mode and is_demo as first-class inputs, not leave them as an excluded dimension.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'A venture with current_lifecycle_stage>=24 and launch_mode=\'simulated\' is blocked (shouldEnforceBlock()===true)',
        'A venture with is_demo=true is force-mocked regardless of stage or launch_mode (never treated as out-of-scope/ungated)',
        'A venture with current_lifecycle_stage>=24, launch_mode=\'live\', is_demo=false passes (shouldEnforceBlock()===false)',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'Fix the return-contract gap so a dry-run/mock publish is never counted as a real one',
      description: "publisher.publish() in lib/marketing/publisher/index.js returns {success:true, dryRun:true} on its dry-run branch (line 117), but content-pipeline.js (line 136) and owned-audience-content-loop.js (line 173) both read only .success before incrementing totalPublished, recording spend, or writing status='posted'. owned-audience-content-loop.js specifically persists the dry-run publish to the DB as a completed real publish. Both callers must branch on a real mode field (or .dryRun) before treating a publish as real.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'content-pipeline.js does not increment totalPublished or call recordSpend when publish() returns dryRun:true or mode:\'mock\'',
        "owned-audience-content-loop.js does not write marketing_content_queue.status='posted' when publish() returns dryRun:true or mode:'mock'",
        'A unit test exercises both callers against a forced-mock publish() response and asserts neither treats it as real',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Add a mock/synthetic discriminator to venture_channel_publish_ledger before any mock send path exists, and exclude discriminated rows from the autonomy graduation streak',
      description: 'evaluateGraduation() in lib/marketing/autonomy-gate.js (lines 474-495) counts ledger rows toward a channel\'s autonomy streak with no mock filter today. Once FR-1/FR-2/FR-3 make mock publishes routine below go-live, an undiscriminated mock row would feed the same streak count that grants real, unsupervised publish authority — reintroducing the exact harm class this SD exists to prevent. The discriminator column must land in the SAME change as the first code path that can produce a mock-shaped ledger row (this SD\'s own Part A acceptance test exercises force-mock paths).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'venture_channel_publish_ledger has a new column (e.g. is_synthetic or send_mode) distinguishing mock from real rows',
        'Every mock-forced publish writes that discriminator on the ledger row',
        'evaluateGraduation() excludes discriminator-marked rows from its streak computation — a unit test proves N mock-discriminated accepted rows never satisfy the graduation streak',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'Extend the corrected predicate to 5 mirror sites: publisher/index.js, email-campaigns.js processStep(), email-campaigns.js sendEmail(), venture-consent.js, and the outbound-ledger DB trigger',
      description: "processStep() in lib/marketing/ai/email-campaigns.js (line 129) already calls shouldEnforceBlock() before sendEmail() (line 179), but sendEmail() itself (line 60) is independently exported via lib/marketing/index.js with no gate of its own — a caller that invokes sendEmail() directly bypasses processStep()'s check entirely. lib/marketing/venture-consent.js's resolveSendPermission() (line 76) is the consent-side mirror. A DB trigger on the outbound ledger provides a last-line defense independent of application code. sovereign-alert.js is explicitly EXCLUDED (chairman/operator emergency alerting, not customer outreach — gating it would suppress emergency alerts for all 171 pre-go-live ventures).",
      priority: 'HIGH',
      acceptance_criteria: [
        'sendEmail() itself refuses (SEND_REFUSAL) for a below-go-live venture even when called without going through processStep()',
        'venture-consent.js resolveSendPermission() denies for a below-go-live venture',
        'A DB trigger on the outbound ledger / venture_consent_events rejects inserts for a below-go-live venture independent of application-layer gating',
        'sovereign-alert.js remains ungated; a test documents this as an intentional exclusion, not an oversight',
      ],
    },
    {
      id: 'FR-6',
      requirement: 'CI acceptance test suite asserts shouldEnforceBlock()===true as the discriminator, never checkStageGate().blocked',
      description: "checkStageGate() computes the correct blocked:true verdict today even while the publish still proceeds (the predicate is correct; only the arming/enforcement path is broken). A test asserting on checkStageGate().blocked alone would pass green against the current inert code and prove nothing about whether enforcement actually happened. The negative-test suite must assert on shouldEnforceBlock(), which is what FR-1 through FR-5 actually wire up.",
      priority: 'HIGH',
      acceptance_criteria: [
        'CI includes a negative test: with real-shaped channel credentials present and a below-go-live venture, zero adapter.publish calls, zero email sends (including direct sendEmail() calls), zero consent-event writes, zero undiscriminated venture_channel_publish_ledger rows',
        'The negative test asserts on shouldEnforceBlock()===true, not checkStageGate().blocked',
        'The negative-test matrix includes at minimum AltifyAI (S23) and ApexNiche AI (S21), the two live active below-go-live ventures',
      ],
    },
    {
      id: 'FR-7',
      requirement: 'Resolve or explicitly waive the SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 atomic obligation before arming, and file the deferred Part B follow-on SD',
      description: "SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (completed 2026-08-25) attached an atomic requirement to arming: HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED and LEO_HIGH_CONSEQUENCE_GATES_ENABLED were to graduate atomically with STAGE_GATE_PREDICATE_ARMED. Both flags remain is_enabled=true today with that FR undischarged. This SD's arming step (the is_enabled=true flip in FR-1) must not proceed until the coordinator/chairman either graduates those 2 flags or documents an explicit waiver. This is a precondition on ARMING, not on BUILDING — all other FRs can be implemented and merged first. Separately, a follow-on SD must be filed for the deferred Part B (mock first-stranger run), since this SD's own scope reduction commits to it.",
      priority: 'HIGH',
      acceptance_criteria: [
        'A documented coordinator/chairman confirmation or waiver exists for the HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED / LEO_HIGH_CONSEQUENCE_GATES_ENABLED obligation before FR-1\'s is_enabled=true flip executes',
        'A follow-on SD exists in strategic_directives_v2 for Part B (the mock first-stranger run), citing this SD as a prerequisite and this SD\'s ledger discriminator (FR-4) as a dependency',
        'SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E\'s release condition is updated to reference the follow-on SD, not this SD, for its mock-run dependency',
      ],
    },
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'The feature flag (FR-1) is created via the existing leo_feature_flags governed insert path, never a hand-rolled SQL UPDATE',
      rationale: 'leo_feature_flags rows carry lifecycle_state, risk_tier, owner_type and other governance columns that a bare INSERT/UPDATE would leave null or wrong, breaking the fail-safe evaluator contract documented in lib/feature-flags/evaluator.js.',
    },
    {
      id: 'TR-2',
      requirement: 'The venture_channel_publish_ledger discriminator column (FR-4) is added via a chairman-gated migration, following the same schema-lint-disable-line convention already used for chairman-gated columns in this codebase (e.g. lib/eva/launch-mode.js:27, :78, :228)',
      rationale: 'ventures.launch_mode and launch_mode_audit are both chairman-gated DDL (database/migrations/20260703_ventures_launch_mode.sql, 20260705_launch_mode_audit.sql); the ledger discriminator is the same class of safety-relevant schema change and must go through the same review path, not a direct migration.',
    },
    {
      id: 'TR-3',
      requirement: 'All 5 mirror sites (FR-5) call the SAME checkStageGate()/shouldEnforceBlock() exported from lib/governance/stage-gate-predicate.js — no site implements its own copy of the predicate',
      rationale: 'A duplicate implementation was explicitly what this SD found and rejected: a canonical predicate already exists and is wired at 2 of the eventual 5 sites; writing a 5th implementation of the same check was the original sourced plan\'s mistake.',
    },
    {
      id: 'TR-4',
      requirement: 'No change to existing behavior for a venture already at launch_mode=\'live\', is_demo=false, current_lifecycle_stage>=24 — the corrected predicate must be behavior-preserving for the already-cleared population',
      rationale: 'Backward compatibility: this SD closes an enforcement gap, it does not re-litigate ventures that were already correctly past go-live under the current (unarmed) code path.',
    },
  ],
  system_architecture: {
    overview: 'One canonical predicate (lib/governance/stage-gate-predicate.js) is armed via a feature flag and evaluated at 5 call sites (the "mirrors") before any customer-facing send. A new discriminator column on the publish ledger keeps mock-forced sends from feeding the autonomy graduation streak, closing the loop between the go-live gate and the existing autonomy-gate.js safety architecture.',
    components: [
      { name: 'stage-gate-predicate.js', responsibility: 'Computes checkStageGate() (raw verdict) and shouldEnforceBlock() (armed, corrected enforcement decision) from ventures.current_lifecycle_stage, launch_mode, and is_demo', technology: 'Node.js module, Supabase-backed reads' },
      { name: 'leo_feature_flags / evaluator.js', responsibility: 'Stores and fail-safe-evaluates STAGE_GATE_PREDICATE_ARMED; absent-flag defaults to false (fail-closed for the flag itself, which is why the flag must exist AND be enabled)', technology: 'Postgres table + isEnabled()/evaluateFlag()' },
      { name: 'publisher/index.js', responsibility: 'Primary choke point; forces mock/deny before credential resolution when shouldEnforceBlock()===true', technology: 'Node.js, existing dry-run branch corrected to a real 3-way (real/mock/deny) contract' },
      { name: 'content-pipeline.js / owned-audience-content-loop.js', responsibility: 'Consumers of publisher.publish(); corrected to read the mode/dryRun field before counting a publish as real', technology: 'Node.js' },
      { name: 'email-campaigns.js (processStep/sendEmail)', responsibility: 'Mirror site; sendEmail() gains its own gate independent of processStep()', technology: 'Node.js, factory pattern (createEmailCampaigns)' },
      { name: 'venture-consent.js (resolveSendPermission)', responsibility: 'Consent-side mirror site', technology: 'Node.js' },
      { name: 'outbound ledger DB trigger', responsibility: 'Last-line defense independent of application code', technology: 'Postgres trigger, chairman-gated migration' },
      { name: 'venture_channel_publish_ledger + evaluateGraduation()', responsibility: 'Records publish outcomes; the new discriminator column keeps mock rows out of the autonomy graduation streak count', technology: 'Postgres table + autonomy-gate.js streak logic' },
    ],
    data_flow: 'A publish attempt reaches publisher/index.js -> shouldEnforceBlock(checkStageGate(venture)) is evaluated -> if true, the call is forced to the recording/mock adapter and the ledger row is written with the discriminator set -> content-pipeline.js/owned-audience-content-loop.js read the mode field and do not count it as real -> evaluateGraduation() later reads the ledger and skips discriminator-marked rows. Mirror sites (email-campaigns.js sendEmail, venture-consent.js, the DB trigger) each independently evaluate the same predicate for their own send/consent path.',
    integration_points: [
      'lib/governance/stage-gate-predicate.js (canonical predicate, already wired at 2 of 5 sites)',
      'leo_feature_flags (flag storage + fail-safe evaluator)',
      'venture_channel_publish_ledger (new discriminator column)',
      'lib/marketing/autonomy-gate.js evaluateGraduation() (streak-count consumer of the ledger)',
    ],
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'Happy path: non-demo venture, launch_mode=live, stage>=24 — real publish proceeds', test_type: 'integration', given: 'A venture with is_demo=false, launch_mode=\'live\', current_lifecycle_stage=25 and real-shaped channel credentials', when: 'publisher.publish() is called', then: 'shouldEnforceBlock() returns false and the call falls through to adapter.publish (mode=real)' },
    { id: 'TS-2', scenario: 'Negative: below-go-live venture with real credentials present — publish forced to mock', test_type: 'integration', given: 'A venture matching AltifyAI\'s shape (is_demo=false, launch_mode=\'simulated\', current_lifecycle_stage=23) with real-shaped credentials present', when: 'publisher.publish() is called', then: 'shouldEnforceBlock() returns true; zero adapter.publish calls occur; the ledger row is written with the mock discriminator set' },
    { id: 'TS-3', scenario: 'is_demo=true venture past stage 24 is force-mocked, never exempted', test_type: 'unit', given: 'A venture with is_demo=true, current_lifecycle_stage=25, launch_mode=\'live\'', when: 'checkStageGate()/shouldEnforceBlock() evaluate it', then: 'shouldEnforceBlock() returns true (forced mock), not treated as out-of-scope/ungated' },
    { id: 'TS-4', scenario: 'A forced-mock publish is not counted as real by either caller', test_type: 'unit', given: 'publisher.publish() returns {success:true, dryRun:true} (or mode:\'mock\')', when: 'content-pipeline.js and owned-audience-content-loop.js each process the result', then: 'totalPublished is not incremented, recordSpend is not called, and marketing_content_queue.status is not set to \'posted\'' },
    { id: 'TS-5', scenario: 'Mock-discriminated ledger rows never satisfy the autonomy graduation streak', test_type: 'unit', given: 'N consecutive venture_channel_publish_ledger rows all marked with the mock discriminator', when: 'evaluateGraduation() computes the channel\'s streak', then: 'the streak count excludes all discriminator-marked rows and graduation does not fire' },
    { id: 'TS-6', scenario: 'sendEmail() called directly (bypassing processStep()) on a below-go-live venture is refused', test_type: 'integration', given: 'A below-go-live venture and a direct call to email-campaigns.js sendEmail() (not via processStep())', when: 'sendEmail() executes', then: 'it returns/throws a SEND_REFUSAL token and no real email is sent (verified via the mock/recording transport, zero calls to the real Resend client)' },
    { id: 'TS-7', scenario: 'Error condition: STAGE_GATE_PREDICATE_ARMED flag row missing or disabled', test_type: 'unit', given: 'leo_feature_flags has no STAGE_GATE_PREDICATE_ARMED row, or is_enabled=false', when: 'shouldEnforceBlock() is called for any venture', then: 'it returns false (fails safe to the pre-fix behavior) — this is the documented baseline this SD changes, not a defect in the flag evaluator' },
  ],
  acceptance_criteria: [
    'shouldEnforceBlock() returns true for a live-probed real venture below go-live (e.g. AltifyAI) after FR-1/FR-2 are complete and the flag is armed',
    'A forced-mock publish is never counted as real by content-pipeline.js or owned-audience-content-loop.js (FR-3), and never contributes to the autonomy graduation streak (FR-4)',
    'All 5 mirror sites (publisher/index.js, email-campaigns.js processStep() + sendEmail(), venture-consent.js, the outbound-ledger DB trigger) independently refuse a below-go-live send, verified by grep/test',
    'CI includes a green negative-test job asserting shouldEnforceBlock()===true as the discriminator, covering at minimum AltifyAI and ApexNiche AI',
    'The STAGE-GATE-PREDICATE-001 atomic obligation (FR-7) has a documented resolution or waiver before the flag is flipped to is_enabled=true, and a Part B follow-on SD exists in strategic_directives_v2',
  ],
  risks: [
    {
      risk: "GATE-ON-DEAD-INSTRUMENT: the corrected predicate's PASS condition (launch_mode='live') has never been exercised for any of 171 ventures — arming closes the gate for everyone, including AltifyAI, until a SEPARATE chairman go-live decision sets launch_mode='live'.",
      probability: 'HIGH',
      impact: 'MEDIUM',
      mitigation: 'Document explicitly in status communications and the retro that Part A is a safety fix, not a launch-unblock — the separate chairman go-live decision remains a prerequisite for AltifyAI to ever pass the corrected gate.',
      rollback_plan: 'Disable the STAGE_GATE_PREDICATE_ARMED flag (is_enabled=false) to return to the pre-fix permissive behavior; this reopens the safety gap and must be treated as an emergency-only rollback, documented as such.',
    },
    {
      risk: 'SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 left an atomic FR undischarged (HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED / LEO_HIGH_CONSEQUENCE_GATES_ENABLED were meant to graduate atomically with arming); arming this SD alone without resolving that obligation may violate the predecessor SD\'s own safety design intent.',
      probability: 'MEDIUM',
      impact: 'HIGH',
      mitigation: 'FR-7 makes flag-arming (not code-building) contingent on an explicit coordinator/chairman resolution or documented waiver of that obligation.',
      rollback_plan: 'If the obligation surfaces only after arming, disable STAGE_GATE_PREDICATE_ARMED immediately and escalate to the coordinator/chairman before re-arming.',
    },
    {
      risk: 'A mock/synthetic publish with no ledger discriminator could feed evaluateGraduation()\'s streak count and grant a channel real, unsupervised publish authority earned entirely by simulated activity.',
      probability: 'MEDIUM',
      impact: 'CRITICAL',
      mitigation: 'FR-4 adds the discriminator column and the evaluateGraduation() filter in the same change as the first code path that can produce a mock-shaped ledger row, before Part A\'s own acceptance test can exercise force-mock paths.',
      rollback_plan: 'If a graduation is found to have been earned via undiscriminated mock rows, revoke the affected channel\'s autonomy_state back to propose_and_approve and audit venture_channel_publish_ledger for the affected window.',
    },
    {
      risk: "A stage-only predicate (ignoring launch_mode) would leave 141/171 ventures (is_demo=true) permanently ungated and grant real-publish authority to the 2 non-demo ventures past stage 24 that self-declare launch_mode='simulated'.",
      probability: 'LOW',
      impact: 'HIGH',
      mitigation: "FR-2 corrects the predicate to stage>=24 AND launch_mode='live', with is_demo=true forced to mock rather than exempted.",
      rollback_plan: 'Covered by TS-2/TS-3 CI tests; a regression here fails CI before merge, so no runtime rollback path is expected to be needed.',
    },
    {
      risk: 'Extending gating to 5 mirror sites introduces a behavior change for existing callers that previously sent unconditionally (e.g. a direct sendEmail() caller).',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'TR-4 requires the change to be behavior-preserving for already-cleared ventures (launch_mode=live, is_demo=false, stage>=24); only below-go-live sends change behavior, which is the intended fix.',
      rollback_plan: 'Each mirror site\'s gate is independently feature-flag-gated on STAGE_GATE_PREDICATE_ARMED, so disabling the flag reverts all 5 sites to their pre-fix behavior simultaneously.',
    },
  ],
  implementation_approach: {
    phases: [
      { phase: 'Phase 1 — Flag + predicate correction', description: 'Create the STAGE_GATE_PREDICATE_ARMED flag row (disabled); correct checkStageGate()/shouldEnforceBlock() to incorporate launch_mode and is_demo (FR-1, FR-2).', deliverables: ['leo_feature_flags row created', 'stage-gate-predicate.js updated with unit tests (TS-2, TS-3)'] },
      { phase: 'Phase 2 — Ledger discriminator + graduation filter', description: 'Add the chairman-gated discriminator column to venture_channel_publish_ledger and filter it in evaluateGraduation() (FR-4) before any mock send path exists.', deliverables: ['Migration for the discriminator column', 'evaluateGraduation() updated with unit test (TS-5)'] },
      { phase: 'Phase 3 — Return-contract fix', description: 'Fix publisher/index.js\'s dry-run/mock contract and update content-pipeline.js + owned-audience-content-loop.js to read it (FR-3).', deliverables: ['publisher/index.js real/mock/deny contract', 'Both callers updated with unit test (TS-4)'] },
      { phase: 'Phase 4 — Mirror site extension', description: 'Gate email-campaigns.js sendEmail(), venture-consent.js, and add the outbound-ledger DB trigger (FR-5).', deliverables: ['sendEmail() gate', 'venture-consent.js gate', 'DB trigger migration', 'integration test (TS-6)'] },
      { phase: 'Phase 5 — CI suite, arming, and follow-on filing', description: 'Land the CI negative-test suite (FR-6); resolve/waive the STAGE-GATE-PREDICATE-001 obligation and flip the flag to enabled (FR-7); file the Part B follow-on SD.', deliverables: ['CI job asserting shouldEnforceBlock()', 'Documented obligation resolution/waiver', 'Flag enabled', 'Follow-on SD filed in strategic_directives_v2'] },
    ],
    technical_decisions: [
      'Reuse the existing lib/governance/stage-gate-predicate.js predicate rather than author a new one — a 5th implementation of the same check was the original sourced plan\'s mistake',
      'is_demo=true forces mock rather than being treated as out-of-scope — measured that 141/171 ventures are is_demo=true and would otherwise stay permanently ungated',
      'The ledger discriminator column lands before the first code path that can produce a mock-shaped row, not after, closing the graduation-streak safety gap at its origin rather than patching it later',
      'Flag ARMING (is_enabled=true) is decoupled from code BUILDING — all 5 FRs before FR-7 can merge without waiting on the STAGE-GATE-PREDICATE-001 obligation resolution',
    ],
  },
  integration_operationalization: {
    consumers: [
      { name: 'content-pipeline.js', interaction: 'Calls publisher.publish() and must read the corrected mode/dryRun field', frequency: 'Per scheduled content-publish run' },
      { name: 'owned-audience-content-loop.js', interaction: 'Calls publisher.publish() and persists status to marketing_content_queue', frequency: 'Per content-loop cycle' },
      { name: 'email-campaigns.js callers (via lib/marketing/index.js)', interaction: 'Call sendEmail()/processStep() for enrollment sends', frequency: 'Per email-campaign step' },
    ],
    dependencies: [
      { name: 'leo_feature_flags', type: 'upstream', contract: 'STAGE_GATE_PREDICATE_ARMED row read via isEnabled()/evaluateFlag(), fail-safe to false if absent', failure_handling: 'Missing/errored flag read fails closed to the pre-fix (unarmed) behavior — no new blast radius from a flag-read failure' },
      { name: 'ventures table (launch_mode, is_demo, current_lifecycle_stage)', type: 'upstream', contract: 'Read-only inputs to checkStageGate()', failure_handling: 'A read failure must propagate as a BLOCK, never silently pass through as allow' },
      { name: 'venture_channel_publish_ledger', type: 'downstream', contract: 'Every publish attempt (real or mock) writes a row, now carrying the discriminator', failure_handling: 'A failed ledger write must not itself permit a real send — the write and the send decision are ordered so ledger failure fails closed' },
      { name: 'SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 obligation (HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED / LEO_HIGH_CONSEQUENCE_GATES_ENABLED)', type: 'upstream', contract: 'Coordinator/chairman resolution or waiver required before FR-1\'s enable step', failure_handling: 'Arming is blocked (not code-building) until resolved' },
    ],
    data_contracts: [
      { contract_name: 'publisher.publish() return contract', schema: '{ success: boolean, mode: "real"|"mock"|"deny", dryRun?: boolean (deprecated alias, kept for one release) }', validation: 'Unit tests TS-1/TS-2/TS-4 assert both the mode field and caller behavior', versioning: 'dryRun retained one release for backward compatibility with any un-migrated caller, then removed in a follow-up' },
      { contract_name: 'venture_channel_publish_ledger discriminator', schema: 'New column (e.g. is_synthetic boolean or send_mode text) on venture_channel_publish_ledger', validation: 'Every mock-forced write sets it; evaluateGraduation() query filters on it', versioning: 'Chairman-gated migration, additive only (no backfill required — historical 3 rows are all decision=pending/outcome=unknown, pre-dating any real send)' },
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: ['STAGE_GATE_PREDICATE_ARMED (new, this SD)', 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED (pre-existing, FR-7 obligation)', 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED (pre-existing, FR-7 obligation)'],
      deployment_considerations: 'Code (FR-1 through FR-6) can deploy with the flag disabled with zero behavior change; the is_enabled=true flip (part of FR-1/FR-7) is a separate, governance-gated step.',
    },
    observability_rollout: {
      monitoring: ['Ratio of mock vs real rows in venture_channel_publish_ledger by venture and channel', 'Count of shouldEnforceBlock()===true decisions vs actual mock-forced sends (should be equal)'],
      alerts: ['Any adapter.publish (real send) recorded for a venture with current_lifecycle_stage<24 or launch_mode!=\'live\' or is_demo=true — should be impossible once armed; alert-then-alert as a defense-in-depth check'],
      rollout_strategy: 'Phased: deploy all code with the flag disabled first (Phases 1-4), land the CI suite (Phase 5), then flip the flag only after the FR-7 obligation is resolved',
      rollback_trigger: 'Any confirmed real send for a below-go-live venture, or any confirmed graduation earned via undiscriminated mock rows',
      rollback_procedure: 'Disable STAGE_GATE_PREDICATE_ARMED immediately (returns to pre-fix behavior); for a graduation-safety incident, additionally revoke the affected channel\'s autonomy_state to propose_and_approve',
    },
  },
  exploration_summary: {
    files_read: [
      'lib/marketing/autonomy-gate.js',
      'lib/governance/stage-gate-predicate.js',
      'lib/marketing/publisher/index.js',
      'lib/marketing/content-pipeline.js',
      'lib/marketing/owned-audience-content-loop.js',
      'lib/marketing/ai/email-campaigns.js',
      'lib/marketing/venture-consent.js',
      'lib/eva/launch-mode.js',
      'lib/services/sovereign-alert.js',
      'src/services/CalibrationService.js',
    ],
    patterns_identified: [
      'Chairman-gated columns/tables use a schema-lint-disable-line comment convention (e.g. lib/eva/launch-mode.js:27,78,228) — the discriminator migration should follow the same convention',
      'Injectable-factory pattern for testability (createEmailCampaigns({resendClient})) — already used in this codebase, informs how the follow-on Part B SD should design its audience-loader DI seam',
      'Feature flags fail safe to false when absent (lib/feature-flags/evaluator.js) — confirmed as the root cause of the live gap: the predicate computes correctly but the flag was never created',
    ],
    key_decisions: [
      'Reuse the existing predicate rather than write a new one (avoids a 5th implementation of the same check)',
      'Decouple flag ARMING from code BUILDING so the STAGE-GATE-PREDICATE-001 obligation (FR-7) blocks only the final enable step, not the implementation work',
      'Defer Part B (mock first-stranger run) to a follow-on SD — no audience-loader or DI seam exists today to build it safely inside this SD\'s scope',
    ],
    exploration_date: new Date().toISOString(),
  },
  metadata: {
    lead_scope_reduction_percentage: 55,
    lead_scope_reduction_note: 'Part B deferred to a follow-on SD per prospective testing-agent finding 28f7a641',
    mirror_site_count: 5,
    excluded_mirror_site: 'lib/services/sovereign-alert.js (operator/chairman emergency alerting, not customer outreach)',
  },
  created_by: 'Alpha-2 (PLAN phase, worker)',
};

const { data: existing } = await supabase.from('product_requirements_v2').select('id').eq('id', prd.id).maybeSingle();

let result;
if (existing) {
  result = await supabase.from('product_requirements_v2').update(prd).eq('id', prd.id).select('id,status');
} else {
  result = await supabase.from('product_requirements_v2').insert(prd).select('id,status');
}

if (result.error) {
  console.error('PRD WRITE ERROR:', result.error.message);
  process.exit(1);
}
console.log('PRD written:', JSON.stringify(result.data));
