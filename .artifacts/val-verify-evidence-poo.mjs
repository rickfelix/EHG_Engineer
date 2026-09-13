import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';

const critical_issues = [];

const findings = [
  {
    id: 'VERIFY-F1-no-observation-window-permanent-unmeasurable',
    severity: 'HIGH',
    title: "FR-4's created_at observation window was never built, so an approved-but-not-yet-dispatched ledger row is permanently stamped terminal 'unmeasurable'",
    summary: "FR-4's description requires the step to select 'ledger rows still outcome=unknown whose created_at is inside a fixed observation window', and FR-7 requires 'the observation window (config constant ...)' that 'bounds how long the scheduled step waits before finalizing an outcome for a row'. NEITHER EXISTS IN CODE. scripts/cron/publish-outcome-observer.mjs:85-95 selects on outcome=unknown AND decision=accepted, ordered created_at asc, limited to DEFAULT_ROW_LIMIT, with NO created_at predicate; the only bound is DEFAULT_ROW_LIMIT=200 (:34), a row cap rather than a window -- and the file's own comment at :30-33 states plainly that there is no upper bound. CONSEQUENCE, traced through the approval-gated path that is the fail-closed DEFAULT and the whole reason FR-1's dispatchKey fix exists: attempt 1 writes decision=pending (autonomy-gate.js:431-437); the chairman approval flips it to decision=accepted OUT OF BAND (a repo-wide census finds NO code that writes decision=accepted on the approval path -- only the autonomous-tier insert at autonomy-gate.js:376-384 does, and that one dispatches within the same call); campaign_content stays EMPTY for that correlation_id until publish() is next retried, which is human/pipeline-paced and unbounded. The observer's next 30-minute tick selects that row, observeOutcome returns unmeasurable (observe-outcome.js:69-72, 'no joinable real post id'), and recordPublishOutcome writes that TERMINAL value. The row then leaves the candidate set forever (selection filters outcome=unknown) and is also excluded from the graduation streak window (FR-6's not-in (unknown,unmeasurable)), so the real post published minutes or days later is NEVER observed and NEVER credited to the autonomy ladder. This directly contradicts FR-1's own definition of the value it writes: 'the artifact needed to ever measure this row does not exist AND NEVER WILL'. Here it does not exist YET and very plausibly will.",
    evidence: 'scripts/cron/publish-outcome-observer.mjs:30-34 (no upper bound, row cap only), :85-95 (selection predicate, no created_at window); lib/marketing/observer/observe-outcome.js:69-72 (terminal unmeasurable on join-miss); lib/marketing/autonomy-gate.js:395-410 (accepted-row lookup, i.e. approval is out-of-band by construction), :431-437 (pending insert, no decision_at), :376-384 (autonomous insert, sub-second window only). Census: git grep for accepted-decision writers and for venture_channel_publish_ledger across lib/scripts/src returns NO writer that flips pending to accepted.',
    currently_masked: "NOT harmful at this instant: the FR-6 migration is NOT yet applied (live pg_constraint read 2026-09-13: venture_channel_publish_ledger_outcome_check admits only unknown/shipped_clean/reverted/caused_rework -- no unmeasurable), so every such write fails 23514 and the row stays unknown. The defect becomes LIVE the moment the chairman applies database/migrations/20260912_venture_channel_publish_ledger_outcome_unmeasurable.sql. It is also inert today because all 3 live ledger rows are decision=pending, so 0 rows select.",
    suggested_fix: 'One predicate, as FR-4 already specified: gate the TERMINAL unmeasurable classification (or the selection itself) on an age window. created_at is the propose time, so a window upper-bound excludes long-pending-then-approved rows exactly as FR-4 intended; decision_at would be the sharper discriminator but is only populated on the autonomous path (autonomy-gate.js:383), not the approval path. Leaving the row unknown until the window elapses is the behaviour FR-7 describes and costs nothing.',
    must_resolve_before: 'chairman apply of the FR-6 migration (not necessarily before PLAN-TO-LEAD)',
  },
  {
    id: 'VERIFY-F2-x-read-budget-no-batch-no-backoff-no-cap',
    severity: 'MEDIUM',
    title: 'TR-4/FR-3 require batch + backoff within a 15K reads/month X budget; none of the three is implemented, and the absent window (F1) makes the poll literally unbounded',
    summary: "TR-4 states: the scheduled step must operate within a 15K reads/month budget for X lookups -- batch reads, back off on 429, and never treat a rate-limit response as a terminal outcome. FR-3 repeats 'must batch/backoff rather than poll unboundedly', and integration_operationalization.runtime_config names an 'X read-budget knob (reads/month cap, batch size, backoff)'. SHIPPED: only the third clause. 429 to transient is correct (x.js getTweet, non-ok branch) and tested. But sweepOnce (scripts/cron/publish-outcome-observer.mjs:108-140) awaits observeOutcome once per row sequentially with NO batching (X API v2 GET /2/tweets?ids= accepts up to 100 ids per request and is unused), NO backoff (intra-run or cross-run), and NO read accounting or cap anywhere in the repo. This COMPOUNDS with F1: because a row classifying unknown is never written and never ages out, the SAME row is re-read every 30 minutes forever -- 48 reads/day, ~1,440/month per stuck row. About 11 permanently-unknown X rows exhaust the entire 15K/month budget; at limit=200 the worst case is ~288K reads/month, roughly 19x over. The most likely live failure mode is exactly this: venture_channel_secrets has 0 rows today, so every lookup currently short-circuits to unknown BEFORE the fetch (observe-outcome.js:92-95) -- which is what keeps the budget safe right now, not any implemented control.",
    evidence: 'scripts/cron/publish-outcome-observer.mjs:108-140 (sequential loop, no batch/backoff/cap), :34 (DEFAULT_ROW_LIMIT=200, not env-configurable); .github/workflows/publish-outcome-observer-cron.yml:14 (30-minute schedule, 48 runs/day); lib/marketing/publisher/adapters/x.js getTweet (single-id endpoint only); repo-wide: no reads/month counter or budget table for X.',
    must_resolve_before: 'a venture is actually provisioned with X credentials (today 0 rows in venture_channel_secrets keeps this inert)',
  },
  {
    id: 'VERIFY-F3-TS7-FR8-AC1-has-no-test',
    severity: 'MEDIUM',
    title: "TS-7 was never written: FR-8 AC-1 -- the SD's own REPLACEMENT for its unreachable live-outcome success criterion -- is the one AC with no test",
    summary: "FR-8 AC-1 ('evaluateGraduation runs at least once from a recorded MOCK-mode outcome produced by this SD's new scheduled path') and its TS-7 ('running the scheduled step end-to-end against a self-created mock-mode fixture ... causes evaluateGraduation to run successfully from a recorded mock outcome') have NO implementation. Every cron test injects fakes for BOTH ends of the chain: tests/unit/cron/publish-outcome-observer.test.js passes observeOutcomeFn/recordPublishOutcomeFn as vi.fn() in every sweepOnce test and deps.sweepOnce in every main() test, and the file imports neither real function. So the composition sweepOnce -> real recordPublishOutcome -> real evaluateGraduation(mode=mock) is never executed in any test. Each LINK is well covered (recordPublishOutcome's allowlist and 23514 in autonomy-gate.test.js; evaluateGraduation mode isolation and SEC-2 against a genuinely filtering fake; observeOutcome's 11 classification cases) and the wiring is grep-asserted (publish-outcome-observer-wiring.test.js:33), but 'each link works' is not the end-to-end proof the PRD substituted for the live criterion. git grep TS-7 across tests returns only unrelated SDs.",
    evidence: 'tests/unit/cron/publish-outcome-observer.test.js:12 (imports only main/parseArgs/ensureArmedRegistration/sweepOnce -- never recordPublishOutcome or observeOutcome), :174-233 (all sweepOnce tests inject both fns), :65-142 (all main() tests inject deps.sweepOnce); no TS-7 test exists anywhere in the repo.',
    honest_caveat: 'Even a TS-7 test could only prove INVOCATION, not ladder climbing: with the mock-only candidate filter (autonomy-gate.js:548) plus the retained loop break (:572), a mode=mock evaluateGraduation has cleanStreak structurally pinned at 0 and returns early without writing venture_channel_autonomy (:648-650). That is the DESIRED safety property (a mock publish must never earn autonomy), but it means FR-8\'s phrase "proves the full mechanism ... end-to-end" is over-claimed for the graduation leg specifically, and the PRD should say so rather than leave it implied.',
    must_resolve_before: 'PLAN-TO-LEAD (cheap: one test, all the seams already exist)',
  },
  {
    id: 'VERIFY-F4-FR5-AC-literal-deviations-code-is-right-AC-is-wrong',
    severity: 'LOW',
    title: "FR-5 AC-1's two literal clauses are not met, and in both cases the code is correct and the AC wording is the defect",
    summary: "(a) 'both the primary and 42703-fallback query forms filter by execution_mode' is UNSATISFIABLE BY CONSTRUCTION -- the 42703 fallback exists precisely because the column is absent, so it cannot filter on it. The code correctly omits the filter there (autonomy-gate.js:555-563) and documents the branch as dead in production. (b) 'replacing the current streak-break-on-mismatch loop behavior' -- the break was RETAINED (:572) as documented defense-in-depth, not replaced. Retaining it is what makes SEC-2's fix coherent (its comment at :621-630 reasons FROM the break firing on the first row), so removing it now would be a regression. Recommend amending FR-5 AC-1 rather than changing code.",
    evidence: 'lib/marketing/autonomy-gate.js:543-553 (primary form, mode filter at :548), :555-563 (42703 fallback, outcome exclusion applied, no mode filter), :572 (loop break retained), :621-650 (SEC-2 reasoning that depends on the break).',
  },
  {
    id: 'VERIFY-F5-adapter-return-shape-naming',
    severity: 'LOW',
    title: 'FR-2/FR-3 specify a deletedOrErrored field; the code returns a transient field instead -- a strictly better 3-state, but the ACs still say deletedOrErrored',
    summary: "deletedOrErrored conflates the two states the SD's whole never-guess property depends on separating (deleted means terminal reverted; errored means stays unknown). The implementation's exists: true|false|null plus transient: boolean separates them cleanly and observe-outcome.js:101-107 reads exactly that 3-way. Every FR-2/FR-3 AC is satisfied in substance (deletedOrErrored=true reads as exists:false; 'neither exists nor deletedOrErrored' reads as exists:null plus transient:true), with tests for all six cases per adapter. Flagged only so the PRD text and the code stop disagreeing on a field name.",
    evidence: 'lib/marketing/publisher/adapters/x.js getTweet and bluesky.js getPostRecord return shapes; lib/marketing/observer/observe-outcome.js:101-107; tests/unit/marketing/adapters-post-lookup.test.js (13 cases).',
  },
  {
    id: 'VERIFY-CLOSED-DURING-REVIEW-two-findings-derived-independently',
    severity: 'INFO',
    title: 'Two findings I derived independently were fixed in commit 8f2b2843755 while this review was in progress -- corroboration, not new gaps',
    summary: "I read the working tree at 10f01028cd5 and independently concluded (i) rows_joined did not exist anywhere despite being named in FR-4 AC-3, top-level AC-10 and TS-11 (which literally specifies rows_joined=0), with rows classifying unknown counted in NO counter at all; and (ii) BOTH adapters' absence detection rested on an HTTP-404 premise that is wrong for both real APIs -- X API v2 GET /2/tweets/:id returns HTTP 200 with an errors[] array and no data key for a deleted tweet (so a deleted post would have been written as TERMINAL shipped_clean and could earn graduation credit), and AT Protocol XRPC returns not-found as HTTP 400 with error=RecordNotFound (so reverted was unreachable on Bluesky and a deleted post would stay unknown forever, violating FR-7 AC-2). Mid-review the tree changed under me; commit 8f2b2843755 (pushed to PR #8822) fixes both with exactly that diagnosis, plus requires positive evidence (raw.data.id / raw.uri) before exists:true, adds rows_left_unknown and rows_write_failed_expected_pre_migration, hardens SEC-2 fail-CLOSED (only mode===live or an omitted mode key may write), trims three posting-capable secrets from the read-only workflow (SEC-4), and orders the selection oldest-first. Both are CLOSED. Recorded because the X one was CRITICAL and the agreement of two independent reads is the evidence that it was real.",
    verified_state: 'Local HEAD == origin/feat/SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 == 8f2b2843755; working tree clean for lib/scripts/tests/database/.github; 92 tests pass across the 6 SD test files (86 at 10f01028cd5).',
  },
];

