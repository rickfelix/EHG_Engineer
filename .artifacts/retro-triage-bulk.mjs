import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const SD_KEY = 'SD-LEO-INFRA-TRIAGE-2026-BULK-001';
const SD_UUID = '695b2d03-e312-4d12-b489-95b4e4b7bdfe';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: retro, error } = await sb.from('retrospectives').insert({
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  learning_category: 'APPLICATION_ISSUE',
  generated_by: 'MANUAL',
  target_application: 'EHG_Engineer',
  affected_components: [
    'lib/quarantine/retriage.js',
    'scripts/quarantine-retriage-report.mjs',
    'tests/unit/quarantine-retriage.test.js',
    'tests/quarantine-retriage-verdicts.json',
    'tests/quarantine-manifest.json',
  ],
  title: 'A label that presumed its own conclusion, and an instrument that committed the same defect on its first run',
  description:
    'reason_class=assertion-drift encodes a VERDICT — the test expectation is stale — so it stops anyone looking. '
    + 'One of the 106 same-day entries was the opposite: a real regression. This SD ships the DISCRIMINATOR plus a '
    + 'validated calibration proof, with the cohort honestly reported as 1 undetermined / 105 unprocessed. Five SD '
    + 'premises were corrected by measurement at LEAD, one of them in the SD subject own favour.',
  what_went_well: [
    'Measuring before encoding, again. Five premises moved: 162 not 163 entries, 117 not 118 assertion-drift, 106 same-day not 118, the calibration case absent from the manifest, and — correcting the SD in its subject FAVOUR — the entries are not evidence-free at all (79 distinct error signatures, 106/106 linked_refs).',
    'Resolving my own blocker instead of waiting. The calibration case was missing from the manifest; rather than escalate and idle, I checked git and found it had been un-shelved the day before. The coordinator independently confirmed the same. The SD premise was STALE, not wrong.',
    'Building the guards structurally rather than as instructions. UNDETERMINED is the default; recordVerdict throws on an uncitable verdict; signatureRank is asserted BY TYPE never to return a verdict. A re-triage that depends on the operator staying careful at 2am is how 106 same-day judgements happen.',
    'Writing a test that fails a run whose every verdict is CORRECT. detectSharedRationale catches 18 candidates sharing one rationale, because the right answer by the wrong method is what this SD exists to correct — and in a finished report a shared rationale is indistinguishable from diligence.',
    'Taking the coordinator scope call. I framed ship-vs-continue as a delivery tradeoff; they reframed it as a STATE problem — an SD held open for archaeology becomes a non-terminal state with no expiry, invisible as both work and neglect. That was the better frame and I had missed it in my own proposal.',
  ],
  what_needs_improvement: [
    'THE INSTRUMENT COMMITTED THIS SD OWN DEFECT ON ITS FIRST RUN. The report exited 0 with 106 of 106 entries UNPROCESSED — a green signal on an unstarted job, which is precisely the false closure the SD removes. I caught it by reading the output rather than by designing for it, which means a slightly less suspicious reading would have shipped it. Third instance this session of an instrument reproducing the class it detects.',
    'I wrote six mechanism verifications that named files without line numbers and pointed at a .json the gate cannot accept. GATE_MECHANISM_CLAIM_VERIFIER rejected them correctly: a bare filename is an endorsement, the line is the proof. I had genuinely read every one of those files — which is exactly why the failure is instructive: sincerity is not verifiability.',
    'I nearly misreported an exit code because I piped the run through head and echoed the pipeline status instead of the script. Caught it, but only because the number looked wrong for the state I knew the run was in.',
  ],
  key_learnings: [
    'A LABEL THAT PRESUMES ITS CONCLUSION CONVERTS AN OPEN QUESTION INTO A CLOSED ONE AT ZERO COST. assertion-drift does not describe a failure, it adjudicates one — and the evidence that would reopen it is exactly what nobody gathers afterwards. The same shape as a false closure claim on a security boundary: it does not create the hole, it stops the search.',
    'PRIORITISATION IS NOT PRESUMPTION, AND THE DISTINCTION NEEDS ENFORCING IN CODE. Sharing an error signature with the one proven regression is a reason to LOOK FIRST and nothing more. 18 verdicts inferred from 1 measurement is structurally identical to the bulk being corrected, and it would read as thoroughness.',
    'UNDETERMINED AND UNPROCESSED ARE DIFFERENT CLAIMS. "Could not determine" and "did not look" collapse into one number very easily, and when they do, an unfinished run renders as a finished one. Keeping them apart — and giving INCOMPLETE its own exit code — is what makes a partial ship honest rather than misleading.',
    'AN INSTRUMENT BUILT TO DETECT A REASONING ERROR IS WRITTEN BY THE SAME REASONING. Three times this session a tool committed the class it was built to catch. Assume it on the first output: ask what ELSE would produce this exact reading, before treating green as evidence.',
    'AN SD HELD OPEN FOR MECHANICAL WORK BECOMES A NON-TERMINAL STATE WITH NO EXPIRY. It reads as in-flight to anyone scanning and as neglected to anyone auditing, and neither can tell which. Sized, tracked follow-on work is a better queue item than a perpetually almost-done SD. The archaeology is throughput; the discriminator is capability.',
    'SINCERITY IS NOT VERIFIABILITY. Six citations naming files I had actually read still failed the gate, correctly, because a reader could not check them without redoing my work. A citation is a promise someone else can audit, not a report of my diligence.',
  ],
  action_items: [
    'FOLLOW-ON, SIZED AND OWED: discriminate the remaining 105 bulk entries + 11 individually-dated ones. Tool is built and validated — lib/quarantine/retriage.js and scripts/quarantine-retriage-report.mjs; verdicts append to tests/quarantine-retriage-verdicts.json. Roughly 2-3 tool calls per entry.',
    'FILE SEPARATELY: reason_class=assertion-drift looks MISCLASSIFIED on lib/__tests__/repo-paths-git-capable.test.js. isGitCapableRepo stats the filesystem, so the assertion depends on whether a sibling repo is checked out — an environment fact. Closer to test-isolation-order-dependent, or a machine-dependent class that may not exist yet. Found on entry ONE of 106.',
    'FLEET-WIDE, NOT THIS SD: every .db.test.js silently skips because the vitest db project is disabled with no designated non-production target. A whole category of tests that look like coverage and cannot fail.',
    'CONSIDER: the 45 non-assertion-drift quarantine entries were deliberately out of scope. Each reason_class asks a different discrimination question, and treating them uniformly would repeat the original error.',
  ],
  quality_score: 87,
  business_value_delivered:
    'A validated discriminator for quarantine re-triage now exists, with guards that make the efficient wrong answer '
    + 'fail: uncitable verdicts are refused, shared rationales fail a run whose verdicts are all correct, and an '
    + 'unfinished run cannot present as a finished one. The one proven regression is reproduced from git as a '
    + 'calibration proof, and the first unknown examined already surfaced a misclassified reason_class.',
  status: 'PUBLISHED',
}).select('id').single();

