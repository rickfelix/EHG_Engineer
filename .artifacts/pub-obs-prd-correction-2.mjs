import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'PRD-SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, risks, system_architecture, integration_operationalization, implementation_approach, metadata')
  .eq('id', PRD_ID)
  .single();
if (readErr) throw readErr;

const fr = prd.functional_requirements;
const byId = (arr, id) => arr.find(x => x.id === id);

// ============================================================
// BLOCKER 1 (critical, TESTING PLAN evidence 26462519): the join is dead by
// construction on the approval-gated path. Root cause confirmed by direct read of
// lib/marketing/publisher/index.js:39-77,146,179 and autonomy-gate.js:394-411:
// publisher/index.js rebuilds a fresh timestamp-keyed idempotencyKey on EVERY
// publish() call and uses that SAME local var for both the campaign_content dedup
// check and the final upsert. On an approval-gated attempt #2 (post-chairman-approval),
// checkPublishAuthorization's "already accepted" branch (autonomy-gate.js:398-405)
// matches the ledger row by (venture_id, channel_type, content_ref) -- NOT by the
// incoming correlationId -- and returns the ORIGINAL propose-time correlation_id
// (from attempt #1). So authCheck.correlationId (attempt #1's key) and the local
// idempotencyKey used for campaign_content's upsert (attempt #2's freshly-built key)
// are two different strings for the exact same decision -- the join can never match
// on the approval-gated (fail-closed default) path.
// ============================================================
byId(fr, 'FR-1').title = 'observeOutcome core join + classification, with a durable dispatch-key fix in publisher/index.js';
byId(fr, 'FR-1').description += " CRITICAL FIX REQUIRED IN lib/marketing/publisher/index.js (confirmed root cause, not a workaround): publish() currently rebuilds a fresh timestamp-keyed idempotencyKey on every call and uses that SAME local variable both as the correlationId passed INTO checkPublishAuthorization and as the key for campaign_content's own dedup-check/upsert. checkPublishAuthorization's 'already accepted' branch (autonomy-gate.js:398-405) looks up the ledger row by (venture_id, channel_type, content_ref) and returns the STORED historical correlation_id from whenever that row was originally proposed/accepted -- which differs from the freshly-built key on any attempt after the first. THE FIX: after authCheck resolves with allowed:true, publisher/index.js must use `authCheck.correlationId` (never its own locally-rebuilt idempotencyKey) as the key for both the campaign_content dedup SELECT (:69-70) and the final upsert (:179-180). This makes campaign_content.idempotency_key durably equal to venture_channel_publish_ledger.correlation_id for a given decision regardless of how many propose/deny/approve attempts preceded the real dispatch -- the actual fix the observer's join depends on. The locally-built idempotencyKey remains the value SEEDED into checkPublishAuthorization's correlationId parameter for a brand-new (never-before-seen) propose, which is unaffected.";
byId(fr, 'FR-1').acceptance_criteria.push("publisher/index.js's campaign_content dedup-check and final upsert both key on authCheck.correlationId, never on the function-local freshly-built idempotencyKey, once authCheck has resolved");
byId(fr, 'FR-1').acceptance_criteria.push("A real two-attempt approval-gated publish sequence (attempt 1 denied/pending, chairman approves, attempt 2 succeeds) yields a NON-NULL external_post_id when joined via observeOutcome -- proven by an integration test driving the actual publish()/checkPublishAuthorization() sequence, never a hand-seeded fixture that encodes the premise instead of testing it");

// FR-2/FR-3: fetchImpl DI seam + HTTP-status-based ACs (unrunnable-in-CI ACs replaced)
byId(fr, 'FR-2').description += ' Testability: add `options.fetchImpl` (default global fetch) to the BlueskyAdapter constructor, consistent with its existing options pattern -- gives tests a clean seam without a global.fetch stub.';
byId(fr, 'FR-2').acceptance_criteria = [
  'A mocked 200 response with a valid record classifies exists=true',
  'A mocked 404/tombstone response classifies deletedOrErrored=true',
  'A mocked 500 or network-error response returns neither exists nor deletedOrErrored (FR-7 transient case), never thrown uncaught'
];
byId(fr, 'FR-3').description += ' Testability: add `options.fetchImpl` (default global fetch) to the XAdapter constructor, same seam as Bluesky. Budget: X Basic-tier is 15K reads/month (TR-4) -- the scheduled step batches/backs off, never polls unboundedly.';
byId(fr, 'FR-3').acceptance_criteria = [
  'A mocked 200 response with a valid tweet classifies exists=true',
  'A mocked 404 response classifies deletedOrErrored=true',
  'A mocked 429/500/network-error response returns neither exists nor deletedOrErrored (FR-7 transient case, stays unknown, never a terminal outcome)'
];

