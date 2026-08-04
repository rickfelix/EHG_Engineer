import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-TRIAGE-2026-BULK-001';

const testing = {
  verdict: 'CONDITIONAL_PASS', confidence: 87,
  summary:
    'Seven scenarios for an SD whose main risk is not a broken deliverable but a CORRECT-LOOKING one. '
    + 'TS-1 (reproduce the known answer) and TS-7 (fail on a shared rationale) are the two that keep '
    + 'this from becoming the bulk error inverted. Three conditions into EXEC.',
  findings: [
    { id: 'ts1-is-the-only-calibration-this-method-will-ever-get', severity: 'critical', note: 'THE ANCHOR SCENARIO. Exactly ONE entry in this population has a known answer — pr-merge-verification.test.js, recoverable from git (added a6a5477f149, removed 071758279d1) with its verdict recorded in its own header at pr-merge-verification.test.js:11. If the discrimination method cannot reproduce REGRESSION on that case, it is not fit to judge 106 unknowns, and there is no second case to catch the error. Run it FIRST, not as a spot check afterwards — a method validated after the fact has already produced 106 unvalidated verdicts.' },
    { id: 'ts7-fails-a-run-whose-every-verdict-is-correct', severity: 'critical', note: 'THE UNUSUAL SCENARIO, and it is deliberate. TS-7 fails review when the 18 boolean-inversion candidates share a rationale, EVEN IF each verdict is individually right. Getting the right answer by the wrong method is precisely what this SD exists to correct: 18 verdicts inferred from 1 measurement is structurally what produced 106 same-day judgements. Acceptance must not reward it, because in the final report a shared rationale is INDISTINGUISHABLE FROM DILIGENCE.' },
    { id: 'undetermined-must-be-expressible-by-construction-not-by-discipline', severity: 'critical', note: 'TS-3 asserts the report SCHEMA can carry an undetermined bucket, not merely that the author remembered to use one. A schema that only expresses drift-or-regression forces every unrecoverable entry into a bucket it does not belong in, and the pressure at report time runs entirely toward a clean binary. Make the shape prevent the error rather than relying on someone resisting it at 2am.' },
    { id: 'the-two-sided-acceptance-is-genuinely-two-sided-here', severity: 'critical', note: 'TS-6 (genuine drift REMAINS shelved, with the inverting change cited) is as load-bearing as TS-5 (regressions ARE un-shelved). An SD that un-shelved everything would pass a regressions-only suite while doing exactly the damage the SD warns against. Both halves required, and TS-6 is the half a careless implementation drops.' },
    { id: 'cohort-separation-is-testable-and-must-be-tested', severity: 'warning', note: 'TS-2 fails on a single 117 figure. Measured: 106 same-day (2026-06-11) plus 11 individually dated (06-22 x1, 06-28 x8, 07-08 x1, 07-17 x1). Merging them manufactures a bulk event that did not happen and hands the 11 an argument they were never part of — a small over-generalisation inside an SD about over-generalisation.' },
    { id: 'the-live-manifest-is-the-test-subject-so-guard-it', severity: 'warning', note: 'tests/quarantine-manifest.json is the SINGLE source of the vitest exclude list (vitest.config.js:26 derives it, applied at :35). A malformed edit does not fail loudly — it silently changes which tests run in CI. TS-5 pairs the un-shelve assertion with tests/unit/quarantine-manifest.test.js staying green, so schema damage surfaces in the same run as the change that caused it.' },
    { id: 'coverage-boundary-45-entries-and-the-repairs-are-out', severity: 'info', note: 'The 45 non-assertion-drift entries (timeout, node-test-runner, empty-suite, windows-abort, ...) are out of scope — different reason classes ask different discrimination questions, and treating them uniformly would be the same error again. Repairing the tests themselves is also out: this SD determines whether a test was RIGHT; the filed defect owns the fix. Named rather than silently omitted.' },
  ],
  metadata: {
    scenarios: 7, cohort_same_day: 106, cohort_individually_dated: 11,
    boolean_inversion_candidates: 18, calibration_cases_available: 1,
    out_of_scope_entries: 45, conditions: 3,
    mechanism_verifications: [
      { verified_by: 'Bravo (e3610a71) — the exclude list is derived, so the manifest is the only edit point AND the only damage point', verified_at: 'vitest.config.js:26 loadQuarantineExclude(), manifest path built at vitest.config.js:28, applied at vitest.config.js:35' },
      { verified_by: 'Bravo (e3610a71) — the calibration case records its own verdict, which is what TS-1 must reproduce', verified_at: 'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js:11 (quarantined 2026-06-11 as assertion-drift) and :12 (the label asserted the TEST was stale; the CODE had changed)' },
      { verified_by: 'Bravo (e3610a71) — the manifest contract requires per-entry evidence, which is why discrimination is the gap rather than basis', verified_at: 'scripts/unit-tier-quarantine.mjs:21 (nothing skipped without reason_class + linked_ref); entry shape declared at scripts/unit-tier-quarantine.mjs:13' },
      { verified_by: 'Bravo (e3610a71) — the enforcing suite TS-5 leans on', verified_at: 'tests/unit/quarantine-manifest.test.js:5 (asserts the reason_class + linked_ref contract), array shape at tests/unit/quarantine-manifest.test.js:51' },
    ],
  },
  execution_time_ms: 720000,
};

const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(testing, res);
const s = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, testing, { phase: 'PLAN' });
console.log('STORED TESTING/PLAN id=' + (s && s.id));
