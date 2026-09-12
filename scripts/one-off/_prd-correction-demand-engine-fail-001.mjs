import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';
const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, risks')
  .eq('id', PRD_ID)
  .single();
if (readErr) { console.error('READ ERROR:', readErr.message); process.exit(1); }

const VERIFIER = 'Alpha-2 (PLAN phase, post-testing-agent code-read pass b838aa79-22c1-4006-a15c-fc5f171ee2d6)';

// --- Corrected functional_requirements: replace FR-3, FR-4, FR-5 in place ---
const frs = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      requirement: 'Fix the credential-dry-run ledger-correlation gap (data-integrity, NOT the go-live safety property)',
      description: "VERIFIED (post-testing-agent): the go-live safety property does NOT depend on this fix -- checkPublishAuthorization() (lib/marketing/autonomy-gate.js:293-309) already calls checkStageGate()/shouldEnforceBlock() as the single choke point BEFORE any ledger write, and returns {allowed:false} -> publisher/index.js returns {success:false, blockedBy:'autonomy-gate'} with ZERO ledger rows and ZERO adapter calls once armed (FR-1/FR-2 alone close that gap). The REAL, narrower bug: for an AUTHORIZED autonomous-tier publish, checkPublishAuthorization() unconditionally writes a decision:'accepted' ledger row (autonomy-gate.js:349-364) BEFORE publisher/index.js's own credential-resolution dry-run branch (index.js:104-123) runs. If credentials are then found missing, the publish returns {success:true, dryRun:true, ledgerCorrelationId} -- the ledger row now asserts 'accepted' for a send that never actually went out. publisher/index.js already surfaces ledgerCorrelationId on this and other failure paths (per its own round-2-adversarial-review comment at line ~76) specifically so this can be reconciled -- but recordPublishOutcome() (autonomy-gate.js:444), the ONLY function that can move a ledger row's outcome away from 'unknown', has ZERO production callers anywhere in the codebase (verified by repo-wide grep). This FR closes that reconciliation gap: content-pipeline.js and owned-audience-content-loop.js must call recordPublishOutcome() with the real observed result (dry-run counts as a non-shipped outcome, never 'shipped_clean') instead of only reading .success for their own totalPublished/status bookkeeping.",
      priority: 'MEDIUM',
      acceptance_criteria: [
        "content-pipeline.js and owned-audience-content-loop.js call recordPublishOutcome() with the actual observed outcome (dry-run/no-credentials never resolves to 'shipped_clean')",
        'Neither caller increments totalPublished, calls recordSpend, or marks content status=posted when publish() returns dryRun:true',
        'A unit test proves a dry-run publish leaves its ledger row at an outcome other than shipped_clean',
      ],
    };
  }
  if (fr.id === 'FR-4') {
    return {
      ...fr,
      requirement: "Keep the mock/synthetic ledger discriminator as defense-in-depth, downgraded from the SD's original CRITICAL framing",
      description: "VERIFIED (post-testing-agent): the acute threat described at LEAD -- 'a mock publish inflates the graduation streak today' -- does not exist today: evaluateGraduation() (autonomy-gate.js:472-510) already filters .neq('outcome','unknown') and only counts decision='accepted' AND outcome='shipped_clean' rows; recordPublishOutcome(), the ONLY writer of a non-'unknown' outcome, has ZERO production callers anywhere in this codebase. Every ledger row today (all 3 of them) sits at outcome='unknown' forever, so evaluateGraduation() can never fire a graduation for ANY channel right now, mock or real -- a SEPARATE gate-on-dead-instrument finding on the graduation mechanism itself, not something this SD introduces or must fix. This FR is retained as forward-looking defense-in-depth: once FR-3 wires up recordPublishOutcome() calls (which is a prerequisite for the graduation mechanism to ever function at all), a discriminator must exist so a dry-run/mock send can never be recorded as shipped_clean. Sequencing: land the discriminator in the SAME change as FR-3's recordPublishOutcome() wiring, not before -- there is no live exploit window to close urgently.",
      priority: 'MEDIUM',
      acceptance_criteria: [
        'venture_channel_publish_ledger has a new discriminator column (or FR-3\'s outcome values themselves encode mock vs real -- e.g. a dedicated dry_run/mock outcome value distinct from shipped_clean)',
        'evaluateGraduation() (or its outcome vocabulary) makes it structurally impossible for a dry-run/mock send to be recorded as shipped_clean',
        'A mixed-fixture unit test (older real shipped_clean rows + newer mock-shaped rows) proves the mock rows never contribute to the streak -- an all-mock fixture alone does not exercise the actual laundering vector',
      ],
    };
  }
  if (fr.id === 'FR-5') {
    return {
      ...fr,
      description: fr.description + " CORRECTION (post-testing-agent): lib/marketing/ai/email-campaigns.js's sendEmail({to, subject, html, from, tags}) (line 60) and its factory createEmailCampaigns() deps (line 46) carry NO ventureId today. Adding an OPTIONAL ventureId parameter fails OPEN (a caller that omits it hits the 'no_venture_id' rule -> OUT_OF_SCOPE -> shouldEnforceBlock()===false -> send proceeds) -- exactly the bypass this FR exists to close. ventureId (or an equivalent venture-linkage context) must become a REQUIRED parameter of sendEmail(), with every existing call site updated to supply it, and absence must fail CLOSED (refuse), not fail open.",
    };
  }
  return fr;
});

