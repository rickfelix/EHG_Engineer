#!/usr/bin/env node
/**
 * FR-5 — materialize the founding corpus as STRUCTURED RECORDS.
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001
 *
 * TESTING (row 6c9e89b9) measured that metadata.founding_corpus is a single ~200-char PROSE
 * STRING — a pointer to a corpus, not a record of one — so FR-5 acceptance had nothing to assert
 * against. This writes the records the acceptance criteria need, and it does NOT overwrite the
 * prose pointer: the string stays as provenance for how the records were derived.
 *
 * COUNT RECONCILIATION (the reason this script exists rather than a hand-edit): the PRD says
 * ELEVEN. The evidence says TWELVE. Instance seven (Trend-Eyes) was added by the coordinator at
 * 20:24:28Z, AFTER the "eleven" was written at 19:41:19Z, and nobody re-reconciled the count. The
 * coordinator's label "instance SEVEN" continues the 1-6 numbering INSIDE flag 06627c75 and skips
 * the unnumbered ledger five — a numbering artifact, not evidence that it merges with an existing
 * entry. Recorded here as 12 with the discrepancy explicit, because a corpus that quietly drops a
 * member to match a stale total is the same failure this SD exists to catch.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001';
const SIX_FLAG = '06627c75-8279-4a6d-9d53-5b3595b002d6';

/**
 * in_class = "a diff heuristic COULD catch it" (FR-5's wording) — deliberately NOT "the arm this
 * SD ships catches it". Conflating the two would let the replay hit rate read as a capability
 * claim. Recall is reported against this subset with the out-of-class count on the same line.
 */