const warnings = [
  {
    severity: 'LOW',
    area: 'FR-1 dispatchKey fallback',
    summary: "publisher/index.js keeps an or-fallback (authCheck.correlationId || idempotencyKey) that FR-1 AC-4's wording ('never on the function-local freshly-built idempotencyKey') literally forbids. VERIFIED UNREACHABLE: both allowed:true return sites in checkPublishAuthorization populate correlationId (autonomy-gate.js:392 autoCorrelationId, :409 accepted.correlation_id) and the live column is correlation_id NOT NULL with a UNIQUE constraint. Harmless; noted only so nobody later reads the fallback as a live path.",
  },
  {
    severity: 'LOW',
    area: 'SEC-3 residual surface',
    summary: 'observeOutcome gates on resolveChannelCredentials returning non-null (observe-outcome.js:86-89) -- the same mechanism publish() uses (publisher/index.js:130), verified identical. Residual: both adapter CONSTRUCTORS still field-level fallback to process.env (x.js:13-16, bluesky.js:13-15), so a venture whose secret row resolves to an object MISSING the expected keys would silently use a shared identity. 8f2b2843755 shrinks the exposed surface to X_ACCESS_TOKEN only (SEC-4 trim). Not introduced by this SD; noted as the remaining hole in the SEC-3 guarantee.',
  },
  {
    severity: 'LOW',
    area: 'Bluesky credential gate is a gate, not a need',
    summary: 'getPostRecord sends no Authorization header at all (public AT Protocol read, now explicitly documented in the SEC-4 workflow comment), yet observeOutcome still refuses to call it without a resolved per-venture credential. Conservative and consistent with SEC-3, but it means a Bluesky post the observer COULD read publicly stays unknown forever when the venture has no secret row -- which is every venture today (venture_channel_secrets = 0 rows).',
  },
];

