#!/usr/bin/env node
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';

const findings = [
  {
    id: 'ts-1-host-fragile-unset-key',
    severity: 'HIGH',
    summary: "TS-1 says 'MICHAEL_ENCRYPTION_KEY is unset'. Measured: .env in this repo already carries GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (names read, values never), and vitest.config.js's own comment block records that a module calling dotenv.config() at module scope repopulates process.env from .env inside a unit test. The moment the chairman provisions MICHAEL_ENCRYPTION_KEY per the FR-4 runbook, a TS-1 that merely assumes absence starts passing in CI and FAILING on the chairman host. Required: TS-1 must actively delete or stub the var, and chairman-oauth.js and gmail-client.mjs must not call dotenv at module scope (FR-2 nothing-runs-at-import already forbids it; make it an asserted test, not an assumption). tests/setup.unit.js:140-147 snapshots and restores process.env per test, so stubbing is safe."
  },
  {
    id: 'ac-2-invalid-key-shape-untested',
    severity: 'HIGH',
    summary: 'Acceptance criterion 2 names two refusals, MICHAEL_ENCRYPTION_KEY_MISSING and MICHAEL_ENCRYPTION_KEY_INVALID (FR-2). No test scenario covers _INVALID; TS-1 covers only the absent case. A 63-hex, a 65-hex, a non-hex and an empty-string key each need a case, and the empty-string case is load-bearing: SD smoke step 2 runs the CLI with MICHAEL_ENCRYPTION_KEY set to empty (present but falsy, not absent) and expects _MISSING, so the implementation must normalise falsy to MISSING rather than routing empty through the shape check to _INVALID.'
  },
  {
    id: 'ac-2-no-key-generation-untested',
    severity: 'HIGH',
    summary: 'Acceptance criterion 2 says no key is ever generated, and FR-2 says HostKeyEncryption never calls the inherited self-generating method and never touches .leo-keys. No test scenario asserts either clause. Required: a test that spies on the inherited getMasterKey/generate path and asserts it is never invoked, plus an assertion that no .leo-keys file is read or created during a HostKeyEncryption run. Without it the clause is unfalsifiable: an implementation that silently fell back to the parent self-generating key would still produce real AES-256-GCM ciphertext and would pass TS-2, TS-3 and every other scenario.'
  },
  {
    id: 'ac-3-ci-true-and-workflow-scan-untested',
    severity: 'MEDIUM',
    summary: 'Acceptance criterion 3 has two legs. TS-6 covers only GITHUB_ACTIONS=true; the CI=true leg named in FR-2 has no scenario. The second leg, no workflow references MICHAEL_ENCRYPTION_KEY or GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET, has no scenario at all. It is a cheap static repo-scan test in exactly the pattern TS-9 already uses for the server/index.js mount table: read .github/workflows and assert none of the three names appears.'
  },
  {
    id: 'ac-4-status-non-secret-output-untested',
    severity: 'MEDIUM',
    summary: 'Acceptance criterion 4 clause "--status shows non-secret columns only" has no test scenario. TS-9 asserts the HTTP route payload omits encrypted_blob and encryption_metadata, but the CLI --status output is a separate surface with a separate leak path and its own field set per FR-4. Required: a test that drives the --status --json path against an injected client whose row carries an encrypted_blob and asserts the emitted object has neither encrypted_blob nor encryption_metadata.'
  },
  {
    id: 'ts-8-non-discriminating-dry-run-assertion',
    severity: 'MEDIUM',
    summary: 'Measured at scripts/michael/gmail-act.mjs:55-56: the current GMAIL_CLIENT_ABSENT refusal ALREADY returns would_call, and it is emitted BEFORE the --dry-run branch. So an EXEC test asserting only that would_call is present passes identically in the pre-fix and post-fix states, and SD smoke step 4 expected outcome is discriminating only on its dry_run:true half. The assertion must key on dry_run === true and on the ABSENCE of the GMAIL_CLIENT_ABSENT code, never on would_call alone.'
  },
  {
    id: 'ac-7-process-criterion-no-test-owner',
    severity: 'LOW',
    summary: 'Acceptance criterion 7 (a SECURITY sub_agent_execution_results row for phase EXEC carrying content_hash, session_id and evaluated_commit_sha, created before the EXEC-TO-PLAN handoff row, and a diff containing no migration) has no test scenario and correctly cannot have one. It is a gate and process criterion. Flagged so it is carried as an explicit EXEC checklist item rather than assumed covered by TS-1 through TS-10: nothing in the scenario set asserts it.'
  },
  {
    id: 'smoke-steps-posix-only',
    severity: 'MEDIUM',
    summary: 'SD smoke steps 2 and 3 use POSIX env-prefix syntax and step 4 uses && chaining with nested single quotes inside double quotes. This session primary shell is PowerShell, where all three forms are invalid. The steps are executable as written only under bash or Git Bash. Either annotate them bash-only or add PowerShell equivalents using $env: assignment. Not a blocker, but a verbatim paste into the default shell fails for a reason unrelated to the code under test.'
  },
  {
    id: 'smoke-step-1-empty-filter-pre-exec',
    severity: 'LOW',
    summary: 'Smoke step 1 filter includes lib/integrations/google/, which does not exist at PLAN time. The unit project in vitest.config.js does not set passWithNoTests (only the db and smoke projects do), so the command errors before EXEC lands the directory. This is correct post-EXEC behaviour and is recorded only so a pre-EXEC run of the smoke step is not misread as a defect.'
  }
];

