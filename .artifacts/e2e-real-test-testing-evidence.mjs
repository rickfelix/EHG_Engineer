// SD-LEO-INFRA-E2E-REAL-TEST-001 — TESTING sub-agent evidence writer (PLAN-TO-EXEC).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = '5b20aee7-e80b-424e-9f9e-d0da99a0ddcb';
const PHASE = 'PLAN-TO-EXEC';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'PLAN-phase TEST STRATEGY review of PRD-SD-LEO-INFRA-E2E-REAL-TEST-001 (no test execution — EXEC has not started). ' +
    'Grounded in the live worktree, not the PRD prose: read tests/helpers/db-target.js, tests/helpers/db-tier-gate.js, all 5 ' +
    'playwright*.config.* files, tests/e2e/setup/*, tests/uat/setup/global-auth.js, .env.test (main repo), and the SD row itself. ' +
    'HEADLINE: FR-1 is sound, well-scoped, and MORE testable than the PRD implies — the "zero HTTP requests dispatched" criterion ' +
    'is achievable today because tests/helpers/db-tier-gate.js ALREADY patches net.Socket.prototype.connect + tls.connect and ' +
    'exports shouldRefuseConnect/connectTargetOf/isLoopbackHost, which is the correct interception layer for undici/fetch. ' +
    'But TWO BLOCKING GOVERNANCE DEFECTS and FOUR TESTABILITY DEFECTS must be resolved before EXEC. ' +
    'BLOCKER 1: the approved PRD CONTRADICTS this SD own fr1_rescope_decision (Adam, 2026-09-07T05:29:59Z), which requires the ' +
    'carved FR-1 exit predicate be restated to the NEGATIVE HALF ONLY; the PRD still carries FR-1 AC#2 ("designated non-production ' +
    'ref proceeds normally") and top-level acceptance_criteria[0] ("...while a designated-test-project run proceeds") — the exact ' +
    'back-door re-coupling to D-a the condition names and forbids. FR-1 cannot be driven to done against the PRD as written. ' +
    'BLOCKER 2: metadata.chairman_decisions is ABSENT on the SD and plan_to_exec_gate.blocked=true with ONLY FR-1 carved out, so ' +
    'PRD acceptance_criteria[3] ("D-a and D-b recorded before any PLAN-TO-EXEC handoff is attempted") is currently FALSE — EXEC must ' +
    'be scoped to FR-1 alone. ' +
    'SHARPEST TECHNICAL DEFECT (FR-3): the specified CI lint scope is INVERTED relative to CI visibility. .gitignore:5 is `.env.*`; ' +
    'only 3 tracked .env* files exist and .env.test — the file actually holding the plaintext credential — is UNTRACKED and absent ' +
    'from every CI checkout. A lint scanning ".env* files in the repo" scans exactly the set that cannot contain the defect and would ' +
    'pass vacuously forever. Meanwhile the chairman-class identity IS committed: TEST_USER_EMAIL in .env.test is byte-equal to the ' +
    'hardcoded fallback literal in FOUR TRACKED spec files. FR-2 additionally has two ways to pass while weakened (JWT role claim is ' +
    '"authenticated" for the chairman too; an unresolved chairman reference makes the inequality vacuously true). ' +
    'FR-4: this review performed NO enumeration and NO deletion of production data, and recommends none — it stays a separate ' +
    'chairman-approved ceremony, out of scope for this review and for EXEC. ' +
    'Baseline e2e capture deliberately NOT taken: running the suite pre-guard is the very hazard this SD closes.',
  findings: [
    {
      id: 'blocker-prd-contradicts-fr1-rescope-condition',
      severity: 'critical',
      note:
        'THE APPROVED PRD IS OUT OF COMPLIANCE WITH THIS SD OWN RECORDED CONDITION. strategic_directives_v2 ' +
        'metadata.fr1_rescope_decision (decided_by adam:bc762fa4, decided_at 2026-09-07T05:29:59.828Z) carries an explicit ' +
        'condition_and_why_it_matters clause: "The carved item exit predicate must be restated to the negative half only: a test ' +
        'proves a Playwright run with the production ref ABORTS BEFORE ANY NETWORK CALL. The test-project-proceeds half travels with ' +
        'FR-5/D-a; the lint travels with FR-2/FR-3/D-b; the zero-rows clause travels with FR-4." The PRD as approved still carries ' +
        'BOTH forbidden couplings: functional_requirements FR-1 acceptance_criteria[1] = "A Playwright run with SUPABASE_URL pointed ' +
        'at a designated non-production ref (once DESIGNATED_NON_PROD_REFS or VITEST_DB_ALLOW_REF names it) proceeds normally", and ' +
        'top-level acceptance_criteria[0] = "A test proves a Playwright run against the production ref aborts before any network ' +
        'call, WHILE A DESIGNATED-TEST-PROJECT RUN PROCEEDS". The rescope decision names this precise failure mode: "Carving FR-1 out ' +
        'while carrying that exit predicate unchanged would leave the new item blocked on exactly the decision the split exists to ' +
        'escape." CONSEQUENCE FOR TESTING: FR-1 is currently UNTESTABLE-TO-DONE. DESIGNATED_NON_PROD_REFS is Object.freeze([]) ' +
        '(db-target.js:25, comment: "INTENTIONALLY EMPTY: no non-production Supabase project exists yet"), so the allow arm cannot be ' +
        'satisfied end-to-end until D-a funds a project. REQUIRED BEFORE EXEC: amend the PRD so FR-1 exit predicate is the refusal arm ' +
        'only, and move the proceeds-normally criterion to FR-5. NOTE the allow arm IS still worth a hermetic unit test at the ' +
        'globalSetup-resolves level (assessDbTarget accepts any parseable *.supabase.co URL + matching opt-in, so a synthetic ref ' +
        'proves the non-refusing branch without a real project) — but that is a unit assertion on the predicate, NOT the ' +
        '"run proceeds normally" integration criterion, and it must not be used to claim the FR-5 criterion is met.',
    },
    {
      id: 'blocker-chairman-decisions-absent-gate-still-blocked',
      severity: 'critical',
      note:
        'PRD top-level acceptance_criteria[3] states "metadata.chairman_decisions D-a and D-b are both recorded on this SD before any ' +
        'PLAN-TO-EXEC handoff is attempted". MEASURED LIVE on strategic_directives_v2 (sd_key SD-LEO-INFRA-E2E-REAL-TEST-001, ' +
        'id 5b20aee7-e80b-424e-9f9e-d0da99a0ddcb): metadata.chairman_decisions is UNDEFINED — the key does not exist in the metadata ' +
        'key set. metadata.plan_to_exec_gate.blocked is TRUE, condition "chairman decisions D-a and D-b recorded on this SD", with ' +
        'amendment "FR-1 is carved OUT of this gate per fr1_rescope_decision. The gate continues to block PLAN-TO-EXEC for the ' +
        'REMAINDER of the SD on chairman decisions D-a and D-b." So the SD own acceptance criterion is FALSE right now, and only FR-1 ' +
        'is EXEC-eligible. TESTING POSITION: EXEC scope must be FR-1 ONLY. FR-2/FR-3 test strategy is recorded in this review so it is ' +
        'ready when D-b lands, but no FR-2/FR-3/FR-4/FR-5/FR-6 implementation or test authoring should be treated as in-scope for the ' +
        'current handoff. A PLAN-TO-EXEC that silently carries the full FR set would ship work the SD own gate forbids.',
    },
    {
      id: 'fr3-lint-scope-inverted-zero-yield-by-construction',
      severity: 'high',
      note:
        'FR-3 CI LINT AS SPECIFIED IS DEAD BY CONSTRUCTION. Specified scope: "A CI lint scans every .env* file in the repo for ' +
        'chairman-class credential markers". MEASURED: .gitignore line 5 is `.env.*` (confirmed via git check-ignore -v .env.test -> ' +
        '".gitignore:5:.env.* .env.test"). `git ls-files` shows exactly THREE tracked .env* files: .env.claude, .env.claude.example, ' +
        '.env.example. `.env.test` is UNTRACKED (git ls-files --error-unmatch fails) and therefore ABSENT FROM EVERY CI CHECKOUT. It is ' +
        'also absent from worktrees by design — tests/e2e/setup/resolve-env-test-path.js exists precisely because the file lives only at ' +
        'the main repo root and is deliberately never copied/symlinked (its header records that `git worktree remove` follows a junction ' +
        'and destroys the target). So the lint would scan the one set of files that cannot hold the defect, find nothing, and pass ' +
        'green forever, while TS-4 ("passes on the cleaned/retired state") is satisfied vacuously. ' +
        'MEANWHILE THE MARKER IS COMMITTED: I verified programmatically (without printing the secret) that .env.test TEST_USER_EMAIL is ' +
        'BYTE-EQUAL to the literal rickfelix2000@gmail.com, which is hardcoded as a fallback default in FOUR TRACKED files — ' +
        'tests/uat/ai-eva-uat.spec.mjs:93, tests/uat/dashboard-analytics-uat.spec.mjs:95, tests/uat/navigation-uat.spec.mjs:142, ' +
        'tests/uat/remaining-uat-batch.spec.mjs:109 (all confirmed TRACKED), each paired with a hardcoded password fallback literal. ' +
        'REQUIRED REDESIGN, two axes, neither alone sufficient: (a) a CI lint over TRACKED SOURCE (tests/**, scripts/**, and the 3 ' +
        'tracked .env* files) for chairman-class identity markers — this is the axis CI can actually see and where the markers ' +
        'demonstrably are; (b) a PRE-COMMIT / local-only check for gitignored .env* files, since CI structurally cannot observe them. ' +
        'Precedent exists and is strong: 40+ lints under scripts/lint/ with the npm script + workflow + exported-pure-scan-function ' +
        'convention, so implementation risk is low once scope is corrected. ACCEPTANCE CRITERION MUST CHANGE: the lint must be proven ' +
        'by a POSITIVE arm (a fixture containing a chairman-class marker makes it exit 1), not only by the negative arm on a clean ' +
        'tree — a lint whose only evidence is "it passed" is indistinguishable from a lint that scans nothing.',
    },
    {
      id: 'fr2-discriminator-passes-while-weakened-two-ways',
      severity: 'high',
      note:
        'FR-2 acceptance criterion "A regression test fails if the authenticated principal id/role matches the chairman" is the right ' +
        'INTENT (the PRD correctly rejects display-name matching) but has TWO shallow implementations that would pass while providing ' +
        'no protection. (1) ROLE CLAIM IS NOT A DISCRIMINATOR: in Supabase the JWT `role` claim is "authenticated" for EVERY logged-in ' +
        'user, the chairman included. An implementation asserting role !== "chairman" is green by construction and always will be. The ' +
        'discriminator must be the `sub` (user id) or the email, plus an application-level role lookup if role is to be used at all. ' +
        '(2) VACUOUS INEQUALITY: if the chairman reference id/email is read from an env var or config that is unset in CI, the assertion ' +
        'degrades to actualId !== undefined, which is trivially true for any real authenticated principal — the test passes hardest ' +
        'exactly when its reference data is missing. The test MUST fail closed: first assert the chairman reference RESOLVES to a ' +
        'non-empty, well-formed value (and fail if not), only then assert inequality. This is the same class as the repo existing ' +
        '"null from an errored select is not absence" hazard. (3) REQUIRED THIRD ARM — STATIC, not runtime: the fallback chain is how ' +
        'the chairman identity re-enters after .env.test is retired. tests/e2e/ehg-app/auth.setup.spec.ts:73-74 and ' +
        'tests/e2e/ehg-app/login.spec.ts:28-29 use `process.env.TEST_USER_EMAIL || "admin@ehg.com"`; tests/e2e/setup/global-auth.js:47-48 ' +
        'and tests/uat/setup/global-auth.js:36 use `|| "test@example.com"`; the four tests/uat/*.spec.mjs files use ' +
        '`|| "rickfelix2000@gmail.com"`. Retiring .env.test with those literals in place means an unset env silently authenticates as ' +
        'the chairman on the UAT tier. Add a lint arm forbidding any chairman-class email literal as a fallback default anywhere under ' +
        'tests/. A runtime-only FR-2 test cannot catch this, because on the runs where it matters the runtime test is not the thing ' +
        'that executes.',
    },
    {
      id: 'fr1-zero-http-achievable-reuse-existing-socket-guard',
      severity: 'medium',
      note:
        'GOOD NEWS, WITH A DO-NOT-HAND-ROLL WARNING. The PRD hardest criterion ("proven by a regression test asserting zero HTTP ' +
        'requests were dispatched") is achievable TODAY and the machinery already exists in-repo: tests/helpers/db-tier-gate.js wraps ' +
        'net.Socket.prototype.connect (line 192) and tls.connect (line 195) — its own comment records the reason: "http/https build on ' +
        'net.createConnection, so this covers them too" — and exports the reusable pure classifiers shouldRefuseConnect(args), ' +
        'connectTargetOf(args), connectHostOf(args), isLoopbackHost(host), plus SENTINEL_URL. The socket layer is the CORRECT ' +
        'interception point; a proxy-env-var approach (HTTP_PROXY/HTTPS_PROXY) would be unreliable because supabase-js uses fetch/undici, ' +
        'which does not honour those by default. There is NO existing pattern for node-process-level request assertion in the e2e suite — ' +
        'the ~90 page.route/waitForResponse hits under tests/e2e/ are all BROWSER-level and are not applicable to a globalSetup abort ' +
        '(no browser exists yet at that point). RECOMMENDED TEST SHAPE: an outer vitest test spawns Playwright as a child process with ' +
        'SUPABASE_URL set to the production ref and NODE_OPTIONS="--require <sentinel.cjs>"; the sentinel installs the SAME classifier ' +
        'from db-tier-gate.js in RECORD mode and writes observed non-loopback connect targets to a JSON file; the outer test then ' +
        'asserts three things together — (i) child exit code is non-zero, (ii) the Playwright JSON reporter output shows ZERO tests ' +
        'started (this is what proves "before any test file executes", distinct from "no network"), and (iii) the sentinel file records ' +
        'zero non-loopback targets. Asserting only (iii) would not distinguish an abort from a run that merely failed to reach the ' +
        'network. IMPORT the classifier; a re-implemented host matcher would agree with itself by construction — the exact defect ' +
        'db-target.js own header documents from the original vitest-db-split.test.js failure. SCOPE CONFIRMATION for the guard predicate: ' +
        '39 of 66 e2e spec files construct node-side Supabase clients (grep -rl createClient tests/e2e), and env usage across tests/e2e ' +
        'is SUPABASE_URL x117 / SUPABASE_KEY x53 / SUPABASE_SERVICE_ROLE_KEY x50 / SUPABASE_ANON_KEY x2, with zero VITE_ references — so ' +
        'assessDbTarget(process.env) is correctly aimed at the dominant write path.',
    },
    {
      id: 'fr1-guard-covers-one-of-five-playwright-configs',
      severity: 'medium',
      note:
        'COVERAGE GAP. FR-1 names only "playwright.config.js globalSetup", but the repo has FIVE Playwright configs: ' +
        'playwright.config.js, playwright-uat.config.js, playwright-test.config.js, playwright.diagnostic.config.js, ' +
        'playwright-uat-nosetup.config.js. Critically, `npm run test:uat` runs playwright-uat.config.js, which already declares its OWN ' +
        'globalSetup (./tests/uat/setup/global-auth.js, line 12) and whose setup loads .env.test via resolveEnvTestPath and performs a ' +
        'real browser login — i.e. the tier that ACTUALLY AUTHENTICATES AS THE CHAIRMAN would remain completely unguarded if FR-1 wires ' +
        'only playwright.config.js. Guarding one config while four remain open does not close the defect; it relocates it. REQUIRED: ' +
        'implement the guard as a single shared module and wire it into EVERY playwright*.config.* globalSetup (composing with, not ' +
        'replacing, the UAT config existing global-auth setup — the guard must run FIRST, before its browser launch), and add a lint ' +
        'asserting every playwright*.config.* file declares it, so config #6 cannot ship unguarded. ALSO NOTE a Playwright ordering ' +
        'constraint relevant to FR-5: `webServer` starts BEFORE globalSetup, so on any config that later re-enables a webServer the ' +
        'literal claim "before any network call" would be false for the dev-server localhost traffic. Today this is moot ' +
        '(playwright.config.js line 168 is `webServer: []` and the UAT config webServer block is commented out at lines 54-59), but the ' +
        'criterion should be stated as "before any NON-LOOPBACK network call" to stay true if a webServer returns.',
    },
    {
      id: 'fr1-implementation-decoy-unwired-global-auth',
      severity: 'medium',
      note:
        'IMPLEMENTATION TRAP with a concrete wrong-turn. playwright.config.js declares globalTeardown (line 44) but has NO globalSetup ' +
        'at all — the slot FR-1 targets is currently EMPTY, and that config instead sequences auth via a `setup` PROJECT matching ' +
        '/.*\\.setup\\.spec\\.ts$/ (lines 128-131) with every browser project declaring dependencies:["setup"]. Sitting in exactly the ' +
        'directory an implementer will look in is tests/e2e/setup/global-auth.js — a file that LOOKS like the intended globalSetup, is ' +
        'referenced by NO config (only tests/uat/setup/global-auth.js is wired, and only to the UAT config), and still resolves ' +
        'credentials with the bare `path.resolve(process.cwd(), ".env.test")` at lines 16-17 that resolve-env-test-path.js was created ' +
        'to fix. Setting globalSetup to that file to satisfy FR-1 would silently ACTIVATE a stale, cwd-dependent auth path as a side ' +
        'effect of adding a safety guard. REQUIRED: create a NEW dedicated module (e.g. tests/e2e/setup/global-db-guard.js) for the ' +
        'guard; leave tests/e2e/setup/global-auth.js unwired or remove it. PLACEMENT IS OTHERWISE CORRECT: Playwright globalSetup runs ' +
        'once before all projects including the `setup` project, so a guard there genuinely precedes auth.setup.spec.ts, the browser ' +
        'launch, and the login — FR-1 chosen seam is architecturally right.',
    },
    {
      id: 'fr1-shared-opt-in-variable-over-grants-across-tiers',
      severity: 'medium',
      note:
        'FR-1 is right to reuse assessDbTarget by import ("widening designation happens in db-target.js or nowhere") and I confirm the ' +
        'predicate is sound and fails closed on every arm: no url / no service key / unparseable ref / no opt-in / opt-in-ref mismatch ' +
        'all return allowed:false, and the mismatch arm (db-target.js:68) correctly makes the opt-in an AUTHORISATION rather than a ' +
        'rubber stamp. BUT the only opt-in channel is the env var VITEST_DB_ALLOW_REF (db-target.js:66). Reusing it verbatim for the ' +
        'Playwright tier means (a) the variable is misnamed for the tier that reads it, and (b) more importantly, a developer ' +
        'authorising a vitest DB UNIT run against some ref SIMULTANEOUSLY authorises browser-driven e2e writes to that same ref, which ' +
        'have a far larger blast radius. Those are different risk decisions sharing one switch. RECOMMEND: keep ONE designation ' +
        'predicate (correct as specified) but require a tier-scoped authorisation for the e2e tier — e.g. the e2e guard demands BOTH a ' +
        'passing assessDbTarget AND a separate E2E_DB_ALLOW_REF matching the same ref. Designation stays single-sourced; authorisation ' +
        'becomes per-tier. Worth an explicit test: setting only VITEST_DB_ALLOW_REF must NOT unlock the e2e tier.',
    },
    {
      id: 'fr3-rotation-criterion-not-machine-verifiable-do-not-script',
      severity: 'low',
      note:
        'FR-3 acceptance criterion "The previously-exposed chairman password is rotated" is NOT objectively verifiable by any in-repo ' +
        'automated test, and MUST NOT be made one. The only mechanical way to "prove" a rotation is to attempt authentication with the ' +
        'old credential and assert failure — which is itself a production authentication attempt using a chairman credential, against ' +
        'the very production project this SD exists to stop tests from touching, and would leave failed-auth entries in the production ' +
        'auth log. Record it as an attested manual step with an evidence pointer (who rotated, when, where the new secret lives), ' +
        'explicitly marked not-machine-verifiable in the PRD, rather than leaving it in a list of criteria a future reader will assume ' +
        'a test covers. Related and in-scope for the provisioner work: .env.test currently contains TEST_USER_EMAIL and a real ' +
        'TEST_USER_PASSWORD (verified present and non-placeholder without printing either), and it is consumed indirectly through ' +
        'resolveEnvTestPath by tests/e2e/ehg-app/auth.setup.spec.ts, tests/e2e/ehg-app/login.spec.ts and tests/uat/setup/global-auth.js ' +
        '(which also probes .env.test.local first) — those are the call sites the secret-injection migration must cover, and ' +
        'tests/unit/e2e-auth-selector-order.test.js already asserts those files import resolveEnvTestPath rather than using a bare ' +
        'relative path, so that existing test is a regression risk to check when the delivery path changes.',
    },
    {
      id: 'baseline-deliberately-not-captured-running-e2e-is-the-hazard',
      severity: 'info',
      note:
        'BASELINE NOT CAPTURED, AND THAT IS THE CORRECT CALL — stated explicitly so a later reader does not read its absence as an ' +
        'oversight or, worse, go take it. Standard practice is to capture pre-existing e2e failures before implementation. I did NOT ' +
        'execute npm run test:e2e / test:uat, because doing so PRE-GUARD is precisely the hazard this SD closes: 39 of 66 e2e specs ' +
        'build Supabase clients from SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, which currently resolve to the live production project, and ' +
        'the UAT tier logs in with the chairman credential. The SD own metadata records fr1_recurrence_witnessed=3 with ' +
        'fr1_rescope_decision.evidence_at_decision_time noting "SD-TEST-HANDOFF prefix moved 32 -> 34 at 2026-09-07 04:30Z" and six ' +
        'fixture ventures flipping to escalated=TRUE. A "baseline run" today would ADD contamination and could plausibly be the source ' +
        'of the next witnessed batch. REQUIRED SEQUENCING: capture the e2e baseline only AFTER FR-1 lands, against a designated target. ' +
        'Until then the correct baseline for FR-1 itself is the unit tier, which is safe and already covers the shared predicate ' +
        '(tests/unit/e2e-resolve-env-test-path.test.js, tests/unit/e2e-auth-selector-order.test.js, ' +
        'tests/helpers/db-guard-fail-closed.db.test.js).',
    },
    {
      id: 'fr4-no-deletion-recommended-explicit-non-recommendation',
      severity: 'info',
      note:
        'EXPLICIT NON-RECOMMENDATION, per the review scope. This testing review does NOT recommend, authorise, schedule, or imply any ' +
        'deletion of production data, and performed NONE. I did not enumerate the __e2e_* / SD-TEST-HANDOFF-* rows, did not read ' +
        'metadata.fr4_cleanup_scope contents beyond confirming the field names exist (keys, count, source, window, writer, ventures, ' +
        'recorded_at, recorded_by, ventures_note, plus _second_batch and _third_batch siblings), and ran no DELETE against any table. ' +
        'FR-4 remains a separate chairman-approved ceremony with its own enumerate-then-approve sequence, out of scope for this ' +
        'PLAN-phase review AND out of scope for EXEC. Testing position for whenever FR-4 does run: the enumeration script and the ' +
        'deletion step must be separate invocations with the approved list persisted between them, so the rows deleted are provably the ' +
        'rows approved rather than a re-evaluated pattern match at deletion time (the PRD own risk register already names this, and it is ' +
        'the correct control). One observation that belongs to FR-4 planning, not to this handoff: because contamination has been ' +
        'measured in production ventures as well as strategic_directives_v2, any FR-4 exit assertion scoped only to ' +
        'strategic_directives_v2 would read green while ventures rows remain.',
    },
    {
      id: 'ts-scenario-testability-summary',
      severity: 'info',
      note:
        'PER-SCENARIO TESTABILITY VERDICT on the PRD test_scenarios. TS-1 (prod ref -> globalSetup aborts, zero network): TESTABLE as ' +
        'specified, via the child-process + net/tls sentinel shape above; strengthen by also asserting zero tests STARTED via the JSON ' +
        'reporter, since "no network" and "no test executed" are two distinct claims and the criterion asserts both. TS-2 (designated ' +
        'non-prod ref proceeds): NOT TESTABLE end-to-end today (DESIGNATED_NON_PROD_REFS is empty pending D-a) AND per the ' +
        'fr1_rescope_decision condition it does not belong to the carved FR-1 at all — move to FR-5; a hermetic unit assertion that ' +
        'assessDbTarget returns allowed:true for a synthetic ref + matching opt-in is worth having but must not be labelled as ' +
        'satisfying TS-2. TS-3 (e2e login identity is the test user, not the chairman): TESTABLE but only with the fail-closed ' +
        'reference-resolution guard and the static fallback-literal lint described above; as loosely worded it is passable by a ' +
        'no-op check. TS-4 (CI lint scans repo .env* files): AS SPECIFIED IT IS VACUOUS — see the scope-inversion finding; needs a ' +
        'positive fixture arm and a corrected file scope before it can fail for the right reason. NET: 1 of 4 scenarios is sound as ' +
        'written, 1 is misassigned to the wrong FR, and 2 need materially tightened criteria.',
    },
  ],
  metadata: {
    // Honest unmeasured row: this is a PLAN-phase STRATEGY review. Nothing was executed, and
    // executing the e2e/uat suites pre-FR-1 is itself the production-write hazard this SD closes.
    measured: false,
    test_execution: buildTestExecution({
      executed: 0, passed: 0, failed: 0, skipped: 0,
      runner: 'none (PLAN-phase strategy review — no runner invoked)',
      source: 'plan_phase_strategy_review_no_execution',
    }),
    review_type: 'PLAN-phase test strategy review (no test execution — EXEC not started)',
    prd_id: 'PRD-SD-LEO-INFRA-E2E-REAL-TEST-001',
    prd_status_at_review: 'approved',
    sd_key: 'SD-LEO-INFRA-E2E-REAL-TEST-001',
    sd_phase_at_review: 'PLAN_PRD',
    reviewed_at: '2026-09-07',
    tests_executed: false,
    tests_executed_reason:
      'PLAN-phase strategy review. Additionally, executing the e2e/uat suites pre-FR-1 would itself write to the production project — the exact defect this SD closes.',
    exec_scope_recommendation:
      'FR-1 ONLY. metadata.chairman_decisions absent + plan_to_exec_gate.blocked=true (FR-1 carved out) means FR-2..FR-6 are not EXEC-eligible.',
    blocking_before_exec: [
      'Amend PRD FR-1 acceptance_criteria[1] and top-level acceptance_criteria[0] to the refusal arm only, per metadata.fr1_rescope_decision.condition_and_why_it_matters (2026-09-07T05:29:59.828Z)',
      'Confirm EXEC scope is FR-1 only until D-a/D-b are recorded on the SD',
    ],
    files_read_for_grounding: [
      'tests/helpers/db-target.js',
      'tests/helpers/db-tier-gate.js',
      'playwright.config.js',
      'playwright-uat.config.js',
      'tests/e2e/setup/resolve-env-test-path.js',
      'tests/e2e/setup/global-auth.js',
      'tests/uat/setup/global-auth.js',
      '.env.test (main repo root; read programmatically, secrets never printed)',
      'strategic_directives_v2 metadata (fr1_rescope_decision, plan_to_exec_gate)',
      'product_requirements_v2 PRD-SD-LEO-INFRA-E2E-REAL-TEST-001',
    ],
    measured_facts: {
      playwright_configs_total: 5,
      playwright_config_js_has_globalSetup: false,
      playwright_config_js_has_globalTeardown: true,
      uat_config_has_own_globalSetup: 'tests/uat/setup/global-auth.js',
      e2e_spec_files_total: 66,
      e2e_specs_constructing_supabase_client: 39,
      e2e_env_usage: 'SUPABASE_URL x117, SUPABASE_KEY x53, SUPABASE_SERVICE_ROLE_KEY x50, SUPABASE_ANON_KEY x2, VITE_* x0',
      tracked_env_files: ['.env.claude', '.env.claude.example', '.env.example'],
      env_test_tracked: false,
      env_test_gitignored_by: '.gitignore:5 (.env.*)',
      env_test_email_equals_hardcoded_uat_fallback: true,
      tracked_files_with_chairman_class_email_literal: [
        'tests/uat/ai-eva-uat.spec.mjs:93',
        'tests/uat/dashboard-analytics-uat.spec.mjs:95',
        'tests/uat/navigation-uat.spec.mjs:142',
        'tests/uat/remaining-uat-batch.spec.mjs:109',
      ],
      designated_non_prod_refs: '[] (Object.freeze, db-target.js:25)',
      existing_socket_guard: 'tests/helpers/db-tier-gate.js patches net.Socket.prototype.connect (L192) and tls.connect (L195); exports shouldRefuseConnect/connectTargetOf/connectHostOf/isLoopbackHost',
      browser_level_network_assertions_in_e2e: '~90 (page.route/waitForResponse) — browser-level only, not applicable to a globalSetup abort',
      chairman_decisions_present: false,
      plan_to_exec_gate_blocked: true,
    },
    fr4_position: 'NO deletion recommended, implied, or performed. Enumeration not run. Remains a separate chairman-approved ceremony, out of scope for this review and for EXEC.',
    scenario_verdicts: { 'TS-1': 'testable (strengthen with zero-tests-started assertion)', 'TS-2': 'not testable today + misassigned to FR-1; belongs to FR-5', 'TS-3': 'testable only with fail-closed reference resolution + static fallback lint', 'TS-4': 'vacuous as specified — scope inverted vs CI visibility' },
  },
  execution_time_ms: 720000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
console.log('REPO_RESOLVED=' + results.metadata.repo_resolved);
