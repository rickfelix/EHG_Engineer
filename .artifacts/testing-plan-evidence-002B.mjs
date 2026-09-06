import 'dotenv/config';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_UUID = '058c33b2-62ce-45d0-a712-39716c5e8cfc';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B';

const amendments = [
  { id: 'A1', ts: 'TS-1', severity: 'CRITICAL', add: "PRD premise 'no scratch DB exists' is REFUTED. vitest.ddl.config.mjs + tests/ddl/**/*.db.test.js runs an ephemeral PostgreSQL 16 service container, fail-closed (passWithNoTests:false), invoked by .github/workflows/drive-reports-ddl.yml:191. Three direct posture precedents exist (eva-sync-state-rls-lockdown, eva-youtube-intake-rls-lockdown, close-remaining-secdef-execute-exposure). Add tests/ddl/michael-tables-ddl.db.test.js that applies 20260906_michael_tables.sql to the container, extracts the DO verify block from the real file (extractDollarQuotedDoBlock precedent) and RUNS it, then asserts has_table_privilege(anon|authenticated) = false for all 7 privilege types per table and the DOWN restores. Without this, every posture claim in AC-1 is asserted only as a string in a file." },
  { id: 'A2', ts: 'TS-1', severity: 'CRITICAL', add: "Add tests/ddl/michael-tables-ddl.db.test.js AND database/migrations/20260906_michael_tables.sql AND _DOWN.sql to drive-reports-ddl.yml paths filter. That filter is LITERAL (no globs) and its own comments record ~15 recurrences of a new DDL pair triggering ZERO CI. Omitting this line makes the DDL tier green-by-not-running." },
  { id: 'A3', ts: 'TS-2/TS-3', severity: 'HIGH', add: "NEGATIVE CONTROL missing: a non-flip, non-supersede rule-encode write must SUCCEED with NO --verifier-verdict. Without it, an implementation that refuses every write passes TS-2 and TS-4 identically, and the tests cannot distinguish a correctly-scoped gate from an always-refuse gate." },
  { id: 'A4', ts: 'TS-4', severity: 'HIGH', add: "TS-4 says 'a distinct reason code' but never asserts distinctness. Make it table-driven over SIX cases (missing verdict / producer != opus-verifier / model not starting claude-opus / verdict=reject / subject_hash mismatch / produced_at older than 24h) and assert new Set(codes).size === 6. A single generic REFUSED code currently passes all of TS-4." },
  { id: 'A5', ts: 'TS-3', severity: 'HIGH', add: "subject_hash canonicalization (TR-3, 'canonical JSON with sorted keys') has no falsifier. Add a case where the verdict file subject fields are supplied in a DIFFERENT key order than the CLI builds them and the hash must still MATCH. A naive JSON.stringify implementation passes every current scenario and fails only in production." },
  { id: 'A6', ts: 'TS-5', severity: 'CRITICAL', add: "Threshold precedence (--threshold > michael_rules domain=brief rule_key=autonomy_threshold rule_json.value > 7) is untested. Add three scenarios: flag wins over DB row; DB row wins over 7 (seed value 3 and assert a proposal at streak 3); default 7 when neither present. Neutering the DB branch to a constant 7 passes TS-5 exactly as written." },
  { id: 'A7', ts: 'TS-5', severity: 'CRITICAL', add: "MIXED-RULE LEDGER missing (explicitly requested): seed michael_feedback_ledger dispositions containing entries for rule_key A and rule_key B on the same et_date, 7 approves for A and 7 overrides for B. Assert exactly one proposal, for A. A rule_key filter bug that counts all approvals in the ledger passes every current TS-5 scenario." },
  { id: 'A8', ts: 'TS-5', severity: 'HIGH', add: "The 'days without an entry for that rule are ignored' rule (FR-4) has no scenario. Add: approves on days 1-3, a gap day carrying a disposition for a DIFFERENT rule only, approves on days 5-8 => streak 7 => proposal. An implementation that resets on any gap day passes TS-5 today." },
  { id: 'A9', ts: 'TS-5', severity: 'MEDIUM', add: "Only 'override' is tested as a streak reset. FR-4 names override, skip AND auto. Add one scenario per reset kind (6 approves + skip => none; 6 approves + auto => none), and add the 'delete' verb twin to the existing 'complete never proposes' case." },
  { id: 'A10', ts: 'TS-6', severity: 'CRITICAL', add: "ORDERING falsifier missing. FR-4 states 'Revocations are emitted first'. Add a scenario where ONE rule simultaneously has streak >= threshold AND a reopened_at signal; assert revocations[] contains it and proposals[] does NOT. This is the highest-consequence branch (auto-flipping a rule that just misfired) and nothing currently covers it." },
  { id: 'A11', ts: 'TS-6', severity: 'HIGH', add: "TS-6 lists reopened_at and three-overrides only; the moved_back_at signal (michael_todoist_snapshot, FR-4) has NO scenario. Add it, plus a negative twin: reopened_at set BEFORE action_taken_at must NOT revoke (FR-4 says 'after action_taken_at')." },
  { id: 'A12', ts: 'TS-7', severity: 'MEDIUM', add: "Add the upsert-grain falsifier: two feedback-append calls for the SAME et_date must APPEND to dispositions (length 2), not replace. Also assert one accepted case per enum value, not just the rejection of an unknown one." },
  { id: 'A13', ts: 'TS-8', severity: 'HIGH', add: "Add the negative twin: a reschedule to the SAME date as proposed_date must NOT stamp moved_back_at; and a row with proposed_date NULL must not stamp. As written, an implementation that always stamps passes TS-8." },
  { id: 'A14', ts: 'TS-9', severity: 'MEDIUM', add: "On GMAIL_CLIENT_ABSENT assert the injected supabase stub from() was called ZERO times ('nothing is written' is currently only asserted as exit 2)." },
  { id: 'A15', ts: 'TS-10', severity: 'HIGH', add: "BOUNDARY ROW missing (explicitly requested): seed et_date exactly === cutoff, one row cutoff-1 day, one row cutoff+1 day; assert only the strictly-older row is selected, pinning < vs <=. Also assert michael_rules/michael_closures never appear in the set of tables passed to from() (spy on the injected client), and that the michael_feeder_runs stamp is written on the DRY run with attempt = 1 + max(attempt) for that et_date (the attempt-increment has no scenario at all)." },
  { id: 'A16', ts: 'TS-11', severity: 'CRITICAL', add: "TS-11 is typed 'integration'. If it lands under tests/integration/ it joins DB_INCLUDE, which routes it to the assessDbTarget-GATED db project and it SKIPS silently on every undesignated target (vitest.config.js:80-86; the MIGRATION_GATE_INCLUDE comments record this exact green-while-unproven masking). Re-scope TS-11 as a LIVE SMOKE RUN executed by EXEC against the real unapplied DB, captured to a runner-written file, NOT as a vitest file in tests/integration/." },
  { id: 'A17', ts: 'TS-11', severity: 'HIGH', add: "TS-11 covers readers only. TR-1 also specifies 'a named refusal exit 2 for writes' when tables are absent. Add smoke coverage for the six write verbs (rule-encode, closure-add, capture, feedback-append, gmail-act, todoist-act) asserting exit 2 and a NAMED refusal on absent tables." },
  { id: 'A18', ts: 'AC-4', severity: 'MEDIUM', add: "The gitignore acceptance criterion has NO test. Add a one-line unit assertion: git check-ignore -q docs/michael/generated/RULES.md exits 0. Currently unfalsifiable." },
  { id: 'A19', ts: 'NEW TS-13', severity: 'HIGH', add: "FR-2 (rules-load, rules-render) has no test scenario at all beyond inertness. Add: rules-load --domain filters and --json shape; rules-render emits the six documentation-standards frontmatter keys, groups by domain, and renders provenance.ratification_id; and rules-render NEVER writes outside docs/michael/generated/." },
  { id: 'A20', ts: 'NEW TS-14', severity: 'MEDIUM', add: "TR-4 ('a prior with status superseded is never re-superseded') has no scenario. Add: attempting to supersede an already-superseded row refuses, and the successful supersede path writes both rows in one call (assert the prior update and the new insert both occurred)." },
  { id: 'A21', ts: 'TS-1', severity: 'MEDIUM', add: "The shape test loops MICHAEL_TABLES, so dropping a name from that constant silently shrinks the assertion set. Assert MICHAEL_TABLES.length === 11 AND the migration CREATE TABLE IF NOT EXISTS count === 11 AND the DOWN DROP TABLE count === 11 (the michael-flag precedent does exactly this with its ===2 counts)." },
  { id: 'A22', ts: 'TS-1', severity: 'MEDIUM', add: "Assert the chairman-gate header against the SEEDER OWN regex, not a hand-copied string: mirror CHAIRMAN_GATED_RE from scripts/seed-migration-dispositions.mjs:49 and APPROVED_BY_RE from line 46. VERIFIED at this commit: the FR-1 header line '-- @chairman-gated: applied by the chairman after sign-off (Tier 3)' DOES match CHAIRMAN_GATED_RE, so RULE A will emit the DEFERRED ledger entry as FR-1 assumes." },
  { id: 'A23', ts: 'ALL', severity: 'CRITICAL', add: "FILE EXTENSION TRAP: every new test MUST be named *.test.js. The unit project include is ['**/*.test.js'] plus narrow .test.mjs allowlists for tests/unit/org and tests/unit/venture-email ONLY (vitest.config.js:280-299). A *.test.mjs file written alongside a .mjs SUT would be a member of ZERO projects and never run in CI. The precedent scripts/michael-quiet-tick.test.js is .test.js importing a .mjs SUT." },
  { id: 'A24', ts: 'TS-12', severity: 'HIGH', add: "TS-12 names lints but has no scenario for the NEW workflow. Add (a) node scripts/check-workflow-yaml.mjs .github/workflows/michael-retention-cron.yml in PR 6 evidence, and (b) a tests/unit/cron/michael-retention-wiring.test.js in the tests/unit/cron/drive-report-sweep.test.js precedent that READS the YAML and asserts cron '0 4 * * 0', permissions contents:read, a concurrency group, and — the security property of FR-6 / ratification 0daf3bd8 — that the job env keys are EXACTLY SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY with no Google/Todoist/encryption secret. The 'no credential' claim is otherwise unfalsifiable." },
  { id: 'A25', ts: 'TS-12', severity: 'HIGH', add: "count-truncation-diff-lint BLOCKS on newly-added lines. Every .select() in lib/michael/db.mjs, rules-load and autonomy-read is a new unbounded select and will turn PR 2 and PR 4 red. Give readRows() an explicit bound (or count exact per the shared classifyChain classifier), and add a unit assertion that readRows applies a bound — otherwise the fix is one refactor away from silently regressing." },
  { id: 'A26', ts: 'TS-12', severity: 'MEDIUM', add: "eol-renormalization-lint triggers on **/*.sql, **/*.mjs and **/*.js — i.e. every PR in this SD — and reads git ls-files --eol for i/crlf. This SD is authored on a Windows worktree and .gitattributes pins *.sql/*.mjs/*.yml to eol=lf (lines 56-84). EXEC must run git add --renormalize . before opening PR 1 and cite the lint local output." }
];

