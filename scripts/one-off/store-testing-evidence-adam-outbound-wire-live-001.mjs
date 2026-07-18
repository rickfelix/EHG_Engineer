// SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001 (Part 1) — TESTING sub-agent evidence writer.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-ADAM-OUTBOUND-WIRE-LIVE-001';
const PHASE = 'EXEC';

const results = {
  verdict: 'PASS',
  confidence: 96,
  summary:
    'Part 1 chairman-SMS gate LIVE-wiring verified. Unit suites GREEN: comms 28/28, chairman 134/134 (162 total); ' +
    'email-path regression record-pending-decision-escalation 24/24. All PLAN-gap (7867943d) acceptance items covered.',
  findings: [
    { id: 'run', severity: 'info', note: 'npx vitest run tests/unit/comms/ tests/unit/chairman/ => 13 files, 162 tests, 0 fail (685ms).' },
    { id: 'counts', severity: 'info', note: 'comms 28/28 (4 files); chairman 134/134 (9 files). Meets/exceeds expected 28+134.' },
    { id: 'a-fail-closed', severity: 'info', note: 'TS-1/TS-3: rubric-FAIL and rubric-THROW both HELD (held=true, sender.send NOT called; throw => reason=gate_unavailable). Fail-closed, not fail-open.' },
    { id: 'b-pass-delegates', severity: 'info', note: 'rubric-PASS invokes injected sender exactly once (sent=true, send called once).' },
    { id: 'c-fr2-fail-soft', severity: 'info', note: 'FR-2: no recipient/durable state => makeDefaultSender soft-fails (no throw); gate returns sent=true, email fallback delivers. TS-6 updated from throw-stub to delegate/fail-soft contract.' },
    { id: 'd-email-unchanged', severity: 'info', note: 'escalateChairmanDecision intercept: spawn(email) still fires; a HELD gated-SMS does not block email. smsGate outcome surfaced in return. No email regression.' },
    { id: 'e-no-twilio', severity: 'info', note: 'Source assertion: gate references enqueueChairmanSms (-B durable path) and does NOT match new twilio / require(twilio) / from twilio. No 2nd Twilio client (two-stack hazard avoided).' },
    { id: 'f-away-bridge', severity: 'info', note: 'FR-3/TS-4: @wire-check-exempt removed on chairman-sms-gate + rubric-engine (live caller now references them); away-bridge stays UNWIRED for Part 2 (live caller does not match /away-bridge/).' },
    { id: 'regression', severity: 'info', note: 'record-pending-decision-escalation.test.js 24/24 pass — email escalation path (spawn/CAS/quiet-window/dedupe/digest) not regressed by the smsGate addition.' },
    { id: 'run-half-boundary', severity: 'info', note: 'Commit b9754c2 touches 6 files: wires live caller (record-pending-decision.mjs), wires makeDefaultSender production stub (gate), removes 2 exempt comments (gate+rubric, 1 line each, no logic), adds tests. Rubric/decision LOGIC of children A/C unchanged.' },
  ],
  metadata: {
    test_command: 'npx vitest run tests/unit/comms/ tests/unit/chairman/',
    test_files: 13,
    tests_total: 162,
    tests_passed: 162,
    tests_failed: 0,
    comms_passed: '28/28',
    chairman_passed: '134/134',
    escalation_regression: '24/24',
    part1_commit: 'b9754c2f1213b6906de2259fda115bd85ec009d4',
    plan_gap_ref: '7867943d',
    new_test_file: 'tests/unit/comms/chairman-sms-gate-live-intercept.test.js',
    away_bridge_wired: false,
  },
  execution_time_ms: 700,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { metadata: { version: '2.4.0' } }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
