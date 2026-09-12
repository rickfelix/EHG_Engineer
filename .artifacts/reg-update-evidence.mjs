import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const ROW_ID = 'df2f5fc5-894a-4287-9ef3-e89daf873822';
const SD_UUID = '2d4e7fea-d8db-447e-a75e-0a8ad201f6c4';
const SD = 'SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001';

const findings = [
  { id: 'NO-IDENTITY-PATH-BACKWARD-COMPAT-CONFIRMED', severity: 'info', type: 'premise_verified',
    note: 'Read the staged diff line by line (git diff --cached), did not trust the description. The "byte-identical when no identity resolves" claim HOLDS behaviorally on all three touched call sites. (a) scripts/lib/supabase-connection.js createDatabaseClient: set_config is inside `if (actorId)`, so zero extra queries when actorId is null. (b) lib/supabase-client.js plain branch: withActorHeader(undefined, null) returns undefined, so `global ? {global} : undefined` yields createClient(url, key, undefined) -- ARITY 3 with explicit undefined vs pre-change arity 2; behaviorally inert because supabase-js does `options ?? {}`. (c) lib/supabase-client.js boundedFetch branch: withActorHeader({fetch}, null) returns the same object identity -> literally byte-identical. (d) scripts/lib/supabase-connection.js createSupabaseServiceClient: `global:` key is now ALWAYS present (value undefined when no identity) where it was previously ABSENT; inert because supabase-js applySettingDefaults does `{...DEFAULT_GLOBAL_OPTIONS, ...globalOptions}` and spreading undefined is a no-op.' },
  { id: 'CALLER-HEADER-PRECEDENCE-CORRECT-AND-TESTED', severity: 'info', type: 'premise_verified',
    note: 'Item 3 checked at the implementation, not the test result. lib/db-actor-identity.js withActorHeader places `x-actor-session: actorId` FIRST then spreads `...(globalOptions?.headers || {})`, so a caller-supplied x-actor-session WINS and is not silently overridden -- correct direction. This IS asserted: tests/unit/lib/db-actor-identity.test.js:65 "a caller-supplied x-actor-session header wins over the injected one" and :70 "preserves other caller-supplied headers". Caller global.fetch preservation asserted at both helper level (:58) and factory level (supabase-connection-actor-threading.test.js "merges ... rather than clobbering it").' },
  { id: 'SET-CONFIG-ORDERING-NO-INTERFERENCE', severity: 'info', type: 'premise_verified',
    note: 'Item 1. set_config is issued AFTER `await client.connect()` and BEFORE the `options.verify !== false` verification query. No interference: (a) it is session-level (is_local=false) and runs outside any transaction, so a caller that immediately issues BEGIN is unaffected; (b) tests/integration/sd-park.test.js calls createDatabaseClient(\'engineer\') and only then issues its own outer BEGIN (line 96) and SAVEPOINTs -- the savepoint-translating wrapper is built around the client AFTER construction, so the set_config never passes through it and cannot be rewritten into a SAVEPOINT; (c) scripts/one-off/* get a client whose only non-pristine state is one custom GUC, which no observed caller reads or resets. set_config on a custom `app.*` GUC cannot raise for lack of privilege, so no new throw-after-connect leak path on the direct-pg route.' },
  { id: 'NO-CREATECLIENT-ARITY-ASSERTIONS-EXIST', severity: 'info', type: 'regression_probe_clean',
    note: 'Item 5, the one shape the `global` key insertion could break. Cross-referenced every tests/ file that does vi.mock(\'@supabase/supabase-js\') (40+ files) against every file containing toHaveBeenCalledWith, then grepped for createClient arg assertions (`createClient*).toHaveBeenCalledWith`, `createClient*.mock.calls`, `.calls[`). ZERO matches anywhere in tests/. The single hit repo-wide is tests/unit/coordinator/clear-coordinator-review.test.js:66 `expect(createClientFn).toHaveBeenCalledWith(\'engineer\', { verify: false })` -- that is a mock of the createDatabaseClient FACTORY (projectKey, options), not of supabase-js createClient, and its asserted arity is untouched by this change. No test asserts options is exactly undefined or that createClient was called with exactly 2 args. Item 5 is CLEAN.' },
  { id: 'SCHEMA-DRIFT-WRAP-UNCHANGED', severity: 'info', type: 'premise_verified',
    note: 'Item 2. applyWrap is computed before the change and is applied to BOTH return paths exactly as before (`applyWrap(createClient(...))` on each); the throwOnSchemaDrift===false opt-out is untouched. The only shape delta when fetchTimeoutMs is NOT passed is the optional third createClient argument. Confirmed live by the two pre-existing factory tests, which were NOT in the commanded list and which I added: tests/unit/client-factory-schema-drift-throw.test.js (19 passed) and tests/unit/client-factory-default-export-removed.test.js (4 passed).' },
  { id: 'POINTER-FALLBACK-WARNS-ON-EVERY-CLIENT-CONSTRUCTION', severity: 'high', type: 'regression',
    note: 'MEASURED, not reasoned. resolveActorIdentity() delegates to resolveClaimIdentity(env, opts), which on the pointer branch calls `warn = opts.warn ?? console.warn` with a multi-line message. NEITHER factory passes a warn override. Measured from the shared main root (C:/Users/rickf/Projects/_EHG/EHG_Engineer, where .claude/session-identity/current EXISTS): with CLAUDE_SESSION_ID unset, resolveActorIdentity returns {actorId:"45924f8d-...",source:"pointer_fallback"} AND prints "[claim-identity] CLAUDE_SESSION_ID absent -- falling back to the SHARED pointer (...). This is last-writer-wins under concurrency; the claim will be stamped identity_source=pointer_fallback." to stderr. That warning is now emitted on EVERY createSupabaseServiceClient()/createDatabaseClient() construction on that path -- a factory pair with ~468 + ~542 importers, repeatedly for scripts that build several clients. The text is also semantically wrong in this context: no claim is being stamped, this is DB-client construction, so operators get a correct-sounding message about the wrong subsystem. From a fresh worktree (no pointer file) resolution is source=none and nothing prints, which is why CI stays silent and the regression is invisible to CI.' },
  { id: 'POINTER-FALLBACK-CAN-ATTRIBUTE-THE-WRONG-ACTOR', severity: 'high', type: 'correctness_risk',
    note: 'Consequence of the same measurement, aimed at the SD\'s own goal. pointer_fallback is explicitly last-writer-wins across concurrent sessions (per claim-identity.js own warning). At measure time the shared pointer read 45924f8d-f761-49fe-b89e-dbb1df80b7a8 while the session actually executing was 961a30d3-1a94-4f10-8b06-b48fa2306361 -- i.e. an unattended or env-less process running from the main root would stamp app.actor / x-actor-session with a DIFFERENT live session\'s id. For an AUDIT trigger this is worse than the status quo: today\'s `authenticator`/`postgres` is honestly non-specific, whereas a wrong-but-specific session uuid reads as trustworthy attribution and would be believed. Recommend the factories accept only source=\'env\' and \'role_tag_fallback\' and treat pointer_fallback as no identity (or stamp it as `pointer:<id>` so it is self-labelling), since the pointer cannot answer "who acted".' },
  { id: 'SYNC-FS-READ-ON-CLIENT-CONSTRUCTION-HOT-PATH', severity: 'medium', type: 'performance_risk',
    note: 'resolveActorIdentity() is called unconditionally on every invocation of both factories and, on the no-env path, performs a synchronous readCurrentPointer() file read. There is no memoization anywhere in lib/db-actor-identity.js. Previously these factories did zero filesystem I/O per call. Recommend memoizing the resolution once per process (identity cannot change mid-process for the env and role-tag sources).' },
  { id: 'TWO-OF-FIFTEEN-COMMANDED-TEST-FILES-NEVER-RAN', severity: 'medium', type: 'evidence_integrity',
    note: 'Item 4 did not actually run what it claimed. The commanded 15-path vitest invocation reported "Test Files 9 passed | 4 skipped (13)" and exited 0 -- 13, not 15. Re-ran with --reporter=json: tests/unit/blocked-state-detector.test.js and tests/unit/sd-workflow-templates.test.js produced NO result row at all, yet both EXIST on disk (11939 and 8621 bytes). Under --project unit they are silently excluded (project glob / project assignment; exact cause not chased) and vitest exits 0 regardless. So "all pass, 0 failures" covers 13/15 commanded files; the other two are unmeasured, not green.' },
  { id: 'SIXTY-NINE-OF-154-TESTS-SKIPPED-CONNECTION-ROUTER-VACUOUS', severity: 'low', type: 'evidence_integrity',
    note: 'Of the 13 files that did run, 4 were 100% skipped and contributed zero coverage: connection-router.test.js (15 skipped), effort-policies.test.js (18), flywheel/analytics.test.js (10), flywheel/integration.test.js (6) = 69 of 154 tests pending. connection-router.test.js is gated by `describe.skipIf(!HAS_REAL_DB)` at line 25, so the single most DB-client-adjacent file in the commanded regression list asserted NOTHING; its "pass" is vacuous as a regression signal for these factories. Net real signal: 85 passed assertions, of which 21 are the three new actor-threading files (db-actor-identity 10, supabase-connection-actor-threading 6, supabase-client-actor-threading 5) and 23 are the two pre-existing factory files I added.' },
  { id: 'FACTORY-LEVEL-HEADERS-MERGE-NOT-ASSERTED', severity: 'low', type: 'coverage_gap',
    note: 'Minor asymmetry. tests/unit/lib/supabase-connection-actor-threading.test.js asserts caller-global preservation only for `global.fetch`; it never passes a caller `clientOptions.global.headers`. The headers-precedence invariant is asserted only at the helper level (db-actor-identity.test.js). A future refactor that merged headers in the factory rather than via withActorHeader could flip precedence and still pass the factory suite. One extra case in the factory test closes it.' },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  execution_time_ms: 0,
  summary:
    'REGRESSION (VERIFY): NO backward-compatibility regression found for existing callers of the three touched entry points. ' +
    'The "byte-identical when no identity resolves" claim was verified against the staged diff line by line and HOLDS behaviorally ' +
    'on all three call sites (two are literally unchanged objects; two introduce only an inert explicit-undefined argument / undefined ' +
    'global key that supabase-js spreads away). Item 5 -- the one test shape the global-key insertion could break -- is CLEAN: zero ' +
    'tests anywhere assert createClient arg shape or arity. set_config does not interfere with the verify query or with the sd-park ' +
    'savepoint pattern. Caller-supplied headers correctly win and that is genuinely asserted. CONDITIONAL on 2 HIGH findings that are ' +
    'new behavior rather than broken behavior (an unconditional stderr warning now fires on every client construction from the shared ' +
    'main root, and that same pointer_fallback path can attribute a mutation to a DIFFERENT live session) plus 2 evidence-integrity ' +
    'findings (2 of 15 commanded test files never ran and vitest still exited 0; 69 of 154 tests skipped, including all of connection-router).',
  findings,
  recommendations: [
    'Pass an explicit no-op or dedicated warn into resolveClaimIdentity from both factories (resolveActorIdentity(process.env, { warn: () => {} })) so client construction stops emitting a claim-stamping warning on a ~1010-importer hot path.',
    'Restrict the factories to source=env and role_tag_fallback, or self-label the pointer value as `pointer:<id>`: a last-writer-wins shared pointer cannot answer "who acted", and a confidently wrong session uuid in an audit row is worse than the honest shared-role value it replaces.',
    'Memoize resolveActorIdentity once per process; it currently does a synchronous pointer-file read on every client construction where these factories previously did zero filesystem I/O.',
    'Re-run tests/unit/blocked-state-detector.test.js and tests/unit/sd-workflow-templates.test.js under the project that actually includes them -- they exist on disk but --project unit silently drops them while still exiting 0.',
    'Do not count connection-router.test.js as regression coverage for this change: describe.skipIf(!HAS_REAL_DB) skipped all 15 of its tests.',
    'Add one factory-level case passing clientOptions.global.headers so the caller-wins header precedence is pinned at the factory, not only inside withActorHeader.',
  ],
  conditions: [
    { action: 'Silence/replace the claim-identity pointer warning at both factory call sites before merge', priority: 'high', blocking: false },
    { action: 'Decide explicitly whether pointer_fallback is an acceptable actor source for audit attribution, or exclude it', priority: 'high', blocking: false },
    { action: 'Memoize actor resolution to remove per-construction sync fs read', priority: 'medium', blocking: false },
    { action: 'Run the 2 commanded test files that --project unit silently excluded', priority: 'medium', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS: no existing caller of createDatabaseClient or either createSupabaseServiceClient breaks, and the ' +
    'no-identity path is behaviorally equivalent as claimed (verified from the diff, not the description), with item 5 probed clean across ' +
    'all 40+ supabase-js-mocking test files. Withheld from PASS because (1) the pointer_fallback branch introduces a measured, unconditional ' +
    'stderr warning on a hot path shared by ~1010 importing files and can attribute a governed mutation to a different live session, and ' +
    '(2) the regression evidence is thinner than the green line implies -- 2 of 15 commanded files never executed and 69 of 154 tests skipped.',
  metadata: {
    phase: 'VERIFY',
    gate: 'PLAN_VERIFICATION',
    partial: false,
    supersedes_partial_row: true,
    session_id: process.env.CLAUDE_SESSION_ID || null,
    diff_source: 'git diff --cached (staged, uncommitted) on feat/SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 @ 82ba6c7fb74',
    files_reviewed: ['lib/db-actor-identity.js', 'lib/supabase-client.js', 'scripts/lib/supabase-connection.js', 'lib/claim/claim-identity.js', 'tests/unit/lib/db-actor-identity.test.js', 'tests/unit/lib/supabase-connection-actor-threading.test.js', 'tests/unit/supabase-client-actor-threading.test.js', 'tests/integration/sd-park.test.js'],
    test_files_commanded: 15,
    test_files_executed: 13,
    test_files_silently_excluded: ['tests/unit/blocked-state-detector.test.js', 'tests/unit/sd-workflow-templates.test.js'],
    test_files_added_by_regression_agent: ['tests/unit/client-factory-default-export-removed.test.js', 'tests/unit/client-factory-schema-drift-throw.test.js'],
    tests_total: 154,
    tests_passed: 85,
    tests_failed: 0,
    tests_skipped: 69,
    fully_skipped_files: ['connection-router.test.js', 'effort-policies.test.js', 'flywheel/analytics.test.js', 'flywheel/integration.test.js'],
    new_actor_threading_assertions_passed: 21,
    createclient_arity_assertions_found: 0,
    supabase_js_mocking_test_files_scanned: 40,
    importers_lib_supabase_client: 468,
    importers_scripts_supabase_connection: 542,
    measured_pointer_fallback_from_main_root: true,
    measured_source_from_fresh_worktree: 'none',
  },
};

const supabase = createSupabaseServiceClient();
const { data: sdRow } = await supabase.from('strategic_directives_v2')
  .select('target_application').eq('sd_key', SD).maybeSingle();
const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: sdRow?.target_application || null,
  subAgentCode: 'REGRESSION',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'lib/db-actor-identity.js',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .update({
    verdict: results.verdict,
    confidence: results.confidence_score,
    recommendations: results.recommendations,
    critical_issues: results.findings.filter((f) => f.severity === 'critical'),
    warnings: results.findings.filter((f) => f.severity === 'high' || f.severity === 'medium'),
    metadata: { ...results.metadata, findings: results.findings, conditions: results.conditions, justification: results.justification, summary: results.summary },
  })
  .eq('id', ROW_ID)
  .select('id, sub_agent_code, verdict, confidence, sd_id')
  .maybeSingle();

if (error) { console.error('UPDATE ERROR:', JSON.stringify(error)); process.exit(1); }
console.log('UPDATED ROW:', JSON.stringify(data));
console.log('sd_id matches expected:', data?.sd_id === SD_UUID);
console.log('repo_path:', results.metadata.repo_path, '| executed_from_cwd:', results.metadata.executed_from_cwd);
