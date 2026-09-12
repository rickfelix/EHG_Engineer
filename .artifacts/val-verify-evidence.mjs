import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const SD = '2d4e7fea-d8db-447e-a75e-0a8ad201f6c4';
const SD_KEY = 'SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  execution_time_ms: 0,
  summary:
    'VALIDATION (GATE 4, PLAN_VERIFICATION): FR-1/FR-2/FR-3-logic/FR-4-unit/FR-5-safety/FR-6 all INDEPENDENTLY VERIFIED, '
    + 'several by live measurement rather than code reading. No duplicate work, no untrusted-input path into the actor value. '
    + 'CONDITIONAL on one PROCESS blocker (624 insertions are STAGED BUT NEVER COMMITTED -- 0 commits ahead of origin/main, '
    + 'no PR, so every diff-based CI lint scanned 0 files and the new SQL has never been through its gates) and two '
    + 'MIGRATION-CORRECTNESS gaps in the chairman-gated file that should be fixed BEFORE the ceremony, because a chairman-'
    + 'approved file is expensive to amend afterwards: (a) CREATE OR REPLACE wipes proconfig, so this file silently reverts '
    + 'the pending 20260831 search_path pin while ADDING the first unqualified public-schema call into that SECURITY DEFINER '
    + 'body; (b) resolve_sd_mutation_audit_actor() ships with default ACL and becomes anon/authenticated-callable via '
    + 'PostgREST. Neither is a design flaw -- both are one-line additions to the same migration.',
  findings: [
    {
      id: 'FR1-VERIFIED-LIVE', severity: 'info', type: 'requirement_met',
      note: 'FR-1 PASS, MEASURED not read. scripts/lib/supabase-connection.js:274 issues SELECT set_config("app.actor", $1, false) after client.connect(). Live probe through the real factory returned app_actor=961a30d3-1a94-4f10-8b06-b48fa2306361 (this session id), session_user=postgres -- the GUC is genuinely populated on a production connection. Identity REUSES lib/claim/claim-identity.js resolveClaimIdentity() via lib/db-actor-identity.js:16; the role-tag fallback is layered ONLY on the sessionId-falsy branch (line 17 returns early), so it is not a 4th resolver. lib/supabase-connection.js remains an untouched re-export shim. Parameterized -> no SQL injection.',
    },
    {
      id: 'FR2-VERIFIED-BOTH-FACTORIES', severity: 'info', type: 'requirement_met',
      note: 'FR-2 PASS. BOTH factories thread the header through the SHARED withActorHeader(): lib/supabase-client.js:120 (both return paths -- plain branch passes options only when an identity resolves, so the no-identity case stays byte-identical to pre-fix; boundedFetch branch merges so the custom fetch is PRESERVED) and scripts/lib/supabase-connection.js:416-427. withActorHeader spreads caller headers LAST (caller wins) and spreads caller globalOptions, so no pre-existing global option is dropped. In scripts/lib the global key is placed AFTER ...clientOptions, and because withActorHeader re-merges clientOptions.global there is no loss; global:undefined is safe through supabase-js applySettingDefaults. Zero call-site changes required.',
    },
    {
      id: 'FR3-STRUCTURE-AND-DECLARATION-VERIFIED', severity: 'info', type: 'requirement_met',
      note: 'FR-3 PASS on structure. All three governed-field branches resolve through ONE call to resolve_sd_mutation_audit_actor() (hoisted to line 72, so the three sites are identical by construction rather than by three parallel edits) and each of the three audit_log rows records metadata.actor_source. The trigger WHEN clause byte-matches the live pg_get_triggerdef output (status/current_phase/claiming_session_id IS DISTINCT FROM). metadata.migration_files declares 20260912_sd_mutation_audit_actor_threading.sql. The _DOWN omission is CORRECT convention, not an oversight: across all 11 SDs carrying migration_files, 0 list a _DOWN file. audit_log.created_by is text, nullable, no FK and no CHECK, so session UUIDs, role:<tag> and session_user all fit.',
    },
    {
      id: 'MIGRATION-WIPES-SEARCH-PATH-PIN', severity: 'high', type: 'migration_correction',
      note: 'MEASURED ON THE LIVE DB, not recalled from docs: created a throwaway SECURITY DEFINER function, ALTER FUNCTION ... SET search_path = public, pg_catalog (proconfig=["search_path=public, pg_catalog"]), then CREATE OR REPLACE without a SET clause -> proconfig BACK TO NULL. So this migration RESETS any function-level search_path pin. database/migrations/20260831_pin_search_path_log_sd_mutation_audit.sql exists specifically to pin search_path on THIS function (SD-LEO-FIX-TRIAGE-THREE-FAILING-001, CVE-2018-1058 class, flagged by security-linter-sentinel.yml --strict). That pin is NOT applied today (live proconfig=null, header still @approved-by <pending>), so this is an ORDERING HAZARD rather than a live regression -- but whichever of the two applies second wins, and the pin is the one that loses if this applies after it. Independently, this migration makes the exposure WORSE in kind: the prior body referenced only pg_catalog builtins plus unqualified audit_log, whereas the new body adds an UNQUALIFIED call to a public-schema function (resolve_sd_mutation_audit_actor()) inside a SECURITY DEFINER body with a mutable search_path -- exactly the shadowing vector the pin exists to close. FIX: add SET search_path = public, pg_catalog to the CREATE OR REPLACE of log_sd_mutation_audit() (and to the helper), and to the _DOWN, so the pin is carried by the file that owns the body instead of by a separate ALTER that any later replacement silently undoes.',
    },
    {
      id: 'HELPER-FN-DEFAULT-ACL-ANON-CALLABLE', severity: 'medium', type: 'migration_correction',
      note: 'resolve_sd_mutation_audit_actor() is created in public as a NON-trigger, SECURITY INVOKER function with no REVOKE. MEASURED: pg_default_acl carries ALTER DEFAULT PRIVILEGES for role postgres IN SCHEMA public granting EXECUTE to anon, authenticated, service_role (defaclacl {postgres=X,anon=X,authenticated=X,service_role=X}), so the new function is anon-callable via PostgREST .rpc() on creation. Disclosure is LOW (it returns session_user -> authenticator for an anon caller, plus that callers own echoed header; app.actor is unset for PostgREST callers) -- this is not a data or credential leak. But it is a NEW anon-reachable RPC surface, and the project convention is explicit ACL management: 0 of 454 public non-trigger functions currently have a default ACL, so this migration would be the first. FIX: add REVOKE EXECUTE ON FUNCTION public.resolve_sd_mutation_audit_actor() FROM PUBLIC, anon, authenticated. Verified safe: the only caller is log_sd_mutation_audit(), which is SECURITY DEFINER owned by postgres, so the inner call runs as postgres (probe confirmed current_user=postgres inside a SECURITY DEFINER body) and retains EXECUTE.',
    },
    {
      id: 'FR5-EXCEPTION-SAFETY-PROVEN-EMPIRICALLY', severity: 'info', type: 'requirement_met',
      note: 'FR-5 exception-safety PASS, and proven rather than read. Installed the migrations resolve_sd_mutation_audit_actor() body VERBATIM into pg_temp (session-local, auto-dropped, no public-schema write; only the schema qualifier changed) and drove 10 cases: nothing set -> session_user; app.actor set -> app.actor; headers valid JSON -> request.headers; headers MALFORMED (not-json-at-all{{{) -> session_user NO THROW; headers valid JSON without the key -> session_user; headers a JSON ARRAY -> session_user; headers a JSON scalar string -> session_user; headers empty string -> session_user; x-actor-session present but empty -> session_user; app.actor AND header both set -> app.actor WINS. Every degenerate input degrades to the pre-existing session_user behavior, so a malformed request.headers can never abort the governed write it only means to attribute. Also confirmed session_user (not current_user) is the fallback and is unaffected by SECURITY DEFINER -> FR-3 AC "session_user fallback provably unchanged" is MET. NOT reproduced by me: the PLAN spikes end-to-end claim that PostgREST surfaces x-actor-session in request.headers inside an AFTER UPDATE trigger -- reproducing it needs a throwaway table+trigger on the production project, which I declined to create. That single leg rests on the PLAN evidence, and it is the leg carrying 99.6% of the value (see PREMISE-CONFIRMED-AT-VERIFY).',
    },
    {
      id: 'FR6-CONFIRMED-INDEPENDENTLY', severity: 'info', type: 'requirement_met',
      note: 'FR-6 PASS, independently re-measured rather than taken from the EXEC comment. buildConnectionString ALWAYS routes through <region>.pooler.supabase.com:<DB_CONFIGS.port>, and all three configs (ehg, engineer, ehg_legacy) use port 5432 = Supavisor SESSION mode (6543 is the transaction-mode port). The CI override SUPABASE_POOLER_URL is also port 5432. Live discriminator on a real createDatabaseClient connection: pg_backend_pid() identical across post-connect, txn1 (BEGIN/COMMIT), txn2, and after 5 interleaved standalone statements (1 distinct pid), with app.actor surviving all four reads (1 distinct value). Under transaction-mode pooling the pid would rotate and the session GUC would be dropped. So session-level set_config(...,false) is CORRECT here and SET LOCAL is not required. The EXEC comments reasoning (pg_backend_pid is stable for the life of this pg.Client) is the right discriminator and its conclusion holds.',
    },
    {
      id: 'FR6-RESIDUAL-NOTHING-ENFORCES-PORT-5432', severity: 'low', type: 'design_risk',
      note: 'Carried forward UNCLOSED from the LEAD-phase validation row (finding POOLER-SESSION-GUC-RISK). createDatabaseClient accepts options.connectionString and QF-20260513-258 documents CI passing SUPABASE_POOLER_URL through it. Nothing asserts that target is session-mode. If SUPABASE_POOLER_URL is ever repointed at the :6543 transaction pooler, the session-level SET becomes a silent CROSS-ACTOR LEAK -- actor A app.actor can attribute actor B governed write on a shared pooled backend -- and the failure mode is worse than no attribution, because it produces CONFIDENT WRONG attribution in an audit ledger with no retention. Not a blocker today (measured 5432 on every path). Cheapest guard: after set_config, assert inet_server_port()=5432 (or that the GUC reads back) and fall back to SET LOCAL otherwise; or an AC asserting the GUC is readable at trigger time on the pooled path.',
    },
    {
      id: 'FR4-UNIT-PASS', severity: 'info', type: 'requirement_met',
      note: 'FR-4 unit tier PASS. Ran env -u CLAUDE_SESSION_ID npx vitest run --project unit over the three files: 3 files / 21 tests, all passing, no live-DB dependency. Coverage is genuinely tier-complete on the JS side: identity present (env), role-tag fallback, fallback NOT consulted when env present, blank role tag ignored, none -> null; header injected, caller fetch preserved, caller header wins, other caller headers preserved; and both lib/supabase-client.js return branches. Regression check on the two modified factories: tests/unit/client-factory-default-export-removed, client-factory-schema-drift-throw, connection-router, apply-migration-cli, auto-extract-patterns-service-client -> 46 passed / 15 skipped (skips are DB-gated), no regressions.',
    },
    {
      id: 'FR4-LIVE-TIER-INERT-AND-LIKELY-WRONG-AS-WRITTEN', severity: 'medium', type: 'coverage_gap',
      note: 'FR-4 live tier is CORRECTLY gated but has NEVER EXECUTED, so its own correctness is unverified. tests/integration/sd-mutation-audit-actor-threading.db.test.js gates on describeDb, and tests/helpers/db-target.js has DESIGNATED_NON_PROD_REFS = Object.freeze([]) -- so it skips everywhere absent an explicit VITEST_DB_ALLOW_REF opt-in. That is the right safety posture (QF-20260726-459) and the file header says so honestly. The concrete risk is that the test is ALSO unlikely to pass as written whenever a target does appear: strategic_directives_v2 carries 57 enabled non-internal triggers, and the suite seeds a bare draft SD then drives status->in_progress, current_phase->PLAN, status->active. enforce_handoff_on_phase_transition (enforce_handoff_trigger) plausibly blocks step 2 current_phase update with no handoff row; aaa_/zzz_enforce_canonical_lifecycle_write, trg_enforce_sd_quality_advancement, tr_enforce_business_value_gate, trg_doctrine_constraint_sd and trg_auto_validate_sd_content_quality all sit on the same writes. Unverifiable today without writing to production, which I declined. Recommend treating this suite as DOCUMENTATION of intent (which it explicitly claims to be) and NOT as satisfied coverage, and noting in the handoff that its first real run should be expected to need trigger-aware fixture work.',
    },
    {
      id: 'WORK-STAGED-NEVER-COMMITTED', severity: 'critical', type: 'process_blocker',
      note: 'BLOCKING for PLAN-TO-LEAD. The entire EXEC implementation exists ONLY in the git index: git log origin/main..HEAD is EMPTY, git log --all -- <the new files> is EMPTY, gh pr list --head feat/SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 --state all returns []. git diff --cached --stat HEAD shows 9 files / 624 insertions / 3 deletions staged and uncommitted. Two consequences, both measured rather than inferred. (1) DURABILITY: 624 insertions of chairman-gated DDL and new library code are one git reset --hard from zero, in a worktree whose stash stack is shared with other live sessions. (2) GATE COVERAGE: every relevant CI lint is diff-triggered, so none has examined this SQL -- node scripts/lint/secdef-execute-revoke-lint.mjs (default --diff mode) reports "0 file(s) scanned, 0 violations", and secdef-execute-revoke-lint.yml triggers on pull_request paths database/chairman-gated/**/*.sql which no PR has ever carried. The EXEC-TO-PLAN handoff scored 88 against work that is not in a commit. FIX: commit and open the PR before PLAN-TO-LEAD, then re-read the lint results.',
    },
    {
      id: 'SECDEF-LINT-BLIND-SPOT-2000-CHAR-WINDOW', severity: 'medium', type: 'harness_defect',
      note: 'INCIDENTAL, PRE-EXISTING, NOT introduced by this SD -- but it is the reason the secdef gate reads clean here, so it belongs with this verdict. scripts/lint/secdef-execute-revoke-lint.mjs extractSecdefFunctions() looks for SECURITY DEFINER only inside sql.slice(i, i + 2000) after the argument list. MEASURED distance from CREATE ... log_sd_mutation_audit() to its SECURITY DEFINER token: 2244 chars in the NEW migration and 2145 chars in the 20260802 original -- both OUTSIDE the window. extractSecdefFunctions() returns [] for both files, so the lint never classified this function as SECURITY DEFINER and never checked it for a missing REVOKE. Its "0 violations" is a gate that did not look, not a gate that passed. Generalizes to any SECURITY DEFINER function with a body longer than ~2000 chars, which is the norm for multi-branch trigger functions. Worth routing as its own harness item (the window should extend to the functions own body terminator, not a fixed char count).',
    },
    {
      id: 'NO-UNTRUSTED-INPUT-PATH', severity: 'info', type: 'security_cleared',
      note: 'Spoofing/injection question answered NO. (1) set_config("app.actor", $1, false) is PARAMETERIZED -- no SQL injection, and it is the only set_config(app.actor) call site in the repo. (2) x-actor-session appears in only the two factories, the migration, and tests -- git grep x-actor-session shows ZERO callers supplying it, so the caller-wins merge in withActorHeader is currently a dormant override, not a live vector. (3) No code path forwards inbound HTTP request headers wholesale into a Supabase client: the only header-forwarding construction is lib/middleware/api-auth.js:76, which forwards a single VALIDATED Authorization Bearer token; src/middleware/venture-scope.js and the webhook handlers read specific headers for their own logic and never build a client from them. (4) The identity sources are CLAUDE_SESSION_ID env, the local repo session pointer (lib/session-identity-sot.js readCurrentPointer), and LEO_ACTOR_ROLE_TAG env -- all operator/environment-controlled, none attacker-reachable. The ~90 out-of-scope direct createClient() sites simply carry no header and fall through to session_user, i.e. unchanged pre-fix behavior, which is a coverage gap by design and not a spoofing surface. CAVEAT for the record: this makes attribution ATTRIBUTABLE, not TAMPER-PROOF -- anyone who can set env vars in the process can choose the recorded actor. That is the correct threat model for an internal provenance ledger and matches how claim identity already works, but it should be stated rather than implied.',
    },
    {
      id: 'PREMISE-CONFIRMED-AT-VERIFY', severity: 'info', type: 'premise_verified',
      note: 'Re-confirmed the SD premise at VERIFY against live data: audit_log rows authored by trg_sd_mutation_audit carry EXACTLY 2 distinct created_by values -- authenticator (7877 rows) and postgres (34) -- with metadata.actor_source NULL on all of them. So 99.6% of all governed mutations recorded to date are PostgREST-originated and unattributable. Two consequences for the handoff wording. (a) FR-2 plus the request.headers tier, not FR-1, carry essentially all of the value; FR-1 covers 0.4% of historical volume. (b) That highest-value leg is the one with the weakest automated verification (PLAN spike only, live test inert, migration unapplied), which is the honest shape of the risk here.',
    },
    {
      id: 'CEREMONY-STATE-UNAPPLIED', severity: 'info', type: 'completion_criteria',
      note: 'Live state confirms nothing is applied yet and the SD should not claim otherwise: pg_proc has log_sd_mutation_audit (prosecdef=true, proconfig=null) and NO resolve_sd_mutation_audit_actor. The UP file header correctly carries @approved-by: <PENDING>. The tier classifier agrees the venue is right (classifyMigration -> tier 2, so chairman-gated is correct) though it returns reason "embedded_semicolon_ambiguity" where the file header asserts FORBIDDEN_TOPLEVEL -- same conclusion, different stated reason, worth a one-word header correction so a future reader does not inherit a wrong mechanism. Completion criteria should claim code + staged migration + _DOWN + tests landed, NOT that attribution is fixed, since mis-attribution continues until the ceremony applies the migration.',
    },
  ],
  recommendations: [
    'BLOCKING: commit the 624 staged insertions and open the PR before PLAN-TO-LEAD. Until then no diff-based lint has examined the new SQL (secdef lint literally reports "0 file(s) scanned") and the work is one hard reset from loss.',
    'Add SET search_path = public, pg_catalog to both CREATE OR REPLACE statements in the UP migration and to the _DOWN. CREATE OR REPLACE was MEASURED to reset proconfig, so without this the file silently undoes the pending 20260831 pin, while being the first version of this body to make an unqualified public-schema call inside a SECURITY DEFINER function.',
    'Add REVOKE EXECUTE ON FUNCTION public.resolve_sd_mutation_audit_actor() FROM PUBLIC, anon, authenticated to the UP migration. ALTER DEFAULT PRIVILEGES makes it anon-callable on creation, and 0 of 454 existing public non-trigger functions ship with a default ACL.',
    'Do both migration edits BEFORE the chairman ceremony, not after -- amending a chairman-approved DDL file is the expensive path, and the secdef allowlist already carries one entry apologising for exactly this sequence (SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001).',
    'Correct the UP header stated classifier reason from FORBIDDEN_TOPLEVEL to the actual verdict (embedded_semicolon_ambiguity). The venue conclusion is right; only the reason is wrong, and a correct instruction on a false reason propagates.',
    'State in the PLAN-TO-LEAD handoff that the live-DB tier test has never executed and is expected to need trigger-aware fixture work (57 enabled triggers on strategic_directives_v2; enforce_handoff_on_phase_transition is the likely blocker for its current_phase step). Do not count it as satisfied coverage.',
    'Consider the FR-6 residual guard (assert inet_server_port()=5432 or read the GUC back, else SET LOCAL). Optional now -- every measured path is session-mode -- but a future repoint to the :6543 transaction pooler would produce confidently WRONG attribution rather than none.',
    'Route the secdef-execute-revoke-lint 2000-char look-ahead blind spot as its own harness item. It is pre-existing and not this SD to fix, but it is why this gate reads green on a SECURITY DEFINER function it never classified.',
  ],
  metadata: {
    gate: 'GATE_4_PLAN_VERIFICATION',
    phase: 'VERIFY',
    session_id: process.env.CLAUDE_SESSION_ID || null,
    validated_model: 'Opus 5 (claude-opus-5[1m])',
    probe_method:
      'live pg via createDatabaseClient(engineer): pg_proc prosecdef/proconfig, pg_get_triggerdef, pg_trigger census, '
      + 'pg_constraint, information_schema.columns, pg_default_acl, has_function_privilege(anon/authenticated), '
      + 'audit_log created_by/actor_source cardinality; CREATE OR REPLACE -> proconfig reset proven on a throwaway function; '
      + 'migration helper body installed VERBATIM into pg_temp and driven through 10 adversarial inputs; '
      + 'pg_backend_pid + app.actor stability across 2 explicit transactions and 5 interleaved statements; '
      + 'vitest unit runs with CLAUDE_SESSION_ID unset (3 files/21 tests + 5 regression files/46 tests); '
      + 'secdef-execute-revoke-lint in --diff and --all modes plus direct extractSecdefFunctions() instrumentation; '
      + 'migration-tier-classifier on the new file; git index/commit/PR state; repo-wide grep for header-forwarding sinks',
    frs_verified: ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5', 'FR-6'],
    frs_fully_met: ['FR-1', 'FR-2', 'FR-6'],
    frs_met_with_corrections: ['FR-3'],
    frs_met_partially: ['FR-4', 'FR-5'],
    unit_tests_passed: 21,
    unit_test_files: 3,
    regression_tests_passed: 46,
    live_tier_tests_executed: 0,
    adversarial_sql_inputs_proven_safe: 10,
    staged_insertions_uncommitted: 624,
    commits_ahead_of_main: 0,
    open_prs: 0,
    triggers_on_sd_table: 57,
    public_nontrigger_fns_with_default_acl_before: 0,
    public_nontrigger_fns_total: 454,
    trigger_rows_unattributable_pct: 99.6,
    secdef_lint_window_chars: 2000,
    secdef_lint_measured_distance_chars: 2244,
    pooler_port_measured: 5432,
    blockers: ['WORK-STAGED-NEVER-COMMITTED'],
    must_fix_before_ceremony: ['MIGRATION-WIPES-SEARCH-PATH-PIN', 'HELPER-FN-DEFAULT-ACL-ANON-CALLABLE'],
    incidental_harness_findings: ['SECDEF-LINT-BLIND-SPOT-2000-CHAR-WINDOW'],
    not_reproduced_by_validator: [
      'FR-5 end-to-end PostgREST request.headers -> trigger read (would require creating a probe table+trigger on the production project; PLAN spike evidence accepted)',
    ],
    duplicate_work_found: 0,
    untrusted_input_paths_found: 0,
  },
};

const supabase = createSupabaseServiceClient();
const { data: sdRow } = await supabase.from('strategic_directives_v2')
  .select('target_application').eq('id', SD).maybeSingle();
const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: sdRow?.target_application || null,
  subAgentCode: 'VALIDATION',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'lib/db-actor-identity.js',
  supabase,
});
console.log('RESOLUTION:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

const stored = await storeSubAgentResults(
  'VALIDATION', SD, { name: 'Principal Systems Analyst' }, results, { sdKey: SD_KEY, phase: 'VERIFY' },
);
console.log('\nSTORED:', JSON.stringify(stored)?.slice(0, 500));
console.log('FINAL VERDICT:', results.verdict, '| confidence:', results.confidence_score,
  '| repo_resolved:', results.metadata.repo_resolved, '| repo_path:', results.metadata.repo_path);