const acceptance_criteria_coverage = [
  {
    ac: 'AC-1 no plaintext token is ever written to michael_credentials',
    scenarios: ['TS-2'],
    status: 'COVERED',
    note: 'TS-2 pins algorithm aes-256-gcm and asserts the fixture strings and every token key are absent from the serialized payload, mirroring the precedent assertion at lib/integrations/youtube/oauth-manager.test.js:69.'
  },
  {
    ac: 'AC-2 master key only from MICHAEL_ENCRYPTION_KEY, named refusals, no key generated, fingerprint stamped on write and compared before decrypt',
    scenarios: ['TS-1', 'TS-2', 'TS-3'],
    status: 'PARTIAL',
    gaps: [
      'MICHAEL_ENCRYPTION_KEY_INVALID (malformed, wrong length, non-hex, empty string) has no scenario',
      'no-key-generation and never-touches-.leo-keys have no scenario'
    ]
  },
  {
    ac: 'AC-3 GITHUB_ACTIONS or CI refuses HOST_VENUE_REQUIRED, and no workflow references the three env names',
    scenarios: ['TS-6'],
    status: 'PARTIAL',
    gaps: [
      'CI=true variant untested (TS-6 sets only GITHUB_ACTIONS)',
      'the workflow static-scan leg has no scenario'
    ]
  },
  {
    ac: 'AC-4 google-consent.mjs is the whole runbook, refuses TABLES_ABSENT before the browser, --status shows non-secret columns only',
    scenarios: ['TS-7'],
    status: 'PARTIAL',
    gaps: ['--status non-secret-columns-only output has no scenario']
  },
  {
    ac: 'AC-5 gmail-act --dry-run no longer refuses GMAIL_CLIENT_ABSENT, modifyThread maps and returns ok/modified or ok:false/error',
    scenarios: ['TS-8'],
    status: 'COVERED',
    note: 'Covered, but the assertion must discriminate on dry_run===true and the absence of GMAIL_CLIENT_ABSENT; would_call alone is emitted in both the pre-fix and post-fix states (gmail-act.mjs:55).'
  },
  {
    ac: 'AC-6 /api/michael mounted with requireAuth on the same line proven by a mount-table read, and /oauth/status returns no blob fields',
    scenarios: ['TS-9'],
    status: 'COVERED',
    note: 'Measured: server/index.js has zero /api/michael mounts today, and the requireAuth mount block at 246-270 precedes the /api optionalAuth mount, so the FR-6 insertion point is real and the test can discriminate.'
  },
  {
    ac: 'AC-7 SECURITY evidence row with provenance for phase EXEC before EXEC-TO-PLAN, and no migration in the diff',
    scenarios: [],
    status: 'NOT_TEST_COVERED',
    note: 'Gate and process criterion, correctly not a vitest scenario. Must be carried as an explicit EXEC checklist item.'
  }
];