// FR-4: visibility counters (Blocker 4 -- zero real yield today; a 0/0 run must be visible, not silent)
byId(fr, 'FR-4').description += " VISIBILITY (Blocker 4): live measurement at PLAN time found venture_channel_publish_ledger has 3 rows, ALL decision='pending'/outcome='unknown', and campaign_content has 0 rows -- the observer's real-world join has nothing to act on yet. The scheduled step's main() must return/report rows_selected, rows_joined, and rows_unmeasurable counts in its summary object (repo convention: main(argv, deps) returns {exitCode, action, summary}) so a 0/0 run reads as 'ran, nothing to do' rather than silently looking wired when it is not.";
byId(fr, 'FR-4').acceptance_criteria.push('main()\'s returned summary includes rows_selected/rows_joined/rows_unmeasurable counters, asserted directly by the wiring test');

// FR-6: JS allowlist widen (Blocker 2) + streak-window exclusion (Blocker 3)
byId(fr, 'FR-6').title = "Widen the outcome domain safely: SQL CHECK, JS allowlist, AND the graduation streak-window query";
byId(fr, 'FR-6').description += " TWO ADDITIONAL FIXES REQUIRED, found by TESTING PLAN review (evidence 26462519), without which FR-6's own acceptance criterion passes green while the feature is broken: (1) recordPublishOutcome (autonomy-gate.js:470) hard-validates `['shipped_clean','reverted','caused_rework']` and THROWS on anything else -- widening only the SQL CHECK constraint means the FIRST call with outcome='unmeasurable' throws in JS before ever reaching the database. The JS allowlist must be widened to include 'unmeasurable' in the SAME change. (2) evaluateGraduation's streak-window query (autonomy-gate.js:509,523) uses `.neq('outcome','unknown')` to select candidate rows -- today 'unmeasurable' rows would newly ENTER that window (since they are not literally 'unknown'), where the loop's `else break` treats any non-shipped_clean row as a streak-breaker, silently demoting/resetting channels the moment an unmeasurable row appears. The query must exclude BOTH 'unknown' AND 'unmeasurable' from the streak window (e.g. `.not('outcome', 'in', '(unknown,unmeasurable)')`), so an unmeasurable row is invisible to the graduation safety valve exactly like an unknown row is today -- neither a clean win nor a streak-breaker.";
byId(fr, 'FR-6').acceptance_criteria.push("recordPublishOutcome accepts 'unmeasurable' without throwing (unit test, no live DB required)");
byId(fr, 'FR-6').acceptance_criteria.push("Seeding an 'unmeasurable' row leaves clean_streak/autonomy_state identical to leaving that same row 'unknown' -- a direct regression test, since this is the graduation safety valve");

// technical_requirements: add the two missing dependencies
prd.technical_requirements.push({
  id: 'TR-6',
  title: 'publisher/index.js dispatch-key fix is the load-bearing change',
  description: 'Nothing else in this SD can be verified against a real (non-hand-seeded) fixture until publisher/index.js uses authCheck.correlationId for the campaign_content dedup/upsert key (FR-1). Build and test this fix FIRST, before the observer module.'
});
prd.technical_requirements.push({
  id: 'TR-7',
  title: 'Adapter constructor DI seam',
  description: 'Both BlueskyAdapter and XAdapter constructors gain an options.fetchImpl (default global fetch) parameter so unit tests inject a fake without a global.fetch stub -- consistent with the existing options/env-fallback pattern in both files.'
});

// test_scenarios: rewrite per both TESTING and VALIDATION findings
const ts = prd.test_scenarios;
const tsById = (id) => ts.find(x => x.id === id);

