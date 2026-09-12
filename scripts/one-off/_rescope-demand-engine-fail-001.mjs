import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';

const newScope = `### Part A ONLY -- the GO-LIVE gate (fail-closed, existing predicate armed + corrected, one choke point, mirrored)

RE-SCOPED AT LEAD (Alpha-2, 2026-09-12) per prospective testing-agent finding (evidence 28f7a641-16c3-4ef8-86c6-ba38b951597d): Part B (the faithful MOCK first-stranger run) is DEFERRED to a separate follow-on SD -- see "DEFERRED" section below for why. Q8 scope reduction: ~55% of the original plan's word count / 2 of 2 major parts is cut from this SD.

CORRECTIONS TO THE SOURCED PLAN (measured against current main, not the original citations):
- The correct file is lib/marketing/autonomy-gate.js (NOT lib/marketing/publisher/autonomy-gate.js, which does not exist).
- The honesty invariants (autonomy-gate.js:328-336) are NOT observe-only as the original plan claimed -- they are already fail-closed ENFORCING. They are UNREACHABLE (venture_channel_autonomy has 0 rows), which is a different and more specific problem: making them reachable, not switching a mode.
- A canonical go-live predicate ALREADY EXISTS: lib/governance/stage-gate-predicate.js (checkStageGate/shouldEnforceBlock, STAGE_GATE_REQUIRED_STAGE=24, reads ventures.current_lifecycle_stage). It is already wired at autonomy-gate.js:301 and email-campaigns.js:165 -- writing a new predicate would be a 5th implementation of the same check.
- MEASURED LIVE GAP: the predicate's arming flag STAGE_GATE_PREDICATE_ARMED is absent from leo_feature_flags. isEnabled() fails safe to false, so shouldEnforceBlock() returns false everywhere even when checkStageGate() correctly computes BLOCK. Live-probed against 3 real ventures (WTP Insights S15, Pipeline-Test S3, MarketLens S25): the gate computes the right verdict and the publish proceeds anyway.

SCOPE (revised):
1. Arm STAGE_GATE_PREDICATE_ARMED in leo_feature_flags (the existing predicate, not a new one).
2. CORRECT the predicate: the SD's own exclusion of is_demo/launch_mode is unsafe as originally stated -- measured that 141/171 ventures are is_demo=true (would stay permanently ungated by an is_demo-blind predicate) and the only 2 non-demo ventures past stage 24 both carry launch_mode='simulated'. The corrected predicate is stage>=24 AND launch_mode='live', with is_demo=true converted from OUT_OF_SCOPE to force-mock (never "ungated").
3. Fix the RETURN-CONTRACT gap: publisher.publish()'s existing dry-run branch (index.js:114-123) returns {success:true, dryRun:true} but NO caller reads .dryRun -- content-pipeline.js:131 and owned-audience-content-loop.js:169-174 both treat any success:true as a real, counted publish (increments totalPublished, records spend, marks content 'posted'). This must become a real ternary (allow-real / force-mock / deny) with BOTH callers updated in the same change, or a mock publish silently counts as a real one.
4. Add a mock/synthetic discriminator to venture_channel_publish_ledger BEFORE any mock send is possible -- required even for Part A alone, because MEASURED: mock-shaped publishes with no discriminator would feed evaluateGraduation()'s streak count (autonomy-gate.js:474-495, no mock filter today) and could grant a channel autonomous (real, unsupervised) publish authority earned entirely by simulated activity. This is the safety property this whole SD exists to protect; it must not regress even in the Part-A-only scope, since Part A's own acceptance test exercises force-mock paths.
5. Extend mirror sites from the sourced plan's 4 to 6 (measured, not assumed): email-campaigns.js's exported sendEmail() (has zero gates, unlike processStep() which is gated -- sendEmail() is the actual callable surface via lib/marketing/index.js), and lib/services/sovereign-alert.js (Discord webhook :218, raw Resend fetch :249, reachable from production via src/services/CalibrationService.js:340).
6. CI acceptance test must assert shouldEnforceBlock() === true specifically (not checkStageGate()'s blocked field) -- today the gate computes blocked:true while still permitting the publish; a test written against the wrong field would pass green against the current inert code.

Acceptance for the gate: the NEGATIVE test -- with real-shaped channel credentials present, launch_mode != 'live' or is_demo=true, a spy on the adapter boundary asserts zero adapter.publish calls, zero email sends (including via sendEmail() directly), zero consent-event writes, zero venture_channel_publish_ledger rows without the mock discriminator set -- run in CI.

DEFERRED (separate follow-on SD, NOT this SD): Part B, the faithful MOCK first-stranger run. Measured reason: the sourced "same pipeline, 2 substitutions" framing does not match current code -- no audience/recipient-list-loader module exists anywhere in the repo to substitute (loadAudience/getRecipients/resolveAudience/audienceSource: zero hits; audience is always a caller-supplied array today), ADAPTERS is a hardcoded module-scope const with no DI seam to swap in a recording adapter, and executePipeline() has zero production callers and no (params, deps) injection shape (unlike owned-audience-content-loop.js's existing convention). Building Part B inside this SD would require either invasive production-code changes or a risky duplicate fork, producing exactly the half-fix class the finding warns about. The follow-on SD should design the audience-loader + DI seams first (following the createEmailCampaigns({resendClient}) injectable-factory convention already used in this codebase), informed by this SD's mock/synthetic ledger discriminator (item 4 above) as a prerequisite.`;

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('scope, description, success_criteria, risks, scope_reduction_percentage')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ ERROR:', readErr.message); process.exit(1); }