export const CORPUS = [
  { n: 1, source: 'alpha2_flag_six', label: 'resolver fixed, runSweep untested',
    what: 'Resolver fixed and runSweep left untested; a one-token revert restored a false all-clear with the suite green.',
    in_class: true, reason: 'A changed producer whose only caller is exercised by nothing is visible in the diff.',
    evidence_id: SIX_FLAG, evidence_kind: 'feedback.completion_flag', provenance: 'measured' },
  { n: 2, source: 'alpha2_flag_six', label: 'clamp proven at the probe, not the resolver',
    what: 'Math.min clamp removed but proven only at the probe, never through the resolver.',
    in_class: true, reason: 'Verification site differs from the changed site — both are in the diff.',
    evidence_id: SIX_FLAG, evidence_kind: 'feedback.completion_flag', provenance: 'measured' },
  { n: 3, source: 'alpha2_flag_six', label: 'return made the failure exit unreachable',
    what: 'Probe seed leak fixed with a return, which made the exit unreachable, so a FAILED verify exited 0.',
    in_class: true, reason: 'Unreachable code after a return is statically detectable.',
    evidence_id: SIX_FLAG, evidence_kind: 'feedback.completion_flag', provenance: 'measured' },
  { n: 4, source: 'alpha2_flag_six', label: 'dedup fixture never load-bearing',
    what: 'Dedup fixture gave each finding a distinct class, so the index under test was never load-bearing.',
    in_class: true, in_class_confidence: 'weak',
    reason: 'Detectable in principle as a fixture whose values never collide on the key under test, but this is the hardest of the twelve to reduce to a diff rule.',
    evidence_id: SIX_FLAG, evidence_kind: 'feedback.completion_flag', provenance: 'measured' },
  { n: 5, source: 'alpha2_flag_six', label: 'hand-rolled main guard carried by ||',
    what: 'Hand-rolled main guard whose || fallback silently carried it.',
    in_class: true, reason: 'A hand-rolled entry guard is a literal, greppable pattern; the canonical isMainModule helper exists.',
    evidence_id: SIX_FLAG, evidence_kind: 'feedback.completion_flag', provenance: 'measured' },
  { n: 6, source: 'alpha2_flag_six', label: 'ended a turn without arming a ScheduleWakeup',
    what: 'Alpha-2 ended a turn without arming a ScheduleWakeup after carrying the discipline fifteen passes.',
    in_class: false, out_of_class_kind: 'turn_behaviour',
    reason: 'Turn behaviour leaves no artifact in any diff. No diff heuristic can ever catch it.',
    evidence_id: SIX_FLAG, evidence_kind: 'feedback.completion_flag',
    corroborating_id: '69c2595b-dcf2-4d6f-99b9-9fea701b11ef', provenance: 'measured' },

  { n: 7, source: 'ledger_five', label: 'stale classifier consumer',
    what: 'The work-class classifier fix merged (QF-20260807-195, be4797bf) and the promised consumer check FAILED — because the shared root was 2 commits behind origin/main and still ran the OLD classifier. The fix was correct; the consumer was stale. Confirmed 29 min later: unclassified-fenced went 3 -> ZERO.',
    in_class: false, out_of_class_kind: 'environment_staleness',
    reason: 'The defect was in WHICH BUILD the consumer ran, not in any code property. No diff contains it. Distinct from the two turn-behaviour lapses and recorded as its own out-of-class kind rather than lumped with them.',
    evidence_id: '0ce847f6-3886-4aab-8ad9-c2a8ab344061', evidence_kind: 'session_coordination',
    corroborating_id: '1b889153-aafb-42d3-a4ad-d9b18be5943a', provenance: 'measured' },
  { n: 8, source: 'ledger_five', label: 'producer no-op at its only caller',
    what: 'drive-report-produce.mjs exited 0 with no output and drive_reports stayed at ZERO rows. On Windows the hand-rolled guard at :71 built file://C:/ (two slashes) against import.meta.url file:///C:/ (three) -> no match, main() never ran. The cron dispatch (run 31207150740) went GREEN while producing nothing.',
    in_class: true, reason: 'Same greppable hand-rolled-entry-guard pattern as instance 5; a green caller over a producer that wrote zero rows is exactly the producer-ran-consumer-absent rung.',
    evidence_id: 'c461eb63-a076-4e3f-ba12-25d5bf9ad2b1', evidence_kind: 'session_coordination.finding_2',
    corroborating_id: 'QF-20260807-992', provenance: 'measured' },
  { n: 9, source: 'ledger_five', label: 'phantom-column panel read',
    what: 'A liveness panel verification read periodic_process_registry.liveness_verdict, which DOES NOT EXIST (PostgREST 42703). OVERDUE=0 would have concluded the panel was clean while 13 real alarms were live.',
    in_class: true, reason: 'Column existence is checkable against the live schema; a select naming an absent column is detectable without running the panel.',
    evidence_id: 'c461eb63-a076-4e3f-ba12-25d5bf9ad2b1', evidence_kind: 'session_coordination.finding_1', provenance: 'measured' },
  { n: 10, source: 'ledger_five', label: 'the reap verification',
    what: 'The reaper entry guard hand-compared import.meta.url to a file:// string and never matched on Windows: it ran, printed nothing, exited 0. A reaper whose main() never fires is indistinguishable from one that found nothing to reap. Caught only because the dry-run output was empty.',
    in_class: true, reason: 'Same hand-rolled entry-guard pattern as 5 and 8.',
    evidence_id: '2d950039-6057-4576-a9c8-e2592342e83c', evidence_kind: 'session_coordination',
    corroborating_id: 'QF-20260807-190', provenance: 'measured',
    caveat: 'The label maps to a two-incident arc (the reaper guard, and the post-delete verification of 53 __e2e_ rows which is the same event as instance 9). The ledger wording is lost, so this is the least crisply grounded of the twelve.' },
  { n: 11, source: 'ledger_five', label: 'a dropped wakeup',
    what: 'Bravo wrote "wakeup-armed +900s" into a reap-escalation signal and never called the ScheduleWakeup tool. The Stop hook caught it: saying wakeup armed in a /signal does NOT satisfy it.',
    in_class: false, out_of_class_kind: 'turn_behaviour',
    reason: 'Turn behaviour. No diff heuristic can ever catch it.',
    evidence_id: 'c5e91feb-a875-44e5-9381-6916efdcc1c2', evidence_kind: 'session_coordination',
    corroborating_id: 'QF-20260807-050', provenance: 'inferred',
    provenance_note: 'ATTRIBUTION INFERRED, not documented: nobody attached an evidence id to the ledger\'s "dropped wakeup". The tie to Bravo\'s 18:07Z incident rests on clustering, timing, and the QF-050 routing note. What IS directly documented is that LEAD gate e37eae0d classified "ScheduleWakeup not armed" and "dropped wakeup" as TWO SEPARATE corpus members.' },

  { n: 12, source: 'coordinator_addition', label: 'Trend-Eyes unwired alarm — THE DEMONSTRATION CASE',
    what: 'checkTrendEyesLiveness has ZERO production callers; the receipt is written daily and NOTHING reads it.',
    in_class: true, replay_required: true,
    reason: 'The absent reader is statically detectable: a produced artifact with no importer.',
    why_it_is_the_demo: 'FIRST instance to survive a RATIFIED completion — handoffs at 93/94/87/92/96, a 100-quality retro, and a six-flag completion interrogation. The SECURITY artifact even contained the words ZERO IMPORTS and no human converted it. INVOCATION_PATH_PROOF passed because it checks whether the producer RAN, while nothing asks whether the output has a READER.',
    evidence_id: '1d0d8b6c-96af-406a-8054-b421ae170304', evidence_kind: 'session_coordination',
    corroborating_id: 'QF-20260807-985', provenance: 'measured',
    numbering_note: 'The coordinator called this "instance SEVEN". That continues the 1-6 numbering INSIDE flag 06627c75 and ignores the unnumbered ledger five. It is recorded here as n=12 in a single flat sequence; "corpus #7" in the PRD refers to THIS record.' },
];

const inClass = CORPUS.filter((c) => c.in_class);
const outClass = CORPUS.filter((c) => !c.in_class);

