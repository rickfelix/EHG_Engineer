import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const SD_KEY = 'SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001';
const SD_UUID = '972ab61c-d029-4e34-b3d1-b3657e2c881c';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: retro, error } = await sb.from('retrospectives').insert({
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  learning_category: 'APPLICATION_ISSUE',
  generated_by: 'MANUAL',
  target_application: 'EHG_Engineer',
  affected_components: [
    'lib/ledger/ref-shape.js',
    'scripts/ledger-ref-shape-report.mjs',
    'tests/unit/ledger-ref-shape.test.js',
    'scripts/coordinator-ack-adam.cjs',
    'scripts/solomon-ledger-reconcile.cjs',
  ],
  title: 'The SD prescribed wiring for a writer that works — and I made the same class of error twice while proving it',
  description:
    'outcome_sd_key sits at 3.4% and the SD read that as a wiring defect. A correct writer already exists; '
    + 'the INPUT fails — 853 of 865 populated outcome_ref values are narrative prose, and exactly one matches '
    + 'the eligible SD-key shape. outcome_ref carries two incompatible jobs. The deliverable became a classifier '
    + 'that cannot emit a population without its ceiling. Two of my own findings were retracted en route.',
  what_went_well: [
    'Measuring the SD premises before encoding them. The numbers had already moved (1,216 -> 1,392 -> 1,399 rows during the SD), and the half that mattered — outcome_sd_key gaining ONE row while the table grew by 176 — strengthened the diagnosis while falsifying the prescription.',
    'Building the guards structurally rather than as advice. summarise() THROWS on a bare population; the three buckets exist even at zero; pct_of_ceiling is null rather than 0 when nothing is achievable. On an SD about a misleading number, a convention would have been the wrong instrument.',
    'Paginating the report. PostgREST caps a plain select at 1000 silently and the table holds 1399 — a single fetch would have classified the CAP and printed a confident wrong distribution. Totals reconcile against an exact COUNT or the run exits non-zero.',
    'Caveating my own headline. The 8.4%-of-ceiling figure is optimistic because 534 of the 571 ceiling rows carry no ref at all. Naming that inside the deliverable mattered more than usual, since the SD exists because a flattering denominator went unexamined once already.',
    'Declining the cheap win. Upcasing the 4 lowercase SD- refs would have raised the coverage number and created keys that never resolve, which the reconciler re-selects on every batch forever.',
  ],
  what_needs_improvement: [
    'I ASSERTED "NO WRITER EXISTS" AND IT WAS FALSE. My grep excluded `row.outcome_sd_key` to filter out READS like `if (!row.outcome_sd_key)` — and the WRITE is the same token up to the operator, so the exclusion deleted what I was looking for. The writer had been on main since d4f7cbed4db.',
    'MY POSITIVE CONTROL COULD NOT HAVE CAUGHT IT, and I treated its green as proof. I applied the SAME exclusion to the control field, so it found writers via other syntactic forms and passed while my answer was wrong. I had been citing "a control validates the mechanism, not the completeness of the pattern set" all session and still missed that it does not validate the EXCLUSION either.',
    'I READ A RISING METRIC AS A WORKING MECHANISM. outcome_ref went 14% -> 62% and I called it self-remediation, proposing to copy that writer. It was a bulk stamp of PROSE into a REFERENCE field: the metric rose, the capability did not, and outcome_sd_key moved by one row. That is this SD own thesis, reproduced by me while investigating it.',
  ],
  key_learnings: [
    'A CONTROL THAT INHERITS THE FLAW CANNOT REVEAL IT. A positive control validates that the SEARCH RUNS; it never validates the EXCLUSION LIST. An exclusion is exactly the assumption you forget you made, so to test one the control must be a case the exclusion would wrongly remove — not merely a case that should be found.',
    'A POPULATED COLUMN IS NOT A POPULATED MEASURE. Coverage rising is evidence that something wrote, not that the mechanism works. Ask what was written before crediting the trend.',
    'THE SAME NUMBER CARRIES OPPOSITE REMEDIES DEPENDING ON ITS DENOMINATOR. 3.4% against an implied 100% says the writer is broken and invites wiring; 3.4% against the derivable ceiling says the input is absent. Publishing a population without its ceiling is not incomplete reporting — it is misleading reporting, and it is what produced this SD prescription.',
    'AN UNEXAMINED CEILING IS JUST A FRIENDLIER DENOMINATOR. Having built a tool that refuses to emit a population without a ceiling, the ceiling itself then needs interrogating: mine was dominated by rows with no ref at all, so 8.4% flatters the truth.',
    'AN SD WHOSE REMEDY IS CONTRADICTED BY MEASUREMENT IS NOT A SPEC TO IMPLEMENT LITERALLY. The diagnosis half (the cheap field is written 100%, the expensive one 3.4%) was exactly right and generalises. The prescription half was falsifiable in one query. Keep the diagnosis, replace the prescription, and say which you did.',
    'A FIELD CAN VIOLATE SINGLE-REPRESENTATION IN THE UNFAMILIAR DIRECTION: not one fact in two places, but TWO facts in one place. outcome_ref is simultaneously a machine-resolvable reference and a human narrative, and no amount of writer-wiring resolves an overloaded column.',
  ],
  action_items: [
    'DECISION OWED: split outcome_ref into reference and narrative, or declare it narrative-only and source refs elsewhere. A fix that does not decide which job the column has will recreate the ambiguity under a new name.',
    'THE CEILING IS OPTIMISTIC: 571 is dominated by 534 rows carrying no ref. Of rows that HAVE a ref, only 5 of 865 are in-domain. Anyone quoting 8.4% should quote that alongside it.',
    'PRIOR AUTHOR MEASUREMENT, STILL TRUE: 13 of 31 existing outcome_sd_key values already fail to resolve — the populated minority is partly dead.',
    'PATTERN WORTH A LOOK: the FR-6 author recorded their own negative control missing the case their fix added. Same control-blindness class I hit here, two different authors, same field. The field may invite it.',
    'FLEET-WIDE, RE-FLAGGED: every .db.test.js silently skips because the vitest db project is disabled with no designated non-production target.',
  ],
  quality_score: 88,
  business_value_delivered:
    'A governance ledger stopped reporting a figure that misdirected effort. Coverage now travels with its '
    + 'derivable ceiling and a three-bucket applicability split, so 3.4% reads as an absent input rather than a '
    + 'broken writer — and the tool refuses to produce the misleading form again. Zero DDL, writer untouched.',
  status: 'PUBLISHED',
}).select('id').single();

