import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001';

const testing = {
  verdict: 'CONDITIONAL_PASS', confidence: 87,
  summary:
    'Six scenarios for an SD whose deliverable is a MEASUREMENT, where the failure mode is a number '
    + 'that is true and misleading. The two load-bearing tests make the misleading forms impossible '
    + 'to emit rather than merely discouraged. Three conditions into EXEC.',
  findings: [
    { id: 'ts1-a-population-without-its-ceiling-must-be-unemittable', severity: 'critical', note: 'THE ANCHOR SCENARIO. 3.4% judged against 100% reads as a broken writer; judged against a derivable ceiling of ~0.1% it reads as an absent input. Both are the same number and only one is true to the mechanism. TS-1 makes the bare figure exit non-zero, so the misleading form cannot be produced even by a careless caller. Enforcing this in code rather than in review is the whole point: the SD itself was written from a population figure quoted without a ceiling, and that is what made its remedy look correct.' },
    { id: 'ts5-the-two-bucket-schema-must-fail-by-construction', severity: 'critical', note: 'A row whose outcome is a NARRATIVE can never carry a resolvable SD key — it is outside the mechanism domain, not awaiting work. Collapsing NOT-APPLICABLE into NOT-YET turns a ceiling into a backlog, and a backlog invites more wiring, which is exactly the remedy this SD had to refuse. TS-5 requires the third bucket to exist in the schema EVEN WHEN ZERO, so the distinction survives a quiet period rather than disappearing when it happens to be empty.' },
    { id: 'the-cheap-win-must-be-tested-as-a-hazard-not-an-improvement', severity: 'critical', note: 'TS-3. Case-fixing the 4 non-uppercase SD- refs is the intuitive fix and gains FOUR ROWS of 1,392 — while risking keys that never resolve, which the reconciler re-selects every batch forever. The test therefore requires a lowercase ref to be reported as CASE-DRIFT and NOT silently derived. A run that derives from it FAILS even though it would raise the coverage number, because raising the number is not the goal.' },
    { id: 'whole-column-never-sampled-is-a-tested-property', severity: 'warning', note: 'TR-2 and TS-6. Classifier totals must reconcile against COUNT(head:true) on the live table, and a mismatch exits non-zero rather than printing a plausible subtotal. This codebase already has precedent: an earlier "4 distinct QF keys" figure came from a truncated sample read as a population and had to be corrected to 6 across 8 rows. Sampling is how a ceiling gets mistaken for a backlog.' },
    { id: 'the-writer-is-explicitly-out-of-scope-and-that-is-testable', severity: 'warning', note: 'No test may exercise or modify coordinator-ack-adam.cjs behaviour. The writer is CORRECT — the SD original framing (nothing reliably writes the field) was falsified during LEAD. Any test that appears to fix the writer indicates scope drift back toward the unbuildable remedy.' },
    { id: 'fr5-is-written-not-built-and-has-its-own-acceptance', severity: 'info', note: 'The retraction requirement produces no code. It is verified by inspection of the PRD and retrospective — confirmed already present in the stored PRD row rather than assumed from the write. Recorded so a later reader does not treat FR-5 as unimplemented.' },
    { id: 'coverage-boundary-the-applicability-decision-is-not-ours', severity: 'info', note: 'This SD supplies the measurement that makes the decision possible — whether advice outcomes SHOULD be artifacts at all — and deliberately does not pre-empt it. If most advice genuinely does not become an SD, 3.4% may be near the true ceiling and the honest deliverable is to say the reconciler is inapplicable to those rows. Named as a boundary rather than silently assumed either way.' },
  ],
  metadata: {
    scenarios: 6, conditions: 3, no_migration: true, writer_unchanged: true,
    mechanism_verifications: [
      { verified_by: 'Bravo (e3610a71) — the writer under test is correct and out of scope', verified_at: 'scripts/coordinator-ack-adam.cjs:249 derives outcome_sd_key from outcome_ref; narrowings and their rationale at scripts/coordinator-ack-adam.cjs:264' },
      { verified_by: 'Bravo (e3610a71) — the consumer whose inertness the measurement explains', verified_at: 'scripts/solomon-ledger-reconcile.cjs:64 skips rows without the key; scripts/solomon-ledger-reconcile.cjs:70 resolves the SD by it' },
      { verified_by: 'Bravo (e3610a71) — the ceiling is real, measured whole-column not sampled', verified_at: 'live read of all 865 populated outcome_ref values: exactly 1 matches ^SD-[A-Z0-9-]+$; 853 are narrative prose, ~650 era_closure: prefixed' },
    ],
  },
  execution_time_ms: 660000,
};

const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(testing, res);
const s = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, testing, { phase: 'PLAN' });
console.log('STORED TESTING/PLAN id=' + (s && s.id));