const RECONCILIATION = {
  recorded_total: CORPUS.length,
  prd_stated_total: 11,
  discrepancy: 'PRD FR-5 and metadata.corpus_note both say ELEVEN. The evidence supports TWELVE (6 in-SD + 5 ledger + 1 coordinator addition).',
  why: 'The "eleven" was written into the SD description at 2026-08-07T19:41:19Z. The coordinator added the Trend-Eyes instance at 20:24:28Z. The total was never re-reconciled.',
  settled_by: [
    'SD description d5c02796 wording: the ledger "adds at least five MORE" — additive to the six enumerated in the same sentence.',
    'LEAD gate row e37eae0d classified "ScheduleWakeup not armed" AND "dropped wakeup" as TWO separate out-of-class entries, and counted 6 citable + 5 uncited = 11 with no overlap.',
    'Two genuinely distinct dropped-wakeup incidents exist, by two different seats: Bravo 7c0540c2 at 18:07:16Z and Alpha-2 a3f4b741 at 19:09:52Z.',
    'The other four ledger items belong to non-Alpha-2 seats, so the fleet ledger collects instances OUTSIDE Alpha-2 SD — its dropped wakeup is Bravo not Alpha-2.',
  ],
  evidence_id_gap_closed: 'LEAD gate e37eae0d recorded that the 5 ledger instances "carry no evidence IDs, so 5 of 11 corpus entries are currently unverifiable". Primary records were located for all five; 12 of 12 now carry a citable id. ONE attribution (n=11) is INFERRED and marked as such rather than presented as measured.',
  ledger_source_lost: 'The ledger itself was coordinator advisory 5cc83246, absent from all 4362 session_coordination rows (advisory-lane 24h expiry + prune). Three surviving rows reference it: 2c165276, dd408d1e, f423bb7c. The five labels were expanded from the SD own description, then traced to primary incident records.',
};

export const SUMMARY = {
  total: CORPUS.length,
  in_class: inClass.length,
  out_of_class: outClass.length,
  out_of_class_breakdown: { turn_behaviour: 2, environment_staleness: 1 },
  citable_evidence_ids: CORPUS.filter((c) => c.evidence_id).length,
  inferred_attributions: CORPUS.filter((c) => c.provenance === 'inferred').map((c) => c.n),
  // The line FR-5 demands: a hit rate must never read as complete coverage.
  recall_reporting_rule: `Report replay recall as "N of ${inClass.length} IN-CLASS (${outClass.length} out-of-class, not replayable)" — never as a bare "N of N".`,
};

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).maybeSingle();
  if (readErr) throw new Error(`read failed: ${readErr.message}`);
  if (!sd) throw new Error(`SD not found: ${SD_KEY}`);

  const metadata = {
    ...(sd.metadata || {}),
    // The prose pointer is PRESERVED, not replaced — it is the provenance for these records.
    founding_corpus_records: CORPUS,
    founding_corpus_summary: SUMMARY,
    founding_corpus_reconciliation: RECONCILIATION,
    founding_corpus_materialized_at: new Date().toISOString(),
  };

  const { data: updated, error } = await supabase
    .from('strategic_directives_v2').update({ metadata }).eq('id', sd.id).select('id');
  if (error) throw new Error(`update failed: ${error.message}`);
  // An update matching zero rows is indistinguishable from success — so assert the row count.
  if (!updated || updated.length !== 1) throw new Error(`update matched ${updated?.length ?? 0} rows, expected 1`);

  // Read back from the DB rather than trusting the object we just sent.
  const { data: verify } = await supabase
    .from('strategic_directives_v2').select('metadata').eq('id', sd.id).maybeSingle();
  const back = verify?.metadata?.founding_corpus_records;
  if (!Array.isArray(back) || back.length !== CORPUS.length) {
    throw new Error(`readback mismatch: got ${Array.isArray(back) ? back.length : typeof back}, expected ${CORPUS.length}`);
  }
  if (!verify?.metadata?.founding_corpus) throw new Error('readback: prose pointer was clobbered');

  console.log(`✅ materialized ${back.length} corpus records (readback verified)`);
  console.log(`   in-class ${SUMMARY.in_class} | out-of-class ${SUMMARY.out_of_class} (${SUMMARY.out_of_class_breakdown.turn_behaviour} turn-behaviour, ${SUMMARY.out_of_class_breakdown.environment_staleness} environment-staleness)`);
  console.log(`   citable evidence ids ${SUMMARY.citable_evidence_ids}/${SUMMARY.total}; inferred attribution on n=${SUMMARY.inferred_attributions.join(',')}`);
  console.log(`   ⚠️  PRD says 11, evidence says ${SUMMARY.total} — reconciliation recorded at metadata.founding_corpus_reconciliation`);
  console.log(`   recall rule: ${SUMMARY.recall_reporting_rule}`);
}

// Guarded so importing this module for its CORPUS constant does NOT write to the database.
// An unguarded side effect here would make a unit test a DB writer — the exact shape the
// repo's DB-test guard exists to stop.
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
}
