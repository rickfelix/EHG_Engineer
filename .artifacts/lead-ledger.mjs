import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001';

const explore = {
  verdict: 'WARNING', confidence: 91,
  summary:
    'The SD stated remedy (wiring) is wrong, and measurement shows why: the writer EXISTS and is '
    + 'CORRECT — the INPUT does not match. outcome_ref carries two incompatible jobs. Two of my own '
    + 'findings were retracted en route, both caught by measuring rather than reasoning harder.',
  findings: [
    { id: 'the-numbers-moved-since-sourcing-and-the-starvation-worsened', severity: 'warning', note: 'MEASURED whole-table via COUNT(head:true): 1,392 rows (SD said 1,216). outcome 1,392 (100%). outcome_ref 865 (62.1%; SD said 14.0%). outcome_sd_key 48 (3.4%; SD said 47/3.9%). It gained ONE row while the table grew by 176, so the starvation is proportionally WORSE. Do not re-quote the SD percentages — they are a timestamp, not a fact.' },
    { id: 'RETRACTED-my-own-no-writer-claim-was-false', severity: 'critical', note: 'I first reported outcome_sd_key has NO writer. FALSE, and the retraction matters more than the claim. scripts/coordinator-ack-adam.cjs carries `row.outcome_sd_key = resolvedOutcomeRef`, added by d4f7cbed4db (SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-6) — verified an ancestor of origin/main. MY EXCLUSION FILTER DELETED THE WRITER: I filtered out `row.outcome_sd_key` to drop reads like `if (!row.outcome_sd_key)`, and the write is the same token up to the operator.' },
    { id: 'a-control-that-inherits-the-flaw-cannot-reveal-it', severity: 'critical', note: 'THE TRANSFERABLE LESSON, and it sharpens a rule I already held. I ran a positive control (same pattern against outcome_ref) and it found four writers, which I took as proof the search was sound. But I applied THE SAME EXCLUSION to the control, so it found writers only via other syntactic forms and still looked green. A positive control validates that the search RUNS; it does NOT validate the EXCLUSION LIST. To test an exclusion, the control must be a case the exclusion would wrongly remove.' },
    { id: 'root-cause-the-writer-is-correct-the-input-is-not', severity: 'critical', note: 'The writer DERIVES outcome_sd_key from outcome_ref — deliberately, since a second hand-entered field would drift and two columns would then disagree about which artifact a decision tracked. It fires only on uppercase SD keys; QFs are excluded because the reconciler resolves against strategic_directives_v2 where QFs do not live, and an unresolvable key is WORSE than none (the row is re-selected by every scheduled batch forever). MEASURED shape of ALL 865 populated outcome_ref values: 853 (98.6%) not refs at all, 4 commit sha, 4 SD- non-uppercase, 3 QF-, and exactly ONE (0.1%) eligible. There is essentially nothing to derive FROM.' },
    { id: 'outcome-ref-carries-two-incompatible-jobs', severity: 'critical', note: 'THE ACTUAL DEFECT. Sampled all 853: they are NARRATIVE PROSE — "era_closure:2026-07-29 — advice consumed int...", "followed (dispatch pressed) — later found mo...", "Solomon 07-20 18:51 ground read on -A (SESSI...". ~650 of 853 (76%) carry an era_closure: prefix, i.e. a BULK STAMP rather than organic writes. So outcome_ref is simultaneously an artifact REFERENCE (machine-resolvable, what the advice BECAME) and an outcome NARRATIVE (human prose, what happened). The deriver needs the former; 98.6% of the column is the latter. No wiring fixes an overloaded field — one column, two meanings.' },
    { id: 'RETRACTED-the-14-to-62-jump-was-not-self-remediation', severity: 'critical', note: 'SECOND RETRACTION, and it lands on the SD own thesis. I read outcome_ref rising 14%->62% as the field self-remedying and proposed copying that writer as the model. WRONG: the jump was a bulk stamp of PROSE into a REFERENCE field. The metric rose, the capability did not, and outcome_sd_key moved by exactly one row. A POPULATED COLUMN IS NOT A POPULATED MEASURE — which is precisely this SD thesis (cheap field 100%, expensive field 3.4%), and I nearly reproduced it while investigating it.' },
    { id: 'the-tempting-cheap-win-gains-four-rows', severity: 'warning', note: 'Case-fixing the 4 non-uppercase SD- refs looks like an obvious quick fix and would gain FOUR ROWS out of 1,392. Recording it explicitly so it is not mistaken for progress. Note also the prior author measured that 13 of 31 existing outcome_sd_key values ALREADY FAIL TO RESOLVE — so even the populated minority is partly dead.' },
    { id: 'prior-author-hit-the-same-control-blindness-on-this-field', severity: 'info', note: 'The FR-6 comment records its own author noticing their negative control missed the case FR-6 adds ("it covered the commit-sha case and not the case FR-6 actually adds"). That is the same control-blindness class I hit on this SD — two different authors, same failure mode, same field. Suggests the field itself invites it.' },
  ],
  metadata: {
    phase_intent: 'LEAD groundwork — measure before encoding',
    premises_corrected: 3, own_retractions: 2, reads_only: true,
    mechanism_verifications: [
      { verified_by: 'Bravo (e3610a71) — the writer exists on main, retracting my no-writer claim', verified_at: 'scripts/coordinator-ack-adam.cjs:249 `row.outcome_sd_key = resolvedOutcomeRef`; added by d4f7cbed4db, verified ancestor of origin/main' },
      { verified_by: 'Bravo (e3610a71) — the narrowings are deliberate and each prevents a NOISY failure', verified_at: 'scripts/coordinator-ack-adam.cjs:264 (SD keys only, uppercase only; QF excluded because the reconciler resolves against strategic_directives_v2)' },
      { verified_by: 'Bravo (e3610a71) — the consumer skips rows lacking the key', verified_at: 'scripts/solomon-ledger-reconcile.cjs:64 skips on "no outcome_sd_key"; :70 resolves the SD by that key' },
      { verified_by: 'Bravo (e3610a71) — the input shape makes derivation impossible for 98.6% of rows', verified_at: 'whole-column sample of 865 populated outcome_ref values: 1 matches ^SD-[A-Z0-9-]+$; 853 are narrative prose, ~650 with an era_closure: prefix' },
    ],
  },
  execution_time_ms: 1200000,
};