const exec_test_checklist = [
  'lib/integrations/google/chairman-oauth.test.js TS-1: key ACTIVELY stubbed away (not assumed absent); storeTokens, getStoredTokens and runConsentFlow all reject MICHAEL_ENCRYPTION_KEY_MISSING and no write spy fired.',
  'chairman-oauth.test.js NEW: MICHAEL_ENCRYPTION_KEY_INVALID for 63-hex, 65-hex and non-hex values; empty string must map to _MISSING (smoke step 2 depends on this normalisation).',
  'chairman-oauth.test.js NEW: the inherited self-generating getMasterKey is never called and no .leo-keys path is read or written.',
  'chairman-oauth.test.js TS-2: real AES-256-GCM write; encrypted_blob is a base64 string, encryption_metadata.algorithm is aes-256-gcm, key_fingerprint equals sha256(key) sliced to 16, and the serialized payload contains neither fixture token nor any access_token, refresh_token or id_token key.',
  'chairman-oauth.test.js TS-3: key_fingerprint mismatch returns error KEY_FINGERPRINT_MISMATCH with the decrypt spy never called.',
  'chairman-oauth.test.js TS-4: invalid_grant sets last_error on the row, leaves the blob untouched, and rethrows.',
  'chairman-oauth.test.js TS-5: successful refresh calls storeTokens and updates expires_at and last_refreshed_at and clears last_error.',
  'chairman-oauth.test.js TS-6: GITHUB_ACTIONS=true refuses HOST_VENUE_REQUIRED before any decrypt, browser open or Google call, PLUS the CI=true variant.',
  'chairman-oauth.test.js NEW: static scan asserting no file under .github/workflows references MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.',
  'scripts/michael/google-consent.test.js TS-7: injected client returning 42P01 exits 2 with TABLES_ABSENT and generateAuthUrl is never called.',
  'google-consent.test.js NEW: --status --json against a row holding an encrypted_blob emits neither encrypted_blob nor encryption_metadata and does include hours_to_expiry.',
  'google-consent.test.js NEW: pre-flight ORDER (venue, then key, then Google client, then table probe) asserted by violating several preconditions at once and checking which code wins.',
  'lib/michael/gmail-client.test.js TS-8: modifyThread maps to users.threads.modify with userId me, the id, and requestBody addLabelIds/removeLabelIds, and returns ok:true with modified; a rejecting factory returns ok:false with error and does not throw; importing the module with no env set does not throw.',
  'server/routes/michael.test.js TS-9: /oauth/status payload has no encrypted_blob or encryption_metadata key and does have hours_to_expiry; an absent row yields 404 NO_CREDENTIAL; a missing relation yields 503 TABLES_ABSENT; the server/index.js mount line for /api/michael contains requireAuth and there is exactly one such mount.',
  'Regression TS-10: lib/integrations/youtube/oauth-manager.test.js and the lib/security suites stay green after the one-line encryption.cjs export, and the default import is still the singleton.',
  'Full re-run of the measured PLAN baseline (10 files, 159 tests) plus the four new files, all green, before EXEC-TO-PLAN.'
];

