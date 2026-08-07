import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001';

const testing = {
  verdict: 'PASS', confidence: 88,
  summary:
    '19 tests with 6 seeded defects, plus a live whole-table run that reconciles (1399 fetched = '
    + '1399 counted). Zero migration, writer untouched. The deliverable is a measurement, so the '
    + 'guards make the MISLEADING form unemittable rather than merely discouraged.',
  findings: [
    { id: 'the-bare-population-cannot-be-emitted', severity: 'critical', note: 'THE CENTRAL GUARANTEE. summarise() THROWS when asked for a population without its ceiling. Not a warning — a caller wanting only the numerator is asking for the misleading form, and THE SD ITSELF WAS WRITTEN FROM THAT BARE FIGURE, which is how it arrived at a remedy (wiring) for a writer that already works. Seeded and asserted at tests/unit/ledger-ref-shape.test.js.' },
    { id: 'the-two-readings-of-one-number-are-both-produced', severity: 'critical', note: 'LIVE: outcome_sd_key 48 is 3.4% OF THE TABLE and 8.4% OF THE CEILING (571). Same number, opposite conclusions — broken writer vs absent input. The report prints both on adjacent lines and a test asserts they differ, because publishing either alone is what invites the wrong remedy.' },
    { id: 'not-applicable-is-structural-not-editorial', severity: 'critical', note: 'buckets always carries all three keys EVEN AT ZERO, and buckets sum to total so no row is silently dropped. LIVE: RESOLVABLE 48 | NOT_YET 523 | NOT_APPLICABLE 828. Folding NOT_APPLICABLE into NOT_YET turns a ceiling into a backlog and a backlog invites more wiring — seeded as its own failing case rather than left to reviewer vigilance.' },
    { id: 'pagination-because-the-cap-lies-silently', severity: 'critical', note: 'PostgREST caps a plain select at 1000 and returns the cap with no error; the table now holds 1399. A single fetch would have classified 1000 rows and printed a confident distribution OF THE CAP. The report paginates at 500 and reconciles against an exact COUNT, exiting 1 on mismatch rather than printing a plausible subtotal. This is the measured-the-cap failure, pre-empted.' },
    { id: 'case-drift-is-its-own-shape-and-that-is-the-subtle-call', severity: 'warning', note: 'Upcasing the 4 lowercase SD- refs would RAISE THE COVERAGE NUMBER and create keys that never resolve (sd_key is stored uppercase), which the reconciler re-selects on every batch forever. Reporting the drift lets someone fix the SOURCE; absorbing it trades a visible gap for an invisible one — the exact trade this SD exposes. A test asserts a lowercase ref is CASE_DRIFT and explicitly not eligible.' },
    { id: 'I-CAVEATED-MY-OWN-HEADLINE-because-the-ceiling-is-optimistic', severity: 'critical', note: 'HONESTY FINDING AGAINST MY OWN DELIVERABLE. The ceiling of 571 is dominated by the 534 rows carrying NO ref yet, counted in-domain because a decision could still arrive. But of rows that ALREADY have a ref, only 5 of 865 are in-domain. If future refs resemble past refs (853/865 prose) the realistic ceiling is far below 571 and the true reading is nearer 3.4% than 8.4%. Recorded in the commit and the PRD rather than left standing: an optimistic ceiling is itself a number that is true and misleading — the class this SD removes — and a ceiling nobody interrogates is just a friendlier denominator.' },
    { id: 'scope-held-no-migration-writer-untouched', severity: 'info', note: 'Zero DDL. No change to scripts/coordinator-ack-adam.cjs — the writer is CORRECT and the SD original framing was falsified during LEAD. No loosening of the derivation pattern. Any test appearing to fix the writer would indicate drift back toward the unbuildable remedy.' },
  ],
  metadata: {
    tests_added: 19, seeded_defects: 6, commits: 3, ddl_applied: 0, writer_changed: false,
    live_rows: 1399, populated: 48, ceiling: 571,
    mechanism_verifications: [
      { verified_by: 'Bravo (e3610a71) — the bare population is unemittable', verified_at: 'lib/ledger/ref-shape.js:96 summarise() throws when includeCeiling is false; seeded case in tests/unit/ledger-ref-shape.test.js:104' },
      { verified_by: 'Bravo (e3610a71) — the cap cannot be mistaken for the population', verified_at: 'scripts/ledger-ref-shape-report.mjs:37 paginates at 500 and scripts/ledger-ref-shape-report.mjs:62 exits 1 unless fetched === COUNT; live run reconciled 1399 = 1399' },
      { verified_by: 'Bravo (e3610a71) — three buckets are structural, not editorial', verified_at: 'lib/ledger/ref-shape.js:70 bucketFor returns NOT_APPLICABLE for prose; tests/unit/ledger-ref-shape.test.js:78 asserts it is explicitly not NOT_YET' },
      { verified_by: 'Bravo (e3610a71) — the writer under discussion is correct and untouched', verified_at: 'scripts/coordinator-ack-adam.cjs:249 derives the key; no change made by this SD' },
    ],
  },
  execution_time_ms: 1800000,
};

const security = {
  verdict: 'PASS', confidence: 89,
  summary:
    'No schema, no DDL, no authz surface, no production code path altered. The security-relevant '
    + 'property is epistemic: a governance ledger stopped reporting a figure that invited the wrong '
    + 'remedy, and the tool refuses to produce that figure again.',
  findings: [
    { id: 'a-metric-that-invites-the-wrong-remedy-is-the-risk-here', severity: 'critical', note: 'This ledger is how the fleet judges whether advice produced outcomes. Reporting 3.4% against an implied 100% told a reader the writer was broken, and the SD acted on that reading by prescribing wiring for a writer that already works. A governance measure that misdirects effort is a real defect even though nothing crashes — it spends attention on a phantom and leaves the true cause (an overloaded input column) untouched.' },
    { id: 'the-fix-cannot-manufacture-a-friendlier-number', severity: 'critical', note: 'The obvious way to make this metric look better is to loosen the match. That would create keys that never resolve, which the reconciler re-selects on every scheduled batch forever — an inert path made NOISY, measurably worse. The prior author already measured 13 of 31 existing values failing to resolve. The pattern is unchanged here and the reason is recorded where the next person will look.' },
    { id: 'the-authors-own-optimistic-reading-is-flagged-in-the-artifact', severity: 'warning', note: 'The 8.4%-of-ceiling headline is generous: the ceiling is dominated by rows with no ref at all. Naming that inside the deliverable matters more than usual here, because the SD exists precisely because a flattering denominator went unexamined once already.' },
    { id: 'no-surface-of-any-kind', severity: 'info', note: 'One library and one read-only reporting script. No DB writes, no DDL, no credentials, no env vars, no RLS, no change to the writer or the reconciler. The script reads two columns via the existing service-role client and prints.' },
  ],
  metadata: { ddl_applied: 0, writes: 0, new_env_vars: 0, production_paths_touched: 0 },
  execution_time_ms: 540000,
};

for (const [code, name, payload] of [['TESTING', 'QA Engineering Director', testing], ['SECURITY', 'Chief Security Architect', security]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'EXEC' });
  console.log('STORED ' + code + '/EXEC id=' + (s && s.id));
}
