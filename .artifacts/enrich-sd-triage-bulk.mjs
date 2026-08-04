import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-TRIAGE-2026-BULK-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run: node scripts/quarantine-retriage-report.mjs (reads tests/quarantine-manifest.json and prints the cohort split plus per-entry verdicts)',
    expected_outcome: 'Prints the 2026-06-11 bulk cohort (106) SEPARATELY from the 11 individually-dated assertion-drift entries, and reports the split as drift / regression / UNDETERMINED with undetermined shown as its own count rather than folded away. Exits non-zero if any entry in the processed set lacks a discrimination verdict.',
  },
  {
    step_number: 2,
    instruction: 'Run: node scripts/quarantine-retriage-report.mjs --verify-calibration (re-derives the worked example verdict from git rather than from the manifest, which no longer contains it)',
    expected_outcome: 'Reports pr-merge-verification.test.js as a CONFIRMED REGRESSION: entry added by a6a5477f149, removed by 071758279d1, quarantined 2026-06-11 with reason_class=assertion-drift and error_signature "AssertionError: expected true to be false". Exits non-zero if the method applied to this known-answer case does not reproduce the known answer.',
  },
  {
    step_number: 3,
    instruction: 'Run: npx vitest run tests/unit/quarantine-manifest.test.js (the manifest schema/consistency suite)',
    expected_outcome: 'Green, AND any entry this SD un-shelved is absent from tests/quarantine-manifest.json — which is the only edit needed, because vitest.config.js loadQuarantineExclude derives the exclude list from that file. A file still present in the manifest after being reported un-shelved is the failure this step exists to catch.',
  },
];

const strategic_objectives = [
  'Replace a bulk label with per-entry discrimination: for each of the 106 same-day assertion-drift entries, answer with evidence whether a code change predating the quarantine actually inverted the assertion, so the manifest records WHY an entry is shelved rather than only THAT it is.',
  'Recover the regressions the label hid, without manufacturing new ones: genuine drift stays shelved with its inverting change cited, proven regressions are un-shelved AND have defects filed. Both halves are required — a mass un-shelving and a mass re-confirmation are the same failure in opposite directions.',
  'Report the split honestly including an UNDETERMINED bucket, because an entry whose original context is unrecoverable is a real outcome and forcing it into drift-or-regression to tidy the report would be a second bulk judgement.',
];

const key_changes = [
  {
    change: 'FR-1: per-entry discrimination over the 106-entry 2026-06-11 cohort, processed in a signature-derived order with the recovered calibration case first.',
    impact: 'MEASURED: the worked example (pr-merge-verification.test.js) is a MEMBER of this cohort, carrying error_signature "AssertionError: expected true to be false". Six other entries share that signature exactly and twelve carry its inverse — 18 boolean-inversion candidates, the exact shape of the proven regression. GUARD: this is a LOOK-FIRST order, NOT a verdict. All 18 still need full discrimination and some will be genuine drift; treating shared-signature as proven-regression would repeat the bulk error inverted.',
  },
  {
    change: 'FR-2: add a discrimination verdict to each entry alongside the evidence it already carries.',
    impact: 'CORRECTS THE SD PREMISE: the entries are NOT evidence-free. All 106 carry an error_signature (79 DISTINCT prefixes) and all 106 carry a linked_ref; only triage_note is sparse (2 of 106). The real gap is no per-entry DISCRIMINATION, not no per-entry BASIS. This is adding a verdict beside existing evidence, not reconstructing evidence from nothing — and the 79 distinct signatures are evidence the original quarantiners were doing more than stamping.',
  },
  {
    change: 'Cohort separation: the 11 individually-dated assertion-drift entries (06-22, 06-28 x8, 07-08, 07-17) are reported as a distinct cohort.',
    impact: 'CORRECTS THE SD COUNTS: 162 entries not 163, 117 assertion-drift not 118, and they were NOT all same-day. Only 106 belong to the bulk event. The other 11 were individual judgements and must not inherit the bulk-shelving argument — they may be exactly what the label says.',
  },
  {
    change: 'FR-3: report drift / regression / undetermined, with undetermined preserved as a first-class outcome.',
    impact: 'Prevents the report-time pressure to force unrecoverable entries into a tidy binary. A re-triage that cannot say "I could not determine this" is not measuring, it is re-labelling.',
  },
];

const mechanism_verifications = [
  { verified_by: 'Bravo (e3610a71) — located the real manifest; the file named after the quarantine date is NOT it', verified_at: 'tests/quarantine-manifest.json (keys $schema, generated_at, quarantined); docs/05_testing/skip-quarantine-manifest-2026-06-11.md is 83 lines with no reason_class field' },
  { verified_by: 'Bravo (e3610a71) — measured the population and the date split', verified_at: 'tests/quarantine-manifest.json: 162 entries; assertion-drift=117; by quarantined_at 2026-06-11=106, 06-22=1, 06-28=8, 07-08=1, 07-17=1' },
  { verified_by: 'Bravo (e3610a71) — measured that the entries carry per-entry evidence already', verified_at: '2026-06-11 cohort n=106: error_signature present 106/106 with 79 distinct prefixes; linked_ref 106/106; triage_note only 2/106' },
  { verified_by: 'Bravo (e3610a71) — recovered the calibration case from git after finding it absent from the manifest', verified_at: 'git log -S"pr-merge-verification" -- tests/quarantine-manifest.json: added a6a5477f149, removed 071758279d1 (2026-08-03 15:52)' },
  { verified_by: 'Bravo (e3610a71) — identified the boolean-inversion sub-cohort', verified_at: '106-cohort by error_signature: 6 exactly match "AssertionError: expected true to be false", 12 match the inverse "expected false to be true"' },
  { verified_by: 'Bravo (e3610a71) — confirmed un-shelving is a single-file edit', verified_at: 'vitest.config.js loadQuarantineExclude derives the exclude list from tests/quarantine-manifest.json; no second location to edit' },
];

const { data: sd, error: e0 } = await sb.from('strategic_directives_v2').select('metadata').eq('sd_key', KEY).single();
if (e0) { console.log('lookup failed: ' + e0.message); process.exit(1); }
const metadata = { ...(sd.metadata || {}), mechanism_verifications };

const { error } = await sb.from('strategic_directives_v2')
  .update({ smoke_test_steps, strategic_objectives, key_changes, metadata }).eq('sd_key', KEY);
console.log(error ? ('ERR: ' + error.message)
  : `UPDATED smoke(${smoke_test_steps.length}) objectives(${strategic_objectives.length}) key_changes(${key_changes.length}) mechanism_verifications(${mechanism_verifications.length})`);