const lintFindings = [
  "secdef-execute-revoke-lint.yml and rls-anon-tenant-predicate-lint.yml BOTH trigger on database/migrations/**/*.sql and are genuinely blocking (no continue-on-error) — PR 1 exercises them automatically. Expected clean: no SECURITY DEFINER function is created and no anon policy is added (policies are FOR ALL TO service_role).",
  "alter-default-override-lint.yml and eol-renormalization-lint.yml also trigger on this SD file types; eol is the live risk (Windows worktree) — see A26.",
  "control-seed-test-lint: NOT triggered — child B registers no new control/gauge/lint, so the TR-6 'no new control' claim holds as written.",
  "session-coordination-insert-classguard: not triggered (no session_coordination writes).",
  "no-mocked-sut-import-lint is WARN-ONLY but the planned injected-client style (scripts/michael-quiet-tick.test.js precedent) is compliant; do not vi.mock the SUT modules themselves.",
  "workflow-path-filter-lint.yml runs on EVERY pull_request (no paths filter), so michael-retention-cron.yml is scanned automatically; since that workflow is schedule+workflow_dispatch with no paths array, the lint is a structural no-op for it. The real workflow-wiring risk is the INVERSE case captured in A2 (drive-reports-ddl.yml literal paths filter)."
];

const measuredRunPlan = {
  unit: "npx vitest run --project unit --reporter=json --outputFile=.artifacts/testing-evidence/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B-unit.json <new test paths>; then sha256 the JSON (node:crypto) and carry producer=vitest, run_id, and the content hash in the EXEC-TO-PLAN verdict row (gate-evidence provenance, ratification 6c263823 — the runner writes the file, the verdict cites its hash).",
  ddl: "npx vitest run --config vitest.ddl.config.mjs (locally against a throwaway PG container, and in CI via drive-reports-ddl.yml once A2 paths are added). passWithNoTests is FALSE, so a zero-collection run fails rather than passing.",
  smoke: "Live runs from the repo root against the real (unapplied) DB, stdout+exit code captured to .artifacts/testing-evidence/<sd>-smoke.txt: node scripts/michael-rules-load.mjs --json; node scripts/michael-rules-render.mjs; node scripts/michael/autonomy-read.mjs --json; node scripts/michael/retention.mjs (dry). Assert exit 0 and tables_absent=true. Then the six write verbs with --dry-run, asserting exit 2 and a named refusal (A17).",
  lints: "Run secdef-execute-revoke-lint, alter-default-override-lint, rls-anon-tenant-predicate-lint, eol-renormalization-lint and count-truncation-diff-lint with the same invocation their workflows use, capturing output to the same evidence directory.",
  durability_caveat: ".artifacts/ is untracked and untracked root files are one discard from zero. Either commit the JSON reporter output with the PR or record sha256 plus the four counts inside the verdict row itself; a cited-but-unpersisted path is not evidence."
};

