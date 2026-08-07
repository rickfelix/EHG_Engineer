import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-TRIAGE-2026-BULK-001';

const explore = {
  verdict: 'WARNING', confidence: 90,
  summary:
    'Manifest located and measured before any triage. FIVE premise corrections, two of which change '
    + 'the METHOD. The missing calibration case was resolved from git rather than escalated, and it '
    + 'yielded a signature-based processing order the SD did not anticipate.',
  findings: [
    { id: 'the-manifest-is-the-json-not-the-markdown-named-after-the-date', severity: 'critical', note: 'docs/05_testing/skip-quarantine-manifest-2026-06-11.md is 83 lines with NO reason_class field — it is not the manifest despite being named after the quarantine date. The real one is tests/quarantine-manifest.json (keys: $schema, generated_at, quarantined). Entry shape: file, reason_class, error_signature, linked_ref, quarantined_at, quarantined_by, triage_note. Worth stating because the plausible-looking wrong file would have produced a triage of nothing.' },
    { id: 'counts-and-the-same-day-claim-are-both-off', severity: 'warning', note: 'MEASURED: 162 entries total (SD says 163); 117 assertion-drift (SD says 118). More materially, they were NOT all quarantined the same day: 2026-06-11 -> 106, 06-22 -> 1, 06-28 -> 8, 07-08 -> 1, 07-17 -> 1. The BULK EVENT is 106. The other 11 are individually dated and must NOT inherit the bulk-shelving argument — they may be exactly what the label says, and lumping them in would be the same over-generalisation the SD exists to correct.' },
    { id: 'fr2-premise-is-overstated-and-that-shrinks-the-deliverable', severity: 'critical', note: 'FR-2 says the current state is a label with no per-entry basis, and that this made 118 judgements indistinguishable from one. MEASURED on the 106: ALL 106 carry an error_signature with 79 DISTINCT prefixes, and ALL 106 carry a linked_ref. Only triage_note is sparse (2 of 106). So these were NOT one verdict stamped 106 times — the original quarantiners captured real per-entry data. The actual gap is no per-entry DISCRIMINATION (does a change predating quarantine invert the assertion?), not no per-entry BASIS. FR-2 is therefore adding a verdict beside existing evidence, not reconstructing evidence from nothing. Flagged deliberately: an SD that overstates how evidence-free the bulk was leans the same direction as the bulk it criticises.' },
    { id: 'the-calibration-case-was-recovered-from-git-not-escalated', severity: 'critical', note: 'FR-1 makes pr-merge-verification.test.js the first entry processed so the method is validated against a known answer. It is NOT in the manifest (zero fuzzy matches) and NOT in vitest.config.js. Rather than block, I checked git: it WAS added by a6a5477f149 (the 188-file green-main quarantine) and REMOVED by 071758279d1 on 2026-08-03. The SD premise is STALE, not wrong — the finding is real and FR-1 can execute, reading git instead of the manifest. The test file own header documents the entire episode: quarantined 2026-06-11 as assertion-drift, a label asserting the TEST was stale, when the CODE had changed.' },
    { id: 'the-worked-example-is-a-member-of-the-106-cohort-and-that-is-the-method', severity: 'critical', note: 'THE FINDING THAT SHAPES FR-1. The removed entry was quarantined 2026-06-11 — inside the bulk cohort — with error_signature AssertionError: expected true to be false. Measuring that signature across the 106: SIX entries share it exactly, and TWELVE more carry its inverse (expected false to be true). EIGHTEEN of 106 therefore carry BOOLEAN-INVERSION signatures, which is precisely the shape of the proven regression (a code change flipped a boolean the test correctly asserted). That gives a principled processing order instead of arbitrary sequence through 106 unknowns.' },
    { id: 'a-shared-signature-is-a-reason-to-look-first-not-a-verdict', severity: 'critical', note: 'THE GUARD ON MY OWN METHOD, and it must reach the PRD. Prioritisation is not presumption. All 18 boolean-inversion entries still require the full FR-1 discrimination, and some will be genuine drift. Treating shares-the-signature as is-a-regression would repeat the original bulk error inverted — assuming 18 answers from one measured case is exactly the move that produced 106 same-day judgements. The signature narrows WHERE TO LOOK FIRST; it decides nothing.' },
    { id: 'un-shelving-is-one-change-because-the-exclude-list-is-derived', severity: 'info', note: 'MECHANISM FOR FR-1 ACTION HALF: un-quarantining is deleting the entry from tests/quarantine-manifest.json. vitest.config.js loadQuarantineExclude DERIVES the exclude list from that file, so there is no second place to edit and no risk of a half-un-shelved state. Recorded because a two-place edit would have been the obvious assumption.' },
  ],
  metadata: {
    phase_intent: 'LEAD groundwork — locate and measure the manifest before triaging',
    premise_corrections: 5, cohort_size: 106, individually_dated_excluded: 11,
    boolean_inversion_candidates: 18, blocker_self_resolved: 1, reads_only: true,
    mechanism_verifications: [
      { verified_by: 'the manifest is the JSON, and its real population', verified_at: 'tests/quarantine-manifest.json: 162 entries; reason_class=assertion-drift -> 117' },
      { verified_by: 'the bulk event is 106, not 118', verified_at: 'assertion-drift grouped by quarantined_at: 2026-06-11=106, 06-22=1, 06-28=8, 07-08=1, 07-17=1' },
      { verified_by: 'the entries are NOT evidence-free', verified_at: '106/106 have error_signature (79 distinct prefixes), 106/106 have linked_ref, only 2/106 have triage_note' },
      { verified_by: 'the worked example was in the manifest and is already un-shelved', verified_at: 'git log -S pr-merge-verification -- tests/quarantine-manifest.json: added a6a5477f149, removed 071758279d1 (2026-08-03)' },
      { verified_by: 'the boolean-inversion sub-cohort', verified_at: '106-cohort by signature: 6 match "expected true to be false" exactly, 12 match the inverse "expected false to be true"' },
      { verified_by: 'un-shelving is a single-file change', verified_at: 'vitest.config.js loadQuarantineExclude derives the exclude list from tests/quarantine-manifest.json' },
    ],
  },
  execution_time_ms: 900000,
};