// --- Corrected test_scenarios: replace TS-2, TS-3, TS-5, TS-6, TS-7 in place ---
const tsMap = {
  'TS-2': {
    id: 'TS-2',
    scenario: 'Negative: below-go-live venture with real credentials present -- stage-gate denies BEFORE any ledger row, via the existing autonomy-gate.js choke point',
    test_type: 'integration',
    given: "A venture matching AltifyAI's shape (is_demo=false, launch_mode='simulated', current_lifecycle_stage=23) with real-shaped channel credentials present, and STAGE_GATE_PREDICATE_ARMED enabled",
    when: 'publisher.publish() is called',
    then: "checkPublishAuthorization() calls checkStageGate()/shouldEnforceBlock(), which returns allowed:false BEFORE the venture_channel_publish_ledger insert; publish() returns {success:false, blockedBy:'autonomy-gate'}; zero adapter.publish calls occur; zero venture_channel_publish_ledger rows are written for this attempt (a clean deny, not a discriminated mock row)",
  },
  'TS-3': {
    id: 'TS-3',
    scenario: 'is_demo=true venture past stage 24 is force-mocked, never exempted',
    test_type: 'unit',
    given: "A venture with is_demo=true, current_lifecycle_stage=25, launch_mode='live'",
    when: "checkStageGate({supabase, ventureId, requiredStage, actorType, actorId}) computes the raw verdict, then shouldEnforceBlock(result) evaluates it",
    then: 'shouldEnforceBlock(result) returns true (forced block), not treated as out-of-scope/ungated -- is_demo is read inside checkStageGate(), not by shouldEnforceBlock() directly (shouldEnforceBlock is a pure function over the already-computed result object)',
  },
  'TS-5': {
    id: 'TS-5',
    scenario: "Once FR-3's recordPublishOutcome() wiring exists, mock-discriminated ledger rows never satisfy the autonomy graduation streak, even alongside older real clean rows",
    test_type: 'unit',
    given: 'A mixed fixture: several OLDER real shipped_clean+accepted rows, followed by several NEWER mock-discriminated rows for the same venture/channel',
    when: 'evaluateGraduation() computes the channel\'s streak (ordered by created_at descending, limit requiredStreak)',
    then: "the streak-counting loop breaks at the first newest mock-discriminated row (since it is not decision='accepted' AND outcome='shipped_clean'), so cleanStreak reflects zero regardless of how many older real rows exist beneath it -- an all-mock fixture alone (cleanStreak=0 trivially) does not exercise this; the mixed fixture is the actual laundering vector this test must close",
  },
  'TS-6': {
    id: 'TS-6',
    scenario: 'sendEmail() requires venture linkage and refuses a below-go-live venture even when called directly (bypassing processStep())',
    test_type: 'integration',
    given: 'A below-go-live venture and a direct call to email-campaigns.js sendEmail(), now requiring a mandatory ventureId (or equivalent venture-linkage) parameter',
    when: 'sendEmail() executes with that ventureId supplied',
    then: 'it returns/throws a SEND_REFUSAL token and no real email is sent (verified via the mock/recording transport, zero calls to the real Resend client); a call that OMITS ventureId is a caller-side type/contract error, not a silent ungated bypass',
  },
  'TS-7': {
    id: 'TS-7',
    scenario: "Error condition: STAGE_GATE_PREDICATE_ARMED flag row missing or disabled -- checkStageGate()'s flag read fails safe",
    test_type: 'unit',
    given: "leo_feature_flags has no STAGE_GATE_PREDICATE_ARMED row, or is_enabled=false",
    when: 'checkStageGate({...}) reads the flag (lib/governance/stage-gate-predicate.js:243) and shouldEnforceBlock(result) evaluates the result',
    then: 'shouldEnforceBlock(result) returns false (fails safe to the pre-fix behavior) -- this is the documented baseline this SD changes via FR-1, not a defect in the flag evaluator',
  },
};
const testScenarios = prd.test_scenarios.map((ts) => tsMap[ts.id] || ts);

// --- Corrected risks: downgrade the mock/graduation risk, add the dead-instrument note ---
const risks = prd.risks.map((r) => {
  if (r.risk.startsWith('A mock/synthetic publish with no ledger discriminator')) {
    return {
      ...r,
      risk: r.risk + " CORRECTED SEVERITY (post-testing-agent verification): evaluateGraduation()'s outcome-recording loop (recordPublishOutcome) has ZERO production callers today -- every ledger row sits at outcome='unknown' forever, so no channel can graduate via this path currently regardless of mock or real activity. This is a live-today non-issue; it becomes live only once FR-3 wires up recordPublishOutcome() calls, at which point FR-4's discriminator must already be in place (built in the same change).",
      probability: 'LOW',
      impact: 'MEDIUM',
    };
  }
  return r;
});
risks.push({
  risk: "NEWLY VERIFIED (PLAN phase, post-testing-agent): the venture_channel_publish_ledger graduation mechanism (recordPublishOutcome -> evaluateGraduation) is itself a separate gate-on-dead-instrument -- recordPublishOutcome() has zero production callers anywhere in the codebase, so no channel has ever graduated or can currently graduate regardless of this SD. Out of scope to fully wire up (that is a larger, separate SD), but FR-3/FR-4 must not be built as if closing an active exploit -- there is none today.",
  probability: 'HIGH',
  impact: 'LOW',
  mitigation: 'Document this finding in the retro; do not oversell FR-3/FR-4 as closing a live safety gap. Consider filing a small follow-on SD to wire recordPublishOutcome() into a real outcome signal (e.g. a platform delivery webhook or scheduled reconciliation job) if the autonomy graduation feature is meant to ever activate.',
  rollback_plan: 'N/A -- documentation-only finding, no code to roll back.',
});

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs, test_scenarios: testScenarios, risks, updated_by: 'Alpha-2 (PLAN correction pass)' })
  .eq('id', PRD_ID);

if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log('PRD corrected: FR-3/FR-4/FR-5 revised, TS-2/TS-3/TS-5/TS-6/TS-7 rewritten, risks re-scored + 1 new finding added.');