const validation = {
  verdict: 'CONDITIONAL_PASS', confidence: 88,
  summary:
    'The SD problem is real and its measure is genuinely starved, but its prescribed remedy does not '
    + 'address the cause. Three conditions, all aimed at not chasing a number.',
  findings: [
    { id: 'condition-do-not-implement-the-stated-remedy-as-written', severity: 'critical', note: 'CONDITION 1. "The remedy is wiring" cannot be built as specified: the wiring exists and is correct. Implementing more writers, or loosening the match pattern, would produce UNRESOLVABLE keys — which the prior author measured as strictly worse than none, since such rows are re-selected by every scheduled batch forever. An inert path made NOISY is a regression, not a fix.' },
    { id: 'condition-decide-applicability-before-chasing-population', severity: 'critical', note: 'CONDITION 2. The prior question is whether the forward path is even APPLICABLE to advice whose outcome is a narrative rather than an artifact. If most advice genuinely does not become an SD, then 3.4% may be close to the true ceiling, and the honest deliverable is to SAY the reconciler is inapplicable to those rows rather than leave it looking broken. Chasing 100% on an inapplicable population is chasing a number.' },
    { id: 'condition-if-refs-should-be-resolvable-the-defect-is-upstream', severity: 'warning', note: 'CONDITION 3. If outcome_ref is SUPPOSED to be machine-resolvable, then writing prose into it is the defect and the fix belongs at that writer — not at the deriver, which is behaving correctly. Either way the deliverable starts by naming the overload; a fix that does not decide which job the column has will re-create the ambiguity under a new name.' },
    { id: 'the-sd-diagnosis-half-is-sound-and-worth-preserving', severity: 'info', note: 'The SD framing — the CHEAP field is written 100% and the EXPENSIVE one 3.4%, because outcome costs nothing at insert while outcome_sd_key requires knowing what the advice BECAME — is exactly right and generalises. It reportedly recurred six times on 2026-07-29. Keep the diagnosis; replace the prescription.' },
  ],
  metadata: { conditions: 3, reads_only: true, remedy_as_written_viable: false },
  execution_time_ms: 600000,
};

for (const [code, name, payload] of [['Explore', 'Codebase Explorer', explore], ['VALIDATION', 'Principal Systems Analyst', validation]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'LEAD' });
  console.log('STORED ' + code + '/LEAD id=' + (s && s.id));
}
