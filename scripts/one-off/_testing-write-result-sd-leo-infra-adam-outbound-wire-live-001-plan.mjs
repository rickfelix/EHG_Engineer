#!/usr/bin/env node
/**
 * Write TESTING sub-agent PLAN-phase verdict (test-plan assessment, prospective)
 * for SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 Part 1 — chairman-SMS gate-intercept
 * go-live wiring — ahead of PLAN-TO-EXEC.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) — no hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '717f7e18-28c0-4e2d-b03b-bd9d137cecfc';
const SD_KEY = 'SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001';

const findings = [
  {
    id: 'F1-core-fail-closed-covered',
    severity: 'INFO',
    summary: 'The core hardening guarantee (a) is covered: TS-1 (rubric-FAILING decision -> HELD, not sent) + FR-4 acceptance "test proves a rubric-failing decision is blocked fail-closed at the live chokepoint" map directly onto the gate\'s existing verdict!==\'pass\' branch (lib/comms/adam-outbound/chairman-sms-gate/index.js:66-69, returns {sent:false, held:true, reason:\'blocked\'}). The chokepoint choice is sound: escalateChairmanDecision (lib/chairman/record-pending-decision.mjs:113) is the single funnel all 7 escalation callers already flow through (stall-alert, chairman-decision-watcher via recordPendingDecision, chairman-product-review, chairman-decision-sla-sweep, periodic-liveness-watcher, stage-execution-worker), so a single intercept structurally covers every path.'
  },
  {
    id: 'F2-pass-delegate-covered-but-shallow',
    severity: 'LOW',
    summary: 'Coverage point (b) rubric-PASS -> mocked durable sender is addressed by TS-2, but "handed to the mocked sender" is a weaker assertion than FR-2 requires. FR-2 mandates makeDefaultSender DELEGATE to the -B enqueueChairmanSms durable path (lib/chairman/sms-bridge.js:116) and explicitly NOT instantiate a second Twilio client (the two-stack hazard). A test that only checks "injected mock sender was called" does not prove the PRODUCTION makeDefaultSender() wiring delegates rather than news up Twilio (current makeDefaultSender at index.js:29-37 still throws). EXEC must add an assertion that makeDefaultSender\'s send path invokes enqueueChairmanSms (spy on the -B module) and that no Twilio client constructor is referenced in the gate module.'
  },
  {
    id: 'F3-throw-holds-covered',
    severity: 'INFO',
    summary: 'Coverage point (c) rubric THROW -> HOLD is covered by TS-3 and matches gate behavior (index.js:54-63: catch -> {held:true}). NOTE: the gate returns held for BOTH a decision (reason \'gate_unavailable\') and a non-decision (reason \'gate_unavailable_status\') via effectiveType(message) classification (index.js:50). TS-3 must assert the escalation message classifies as effectiveType===\'decision\' so it exercises the intended decision fail-closed branch — otherwise a classifier regression could silently route through the status branch while the test still sees held:true and passes.'
  },
  {
    id: 'F4-wire-check-covered',
    severity: 'INFO',
    summary: 'Coverage point (d) is covered by TS-4 (WIRE_CHECK passes without exempt via the live escalateChairmanDecision caller). Confirmed the two @wire-check-exempt markers to remove are at chairman-sms-gate/index.js:1 and rubric-engine/index.js:1, and that away-bridge/ has its own exempt to RETAIN (Part-2-owned). TS-4 parenthetically notes away-bridge keeps its exempt but does NOT assert it — see F7.'
  },
  {
    id: 'F5-GAP-fr2-failsoft-to-email-untested',
    severity: 'HIGH',
    summary: 'GAP: FR-2 promises that pre-migration (sms_outbound_obligations owed-state unapplied) the send fails-SOFT to the existing email escalation path with "no regression to the live chairman channel (which is email today)." NONE of TS-1..TS-4 exercises this degrade path. TS-2 covers rubric-PASS -> durable sender available; there is no scenario for rubric-PASS + durable sender unavailable -> escalation still emails (fail-soft), no decision lost. EXEC MUST add a test scenario proving the pre-migration degrade-to-email path preserves the existing escalation (spawn still fires / email path taken), otherwise FR-2\'s central no-regression guarantee ships unproven.'
  },
  {
    id: 'F6-GAP-held-vs-email-semantics-ambiguous',
    severity: 'HIGH',
    summary: 'GAP/AMBIGUITY: TS-1 asserts a rubric-failing decision is "HELD (not sent)" but does not pin what happens to the EXISTING email escalation (spawn(decisionId) at record-pending-decision.mjs:170). Because the chairman decision channel is EMAIL today, if the intercept blocks the email on any rubric-fail, then every decision type that does not meet the SMS decision-format rubric stops emailing — a behavior regression to the live channel. FR-1 ("HOLDS the decision — no send") and FR-2 ("fails-soft to email, no regression") are in tension on this exact axis. The test file MUST encode the resolved contract: does rubric-FAIL suppress the email too (hard fail-closed on the whole escalation), or only the SMS leg while email remains the durable fallback? EXEC/PLAN must disambiguate before coding; the current TS-1 wording admits both and would let either behavior pass.'
  },
  {
    id: 'F7-GAP-away-bridge-retention-unasserted',
    severity: 'MEDIUM',
    summary: 'GAP: FR-3 requires the away-bridge @wire-check-exempt marker be RETAINED (owned by the Part-2 follow-on). TS-4 mentions this only parenthetically with no assertion. EXEC should add an explicit check that lib/comms/adam-outbound/away-bridge/ still carries its @wire-check-exempt marker after the gate/rubric markers are removed — a regression that strips it would break WIRE_CHECK for a module Part 1 does not own, and the current test plan would not catch it.'
  },
  {
    id: 'F8-GAP-chokepoint-covers-all-callers-unasserted',
    severity: 'MEDIUM',
    summary: 'GAP: the intercept\'s value depends on it living INSIDE escalateChairmanDecision (the shared chokepoint), not inside one caller. No scenario asserts this structurally. EXEC should add a test that at least two distinct entry paths (e.g. a direct escalateChairmanDecision call AND the recordPendingDecision->escalate path at line 263) both route through the gate — cheap insurance that a future caller cannot bypass the hardening, and that the intercept was not accidentally placed in a single caller (e.g. chairman-product-review) instead of the funnel.'
  },
  {
    id: 'F9-smoke-cmd-absent',
    severity: 'MEDIUM',
    summary: 'No smoke_test_cmd is recorded in SD or PRD metadata (checked both — metadata keys contain neither). The appropriate Part-1 smoke is a two-part command: (1) the unit test `npx vitest run tests/unit/comms/chairman-sms-gate-live-intercept.test.js`, and (2) the Part-1-SCOPED WIRE_CHECK runner for TS-4. The WIRE_CHECK smoke must be scoped so the RETAINED away-bridge exempt (F7) does not fail a Part-1 run. EXEC should record the concrete smoke_test_cmd on the SD/PRD so the completed record is reproducible.'
  }
];

const warnings = [
  'FR-2 fail-soft-to-email degrade path (pre-migration) has zero test coverage — F5.',
  'Rubric-FAIL vs existing-email suppression semantics are ambiguous between FR-1 and FR-2 — F6; resolve before EXEC codes.',
  'TS-2 delegation assertion is too weak to prove makeDefaultSender delegates to enqueueChairmanSms rather than instantiating Twilio — F2.',
  'away-bridge exempt-retention and chokepoint-covers-all-callers are unasserted — F7, F8.',
  'No smoke_test_cmd recorded — F9.'
];

const recommendations = [
  'PROCEED to EXEC — the four required coverage points (a fail-closed block, b pass-delegate, c throw-holds, d wire-check) are all present in TS-1..TS-4 at a basic level, and the chokepoint architecture is correct.',
  'EXEC MUST add: (1) an FR-2 fail-soft-to-email scenario (rubric-PASS + durable sender unavailable -> escalation still emails, no regression); (2) an assertion that makeDefaultSender delegates to enqueueChairmanSms and references no Twilio constructor; (3) an assertion the away-bridge @wire-check-exempt is retained; (4) a structural assertion the intercept lives in escalateChairmanDecision covering >=2 caller paths; (5) an effectiveType===\'decision\' assertion in the throw test.',
  'PLAN/EXEC MUST resolve the FR-1-vs-FR-2 held-vs-email semantic (does rubric-FAIL suppress the existing email escalation too, or only the SMS leg?) and encode the resolved contract in TS-1, since blocking the email would regress the live chairman channel.',
  'Record a Part-1-scoped smoke_test_cmd on the SD/PRD: `npx vitest run tests/unit/comms/chairman-sms-gate-live-intercept.test.js` + the Part-1-scoped WIRE_CHECK runner.'
];

const summary = 'CONCERNS (confidence 82). PLAN-phase test-plan assessment (prospective). TS-1..TS-4 DO cover all four required guarantees at a basic level: (a) rubric-FAIL blocked fail-closed [TS-1], (b) rubric-PASS delegated to mocked durable sender [TS-2], (c) rubric-THROW holds fail-closed [TS-3], (d) WIRE_CHECK passes without exempt via the live caller [TS-4]. The chokepoint choice (escalateChairmanDecision, the single funnel all 7 callers flow through) is architecturally correct. However five gaps would let real regressions ship: (1) FR-2\'s fail-soft-to-email degrade path (pre-migration) has ZERO coverage; (2) the held-vs-existing-email semantics are ambiguous between FR-1 "no send" and FR-2 "no regression to the email channel" — TS-1 does not pin whether rubric-fail also suppresses the email that IS the live channel today; (3) TS-2\'s delegation assertion is too weak to prove makeDefaultSender delegates to enqueueChairmanSms rather than instantiating a second Twilio client; (4) away-bridge exempt-retention is unasserted; (5) chokepoint-covers-all-callers is unasserted. No smoke_test_cmd is recorded. Not a FAIL — the plan is sound and the test file is EXEC\'s to author — but EXEC must add the enumerated scenarios and PLAN/EXEC must resolve the held-vs-email semantic before coding.';

const justification = `CONCERNS (confidence 82) — SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 Part 1 PLAN-phase test plan is directionally correct and covers the four required guarantees, but has coverage gaps that must be closed in EXEC before the fail-closed and no-regression promises are actually proven.

WHAT THE PLAN GETS RIGHT:
- Core guarantee (a): TS-1 + FR-4 acceptance map onto the gate's existing block branch (chairman-sms-gate/index.js:66-69). Verified the branch returns {sent:false, held:true}.
- (b) TS-2 covers rubric-PASS -> mocked durable sender.
- (c) TS-3 covers rubric-throw -> hold; matches index.js:54-63 fail-closed catch.
- (d) TS-4 covers WIRE_CHECK without exempt. Confirmed the two exempt markers to remove (chairman-sms-gate/index.js:1, rubric-engine/index.js:1) and that away-bridge has its own to keep.
- Chokepoint is correct: escalateChairmanDecision (record-pending-decision.mjs:113) is the single funnel for all 7 callers (grep-confirmed: stall-alert, chairman-decision-watcher, chairman-product-review, chairman-decision-sla-sweep, periodic-liveness-watcher, stage-execution-worker via recordPendingDecision, plus recordPendingDecision's own line-263 self-escalate). One intercept structurally covers every path.

GAPS EXEC MUST ADD (why CONCERNS not PASS):
1. [HIGH] FR-2 fail-soft-to-email degrade path is untested. No TS covers rubric-PASS + durable sender unavailable (pre-migration) -> escalation still emails, no decision lost. FR-2's central "no regression to the live chairman channel" ships unproven without it.
2. [HIGH] Held-vs-email semantics ambiguous. TS-1 says "held, not sent" but does not pin whether the existing email spawn (record-pending-decision.mjs:170) still fires on rubric-fail. Because the live channel is email today, suppressing it on rubric-fail is a regression to every non-SMS-format decision. FR-1 ("no send") and FR-2 ("no regression to email") conflict on this axis — must be resolved and encoded in TS-1.
3. [LOW->must-fix] TS-2 delegation is too shallow: prove makeDefaultSender delegates to enqueueChairmanSms (sms-bridge.js:116) and references no Twilio constructor (makeDefaultSender at index.js:29-37 currently throws — the delegation is the whole FR-2 point).
4. [MEDIUM] Assert away-bridge @wire-check-exempt is RETAINED after gate/rubric markers are removed (FR-3).
5. [MEDIUM] Assert the intercept lives in escalateChairmanDecision covering >=2 caller paths (chokepoint insurance).
6. [MEDIUM] TS-3 must assert effectiveType===\'decision\' so the intended decision fail-closed branch is exercised, not the status branch.

SMOKE: No smoke_test_cmd is recorded on SD or PRD metadata (verified both). Appropriate Part-1 smoke = \`npx vitest run tests/unit/comms/chairman-sms-gate-live-intercept.test.js\` plus a Part-1-SCOPED WIRE_CHECK runner for TS-4 (scoped so the retained away-bridge exempt does not fail Part-1). Recommend EXEC record it.

RATIONALE FOR CONCERNS: The plan proves the hardening block (a) and passes the four literal coverage points, so it is not a FAIL. But two HIGH gaps (FR-2 fail-soft path untested; held-vs-email semantic unresolved) mean the "no regression to the live email channel" and "fail-soft" promises are not yet provable, and a wrong resolution would silently regress the live chairman escalation. These must be closed in EXEC's test file, not deferred.`;

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONCERNS',
    confidence: 82,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'EXEC adds an FR-2 fail-soft-to-email degrade scenario (rubric-PASS + durable sender unavailable -> escalation still emails).',
      'PLAN/EXEC resolves and TS-1 encodes the rubric-FAIL vs existing-email suppression semantic (no silent regression to the live email channel).',
      'EXEC asserts makeDefaultSender delegates to enqueueChairmanSms (no second Twilio client).',
      'EXEC asserts the away-bridge @wire-check-exempt is retained and the intercept covers >=2 caller paths.',
    ],
    metadata: {
      assessment_type: 'prd_test_plan_review',
      test_scenarios_assessed: ['TS-1', 'TS-2', 'TS-3', 'TS-4'],
      planned_test_file: 'tests/unit/comms/chairman-sms-gate-live-intercept.test.js',
      chokepoint_file: 'lib/chairman/record-pending-decision.mjs',
      chokepoint_function: 'escalateChairmanDecision',
      chokepoint_line: 113,
      escalate_callers_confirmed: [
        'lib/adam/stall-alert.js:297',
        'lib/eva/chairman-product-review.js:327',
        'scripts/cron/chairman-decision-sla-sweep.mjs:156',
        'scripts/periodic-liveness-watcher.mjs:377',
        'lib/chairman/record-pending-decision.mjs:263 (recordPendingDecision self-escalate)',
        'lib/eva/chairman-decision-watcher.js (via recordPendingDecision)',
        'lib/eva/stage-execution-worker.js:2814 (via recordPendingDecision)',
      ],
      gate_file: 'lib/comms/adam-outbound/chairman-sms-gate/index.js',
      gate_block_branch: 'index.js:66-69 (verdict!==pass -> held)',
      gate_throw_branch: 'index.js:54-63 (evaluate throws -> held, fail-closed)',
      makeDefaultSender_current_state: 'throws (index.js:29-37) — FR-2 must wire delegation to enqueueChairmanSms',
      durable_sender_target: 'lib/chairman/sms-bridge.js:116 enqueueChairmanSms',
      exempts_to_remove: [
        'lib/comms/adam-outbound/chairman-sms-gate/index.js:1',
        'lib/comms/adam-outbound/rubric-engine/index.js:1',
      ],
      exempt_to_retain: 'lib/comms/adam-outbound/away-bridge/ (Part-2 follow-on owned)',
      coverage_points_required: {
        a_fail_closed_block: 'COVERED (TS-1)',
        b_pass_delegate_mocked: 'COVERED-SHALLOW (TS-2; delegation depth insufficient — F2)',
        c_throw_holds: 'COVERED (TS-3; add effectiveType==decision assertion — F3)',
        d_wire_check_no_exempt: 'COVERED (TS-4; away-bridge retention unasserted — F7)',
      },
      gaps_for_exec: [
        'FR-2 fail-soft-to-email degrade path untested (F5, HIGH)',
        'held-vs-email suppression semantics ambiguous (F6, HIGH)',
        'delegation-not-instantiation unproven (F2)',
        'away-bridge exempt-retention unasserted (F7)',
        'chokepoint-covers-all-callers unasserted (F8)',
        'no smoke_test_cmd recorded (F9)',
      ],
      smoke_test_cmd_recorded: false,
      recommended_smoke_test_cmd: 'npx vitest run tests/unit/comms/chairman-sms-gate-live-intercept.test.js  &&  <Part-1-scoped WIRE_CHECK runner>',
      boundary: 'RUN-half only (no re-implementation of A/C/E); Part 2 decision-scheduler is a follow-on',
      model: 'Opus 4.8 (1M context)',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      phase_assessed: 'PLAN (test-plan review, pre-EXEC)',
      checks_performed: {
        prd_test_scenarios_read: 'TS-1..TS-4 read from product_requirements_v2',
        gate_source_traced: 'chairman-sms-gate/index.js sendChairmanSMS + makeDefaultSender read',
        chokepoint_traced: 'escalateChairmanDecision read (record-pending-decision.mjs:113-175)',
        caller_fanout_grepped: '7 escalate callers confirmed — single-funnel intercept validated',
        durable_path_confirmed: 'enqueueChairmanSms located (sms-bridge.js:116)',
        exempts_located: 'gate + rubric exempts at line 1 each; away-bridge separate',
        smoke_cmd_checked: 'absent from both SD and PRD metadata',
      },
    },
    phase: 'PLAN',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase || 'PLAN');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