const validation = {
  verdict: 'CONDITIONAL_PASS', confidence: 88,
  summary:
    'Scope is sound and the two-sided acceptance is correctly specified. Three conditions, all of '
    + 'which exist to stop the re-triage repeating the original error in the opposite direction.',
  findings: [
    { id: 'condition-the-signature-order-must-not-become-a-verdict', severity: 'critical', note: 'CONDITION 1. The 18 boolean-inversion entries are a LOOK-FIRST order, not a finding. The PRD must say so explicitly, because the efficient-looking shortcut — un-shelve all 18 on the strength of one proven case — is precisely the bulk error inverted, and it would be indistinguishable from diligence in the report.' },
    { id: 'condition-the-11-individually-dated-entries-are-a-separate-cohort', severity: 'critical', note: 'CONDITION 2. Only the 106 same-day entries carry the bulk-event argument. The 11 dated 06-22 through 07-17 were individual judgements and must be reported separately rather than folded into a single 117 figure. Merging them would manufacture a bulk that did not happen.' },
    { id: 'condition-undetermined-must-survive-into-the-report', severity: 'warning', note: 'CONDITION 3. FR-3 permits and expects an undetermined bucket. The pressure at report time will be to force those into drift-or-regression for a tidy split. An entry whose original context is unrecoverable is a real outcome, and recording it as such is the difference between a re-triage and a second bulk judgement.' },
    { id: 'the-sd-discipline-is-correct-and-worth-preserving-verbatim', severity: 'info', note: 'THE LABEL IS THE HAZARD: assertion-drift encodes a verdict that stops anyone looking, converting an open question into a closed one at zero cost. The 117 are UNMEASURED — not suspected, not implied-guilty. Acceptance is two-sided: genuine drift STAYS shelved with the inverting change cited (not a mass un-shelving), AND proven regressions are un-shelved WITH defects filed (finding one and leaving it shelved repeats the original failure). Both halves required.' },
    { id: 'scope-corrections-were-signalled-before-building', severity: 'info', note: 'All five premise corrections went to the coordinator as spec-conflict/high BEFORE any triage work, and the coordinator independently confirmed the calibration-case finding. Correcting an SD about premature closure by quietly adjusting its premises would have been its own small irony.' },
  ],
  metadata: { conditions: 3, cohort_split: { bulk_same_day: 106, individually_dated: 11 }, reads_only: true },
  execution_time_ms: 600000,
};

for (const [code, name, payload] of [['Explore', 'Codebase Explorer', explore], ['VALIDATION', 'Principal Systems Analyst', validation]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'LEAD' });
  console.log('STORED ' + code + '/LEAD id=' + (s && s.id));
}
