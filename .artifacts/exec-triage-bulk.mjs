import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-TRIAGE-2026-BULK-001';

const testing = {
  verdict: 'CONDITIONAL_PASS', confidence: 86,
  summary:
    'The instrument is built, validated against the one known answer, and ships. The COHORT is '
    + 'NOT processed: 1 undetermined, 105 unprocessed, 11 individually-dated untouched. That is '
    + 'reported as the deliverable state, not as a shortfall discovered at review.',
  findings: [
    { id: 'ts1-satisfied-the-method-reproduces-the-one-known-answer', severity: 'critical', note: 'THE ANCHOR. scripts/quarantine-retriage-report.mjs --verify-calibration re-derives the calibration verdict from GIT (the entry is no longer in the manifest, removed by 071758279d1) and reproduces REGRESSION across five independent checks: it was in the manifest, it was un-shelved, and the test header cites 2026-06-11, names reason_class assertion-drift, and records that the label asserted the TEST was stale when the CODE had changed. A method that cannot reproduce the single case with a known answer has no business judging 106 unknowns, so this runs FIRST rather than as a spot check.' },
    { id: 'the-cohort-is-not-processed-and-the-tool-says-so-in-its-exit-code', severity: 'critical', note: 'HONEST STATE: bulk 106 -> undetermined 1, UNPROCESSED 105; individually-dated 11 untouched. The report exits 10 (INCOMPLETE), a code distinct from both 0 and a guard failure, and prints unprocessed SEPARATELY from undetermined throughout. Per coordinator 102a2849 this ships as-is with the remainder tracked as a follow-on — holding the SD open for mechanical archaeology would create a non-terminal state with no expiry, invisible as both work and neglect.' },
    { id: 'the-first-unknown-examined-found-a-misclassification', severity: 'critical', note: 'VINDICATES THE SD ON ENTRY ONE OF 106. lib/__tests__/repo-paths-git-capable.test.js is UNDETERMINED and neither bucket fits: isGitCapableRepo (lib/repo-paths.js:300-302) STATS THE FILESYSTEM, so the assertion depends on whether the sibling EHG repo is checked out — an ENVIRONMENT fact, not a code fact. FR-1 question (did a predating change invert it?) has no clean answer. SEPARATE FINDING: reason_class assertion-drift looks MISCLASSIFIED there, closer to the registered test-isolation-order-dependent class. That is exactly the distinction a same-day bulk label erases.' },
    { id: 'the-load-bearing-test-fails-a-run-whose-every-verdict-is-correct', severity: 'critical', note: 'detectSharedRationale (TS-7) catches the boolean-inversion candidates carrying ONE shared citation, and fails EVEN IF each verdict is individually right. 18 verdicts inferred from 1 measurement is structurally what produced 106 same-day judgements; the right answer by the wrong method is the thing this SD corrects, and in a finished report a shared rationale is indistinguishable from diligence.' },
    { id: 'the-instrument-committed-this-sds-own-defect-on-its-first-run', severity: 'warning', note: 'PROCESS FINDING. The report initially exited 0 with 106 of 106 UNPROCESSED — a green signal on an unstarted job, the exact false closure this SD exists to remove, produced by the tool built to remove it. Fixed with exit 10 and the reason left IN THE CODE COMMENT rather than silently corrected, because the next person adding an early return will be tempted identically. Third instance this session of an instrument reproducing the class it detects.' },
    { id: 'seeded-defects-prove-each-guard-can-fire', severity: 'warning', note: '21 unit tests, 8 seeded: uncited drift, uncited regression, undetermined with no note, an invented verdict value, merged cohorts, an unfinished run reading as complete, unnamed uncited offenders, and the shared-rationale shortcut. A guard shown only to ALLOW cannot be distinguished from one that cannot block — and every guard here exists to stop this SD becoming the error it corrects.' },
    { id: 'coverage-boundary-45-entries-and-the-repairs-remain-out', severity: 'info', note: 'The 45 non-assertion-drift entries (timeout, node-test-runner, empty-suite, windows-abort, ...) are out of scope: different reason classes ask different discrimination questions, and treating them uniformly would repeat the error. Repairing the tests is also out — this SD determines whether a test was RIGHT; the filed defect owns the fix.' },
  ],
  metadata: {
    tests_added: 21, seeded_defects: 11, commits: 4,
    cohort_bulk: 106, cohort_individual: 11,
    processed: 1, undetermined: 1, unprocessed: 105,
    calibration_reproduced: true, ships_incomplete_by_decision: true,
    mechanism_verifications: [
      { verified_by: 'Bravo (e3610a71) — the method reproduces the one known answer', verified_at: 'scripts/quarantine-retriage-report.mjs:78 verifyCalibration() -> 5/5 checks PASS, VERDICT regression; header evidence at scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js:11' },
      { verified_by: 'Bravo (e3610a71) — an unfinished run cannot present as finished', verified_at: 'scripts/quarantine-retriage-report.mjs:128 exits 10 when unprocessed>0; verified live unpiped (a pipe masks $?) -> exit 10' },
      { verified_by: 'Bravo (e3610a71) — the shared-rationale shortcut is caught', verified_at: 'lib/quarantine/retriage.js:139 detectSharedRationale; seeded case at tests/unit/quarantine-retriage.test.js:158' },
      { verified_by: 'Bravo (e3610a71) — the first unknown is environment-dependent, not stale-expectation', verified_at: 'lib/repo-paths.js:300 isGitCapableRepo returns gitCapableAtPath(resolveRepoPath(app)) — a filesystem stat; failing assertion at lib/__tests__/repo-paths-git-capable.test.js:31' },
    ],
  },
  execution_time_ms: 2400000,
};