const recommendations = [
  'Close F1 before the chairman applies the FR-6 migration: add the FR-4 created_at observation-window predicate, or gate the terminal unmeasurable classification on row age. This is the one finding with real data-loss consequence -- a permanently mis-stamped ledger row cannot be re-observed and its real publish is never credited to the autonomy ladder.',
  'Write TS-7 (F3): one test driving sweepOnce with the REAL observeOutcome and REAL recordPublishOutcome against an in-memory mock-mode fixture. All seams exist, and it is the only AC standing in for the SD\'s unreachable live-outcome criterion.',
  'Either implement the TR-4 batch/backoff/budget controls (F2) or amend TR-4 to state explicitly that batching and budget accounting are deferred until a venture is provisioned -- do not leave a named requirement reading as delivered.',
  'Amend FR-5 AC-1 (F4) and the FR-2/FR-3 return-shape wording (F5) in the PRD rather than changing code: in both cases the implementation is the better design and the AC text is what is wrong.',
  'Add one sentence to FR-8 recording that the mock-mode proof can demonstrate evaluateGraduation INVOCATION but never streak accumulation (mock-mode cleanStreak is structurally 0 by design), so the "proves the full mechanism end-to-end" phrasing is not read as stronger than it is.',
];

const summary = "VERIFY-phase PRD-fidelity audit of SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 against the shipped code at 8f2b2843755 (PR #8822, 2 commits). VERDICT: CONDITIONAL_PASS at confidence 90. The SD genuinely delivers what its PRD describes: FR-1's root-cause dispatchKey fix is real and proven by a two-attempt unit test asserting the propose-time correlation_id (not a hand-seeded fixture); observeOutcome's join plus 4-way classification, both adapters' read methods with the fetchImpl DI seam, the scheduled step on the repo's cron convention with ARMED registration and liveness stamping, the mode-scoped evaluateGraduation, the dual-form streak-window exclusion, and the additive CHECK-widen migration all exist and are tested -- 92 tests pass across 6 files, and the load-bearing tests are genuinely discriminating (a real filtering supabase fake, not the pass-through mock the PRD warned about; pre-fix code crashes or returns different values). TR-5 verified by census: recordPublishOutcome has exactly ONE production caller (the cron), and no inline call was added to content-pipeline.js or owned-audience-content-loop.js. BOTH PLAN-phase premises RE-MEASURED AND STILL ACCURATE: execution_mode is applied live (column exists NOT NULL with a CHECK limiting it to live/mock; a probe returns no 42703; all 3 ledger rows are execution_mode=live), and AltifyAI (50763b6a-1fad-4e1e-b2fc-296a1d66ebf9) has ZERO rows across venture_channel_secrets, channel_budgets, venture_channel_publish_ledger, venture_channel_autonomy and venture_demand_verdicts, with outreach_ruling=BLOCKED until S24+S25 and six reached_how families not including Bluesky -- so FR-8/FR-9 remain correctly scoped and no code path touches a real AltifyAI post. Additionally verified live and NOT claimed by the PRD notes: correlation_id IS UNIQUE (validating FR-5's removal of the redundant UPDATE predicate) and the outcome CHECK does NOT yet include unmeasurable (so the pre-migration 23514 path is load-bearing TODAY, not hypothetical). plan_revision_note_1 through _4 are accurate descriptions of the code with two wording exceptions recorded as F4/F5 and one material exception: note_3's claim that TS-1/TS-2/TS-3/TS-7 were all retyped to unit tests is true for the first three and false for TS-7, which was never written. FIVE OPEN FINDINGS, one HIGH: F1 -- FR-4's required created_at observation window was never built, so an approved-but-not-yet-dispatched ledger row gets a PERMANENT terminal unmeasurable, the row leaves the candidate set forever, and the real post published afterwards is never credited to the graduation ladder; currently masked only because the FR-6 migration is unapplied, and it goes live the moment the chairman applies it. F2 (MEDIUM) TR-4's batch/backoff/15K-budget controls are absent and compound with F1 into literally unbounded re-polling. F3 (MEDIUM) TS-7 / FR-8 AC-1 -- the SD's own replacement for its unreachable live-outcome criterion -- is the single AC with no test. F4/F5 (LOW) are PRD-wording defects where the code is the better design. Two findings I derived independently (missing rows_joined; both adapters' 404-only absence detection being wrong for X API v2's 200-with-errors and AT Proto's 400 RecordNotFound, which would have written deleted X posts as shipped_clean) were fixed in 8f2b2843755 mid-review -- recorded as corroboration, closed.";

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 90,
    critical_issues,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_VERIFICATION',
      gate: 'GATE_4_PLAN_VERIFICATION',
      measured_against_commit: '8f2b2843755',
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/8822',
      fr_verdicts: {
        'FR-1': 'MET. dispatchKey = authCheck.correlationId used for BOTH the dedup SELECT (publisher/index.js :69-76) and the upsert (:189-192); TS-1 unit test drives attempt-1-denied then approved-attempt-2 and asserts idempotency_key equals the propose-time correlation_id. observeOutcome join plus unmeasurable/dry-run-sentinel rejection at observe-outcome.js:39-72 with 11 tests. Deviation: observeOutcome signature is {supabase, correlationId, adapters, resolveCredentials} -- no mode param as FR-1 prose names; mode is not needed (the read is keyed on a UNIQUE correlation_id and recordPublishOutcome derives mode from the row), so this is harmless.',
        'FR-2': 'MET in substance (see F5 naming). getPostRecord with at:// parse, 404 AND 400/RecordNotFound absence detection, positive-evidence requirement, transient on 5xx/network/malformed; 5 tests.',
        'FR-3': 'MET for lookup plus 429-transient; NOT MET for TR-4 batch/backoff/budget (F2). getTweet with digit-only tweetId guard (SEC-1), data.id positive evidence, errors[] not-found shape; 6 tests.',
        'FR-4': 'MET. Repo cron convention (parseArgs, main(argv,deps), --once, --dry-run, gracefulExit, registerArmedMachinery, stampLastFired), workflow with schedule plus workflow_dispatch, never imported by publish() (grep-asserted in the wiring test), idempotent via the outcome=unknown filter, and the full counter set rows_selected/rows_joined/rows_left_unknown/rows_unmeasurable/rows_written/rows_write_failed/rows_write_failed_expected_pre_migration. EXCEPTION: the created_at observation-window clause of the same FR is NOT implemented -- F1.',
        'FR-5': 'MET in substance; two AC clauses literally unmet and unmeetable/undesirable (F4). Primary candidate SELECT filters execution_mode (autonomy-gate.js:548); proven by a genuinely filtering supabase fake, which is stronger than the call-arg assertion TS-9 asked for.',
        'FR-6': 'MET. SQL migration constraint name verified against live pg_constraint (venture_channel_publish_ledger_outcome_check), purely additive DROP plus re-ADD, pre/post asserts including an exercised insert-and-undo probe; JS allowlist widened; the not-in (unknown,unmeasurable) exclusion applied to BOTH query forms; the shared ledgerChain mock gained .not() in the same change as required. AC-1 (accepts unmeasurable after migration apply) correctly pends chairman apply; the pre-apply 23514 path is classified and now separately counted.',
        'FR-7': 'MET for both stated ACs (transient stays unknown; confirmed-absent becomes reverted regardless of age). The observation window (config constant) the FR opens with does not exist -- F1.',
        'FR-8': 'MET for AC-2 and AC-3 (no code path touches a real AltifyAI or unprovisioned venture; the live-proof dependency is recorded in integration_operationalization.dependencies). AC-1 is the one with NO test -- F3.',
        'FR-9': 'MET. ADAPTERS = {x, bluesky} (observe-outcome.js:22); an out-of-scope platform classifies unmeasurable with a test; the five other reached_how families are named out-of-scope in integration_operationalization.dependencies.',
      },
      premises_re_measured: {
        execution_mode_applied_live: 'CONFIRMED. information_schema: execution_mode text NOT NULL; CHECK limits it to live/mock; a select of execution_mode returns no 42703; all 3 venture_channel_publish_ledger rows carry execution_mode=live.',
        altifyai_zero_provisioning_and_outreach_block: 'CONFIRMED. venture 50763b6a-1fad-4e1e-b2fc-296a1d66ebf9 AltifyAI, status=active, launch_mode=simulated, is_demo=false; 0 rows in venture_channel_secrets, channel_budgets, venture_channel_publish_ledger, venture_channel_autonomy, venture_demand_verdicts; metadata.outreach_ruling = BLOCKED, scope any outbound contact with a real human being, blocked_until S24 Launch Readiness PASS AND S25 Go Live PASS; metadata.thesis.reached_how names six families, Bluesky among none of them.',
        bonus_correlation_id_unique: 'CONFIRMED -- venture_channel_publish_ledger_correlation_id_key UNIQUE (correlation_id). Validates FR-5 / plan_revision_note_3(d) removal of the UPDATE-side execution_mode predicate as genuinely redundant, not merely asserted.',
        bonus_fr6_migration_not_applied: 'CONFIRMED -- live outcome CHECK admits only unknown/shipped_clean/reverted/caused_rework. The 23514 expected-pre-migration path is live today.',
        live_yield: 'venture_channel_publish_ledger = 3 rows, ALL decision=pending (so the observer decision=accepted filter selects 0 today); campaign_content = 0 rows. Unchanged from the PLAN-phase measurement.',
      },
      plan_revision_notes_audited: {
        note_1: 'ACCURATE. All five claims verified in code and both premises re-measured live.',
        note_2: 'ACCURATE for all 4 blockers. Blocker 4 (visibility counters) was only PARTIALLY true at 10f01028cd5 (rows_joined missing) and became fully true at 8f2b2843755.',
        note_3: 'MOSTLY ACCURATE. (a) TS-1/TS-2/TS-3 were retyped to unit tests as claimed, but TS-7 was never written at all (F3) -- the note describes it as retyped, which reads as delivered. (b) satisfied more strongly than specified (filtering fake rather than a call-arg assertion). (c), (d), (e) verified.',
        note_4: 'ACCURATE. SEC-1 digit-only guard with a test asserting NO fetch is issued; SEC-2 mock-mode skip, further hardened fail-CLOSED in 8f2b2843755; SEC-3 per-venture resolveChannelCredentials, verified to be the IDENTICAL mechanism publisher/index.js:130 uses. The each-reverted-and-confirmed-to-fail-pre-fix claim is not independently verifiable from the artifacts, but all three tests are structurally discriminating (they assert on a call NOT being made, or on a different return value).',
      },
      verification_method: [
        'Read functional_requirements, acceptance_criteria, risks, test_scenarios, technical_requirements, integration_operationalization and metadata.plan_revision_note_1..4 directly from product_requirements_v2 (not from handoff prose)',
        'Read every committed file in 10f01028cd5 and 8f2b2843755 as full diffs plus current-state line reads',
        'Ran the 6 SD test files: 86 pass at 10f01028cd5, 92 pass at 8f2b2843755',
        'Live pg connection via SUPABASE_POOLER_URL for pg_constraint and information_schema (Supabase REST cannot read either; the exec_sql RPC does not exist)',
        'Live supabase reads for the ledger, campaign_content, ventures/AltifyAI and all 5 provisioning tables',
        'Repo-wide census of recordPublishOutcome / evaluateGraduation / venture_channel_publish_ledger writers to verify TR-5 and to trace the decision=accepted path',
        'gh pr view 8822 plus git fetch to confirm the reviewed commits are the PR head',
      ],
      measured_at: new Date().toISOString(),
    },
    phase: 'PLAN_VERIFICATION',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'Principal Systems Analyst' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION', source: 'manual' },
  );

  console.log('\nVALIDATION VERIFY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  source:', stored.source);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