const summary = 'PLAN-phase prospective test-strategy review for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C at commit 9126e8903f2 (branch equals origin/main; no child-C code exists yet). Harness verified by measurement: the vitest unit project collects **/*.test.js and **/__tests__/**/*.test.js, and none of the four planned test locations is excluded. tests/collection-contract.json carries 21 patterns; the two nearest misses, lib/agents/** and scripts/agents/**, are source-anchored and do not match lib/integrations/google, lib/michael, scripts/michael or server/routes, and **/test/** matches no target path. tests/quarantine-manifest.json holds 150 entries, zero matching michael, google, gmail, integrations or server/routes. Sibling proof rather than inference: lib/michael/db.test.js, scripts/michael/verbs.test.js and server/routes/protocol-lint.test.js already collect and run green in those exact directories, and lib/integrations/youtube/oauth-manager.test.js proves lib/integrations subdirectories collect. Measured baseline over the six named paths: 10 files, 159 tests, 159 passed, 0 failed, 783ms, so any red in the EXEC re-run is child-C-introduced. The precedent test runs green and its pattern is what TS-2 must mirror: real AES-256-GCM through the production module, a hand-built mock supabase exposing __getRow, and an algorithm pin added specifically because a fake random-nonce encryptor would otherwise satisfy every other assertion. Child C improves on the precedent by injecting sb and enc rather than vi.mock-ing the supabase client module. Nine findings recorded; five acceptance-criteria coverage gaps named across three criteria.';