const newSuccessCriteria = [
  { criterion: 'STAGE_GATE_PREDICATE_ARMED is set in leo_feature_flags and shouldEnforceBlock() returns true for a real (non-demo, non-live) venture -- verified live, not just unit-tested.', measure: 'Live probe against a real venture row shows shouldEnforceBlock()===true' },
  { criterion: 'Predicate corrected to stage>=24 AND launch_mode=\'live\', with is_demo=true converted to force-mock (never OUT_OF_SCOPE/ungated).', measure: 'Unit test: an is_demo=true venture forces mock; a launch_mode=simulated venture past stage 24 forces mock' },
  { criterion: 'publisher.publish()\'s mock/real distinction is read by BOTH content-pipeline.js and owned-audience-content-loop.js -- neither counts a forced-mock publish as a real one.', measure: 'Unit test: a forced-mock publish does not increment totalPublished, does not call recordSpend, does not mark content status=posted' },
  { criterion: 'venture_channel_publish_ledger carries a mock/synthetic discriminator BEFORE any mock send path exists, and evaluateGraduation() excludes discriminated-mock rows from its streak count.', measure: 'Unit test: N mock-discriminated accepted rows never satisfy the graduation streak' },
  { criterion: 'Gate negative test green in CI: real-shaped credentials present, venture below go-live -- zero adapter.publish, zero email sends (via sendEmail() directly), zero consent-event writes, zero undiscriminated ledger rows.', measure: 'CI job green, asserts shouldEnforceBlock()===true as the discriminator, not checkStageGate().blocked' },
  { criterion: 'Mirror sites extended to 6: publisher/index.js, email-campaigns.js processStep() AND sendEmail(), venture-consent.js, the outbound-ledger DB trigger, sovereign-alert.js.', measure: 'Grep/test confirms all 6 call sites route through the corrected, armed predicate' },
  { criterion: 'A follow-on SD is filed for Part B (the mock first-stranger run) documenting the audience-loader + DI-seam prerequisite work; SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E\'s release condition references the follow-on SD, not this one, for its mock-run dependency.', measure: 'Follow-on SD exists in strategic_directives_v2 with this SD as a cited prerequisite' },
];

const newRisks = [
  {
    risk: 'SAFETY: a mock/synthetic publish with no ledger discriminator could feed evaluateGraduation()\'s streak count and grant a channel real, unsupervised publish authority earned entirely by simulated activity -- reintroducing the exact harm class this SD exists to prevent.',
    impact: 'critical',
    likelihood: 'medium',
    mitigation: 'Add the mock/synthetic discriminator column to venture_channel_publish_ledger and filter it out of evaluateGraduation()\'s streak count BEFORE any mock-shaped publish is possible, even under Part A alone (its own acceptance test exercises force-mock paths).',
  },
  {
    risk: 'A stage-only (stage>=24, ignoring launch_mode) predicate would leave 141/171 ventures (is_demo=true) permanently ungated and grant real-publish authority to the only 2 non-demo ventures past stage 24, both of which self-declare launch_mode=simulated.',
    impact: 'high',
    likelihood: 'high',
    mitigation: 'Predicate corrected to stage>=24 AND launch_mode=\'live\'; is_demo=true forces mock rather than being treated as out-of-scope.',
  },
  ...(current.risks || []),
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    scope: newScope,
    success_criteria: newSuccessCriteria,
    risks: newRisks,
    scope_reduction_percentage: 55,
    updated_by: 'Alpha-2 (LEAD scope reduction, Q8)',
  })
  .eq('sd_key', SD_KEY);

if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log('SD scope updated: Part A only, Part B deferred to a follow-on SD.');