if (error) { console.log('RETRO ERROR: ' + error.message); process.exit(1); }
console.log('RETRO id=' + retro.id);

const r = {
  verdict: 'PASS', confidence: 88,
  summary: `Retrospective ${retro.id} published. Durable output: a control that inherits the flaw cannot reveal it, and a populated column is not a populated measure.`,
  findings: [
    { id: 'a-control-that-inherits-the-flaw-cannot-reveal-it', severity: 'critical', note: 'THE LESSON, now adopted as fleet guidance by the coordinator. My grep excluded `row.outcome_sd_key` to drop reads and deleted the write. My positive control passed because I applied the SAME exclusion to it. A control validates that the SEARCH RUNS, never that the EXCLUSION LIST is safe — and an exclusion is precisely the assumption you forget you made.' },
    { id: 'a-populated-column-is-not-a-populated-measure', severity: 'critical', note: 'SECOND RETRACTION. I read outcome_ref rising 14%->62% as the field self-remedying. It was a bulk stamp of prose into a reference field: metric up, capability flat, outcome_sd_key +1 row. This is the SD own thesis and I reproduced it while investigating it.' },
    { id: 'the-denominator-decides-the-remedy', severity: 'critical', note: '3.4% against an implied 100% reads as a broken writer and invites wiring; 3.4% against the derivable ceiling reads as an absent input. The SD was written from the first reading. summarise() now THROWS rather than emit a population without its ceiling — the misleading form is unbuildable, not merely discouraged.' },
    { id: 'an-unexamined-ceiling-is-a-friendlier-denominator', severity: 'warning', note: 'HONESTY AGAINST MY OWN DELIVERABLE. The 8.4% headline rests on a ceiling dominated by 534 rows with no ref at all; of rows that have one, 5 of 865 are in-domain. Recorded in the commit, PRD and PR rather than left standing.' },
    { id: 'two-facts-in-one-place-is-also-a-single-representation-violation', severity: 'warning', note: 'outcome_ref is simultaneously a machine-resolvable REFERENCE and a human NARRATIVE. The familiar violation is one fact in two places; this is the inverse, and no writer-wiring resolves it. The decision — split or declare narrative-only — is owed and named rather than pre-empted.' },
    { id: 'an-sd-contradicted-by-measurement-is-not-a-literal-spec', severity: 'info', note: 'Diagnosis half exactly right and generalising (cheap field 100%, expensive field 3.4%); prescription half falsifiable in one query. Coordinator accepted the correction as recommended-not-decided. Keep the diagnosis, replace the prescription, and say which you did.' },
  ],
  metadata: {
    retrospective_id: retro.id,
    quality_score: 88, tests_added: 19, seeded_defects: 6, commits: 5,
    ddl_applied: 0, writer_changed: false, own_retractions: 2,
    live_rows: 1399, populated: 48, ceiling: 571,
    pr: 'https://github.com/rickfelix/EHG_Engineer/pull/6810',
    mechanism_verifications: [
      { verified_by: 'Bravo (e3610a71) — retrospective exists and post-dates EXEC-TO-PLAN', verified_at: `retrospectives id=${retro.id}; script at .artifacts/retro-ledger.mjs:1` },
      { verified_by: 'Bravo (e3610a71) — the bare population is unemittable', verified_at: 'lib/ledger/ref-shape.js:96 summarise() throws; seeded at tests/unit/ledger-ref-shape.test.js:104' },
      { verified_by: 'Bravo (e3610a71) — the cap cannot pass for the population', verified_at: 'scripts/ledger-ref-shape-report.mjs:62 exits 1 unless fetched === COUNT; live run reconciled 1399 = 1399' },
      { verified_by: 'Bravo (e3610a71) — the writer I wrongly said was absent', verified_at: 'scripts/coordinator-ack-adam.cjs:249 — on main since d4f7cbed4db' },
    ],
  },
  execution_time_ms: 660000,
};

const res = await resolveSubAgentRepo({ sdId: SD_KEY, subAgentCode: 'RETRO', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(r, res);
const s = await storeSubAgentResults('RETRO', SD_KEY, { name: 'Continuous Improvement Coach' }, r, { phase: 'PLAN' });
console.log('STORED RETRO/PLAN id=' + (s && s.id));