const dbTierRouting = {
  ddl_tier: "The DO verify privilege assertions -> tests/ddl/michael-tables-ddl.db.test.js (ephemeral PG16, fail-closed, ungated). This is the replacement for the PRD 'no scratch DB' premise.",
  never_integration: "Nothing for this SD may land in tests/integration/ — DB_INCLUDE routes that whole directory to the assessDbTarget-gated db project, which collects zero files and passes green on an undesignated target.",
  live_db_naming: "Any genuinely live-DB test must be named *.db.test.js (DB_INCLUDE), which is gated off by default and must therefore never be the sole evidence for an acceptance criterion.",
  everything_else: "All verb tests stay in the unit tier with injected clients (no DB), named *.test.js per A23."
};

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 82,
  summary: 'PLAN test-plan review for Michael child B. The plan is unusually strong on refusal-path coverage but rests on one refuted premise (no scratch DB) and is missing 26 falsifiers, 6 of them CRITICAL: the DDL tier that would actually execute the migration posture assertions exists and is unused (and its literal paths filter must be amended); autonomy-read revocation-before-proposal ordering has no scenario; threshold precedence and the mixed-rule ledger are untested; TS-11 as typed would silently skip; and a *.test.mjs naming choice would make every new suite CI-unreachable. Not measured — no code exists yet.',
  metadata: {
    measured: false,
    review_type: 'test_plan_review_prospective',
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B',
    sd_key: SD_KEY,
    documents_read: ['product_requirements_v2 (FR-1..FR-7, TR-1..TR-7, TS-1..TS-12, AC 1-4)', 'docs/michael/02-SPEC.md sections 2, 7, 11', 'scripts/michael-quiet-tick.test.js', 'tests/unit/migrations/michael-flag-migration-shape.test.js', 'vitest.config.js', 'vitest.ddl.config.mjs', 'tests/ddl/eva-sync-state-rls-lockdown-ddl.db.test.js', '.github/workflows/drive-reports-ddl.yml', '.github/workflows/secdef-execute-revoke-lint.yml', '.github/workflows/rls-anon-tenant-predicate-lint.yml', '.github/workflows/eol-renormalization-lint.yml', '.github/workflows/workflow-path-filter-lint.yml', '.github/workflows/retention-enforce-cron.yml', 'scripts/seed-migration-dispositions.mjs', 'lib/sub-agent-executor/testing-verdict-guard.js'],
    refuted_premise: "PRD FR-7 and the shape-test header assert 'no scratch DB harness exists'. Measured false at this worktree: vitest.ddl.config.mjs collects tests/ddl/**/*.db.test.js against an ephemeral PostgreSQL 16 service container with passWithNoTests:false, invoked at .github/workflows/drive-reports-ddl.yml:191, with ten existing DDL suites including three that ship this exact RLS/REVOKE posture.",
    acceptance_criteria_coverage: {
      'AC-1 migration posture': 'PARTIAL — text-shape only; DO verify never executed. See A1, A2, A21, A22.',
      'AC-2 rule-encode Opus gate': 'GOOD on refusals, MISSING the scoped-gate negative control and the hash-canonicalization falsifier. See A3, A4, A5.',
      'AC-3 autonomy-read': 'WEAKEST — ordering, threshold precedence, mixed-rule ledger, gap-day handling and moved_back_at all lack falsifiers. See A6-A11.',
      'AC-4 inert plus gitignored': 'PARTIAL — readers covered, write-path refusals not; gitignore criterion has no test at all. See A16, A17, A18.'
    },
    amendments,
    amendment_count: amendments.length,
    critical_amendment_ids: amendments.filter((a) => a.severity === 'CRITICAL').map((a) => a.id),
    lint_and_ci_findings: lintFindings,
    measured_run_plan_exec_to_plan: measuredRunPlan,
    db_tier_routing: dbTierRouting,
    test_execution: {
      framework: 'vitest',
      tests_executed: 0,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      note: 'PLAN-phase prospective test-plan review. No deliverable code exists yet (scripts/michael/ and lib/michael/ are absent at this commit), so nothing was run. metadata.measured is explicitly false.'
    }
  },
  conditions: [
    'A1+A2: add tests/ddl/michael-tables-ddl.db.test.js executing the migration DO verify block against the existing ephemeral-Postgres DDL tier, and register its three paths in drive-reports-ddl.yml (literal paths filter — omission means the job never runs).',
    'A6+A7+A10: add autonomy-read scenarios for threshold precedence, a mixed-rule ledger, and revocation-beats-proposal on a single rule.',
    'A16: re-scope TS-11 as a live smoke run captured to a runner-written file, not a vitest suite under tests/integration/ (which would silently skip in the gated db project).',
    'A23: name every new test *.test.js — a *.test.mjs suite is collected by no vitest project and is CI-unreachable.',
    'EXEC-TO-PLAN evidence must carry the vitest json reporter output path plus its sha256 and non-zero tests_executed; this PLAN row is explicitly unmeasured and cannot substitute for it.'
  ],
  justification: 'CONDITIONAL_PASS rather than PASS: the plan covers all four acceptance criteria with named scenarios and its refusal-path design is sound, but (a) it is built on a premise about test infrastructure that is measurably false at this commit, leaving the migration posture asserted only as file text when an executing tier exists; (b) six CRITICAL falsifier gaps mean neutered implementations would pass as written; and (c) two mechanical traps (test file extension, tests/integration routing) would produce green-without-running. PASS is withheld until the conditions land in the PRD test plan. Not a FAIL: no scenario in the plan is wrong, and every gap is additive.'
};

const resolution = await resolveSubAgentRepo({ sdId: SD_UUID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_UUID, { name: 'QA Engineering Director' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
console.log('STORED_ID:', stored?.id || JSON.stringify(stored));
console.log('VERDICT:', results.verdict, 'CONF:', results.confidence);
console.log('repo_path:', results.metadata.repo_path);
console.log('executed_from_cwd:', results.metadata.executed_from_cwd);