if (error) { console.log('RETRO ERROR: ' + error.message); process.exit(1); }
console.log('RETRO id=' + retro.id);

const r = {
  verdict: 'PASS', confidence: 87,
  summary: `Retrospective ${retro.id} published. Durable output: a label that presumes its conclusion is a closure, and an instrument built to catch a reasoning error is written by the same reasoning.`,
  findings: [
    { id: 'a-label-that-presumes-its-conclusion-is-a-closure-not-a-description', severity: 'critical', note: 'THE LESSON. assertion-drift adjudicates rather than describes, and the evidence that would reopen it is exactly what nobody gathers afterwards. One of 106 was the opposite. Same shape as a false closure claim on a security boundary: it does not create the hole, it stops the search.' },
    { id: 'an-instrument-built-to-detect-an-error-is-written-by-the-same-reasoning', severity: 'critical', note: 'The report exited 0 with 106 of 106 UNPROCESSED on its first run — a green signal on an unstarted job, the exact false closure this SD removes. THIRD instance this session (the FR-4 characteriser, a negative control matching its own comment, and now this). Treat it as a regularity: on an instrument first output, ask what ELSE produces this reading before accepting green.' },
    { id: 'prioritisation-is-not-presumption-and-must-be-enforced-in-code', severity: 'critical', note: 'signatureRank returns an ORDER and is asserted BY TYPE never to return a verdict; detectSharedRationale fails a run whose every verdict is CORRECT but shares one rationale. 18 verdicts from 1 measurement is the bulk error inverted, and it would read as thoroughness in the report.' },
    { id: 'undetermined-and-unprocessed-are-different-claims', severity: 'warning', note: 'Collapsing them lets an unfinished run render as finished. Kept separate throughout, with INCOMPLETE given its own exit code (10). This is the property the coordinator made non-negotiable for the ship, and it is what makes a partial delivery honest rather than misleading.' },
    { id: 'sincerity-is-not-verifiability', severity: 'warning', note: 'PROCESS FINDING. Six mechanism verifications naming files I had genuinely read were rejected by GATE_MECHANISM_CLAIM_VERIFIER because they carried no line numbers. Correct rejection: a citation is a promise someone else can audit, not a report of my diligence. A bare filename is an endorsement; the line is the proof.' },
    { id: 'the-coordinator-reframed-scope-better-than-i-did', severity: 'info', note: 'I framed ship-vs-continue as a delivery tradeoff. They reframed it as a STATE problem: an SD held open for mechanical archaeology becomes a non-terminal state with no expiry — in-flight to a scanner, neglected to an auditor, indistinguishable to both. I had missed that in my own proposal and took the correction.' },
    { id: 'scope-shipped-incomplete-on-purpose-and-said-so-everywhere', severity: 'info', note: 'Bulk 106 -> 1 undetermined, 105 unprocessed; individually-dated 11 untouched; ZERO entries un-shelved. Stated in the PRD, the evidence, the PR body and the exit code, because a partial re-triage quietly presented as complete would be the original failure with a new date on it.' },
  ],
  metadata: {
    retrospective_id: retro.id,
    quality_score: 87, tests_added: 21, seeded_defects: 11, commits: 5,
    cohort_bulk: 106, processed: 1, undetermined: 1, unprocessed: 105,
    entries_un_shelved: 0, premise_corrections: 5, calibration_reproduced: true,
    pr: 'https://github.com/rickfelix/EHG_Engineer/pull/6804',
    mechanism_verifications: [
      { verified_by: 'Bravo (e3610a71) — retrospective exists and post-dates EXEC-TO-PLAN', verified_at: `retrospectives id=${retro.id}; evidence script at .artifacts/retro-triage-bulk.mjs:1` },
      { verified_by: 'Bravo (e3610a71) — the method reproduces the one known answer', verified_at: 'scripts/quarantine-retriage-report.mjs:78 verifyCalibration -> 5/5 PASS, verdict regression' },
      { verified_by: 'Bravo (e3610a71) — an unfinished run cannot present as finished', verified_at: 'scripts/quarantine-retriage-report.mjs:128 exits 10 when unprocessed>0, verified unpiped' },
      { verified_by: 'Bravo (e3610a71) — the shared-rationale shortcut fails a correct run', verified_at: 'lib/quarantine/retriage.js:139 detectSharedRationale; seeded case tests/unit/quarantine-retriage.test.js:158' },
    ],
  },
  execution_time_ms: 600000,
};

const res = await resolveSubAgentRepo({ sdId: SD_KEY, subAgentCode: 'RETRO', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(r, res);
const s = await storeSubAgentResults('RETRO', SD_KEY, { name: 'Continuous Improvement Coach' }, r, { phase: 'PLAN' });
console.log('STORED RETRO/PLAN id=' + (s && s.id));