tsById('TS-1').scenario = 'Real two-attempt approval-gated publish yields a joinable post (Blocker 1)';
tsById('TS-1').type = 'integration';
tsById('TS-1').expected = "Driving the ACTUAL publish()/checkPublishAuthorization() sequence for a propose-and-approve channel (attempt 1: denied, writes a pending ledger row; simulate chairman approval; attempt 2: succeeds) yields, via observeOutcome, a NON-NULL external_post_id -- proving the join fires on the real fail-closed-default path, not just a hand-seeded fixture that assumes it";

tsById('TS-4').expected += " -- additionally: given a real successful publish (via the same two-attempt sequence as TS-1), observeOutcome's unmeasurable classification count is 0 (a demonstrably-existing post must never classify unmeasurable; this specifically catches the case where FR-1's join silently fails and every row classifies unmeasurable, which would make TS-4 pass FOR THE WRONG REASON without this addition)";

ts.push({
  id: 'TS-8',
  scenario: "FR-7's transient branch (the 'never guess' guarantee's third leg)",
  type: 'unit',
  expected: "A mocked 500/network-error adapter lookup leaves the row 'unknown' (not reclassified), distinct from both the confirmed-absent (reverted) and no-artifact (unmeasurable) cases -- re-attempted on the next scheduled run"
});
ts.push({
  id: 'TS-9',
  scenario: "'unmeasurable' does not regress the graduation safety valve (Blocker 3)",
  type: 'unit',
  expected: "evaluateGraduation's clean_streak and autonomy_state are IDENTICAL whether a given row is 'unknown' or 'unmeasurable' -- neither value ever counts as a clean win or a streak-breaker"
});
ts.push({
  id: 'TS-10',
  scenario: "recordPublishOutcome accepts 'unmeasurable' without throwing (Blocker 2)",
  type: 'unit',
  expected: "recordPublishOutcome({outcome:'unmeasurable', ...}) resolves normally; only genuinely invalid outcome strings still throw"
});
ts.push({
  id: 'TS-11',
  scenario: 'Scheduled step reports visibility counters on a zero-yield run (Blocker 4)',
  type: 'unit',
  expected: "Running main() against a ledger with no joinable campaign_content rows returns a summary with rows_selected>0, rows_joined=0, rows_unmeasurable=rows_selected -- a 0-yield run is visible in the returned summary, not silent"
});

// acceptance_criteria: add the blockers as top-level SD-facing criteria too
const ac = prd.acceptance_criteria;
ac.push("publisher/index.js's campaign_content dedup/upsert keys on authCheck.correlationId, not a locally-rebuilt idempotency key (FR-1) -- proven by a real two-attempt approval-gated integration test, not a hand-seeded fixture");
ac.push("recordPublishOutcome accepts 'unmeasurable' in JS (not only the SQL CHECK), and evaluateGraduation's streak-window query excludes 'unmeasurable' exactly like 'unknown' (FR-6)");
ac.push('The scheduled step reports rows_selected/rows_joined/rows_unmeasurable so a zero-yield run is observable, not silently "wired but dead" (FR-4)');

// risks: add the newly-found architectural risk
const risks = prd.risks;
risks.push({
  risk: "The ledger-to-campaign_content join is dead by construction on the approval-gated (fail-closed default) path today, because publisher/index.js's per-call idempotencyKey and checkPublishAuthorization's returned correlationId diverge after the first attempt",
  severity: 'critical',
  mitigation: 'Root-cause fix in publisher/index.js: use authCheck.correlationId (not the local per-call key) for the campaign_content dedup/upsert (FR-1); proven via a real two-attempt integration test, never a fixture that assumes the premise it should be testing (TS-1)'
});
risks.push({
  risk: "Widening the outcome CHECK constraint alone (without the JS allowlist and the graduation streak-window fix) ships a feature that throws on first use and/or silently demotes channels",
  severity: 'critical',
  mitigation: 'FR-6 now explicitly requires all three changes together (SQL CHECK, JS allowlist, streak-window exclusion) with dedicated regression tests (TS-9, TS-10)'
});