const security = {
  verdict: 'PASS', confidence: 88,
  summary:
    'No production code, no schema, no authz surface. The security-relevant property is epistemic: '
    + 'this SD removes a false closure and is built so it cannot manufacture a new one.',
  findings: [
    { id: 'a-label-that-presumes-its-conclusion-is-the-vulnerability-class', severity: 'critical', note: 'reason_class=assertion-drift encodes a VERDICT (the test expectation is stale) rather than an observation. A label presuming its own conclusion converts an open question into a closed one at zero cost, and the evidence that would reopen it is exactly what nobody gathers afterward. At least one entry was the opposite — a real regression shelved behind the label. This is the same class as a false closure claim on a security boundary: it does not create the hole, it stops anyone looking for it.' },
    { id: 'the-fix-is-built-so-it-cannot-become-the-same-error-inverted', severity: 'critical', note: 'The obvious failure is a mass un-shelving — assuming the bulk was wrong. Structural guards: UNDETERMINED is the DEFAULT and must be earned out of; recordVerdict THROWS on a verdict without a citation; signatureRank returns a number and is asserted BY TYPE never to be a verdict; detectSharedRationale fails a run whose verdicts are all correct but share one reason. The discipline is enforced by the code rather than by the operator staying careful.' },
    { id: 'no-test-was-un-shelved-on-this-sd', severity: 'warning', note: 'Zero manifest entries removed. The one regression in the verdicts file is the CALIBRATION CASE, already un-shelved by prior work and marked as such so nobody re-actions it. Un-shelving a test changes what CI runs (vitest.config.js:26 derives the exclude list), so doing it without a per-entry basis would put untriaged red into the required check — which is how the original 188-file quarantine happened.' },
    { id: 'shipping-incomplete-is-safer-than-holding-the-sd-open', severity: 'info', note: 'Per coordinator 102a2849: an SD held open for mechanical archaeology becomes a non-terminal state with no expiry — invisible as both work and neglect. The instrument plus the calibration proof ship now; the remaining cohort becomes a sized, tracked follow-on. The property protected in the ship is the INCOMPLETE exit code and the unprocessed/undetermined separation.' },
    { id: 'no-new-surface-of-any-kind', severity: 'info', note: 'Two new library/script files reading a JSON manifest and git history. No DB writes, no network, no credentials, no env vars, no schema, no DDL, no production code path touched.' },
  ],
  metadata: { entries_un_shelved: 0, ddl_applied: 0, new_env_vars: 0, production_code_touched: 0 },
  execution_time_ms: 600000,
};

for (const [code, name, payload] of [['TESTING', 'QA Engineering Director', testing], ['SECURITY', 'Chief Security Architect', security]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'EXEC' });
  console.log('STORED ' + code + '/EXEC id=' + (s && s.id));
}
