import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';
const CMD = 'npx vitest run --project unit lib/integrations/google/ lib/michael/ scripts/michael/ server/routes/michael.test.js lib/integrations/youtube/oauth-manager.test.js server/middleware/auth.test.js';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  execution_time_ms: 1100,
  validation_mode: 'retrospective',
  summary:
    'MEASURED at EXEC on daf75d6dfd7. The mandated command ran 12 files / 150 tests, 150 passed, 0 failed, 0 skipped '
    + '(vitest 4.1.4, runner artifact sha256 d315768d...). Two supplementary tiers also green from their own runner '
    + 'artifacts: the remainder of the PLAN baseline (server/routes/protocol-lint + fleet-sessions, 38 tests) and the '
    + 'TS-10 regression tier lib/security (53 tests). Combined 241 tests across 17 files, zero failures. The PLAN '
    + 'baseline of 159 tests reproduces exactly (121 in-command + 38 out-of-command), so no baseline test regressed and '
    + 'the four new files add 29 tests. eslint exits 0 with no output over all 10 shipped paths; '
    + 'count-truncation-diff-lint reports 0 new needs-review select() sites. All four SD smoke steps behave as '
    + 'specified. 15 of the 16 PLAN exec_test_checklist items are verified by a shipped assertion; item 9 is not. '
    + 'CONDITIONAL_PASS, not PASS, for three reasons named below: the AC-3 workflow static-scan leg shipped no '
    + 'automated guard, the AC-7 SECURITY row for phase EXEC does not exist yet, and PRD TS-3/TS-5 text is now stale '
    + 'against the shipped (review-corrected) semantics.',

  critical_issues: [],

  warnings: [
    {
      id: 'TEST-C1',
      severity: 'MEDIUM',
      issue: 'AC-3 second leg has no automated test: nothing guards against a workflow later referencing the three env names',
      evidence:
        'PLAN exec_test_checklist item 9 required "a static scan asserting no file under .github/workflows references '
        + 'MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET". No such test shipped: grep for the string '
        + '"workflows" across lib/integrations/google/, lib/michael/, scripts/michael/ and server/routes/michael.test.js '
        + 'returns zero files. I verified the PROPERTY holds today by direct measurement - grep -rn for all three names '
        + 'across .github/workflows/ returns zero matches - so AC-3 is satisfied at daf75d6dfd7. What is missing is the '
        + 'regression guard. AC-3 is the criterion that keeps the chairman host key out of CI, and it is now protected '
        + 'only by the runtime venue refusal (which IS tested, both GITHUB_ACTIONS and CI variants), not by anything '
        + 'preventing a secret from being added to a workflow in the first place.',
      location: '.github/workflows/ (unguarded); PLAN row cd6df38e exec_test_checklist item 9',
      recommendation:
        'Add the ~8-line static scan to lib/integrations/google/chairman-oauth.test.js: readdir .github/workflows, read '
        + 'each file, assert none matches /MICHAEL_ENCRYPTION_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/. Cheap, hermetic, '
        + 'and it is the only leg of AC-3 a runtime guard cannot cover.',
    },
    {
      id: 'TEST-C2',
      severity: 'HIGH',
      issue: 'AC-7 is not satisfied: no SECURITY sub_agent_execution_results row exists for phase EXEC',
      evidence:
        'Queried sub_agent_execution_results for sd_id 591400cf-7b88-4974-832a-6043e4f59152: the newest 13 rows are all '
        + 'phase LEAD, PLAN_PRD or PLAN. The only SECURITY rows are 5f31b9b9 (phase PLAN, CONDITIONAL_PASS) and 05068c1a '
        + '(phase PLAN_PRD, CONDITIONAL_PASS), both evaluated at 9126e8903f2 - the commit BEFORE either child-C PR '
        + 'merged. AC-7 requires a SECURITY row with content_hash, session_id and evaluated_commit_sha for phase EXEC '
        + 'before EXEC-TO-PLAN. The second leg of AC-7 IS satisfied and I measured it: the five child-C commits '
        + '(f8bdfe8fce9, 502ff1381be, 80e2542971b, 0742fb2b89e, 38ed02b98c9) touch exactly the 10 declared files and '
        + 'zero .sql or migration paths. This is outside TESTING authorship - recorded, not fixed here.',
      location: 'sub_agent_execution_results; PRD acceptance criterion 7',
      recommendation:
        'Spawn the SECURITY sub-agent for phase EXEC against daf75d6dfd7 before running handoff.js execute '
        + 'EXEC-TO-PLAN. A gate reading AC-7 will otherwise find the criterion unmet.',
    },
    {
      id: 'TEST-C3',
      severity: 'LOW',
      issue: 'PRD TS-5 and TS-3 text is stale: the shipped tests assert different (review-corrected) semantics',
      evidence:
        'TS-5 in the PRD says a successful refresh gives "the row a new expires_at and last_refreshed_at and last_error '
        + 'null". The shipped test at chairman-oauth.test.js asserts the opposite for the first field: '
        + 'expect(sb.writes[0].payload).not.toHaveProperty("expires_at") with the inline comment "grant expiry is '
        + 'stamped at consent only". That is a deliberate correction from adversarial review round 1 (commit 502ff1381be, '
        + '"grant expiry, state compare, last_error write") - expires_at tracks the refresh-token GRANT expiry, which a '
        + 'mere access-token refresh must not extend. The shipped behaviour is the safer one and AC-2/AC-5 are unaffected. '
        + 'TS-3 similarly says the result "is { error: KEY_FINGERPRINT_MISMATCH }" while the shipped test asserts a coded '
        + 'THROW; AC-2 only requires the comparison happen before decrypt with that code, which it does. Both are doc '
        + 'drift, not defects.',
      location: 'PRD test_scenarios TS-3, TS-5 vs lib/integrations/google/chairman-oauth.test.js',
      recommendation:
        'Amend the PRD TS-3 and TS-5 "then" clauses to match the shipped semantics so a later reader does not treat the '
        + 'green suite as diverging from spec. No code change.',
    },
    {
      id: 'TEST-C4',
      severity: 'LOW',
      issue: 'Two narrow assertion gaps inside otherwise-covered scenarios',
      evidence:
        '(a) PLAN checklist item 2 asked for MICHAEL_ENCRYPTION_KEY_INVALID on 63-hex, 65-hex AND non-hex. The shipped '
        + 'test covers 63-hex ("ab".repeat(31)+"a") and non-hex ("zz".repeat(32)); the 65-hex over-length case is not '
        + 'asserted. The empty-string-maps-to-_MISSING normalisation that smoke step 1 depends on IS asserted '
        + '(readHostKey({ MICHAEL_ENCRYPTION_KEY: "" }) throws _MISSING). (b) TS-8 requires "importing the module with no '
        + 'env does not throw". There is no explicit assertion; the property is exercised implicitly because '
        + 'gmail-client.test.js imports the module statically at load, so a throw would fail the whole file. Effective '
        + 'coverage, weak intent.',
      location: 'lib/integrations/google/chairman-oauth.test.js:48-49; lib/michael/gmail-client.test.js:3',
      recommendation:
        'Add the 65-hex case to the existing INVALID it() (one line) and an explicit await import() assertion for the '
        + 'no-env import in gmail-client.test.js.',
    },
    {
      id: 'TEST-C5',
      severity: 'LOW',
      issue: 'The e2e tier did NOT run and is not applicable - stated explicitly rather than implied',
      evidence:
        'Child-C ships no UI. The 10 changed files are a library module, a Gmail client, a CLI, one Express route, one '
        + 'mount line and one export line, all inside EHG_Engineer. There is no EHG (port 8080) surface in the diff, so '
        + 'playwright-uat.config.js and the EHG repo suites have nothing to exercise. No e2e run was attempted and no e2e '
        + 'result is claimed anywhere in this row. The /oauth/status route is covered at the integration tier by '
        + 'server/routes/michael.test.js (3 tests, handler invocation plus a mount-table read).',
      location: 'PRD scope; server/routes/michael.test.js',
      recommendation:
        'Do not open an e2e condition for child-C. If a chairman-facing OAuth status panel is later built on top of '
        + '/api/michael, e2e becomes applicable at that point, not now.',
    },
  ],

  recommendations: [
    'Accept the test tier. 241 tests across 17 files are green from three runner-written artifacts with sha256s on the '
    + 'row, the full PLAN baseline of 159 reproduces exactly, and both lint legs are clean.',
    'Before EXEC-TO-PLAN, spawn SECURITY for phase EXEC (TEST-C2). It is the one acceptance criterion this row '
    + 'measures as unmet, and TESTING cannot author it.',
    'Add the workflows static scan (TEST-C1). It is the only unguarded leg of the criterion that keeps the host key out '
    + 'of CI.',
    'Amend PRD TS-3/TS-5 to the shipped semantics (TEST-C3) so the divergence is recorded as intentional.',
    'Read the four smoke results as behavioural evidence, not just exit codes: refusal ORDER is what smoke step 2 '
    + 'proves, since GITHUB_ACTIONS=true returned HOST_VENUE_REQUIRED while the host key was also absent - venue wins, '
    + 'as the shipped refusal-order test asserts.',
  ],

  detailed_analysis: [
    'TESTING at EXEC for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C, evaluated at daf75d6dfd7 in the child-C',
    'worktree. Every number below came from a runner-written JSON artifact whose sha256 is on this row; none was',
    'typed from a terminal summary.',
    '',
    'TEST EXECUTION. The mandated command produced 12 files / 150 tests, all passing, 0 skipped. Per file:',
    'chairman-oauth 18, youtube/oauth-manager 12, michael/db 11, michael/rules 21, michael/gmail-client 3,',
    'server/middleware/auth 20, server/routes/michael 3, scripts/michael act 14, autonomy-read 18, google-consent 5,',
    'retention 7, verbs 18. The PLAN baseline row (cd6df38e) measured 10 files / 159 tests; two of those files',
    '(server/routes/protocol-lint 17, server/routes/fleet-sessions 21) fall outside the mandated command because it',
    'targets server/routes/michael.test.js specifically rather than the whole directory. I ran them separately: 2',
    'files / 38 tests, all green. 121 in-command baseline tests + 38 out-of-command = 159, matching the PLAN baseline',
    'exactly, so no baseline test regressed and the arithmetic closes: 121 + 29 new = 150. The TS-10 regression tier',
    'lib/security is 1 file / 53 tests, all green, and the default export of encryption.cjs is still',
    'new CredentialEncryption() with the class attached as a named property on line 250 - the singleton contract is',
    'intact and the diff to that file is exactly the 3 added lines (1 export + 2 comment).',
    '',
    'CHECKLIST. 15 of 16 PLAN exec_test_checklist items map to a shipped, passing assertion. Item 1 (TS-1) is covered',
    'by a test that deletes the key rather than assuming absence, across storeTokens, getStoredTokens and',
    'runConsentFlow. Item 3 is covered by "HostKeyEncryption never touches .leo-keys and memoizes the key". Item 8 is',
    'covered with both the GITHUB_ACTIONS and CI variants in one it(). Item 12 (pre-flight ORDER) shipped as an',
    'explicit describe, "refusal order: venue, key, client, table - all before consent", which is stronger than the',
    'checklist asked for. Item 14 (TS-9) covers all four legs and additionally asserts requireAdminRole. Item 9 is the',
    'single miss and is written up as TEST-C1.',
    '',
    'LINT. eslint over all 10 shipped paths exits 0 with zero output. count-truncation-diff-lint reports 0 new',
    'needs-review select() sites across 0 changed files - consistent with commit 0742fb2b89e, which bounded the upsert',
    'read with maybeSingle() for exactly this lint.',
    '',
    'SMOKE. Four steps, all as specified. (1) Empty MICHAEL_ENCRYPTION_KEY with --status --json exits 2 and emits',
    'refusal MICHAEL_ENCRYPTION_KEY_MISSING with a remediation message that explicitly says never add it to GHA',
    'secrets. (2) GITHUB_ACTIONS=true with --json exits 2 and emits HOST_VENUE_REQUIRED citing ratification 0daf3bd8 -',
    'and notably the host key was ALSO absent in that invocation, so this measures the refusal ORDER, not just the',
    'venue check. (3) gmail-act --thread smoke --archive --dry-run --json exits 0 with dry_run:true, would_call',
    '{threadId, addLabelIds:[], removeLabelIds:["INBOX"]} and a would_write block; no GMAIL_CLIENT_ABSENT anywhere,',
    'which is the discriminator the PLAN row warned about since would_call alone is emitted in both the pre-fix and',
    'post-fix states. (4) grep -n for the mount string in server/index.js returns exactly one line, 274:',
    'app.use("/api/michael", requireAuth, requireAdminRole, michaelRoutes) - one mount, both guards, same line.',
    '',
    'ACCEPTANCE CRITERIA. AC-1 covered by TS-2 (real AES-256-GCM write, no token property, no fixture string). AC-2',
    'covered by TS-1/TS-2/TS-3 plus the INVALID and known-answer-fingerprint tests, closing the PARTIAL the PLAN',
    'coverage map recorded, with the narrow 65-hex gap in TEST-C4. AC-3 first leg covered (both venue variants),',
    'second leg holds by measurement but is unguarded - TEST-C1. AC-4 covered by TS-7 plus the --status non-secret',
    'rendering test, closing that PARTIAL. AC-5 covered by TS-8 and smoke step 3. AC-6 covered by TS-9 including the',
    'mount-table read. AC-7 first leg NOT met - TEST-C2; second leg met and measured (10 files, zero migrations).',
    'AC-8 covered: TS-11 asserts 127.0.0.1 binding before the browser opens, state mismatch answered 400 with getToken',
    'never called, and the PKCE verifier reaching getToken; TS-12 asserts TRASH and SPAM refused before any API call;',
    'requireAdminRole is asserted by TS-9; and oauthHealth has its own describe covering five row shapes.',
    '',
    'TEST SCENARIOS. TS-1 through TS-12 all have at least one shipped, passing assertion. TS-3 and TS-5 ship with',
    'semantics that differ from the PRD text in ways that are review-driven improvements, written up as TEST-C3.',
    '',
    'BOUNDARY. No e2e ran and none is claimed - see TEST-C5. This row certifies the unit and integration tiers on',
    'EHG_Engineer only.',
    '',
    'VERDICT RATIONALE. CONDITIONAL_PASS. The implementation tier is genuinely strong: zero failures anywhere, the',
    'baseline reproduces to the test, both lint legs clean, all four smoke behaviours correct, and the new tests are',
    'well-targeted rather than ceremonial - several (refusal order, known-answer fingerprint over raw bytes, granted-',
    'vs-requested scopes, TRASH/SPAM refusal) exceed what the PRD asked for. It is not a clean PASS because AC-7 is',
    'measurably unmet at the time of writing and one checklist item that PLAN called for did not ship.',
  ].join('\n'),

  conditions: [
    {
      action:
        'TEST-C2 (BLOCKING): spawn SECURITY for phase EXEC against daf75d6dfd7 and land the row before running '
        + 'handoff.js execute EXEC-TO-PLAN. AC-7 is otherwise unmet - the only SECURITY rows are phase PLAN/PLAN_PRD at '
        + 'the pre-merge commit 9126e8903f2.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'TEST-C1: add the .github/workflows static scan to chairman-oauth.test.js asserting no workflow references '
        + 'MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. The property holds today by measurement; '
        + 'this is the missing regression guard for AC-3.',
      priority: 'high',
      blocking: false,
    },
    {
      action:
        'TEST-C3: amend PRD TS-3 and TS-5 "then" clauses to the shipped semantics (coded throw; expires_at is the '
        + 'consent-time grant expiry and is deliberately absent from the refresh upsert).',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'TEST-C4: add the 65-hex over-length MICHAEL_ENCRYPTION_KEY_INVALID case and an explicit no-env import '
        + 'assertion for gmail-client.mjs.',
      priority: 'low',
      blocking: false,
    },
  ],

  justification:
    'CONDITIONAL_PASS recorded by TESTING at EXEC for child-C, measured at daf75d6dfd7. 241 tests across 17 files are '
    + 'green with zero failures, taken from three runner-written vitest JSON artifacts whose sha256s are carried in this '
    + 'row rather than from terminal summaries. The full PLAN baseline of 159 tests reproduces exactly once the two '
    + 'out-of-command route files are run separately, so nothing child-C shipped regressed an existing test. eslint and '
    + 'count-truncation-diff-lint are both clean over all 10 shipped paths, and all four SD smoke steps produce the '
    + 'specified codes and exits, including the refusal-order discrimination in step 2 and the dry_run:true / no '
    + 'GMAIL_CLIENT_ABSENT discrimination in step 3. Fifteen of the sixteen PLAN exec_test_checklist items are '
    + 'discharged by a shipped assertion, and acceptance criteria AC-1, AC-2, AC-4, AC-5, AC-6 and AC-8 are fully '
    + 'covered, with all twelve PRD scenarios exercised. It is conditional rather than passing on two counts. AC-7 is '
    + 'measurably unmet: no SECURITY row exists for phase EXEC, only phase PLAN and PLAN_PRD rows evaluated at the '
    + 'pre-merge commit, and TESTING cannot author that evidence. And PLAN checklist item 9, the static scan keeping '
    + 'the host key out of GitHub Actions workflows, did not ship - the property holds today by direct measurement '
    + '(zero matches across .github/workflows) but nothing guards it against regression, which matters because that '
    + 'scan is the one leg of AC-3 the runtime venue refusal cannot cover. No e2e tier ran and none is claimed: child-C '
    + 'ships no UI, only EHG_Engineer library, CLI and API surface.',

  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: 150,
      passed: 150,
      failed: 0,
      skipped: 0,
      runner: 'vitest 4.1.4 --project unit',
      artifactPath: '.artifacts/testing-exec-c/vitest-results.json',
      artifactSha: 'd315768d0ed8bdd32e1566c232b48d0108a39e6823228f7f9823cd78f06fa1ef',
      source: 'fresh',
    }),
    command: CMD,
    test_files_total: 12,
    test_files_passed: 12,
    test_files_failed: 0,
    per_file: [
      { file: 'lib/integrations/google/chairman-oauth.test.js', tests: 18, status: 'pass', new_in_child_c: true },
      { file: 'lib/michael/gmail-client.test.js', tests: 3, status: 'pass', new_in_child_c: true },
      { file: 'scripts/michael/google-consent.test.js', tests: 5, status: 'pass', new_in_child_c: true },
      { file: 'server/routes/michael.test.js', tests: 3, status: 'pass', new_in_child_c: true },
      { file: 'lib/integrations/youtube/oauth-manager.test.js', tests: 12, status: 'pass', new_in_child_c: false },
      { file: 'lib/michael/db.test.js', tests: 11, status: 'pass', new_in_child_c: false },
      { file: 'lib/michael/rules.test.js', tests: 21, status: 'pass', new_in_child_c: false },
      { file: 'server/middleware/auth.test.js', tests: 20, status: 'pass', new_in_child_c: false },
      { file: 'scripts/michael/act.test.js', tests: 14, status: 'pass', new_in_child_c: false },
      { file: 'scripts/michael/autonomy-read.test.js', tests: 18, status: 'pass', new_in_child_c: false },
      { file: 'scripts/michael/retention.test.js', tests: 7, status: 'pass', new_in_child_c: false },
      { file: 'scripts/michael/verbs.test.js', tests: 18, status: 'pass', new_in_child_c: false },
    ],
    additional_test_tiers: [
      {
        tier: 'PLAN-baseline remainder (files outside the mandated command)',
        command: 'npx vitest run --project unit server/routes/protocol-lint.test.js server/routes/fleet-sessions.test.js',
        files: 2, executed: 38, passed: 38, failed: 0,
        artifact_path: '.artifacts/testing-exec-c/vitest-baseline-rest.json',
        artifact_sha: '06e7c0760adc4bd071dffdd924630b53f5d7dbff62fc5100ae4a95e0d4968a99',
      },
      {
        tier: 'TS-10 regression (lib/security)',
        command: 'npx vitest run --project unit lib/security/',
        files: 1, executed: 53, passed: 53, failed: 0,
        artifact_path: '.artifacts/testing-exec-c/vitest-security.json',
        artifact_sha: 'fff03611cdafd865fa1c4745f7bfde978b8676d2cb667e1263b0879e347eea51',
      },
    ],
    combined_measured_totals: { files: 17, executed: 241, passed: 241, failed: 0, skipped: 0 },
    plan_baseline_reconciliation: {
      plan_row: 'cd6df38e-07bc-44fd-8987-9f1a5bd29949',
      plan_baseline: '10 files / 159 tests, 0 failures, at 9126e8903f2',
      in_mandated_command: 121,
      out_of_command_rerun_separately: 38,
      sum: 159,
      new_child_c_tests: 29,
      verdict: 'baseline reproduces exactly; zero regressions introduced by child-C',
    },
    lint_execution: {
      eslint: {
        command: 'npx eslint lib/integrations/google/ lib/michael/ scripts/michael/google-consent.mjs scripts/michael/google-consent.test.js server/routes/michael.js server/routes/michael.test.js server/index.js',
        exit_code: 0, output: '(empty)', status: 'clean',
      },
      count_truncation_diff_lint: {
        command: 'node scripts/lint/count-truncation-diff-lint.mjs',
        exit_code: 0,
        output: '0 new needs-review select() site(s) across 0 changed file(s)',
        status: 'clean',
      },
    },
    smoke_execution: [
      {
        step: 1,
        command: 'MICHAEL_ENCRYPTION_KEY= node scripts/michael/google-consent.mjs --status --json',
        exit_code: 2, refusal: 'MICHAEL_ENCRYPTION_KEY_MISSING', expected: 'exit 2 MICHAEL_ENCRYPTION_KEY_MISSING', result: 'PASS',
      },
      {
        step: 2,
        command: 'GITHUB_ACTIONS=true node scripts/michael/google-consent.mjs --json',
        exit_code: 2, refusal: 'HOST_VENUE_REQUIRED', expected: 'exit 2 HOST_VENUE_REQUIRED', result: 'PASS',
        note: 'the host key was also absent in this invocation, so this measures refusal ORDER (venue before key), not the venue check alone',
      },
      {
        step: 3,
        command: 'node scripts/michael/gmail-act.mjs --thread smoke --archive --dry-run --json',
        exit_code: 0, output_keys: ['ok', 'dry_run', 'would_call', 'would_write'],
        expected: 'dry_run:true and no GMAIL_CLIENT_ABSENT', result: 'PASS',
      },
      {
        step: 4,
        command: 'grep -n "/api/michael" server/index.js',
        matches: 1,
        line: '274:app.use("/api/michael", requireAuth, requireAdminRole, michaelRoutes);',
        expected: 'exactly one guarded mount', result: 'PASS',
      },
    ],
    acceptance_criteria_coverage: [
      { ac: 'AC-1 no plaintext token written to michael_credentials', status: 'COVERED', scenarios: ['TS-2'],
        note: 'real AES-256-GCM write; asserts no token property and no fixture string in the serialized payload' },
      { ac: 'AC-2 key only from MICHAEL_ENCRYPTION_KEY, named refusals, no key generated, fingerprint stamped and compared', status: 'COVERED', scenarios: ['TS-1', 'TS-2', 'TS-3'],
        note: 'PLAN PARTIAL closed: _INVALID (63-hex, non-hex) and empty-string-to-_MISSING now asserted, plus known-answer fingerprint over raw bytes and a never-touches-.leo-keys test. Residual: 65-hex over-length untested (TEST-C4).' },
      { ac: 'AC-3 GITHUB_ACTIONS/CI refuses HOST_VENUE_REQUIRED; no workflow references the three env names', status: 'PARTIAL', scenarios: ['TS-6'],
        gaps: ['the workflow static-scan leg shipped no test (TEST-C1); property measured true today, unguarded against regression'],
        note: 'PLAN PARTIAL on the CI=true variant is closed - both variants asserted in one it().' },
      { ac: 'AC-4 google-consent.mjs is the whole runbook; TABLES_ABSENT before the browser; --status non-secret only', status: 'COVERED', scenarios: ['TS-7'],
        note: 'PLAN PARTIAL closed: --status rendering asserted to carry no blob or metadata and to include hours_to_expiry, plus an explicit refusal-order describe.' },
      { ac: 'AC-5 gmail-act --dry-run no longer refuses GMAIL_CLIENT_ABSENT; modifyThread maps and returns ok/modified or ok:false/error', status: 'COVERED', scenarios: ['TS-8'],
        note: 'discriminated on dry_run===true and absence of GMAIL_CLIENT_ABSENT in smoke step 3, per the PLAN warning about would_call being emitted in both states.' },
      { ac: 'AC-6 /api/michael mounted with requireAuth proven by a mount-table read; /oauth/status returns no blob fields', status: 'COVERED', scenarios: ['TS-9'],
        note: 'mount asserted exactly once with requireAuth AND requireAdminRole on the same line; status payload key set asserted exhaustively.' },
      { ac: 'AC-7 SECURITY EXEC row with provenance before EXEC-TO-PLAN; no migration in the diff', status: 'NOT_MET', scenarios: [],
        gaps: ['no SECURITY row for phase EXEC exists (TEST-C2)'],
        note: 'second leg MEASURED and satisfied: the five child-C commits touch exactly 10 files, zero .sql or migration paths.' },
      { ac: 'AC-8 loopback+state+PKCE S256; TRASH/SPAM refused; requireAdminRole; oauthHealth single predicate', status: 'COVERED', scenarios: ['TS-11', 'TS-12', 'TS-9'],
        note: 'TS-11 asserts 127.0.0.1 bind before browser open, 400 on state mismatch with getToken never called, verifier reaching getToken, and EADDRINUSE as REDIRECT_PORT_IN_USE; oauthHealth has its own describe over five row shapes.' },
    ],
    test_scenario_coverage: {
      covered: ['TS-1', 'TS-2', 'TS-3', 'TS-4', 'TS-5', 'TS-6', 'TS-7', 'TS-8', 'TS-9', 'TS-10', 'TS-11', 'TS-12'],
      uncovered: [],
      semantics_diverge_from_prd_text: [
        'TS-3 (coded throw, not a returned error object)',
        'TS-5 (expires_at deliberately absent from the refresh upsert; it is the consent-time grant expiry)',
      ],
    },
    exec_checklist_status: {
      source_row: 'cd6df38e-07bc-44fd-8987-9f1a5bd29949',
      total: 16, verified: 15, not_shipped: 1,
      not_shipped_detail: 'item 9 - .github/workflows static scan for MICHAEL_ENCRYPTION_KEY / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (TEST-C1)',
    },
    e2e_tier: {
      applicable: false,
      ran: false,
      reason: 'Child-C ships no UI. All 10 changed files are EHG_Engineer library, CLI, Express route, mount line and export line. No EHG (port 8080) surface in the diff, so playwright-uat.config.js has nothing to exercise. No e2e result is claimed anywhere in this row.',
    },
    diff_scope_measured: {
      commits: ['f8bdfe8fce9', '502ff1381be', '80e2542971b', '0742fb2b89e', '38ed02b98c9'],
      files: [
        'lib/integrations/google/chairman-oauth.js', 'lib/integrations/google/chairman-oauth.test.js',
        'lib/michael/gmail-client.mjs', 'lib/michael/gmail-client.test.js',
        'lib/security/encryption.cjs', 'scripts/michael/google-consent.mjs', 'scripts/michael/google-consent.test.js',
        'server/index.js', 'server/routes/michael.js', 'server/routes/michael.test.js',
      ],
      migrations: 0,
      encryption_cjs_delta: '3 lines added (1 export of CredentialEncryption + 2 comment lines); default export still new CredentialEncryption()',
    },
    workflow_secret_scan: {
      command: 'grep -rn "MICHAEL_ENCRYPTION_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET" .github/workflows/',
      matches: 0,
      verdict: 'AC-3 second leg holds at daf75d6dfd7 by direct measurement, but is not guarded by any test',
    },
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C',
    parent_sd: 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002',
    prior_testing_row: 'cd6df38e-07bc-44fd-8987-9f1a5bd29949 (phase PLAN, CONDITIONAL_PASS, carried the 16-item exec_test_checklist)',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD,
  { name: 'QA Engineering Director', code: 'TESTING' },
  results,
  { phase: 'EXEC', sdKey: SD },
);
console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
