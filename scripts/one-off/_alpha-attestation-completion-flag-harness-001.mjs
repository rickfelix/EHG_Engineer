/**
 * REAL_CALLEE_ATTESTATION for SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
 *
 * Names the test that actually DRIVES each real callee this SD adds or modifies. "Driven"
 * means the test invokes the real implementation, not a mock of it — on an SD about checks
 * that report verdicts they did not earn, an attestation naming a mocked callee would be the
 * same defect in miniature.
 *
 * Idempotent.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001';

const attestation = {
  attested_by: 'Alpha (worker session e7c92ad8)',
  commit: '0547e5e6594',
  note: 'Every callee below is exercised against its REAL implementation. The two suites that mock the classifier (fr-delivery-traceability-wiring, lead-final-fr-delivery-verification-fail-open) are listed as wiring/fail-open coverage only and are NOT claimed as drivers of the logic.',
  callees: [
    {
      callee: 'classifyFrDelivery (scripts/modules/handoff/gates/fr-delivery-classifier.js)',
      driven_by: 'tests/unit/handoff/gates/fr-delivery-classifier.test.js',
      tests: [
        'classifies delivered / descoped / undelivered per-FR',
        'REGRESSION (the 93-scored specimen): no FR referenced anywhere -> all unverifiable, never 100',
        'SEEDED DEFECT: convention IS in use and one named FR is missing -> UNDELIVERED and REFUSED',
        'ZERO validated stories is UNDELIVERED, not unverifiable',
        'unvalidated stories do not count as work product',
        'a descope alone does not prove the convention is in use',
      ],
      also_driven_live_by: 'scripts/one-off/_alpha-probe-fr-classifier-specimen.mjs and _alpha-probe-fr-classifier-population.mjs — real code against real DB rows (55 SDs)',
    },
    {
      callee: 'projectGateResult (same module)',
      driven_by: 'tests/unit/handoff/gates/fr-delivery-classifier.test.js',
      tests: [
        'ON + undelivered -> hard fail (passed:false, required:true)',
        'OFF + undelivered -> warn-only pass but the score is TRUE, not pinned at 100',
        'OFF score TRACKS the undelivered count instead of being invariant',
        'all delivered -> pass either way, score 100; required mirrors the flag',
        'no FRs -> pass but scored as NOT-MEASURED, never 100',
        'score 100 implies undelivered===0 AND unverifiable===0 (6 classifications x 2 modes)',
        'exceeding the ceiling produces an OBSERVABLY DIFFERENT result, not the same pass',
        'the ceiling never blocks in warn-only mode',
      ],
    },
    {
      callee: 'frUnverifiableCeiling (same module)',
      driven_by: 'tests/unit/handoff/gates/fr-delivery-classifier.test.js',
      tests: ['frUnverifiableCeiling parses env and fails safe on nonsense (default, 0.4, and 4 invalid inputs)'],
    },
    {
      callee: 'projectGateResultsForPersistence (scripts/modules/handoff/executors/lead-final-approval/index.js)',
      driven_by: 'tests/unit/handoff/lead-final-gate-results-persistence.test.js',
      tests: [
        'returns [] rather than throwing on missing/malformed input',
        'projects name/score/passed/required per gate',
        'carries the FR classification so an auditor can tell UNVERIFIABLE from UNDELIVERED',
        'does NOT persist the per-FR descriptions (row-bloat guard)',
        'omits fr_classification for gates that carry no classification',
        'tolerates the maxScore spelling used by the orchestrator',
      ],
    },
    {
      callee: 'createFrDeliveryTraceabilityGate (scripts/modules/handoff/gates/fr-delivery-traceability-gate.js)',
      driven_by: 'tests/unit/handoff/gates/fr-delivery-traceability-gate.test.js',
      tests: [
        'ON: undelivered FR -> hard fail',
        'OFF (default): undelivered FR -> warn-only pass',
        'orchestrator PARENT delegates to children (pass)',
        'delivered FR -> pass',
      ],
      note: 'Real classifier, real projection — this suite does not mock the module. Its consumer exec-to-plan/index.js:56 is untouched because the exported signature is unchanged (flagged by CONSUMER_IMPACT_ADVISORY and reviewed).',
    },
    {
      callee: 'runFRDeliveryVerification / createFRDeliveryVerificationGate (lead-final-approval/gates.js)',
      driven_by: 'tests/unit/lead-final-fr-delivery-verification-fail-open.test.js',
      tests: ['thrown validator body with enforcement OFF => passing warn result (never blocks)'],
      note: 'HONEST LIMITATION, stated rather than glossed: this suite MOCKS the classifier module, so it drives the gate WRAPPER and its fail-open contract, not the classification logic. The logic itself is driven by the classifier suite above and by the two live probes. No test drives this wrapper against a real DB — the FR-5 gate_results persistence is likewise proven at the projection function, not end-to-end through a real LEAD-FINAL run.',
    },
  ],
  mutation_evidence: {
    method: 'Each mutant confirmed PRESENT ON DISK before running — an unapplied mutation is indistinguishable from one the tests survived. Original restored and the restore verified.',
    results: [
      'M1 restore the warn-only score:100 pin -> falsified, 4 tests failing',
      'M2 collapse UNVERIFIABLE back into UNDELIVERED -> falsified, 2 tests failing',
      'M3 decide the convention PER-FR instead of PER-SD -> falsified, 2 tests failing',
    ],
    deviation: 'The PRD said each mutant would fail a DISTINCT count; M2 and M3 both fail 2. Each was still independently detected, which is the property that matters. The distinct-count phrasing was over-specified by me at PLAN time.',
  },
};

const { data: sd, error: readErr } = await s
  .from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).single();
if (readErr) { console.log('READ ERR:', readErr.message); process.exit(1); }

if (sd.metadata?.real_callee_attestation) {
  console.log('ALREADY PRESENT');
  process.exit(0);
}

const { error } = await s.from('strategic_directives_v2')
  .update({ metadata: { ...(sd.metadata || {}), real_callee_attestation: attestation } })
  .eq('id', sd.id);
if (error) { console.log('UPDATE ERR:', error.message); process.exit(1); }
console.log('WROTE attestation for', attestation.callees.length, 'real callees');