// system_architecture: add publisher/index.js as a MODIFIED component (was previously unlisted)
const sysArch = JSON.parse(prd.system_architecture);
sysArch.components.push({ name: 'lib/marketing/publisher/index.js', change: "MODIFIED (load-bearing): dedup-check and campaign_content upsert key on authCheck.correlationId instead of the function-local per-call idempotencyKey, so the ledger-to-campaign_content join is real on the approval-gated path (FR-1, root cause fix)." });
sysArch.summary += ' A durable dispatch-key fix in publisher/index.js is the load-bearing prerequisite the observer join depends on -- build and test it first.';

// implementation_approach: reorder to put the root-cause fix first
const impl = JSON.parse(prd.implementation_approach);
impl.steps.unshift("FIRST: fix publisher/index.js to use authCheck.correlationId for the campaign_content dedup/upsert key, and prove it with a real two-attempt approval-gated integration test (FR-1, TS-1) -- nothing downstream can be verified against reality until this lands");
impl.steps.push("Widen recordPublishOutcome's JS allowlist and evaluateGraduation's streak-window query together with the SQL migration (FR-6, TS-9, TS-10)");
impl.steps.push('Add rows_selected/rows_joined/rows_unmeasurable counters to the scheduled step\'s summary (FR-4, TS-11)');
impl.steps.push('Add options.fetchImpl DI seam to both adapter constructors; rewrite adapter tests against mocked HTTP status, never live APIs (TR-7)');

// integration_operationalization: name the test file locations as a data contract for EXEC
const io = prd.integration_operationalization;
io.data_contracts.push('Test file locations (repo convention, verified by TESTING PLAN review): tests/unit/marketing/observe-outcome.test.js; tests/unit/cron/publish-outcome-observer.test.js + tests/unit/cron/publish-outcome-observer-wiring.test.js (static wiring test, exemplar tests/unit/cron/venture-ops-actuals-wiring.test.js); tests/integration/publish-outcome-observer.test.js (npm run test:integration, model on tests/integration/marketlens-owned-audience-loop.test.js, insertGuarded with CLASSIFICATION.FIXTURE + is_demo:true, describeDb from tests/helpers/db-available.js). Use .test.js, not .test.mjs.');
io.dependencies.push('lib/marketing/publisher/index.js\'s dedup-check/upsert dispatch key -- load-bearing prerequisite fixed by this SD (FR-1), not a pre-existing correct pattern to merely reuse');

// metadata: append round-2 revision note
const metadata = {
  ...prd.metadata,
  plan_revision_note_2: {
    at: new Date().toISOString(),
    reason: "Second correction round from TESTING PLAN sub-agent evidence (26462519-f6e1-4407-9c47-f0c4174186c5, CONDITIONAL_PASS): fixed 4 blockers found by direct code read -- (1) CRITICAL: the ledger-to-campaign_content join is dead by construction on the approval-gated path (publisher/index.js's per-call idempotency key diverges from checkPublishAuthorization's returned correlationId after attempt 1) -- root-cause fixed in FR-1, not worked around; (2) CRITICAL: FR-6's SQL-only enum widen would throw in JS on first use (recordPublishOutcome's hardcoded allowlist) -- fixed to widen both together; (3) HIGH: adding 'unmeasurable' would silently regress evaluateGraduation's streak-safety-valve query -- fixed with an explicit exclusion + regression test; (4) HIGH: zero real yield exists today (3 pending ledger rows, 0 campaign_content rows) -- addressed with visibility counters (FR-4) and the already-existing mock-mode-only proof (FR-8). Also incorporated concrete test file locations/conventions and an adapter fetchImpl DI seam for CI-safe testing.",
    source_evidence_row: '26462519-f6e1-4407-9c47-f0c4174186c5'
  }
};

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: fr,
    technical_requirements: prd.technical_requirements,
    test_scenarios: ts,
    acceptance_criteria: ac,
    risks,
    system_architecture: JSON.stringify(sysArch),
    integration_operationalization: io,
    implementation_approach: JSON.stringify(impl),
    activation_test_id: 'tests/integration/publish-outcome-observer.test.js',
    metadata
  })
  .eq('id', PRD_ID);
if (writeErr) throw writeErr;

console.log('PRD round-2 corrected. FR count:', fr.length, 'TS count:', ts.length, 'AC count:', ac.length, 'risks:', risks.length);