const justification = 'CONDITIONAL_PASS, not PASS: the collection harness, the precedent pattern and the baseline are all verified green by measurement, and five of seven acceptance criteria map to at least one scenario. But three acceptance criteria are only partially covered by TS-1 through TS-10, and two of those gaps are security-load-bearing rather than cosmetic. An implementation that silently fell back to the parent-class self-generating key would still produce real AES-256-GCM ciphertext and pass TS-2, TS-3 and every other scenario, which makes the no-key-generation clause of acceptance criterion 2 currently unfalsifiable. MICHAEL_ENCRYPTION_KEY_INVALID has no scenario at all despite being a named refusal in FR-2 and despite smoke step 2 depending on the adjacent empty-string-to-MISSING normalisation. Not FAIL, because every gap is additive: no scenario contradicts another, no scenario is unimplementable, and the smoke steps run correctly once the code lands, subject to the POSIX-shell caveat. All gaps are closable inside EXEC by adding the six new cases named in the checklist.';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 90,
    findings,
    recommendations: [
      'Add the six NEW test cases named in metadata.exec_test_checklist before EXEC-TO-PLAN; the two HIGH ones (key-shape refusals, no-key-generation) close currently-unfalsifiable clauses of acceptance criterion 2.',
      'Have TS-1 actively remove MICHAEL_ENCRYPTION_KEY rather than assume its absence, and assert no module-scope dotenv call, so the suite does not start failing on the chairman host the day the key is provisioned.',
      'Make the gmail-act dry-run assertion key on dry_run===true and the absence of GMAIL_CLIENT_ABSENT; would_call is emitted in both the pre-fix and post-fix states (scripts/michael/gmail-act.mjs:55).',
      'Annotate SD smoke steps 2 through 4 as bash-only or add PowerShell equivalents; the env-prefix and && forms are invalid in this session primary shell.',
      'Carry acceptance criterion 7 as an explicit EXEC checklist item; it is a gate criterion with no scenario owner.',
    ],
    summary,
    justification,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN',
      review_type: 'prospective test-strategy review (no child-C code exists yet)',
      evaluated_commit: '9126e8903f285d0350b0841f6162a0e4d7334c72',
      collection_verified: {
        unit_project_include: ['**/__tests__/**/*.test.js', '**/*.test.js', '**/tests/unit/org/**/*.test.mjs', '**/tests/unit/venture-email/**/*.test.mjs'],
        collection_contract_patterns: 21,
        quarantine_entries: 150,
        target_dirs_excluded: false,
        target_dirs_quarantined: false,
        sibling_proof: ['lib/michael/db.test.js', 'scripts/michael/verbs.test.js', 'server/routes/protocol-lint.test.js', 'lib/integrations/youtube/oauth-manager.test.js'],
      },
      precedent_test: {
        path: 'lib/integrations/youtube/oauth-manager.test.js',
        status: 'green, 12 tests, 387ms',
        pattern: 'real AES-256-GCM through the production module; hand-built mock supabase exposing __getRow; algorithm pinned to aes-256-gcm at line 69 against a fake random-nonce encryptor; vi.mock on the supabase client module',
        divergence: 'child C injects sb and enc rather than vi.mock-ing the module, a strict improvement in isolation',
      },
      smoke_steps_executable: {
        step_1: 'executable post-EXEC; the unit project lacks passWithNoTests so the lib/integrations/google/ filter errors pre-EXEC',
        step_2: 'bash-only syntax; also requires the empty string to normalise to _MISSING rather than _INVALID',
        step_3: 'bash-only syntax; the venue-first pre-flight order makes HOST_VENUE_REQUIRED the winning code even though GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are present in .env',
        step_4: 'bash-only (&& and nested quotes); discriminates correctly only on dry_run===true, since the current GMAIL_CLIENT_ABSENT refusal also carries would_call',
      },
      commands_run: [
        'npx vitest run --project unit lib/integrations/youtube/oauth-manager.test.js scripts/michael/ lib/michael/ server/routes/ server/middleware/auth.test.js',
        'node read of tests/collection-contract.json (21 patterns) and tests/quarantine-manifest.json (150 entries)',
        'sed -n 265,335p vitest.config.js for the unit project include and exclude',
        'find lib/michael scripts/michael server/routes lib/integrations -name "*.test.js"',
        'sed -n 28,42p scripts/michael/gmail-act.mjs; sed -n 235,260p lib/security/encryption.cjs; grep -n api/michael server/index.js',
      ],
    },
    metadata: {
      test_execution: {
        ...buildTestExecution({
          executed: 159,
          passed: 159,
          failed: 0,
          skipped: 0,
          artifactSha: 'df2c62e962b014deb47750655b6e87c30b0ba9032836ceaf611f89f7d69094df',
          runner: 'vitest 4.1.4 --project unit',
          artifactPath: '.artifacts/vitest-baseline-002c-plan.json',
          source: 'fresh',
        }),
        project: 'unit',
        command: 'npx vitest run --project unit lib/integrations/youtube/oauth-manager.test.js scripts/michael/ lib/michael/ server/routes/ server/middleware/auth.test.js --reporter=json --outputFile=.artifacts/vitest-baseline-002c-plan.json',
        test_files_total: 10,
        test_files_passed: 10,
        test_files_failed: 0,
        duration_ms: 783,
        measured_at: new Date().toISOString(),
        per_file: [
          { file: 'lib/michael/db.test.js', tests: 11, status: 'pass' },
          { file: 'scripts/michael/retention.test.js', tests: 7, status: 'pass' },
          { file: 'scripts/michael/autonomy-read.test.js', tests: 18, status: 'pass' },
          { file: 'scripts/michael/act.test.js', tests: 14, status: 'pass' },
          { file: 'scripts/michael/verbs.test.js', tests: 18, status: 'pass' },
          { file: 'lib/michael/rules.test.js', tests: 21, status: 'pass' },
          { file: 'lib/integrations/youtube/oauth-manager.test.js', tests: 12, status: 'pass' },
          { file: 'server/middleware/auth.test.js', tests: 20, status: 'pass' },
          { file: 'server/routes/protocol-lint.test.js', tests: 17, status: 'pass' },
          { file: 'server/routes/fleet-sessions.test.js', tests: 21, status: 'pass' },
        ],
        baseline_role: 'PLAN-phase pre-existing-failure baseline; zero pre-existing failures, so any red in the EXEC re-run is child-C-introduced',
      },
      acceptance_criteria_coverage,
      exec_test_checklist,
    },
    phase: 'PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN', source: 'sub_agent_executor' },
  );

  console.log('ROW ID:', stored.id);
  console.log('verdict:', stored.verdict, 'confidence:', stored.confidence);
  console.log('repo_path:', stored.metadata?.repo_path);
  console.log('executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('session_id:', stored.metadata?.session_id);
  console.log('content_hash:', stored.metadata?.content_hash);
  console.log('evaluated_commit_sha:', stored.metadata?.evaluated_commit_sha);
  console.log('test_execution tests_passed:', stored.metadata?.test_execution?.tests_passed, '/', stored.metadata?.test_execution?.tests_total);
  console.log('ac_coverage entries:', stored.metadata?.acceptance_criteria_coverage?.length);
  console.log('exec_test_checklist entries:', stored.metadata?.exec_test_checklist?.length);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
