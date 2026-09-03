import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const SD_ID = 'f47f0201-3a62-4dcc-a7a3-824c08988fd8'; // SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C, resolved via sd_key

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase,
});

const results = {
  sd_id: SD_ID,
  sub_agent_code: 'VALIDATION',
  sub_agent_name: 'Principal Systems Analyst',
  verdict: 'CONDITIONAL_PASS',
  confidence: 85,
  phase: 'LEAD',
  validation_mode: 'prospective',
  source: 'manual',
  critical_issues: [],
  warnings: [
    'SD DESCRIPTION CITES THE WRONG ALLOWLIST PATH: it says database/schema-reference-allowlist.json twice. That file does not exist. The real, code-enforced path (ALLOWLIST_PATH const at schema-reference-lint.mjs:51, matching the file that actually exists on disk) is scripts/lint/schema-reference-allowlist.json. database/ only holds the SNAPSHOT (schema-reference-snapshot.json) — the SD text conflated the two paths. If criterion 3\'s before/after entry-count check is built against the SD\'s literal text, it reads a nonexistent file and the "does not grow" assertion is vacuous by construction.',
    'SD baseline file count is wrong: description and success_criteria[0].measure both say "4334 files". Direct re-run today (node scripts/lint/schema-reference-lint.mjs --all --json) reads files_checked=4316, matching the worker\'s own measurement exactly. Violation count (358) and pre_existing (0) are both confirmed correct. PLAN should re-pin the file count at PRD time rather than carry the SD\'s stale number forward, since the file set will keep moving as the backlog is worked.',
    'Roughly a sixth of the backlog is lint noise, not phantom references. Spot-verified 6 of the worker-reported "10 in comment/template literal": 2 in scripts/hooks/lib/supabase-operative.cjs:17-18 (a regex-example trailing comment `// .from(\'table_name\')`), 1 in lib/sub-agents/modules/stories/context-generation.js:128 (a documentation template-literal pattern example), 2 in lib/agents/cost-agent/alerts-generator.js:98/101 (an "implementation recommendation" example string), 1 in lib/eva/bridge/replit-prompt-formatter.js:179 (markdown code-block text inside a prompt-generation template aimed at a DIFFERENT, generated venture app). None of these are real Supabase calls this repo executes. The honest fix is an extractor precision improvement (skip trailing comments / non-executed template-literal example blocks) — NOT an allowlist entry or an inline pragma. If PLAN/EXEC routes these through an escape instead of an extractor fix, they wrongly consume the frozen escape budget criterion 3 protects.',
    'Found one apparently genuine defect while spot-checking: lib/eva/bridge/replit-prompt-formatter.js:223 selects venture_resources.resource_url inside a real function (buildSupabaseConnectionSection, takes a live supabase client as a parameter) — the snapshot shows venture_resources has repo_url and deployment_url, not resource_url. This reads as a real phantom-column reference needing disposition (rename fix vs snapshot gap), not a false positive and not a dynamic/cross-schema case.',
  ],
  recommendations: [
    'PROCEED to PLAN with corrections: fix the allowlist path (database/ -> scripts/lint/) and the file-count baseline (4334 -> 4316, re-measured at PRD-write time) in the PRD before either is used as a literal gate value.',
    'Split the 358-violation backlog burn-down into its own PR(s), separate from the 3 CI-hardening criteria (staleness-block, escape-count-freeze, canary-proof), which are small, independent, and can land first without waiting on the backlog. Recommend further splitting the burn-down itself by directory tree (lib: 191, scripts: 140, {src,server,api}: 27) or by fix category (real code fix / extractor precision / allowlist-worthy) — touching 146 files across unrelated subsystems (marketing, sub-agent execution, EVA bridge, cost agent, stories generation, hooks) in one PR is not a reviewable single change under the CLAUDE.md PR-size ceiling regardless of literal LOC count.',
    'Sequence the CI --all wiring so the blocking assertion is armed only after the full multi-PR burn-down reaches 0, never mid-sequence — an intermediate non-zero state must not be silently tolerated (contradicts "never assert a non-zero baseline as pass") nor prematurely block unrelated PRs before the backlog work lands.',
    'Route the confirmed comment/template-literal false positives (6 spot-verified, ~10 total per the worker) through an extractor precision fix, not an allowlist/pragma entry, so criterion 3\'s frozen escape budget stays meaningful.',
    'Disposition lib/eva/bridge/replit-prompt-formatter.js:223 (venture_resources.resource_url) explicitly during the burn-down — it reads as a genuine phantom-column reference, not noise.',
  ],
  detailed_analysis: null,
  execution_time: 0,
  metadata: {
    phase: 'LEAD',
    sd_key: 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C',
    reviewer: 'VALIDATION (Principal Systems Analyst) - Sonnet 5',
    handoff_type: 'LEAD-TO-PLAN',
    measured_at_utc: new Date().toISOString(),
    findings: {
      gate_state: 'LEAD-phase VALIDATION evidence for GATE_SUBAGENT_EVIDENCE on LEAD-TO-PLAN. Verdict CONDITIONAL_PASS: the premise is real (CI runs schema-reference-lint --diff only; the ~358-violation backlog is dark to CI, never checked in --all/whole-tree mode) and the core hypothesized tension between criterion 1 (burn to zero) and criterion 3 (freeze the allowlist/pragma escapes) does NOT materialize on measured data. Corrections needed before PLAN arms the criteria: a wrong allowlist path baked into the SD description, a stale file-count baseline, and an unscoped single-PR burn-down that should be decomposed.',
      criteria_measurability: 'All 4 success criteria are measurable with a concrete instrument. (1) violation-count baseline: `node scripts/lint/schema-reference-lint.mjs --all --json` -> violations.length, currently 358 across files_checked=4316 (NOT the SD\'s stated 4334 — re-measured directly today, matches the worker\'s own number exactly). (2) staleness-blocking: unit-testable against the existing STALE_DAYS/computeExitCode contract (schema-lint-exit.mjs) by feeding a synthetic snapshot.generated_at >7 days old and asserting a nonzero exit rather than the current warn-only behaviour (schema-reference-lint.mjs:130-133). (3) escape-count freeze: a CI step diffing scripts/lint/schema-reference-allowlist.json (files+tables array lengths; currently 12 files / 27 tables) and a repo-wide count of lines containing schema-lint-disable-line, base-branch vs PR-branch, failing on any increase — buildable using the same merge-base resolution the lint already does for --diff mode. (4) canary proof: a fixture/unit test (or a documented one-time canary PR) that deliberately introduces a phantom .from(\'literal\')/select/insert/update reference against the pure extractReferences/findViolations/computeExitCode chain and asserts a nonzero exit — the lint\'s own module design (pure, already unit-tested per its header comments) supports this without needing a live CI run.',
      tension_measurement: 'Measured 0 of the 358 violations as genuinely dynamic/cross-schema (no code fix possible), by four independent checks against all 146 violation-carrying files: (a) grep for `.schema(` (explicit non-public-schema PostgREST calls) across every one of the 146 files -> 0 hits; (b) violation-kind tally sums to exactly 358 across {select:131, from:73, insert:102, update:47, upsert:5} with ZERO kind=\'sql\' entries — raw-SQL references are structurally excluded from ever blocking already (schema-reference-lint.mjs:182, `if (ref.kind === \'sql\') continue`), so cross-DB/dynamic raw-SQL is a non-issue for this control by construction; (c) grep for "auth." in every violation\'s missing-object name and file path -> 0 hits; (d) the extractor\'s table-name regex (FROM_RE = /\\.from\\(\\s*[\'"`]([a-zA-Z0-9_]+)[\'"`]\\s*\\)/g, schema-reference-extract.mjs:31) matches ONLY a quoted string literal, so a genuinely dynamic (runtime-variable) table name cannot be captured at all and is structurally invisible to the tool — it can never appear among the 358. One candidate found by grepping for cross-DB client signatures (createDatabaseClient(\'ehg\')/EHG_SUPABASE/VITE_SUPABASE patterns) across the 146 files -> exactly 1 file, lib/eva/bridge/replit-prompt-formatter.js, and on inspection its 2 violations are a template-literal false positive (not cross-DB code, prompt-generation text for a different venture app) and a same-database real-column-name mismatch (venture_resources.resource_url), not a cross-schema case. Conclusion: criteria 1 and 3 are NOT jointly unsatisfiable on the current backlog; the escape hatches this SD guards (allowlist.tables / allowlist.files / inline pragma) may still be needed for a handful of individual dispositions during the burn-down, but nothing in the measured 358 forces widening them structurally.',
      allowlist_path_defect: 'The SD description states the escape file is "database/schema-reference-allowlist.json" (twice). Verified against the running code: ALLOWLIST_PATH in scripts/lint/schema-reference-lint.mjs:51 is \'scripts/lint/schema-reference-allowlist.json\', the file exists there (20973 bytes, 12 files / 27 tables), and database/schema-reference-allowlist.json does not exist on disk (confirmed by ls). database/ holds only the SNAPSHOT (schema-reference-snapshot.json, generated_at 2026-08-30T21:10:07.900Z, 871 tables / 192 views). The SD conflated the snapshot\'s directory with the allowlist\'s. This must be corrected in the PRD before criterion 3\'s before/after count check is built, or it will read a nonexistent file.',
      false_positive_spot_check: 'Spot-verified 6 of the worker-reported 10 comment/template-literal false positives by reading source at the cited lines: scripts/hooks/lib/supabase-operative.cjs:17-18 (regex-pattern documentation in a trailing `//` comment), lib/sub-agents/modules/stories/context-generation.js:128 (a "Standard Supabase query" example shown as a template-literal string for prompt/context generation, not executed), lib/agents/cost-agent/alerts-generator.js:98/101 (an "Instead of: / Use:" example embedded in a generated optimization-recommendation string), lib/eva/bridge/replit-prompt-formatter.js:179 (markdown ```javascript code-block text inside a prompt template describing what a DIFFERENT, generated Replit app should do). All 6 are non-executed text the extractor is reading as code. The honest fix is comment/template-example stripping in the extractor, not an allowlist or pragma entry (which would spend criterion 3\'s frozen escape budget on lint noise rather than genuine dynamic/cross-DB cases).',
      genuine_defect_found: 'lib/eva/bridge/replit-prompt-formatter.js:223, inside the real (executed) function buildSupabaseConnectionSection(supabase, ventureId), selects venture_resources.resource_url. The live snapshot shows venture_resources columns as {id,venture_id,resource_type,resource_identifier,provider,status,metadata,created_at,updated_at,repo_url,deployment_url} — no resource_url. This looks like a genuine rename-drift bug (repo_url or deployment_url is probably the intended column), not lint noise and not a dynamic/cross-schema case; flagged for explicit disposition during the burn-down rather than blanket allowlisting.',
      pr_size_assessment: 'The as-scoped child bundles a 358-violation, 146-file, 5-directory-tree (lib 191, scripts 140, src 10, server 10, api 7) backlog burn-down together with 3 independent, small CI-hardening mechanisms (staleness-block, escape-count-freeze, canary-proof). Per CLAUDE.md\'s Small-PRs guidance (target <=100 LOC, documented-justification ceiling 400 LOC, judged for reviewability not just line count), a single PR touching 146 files across unrelated subsystems (marketing, sub-agent execution, EVA bridge, cost agent, stories generation, git hooks) fails the reviewability bar this ceiling exists to protect, independent of how small any individual per-file fix is. The 3 CI-hardening criteria have no dependency on the burn-down and should ship first/separately; the burn-down itself should be split further (by directory tree or by fix category: real-fix / extractor-precision / allowlist-worthy) with the blocking --all CI assertion armed only once the full split sequence reaches zero.',
    },
    measurements: {
      files_checked_all: 4316,
      files_checked_sd_stated: 4334,
      violations_all: 358,
      pre_existing_all: 0,
      distinct_missing_objects: 254,
      distinct_files_with_violations: 146,
      kind_select: 131,
      kind_from: 73,
      kind_insert: 102,
      kind_update: 47,
      kind_upsert: 5,
      kind_sql_blocking: 0,
      dot_schema_call_hits_in_violation_files: 0,
      auth_schema_ref_hits: 0,
      cross_db_client_hint_files: 1,
      spot_verified_false_positives: 6,
      worker_reported_false_positives: 10,
      allowlist_files_current: 12,
      allowlist_tables_current: 27,
      allowlist_json_size_bytes: 20973,
      snapshot_generated_at: '2026-08-30T21:10:07.900Z',
      snapshot_table_count: 871,
      snapshot_view_count: 192,
      violations_lib_tree: 191,
      violations_scripts_tree: 140,
      violations_other_trees: 27,
    },
    producer_note: 'Measured by directly re-running node scripts/lint/schema-reference-lint.mjs --all --json against current worktree HEAD (branch feat/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C), reading scripts/lint/schema-reference-lint.mjs, schema-reference-extract.mjs, schema-lint-scope.mjs and schema-lint-exit.mjs in full, grepping all 146 violation-carrying files for .schema( calls and cross-DB client signatures, and reading source at 5 specific flagged lines to confirm false-positive vs genuine-defect classification. Not an exhaustive triage of all 358 violations — the tension measurement (Q2) is exhaustive across all 146 files for the .schema()/auth./raw-SQL/dynamic-regex checks; the false-positive and genuine-defect classifications are targeted spot checks, not a full 358-row audit.',
  },
  conditions: [
    {
      action: 'Correct the allowlist path in the PRD from database/schema-reference-allowlist.json to the real path, scripts/lint/schema-reference-allowlist.json, before criterion 3\'s before/after count check is built.',
      blocks: 'criterion 3 instrument correctness',
      severity: 'HIGH',
    },
    {
      action: 'Re-pin the file-count baseline (4316, not the SD\'s stated 4334) at PRD-write time, and treat it as a re-measured value rather than a carried-forward literal, since the burn-down will keep moving the file set.',
      blocks: 'criterion 1 baseline integrity',
      severity: 'MEDIUM',
    },
    {
      action: 'Split the backlog burn-down into its own PR(s) separate from the 3 CI-hardening criteria; decompose the burn-down further by directory tree or fix category rather than one PR touching all 146 files.',
      blocks: 'PR-size/reviewability compliance',
      severity: 'HIGH',
    },
    {
      action: 'Route the ~10 comment/template-literal false positives through an extractor precision fix, not an allowlist/pragma entry, so criterion 3\'s frozen escape budget is not spent on lint noise.',
      blocks: 'criterion 3 integrity',
      severity: 'MEDIUM',
    },
  ],
  retro_contribution: {},
  invocation_id: null,
  summary: 'Child C premise is real (CI runs schema-reference-lint --diff only; the 358-violation, 4316-file --all backlog is dark to CI) and the hypothesized criterion-1/criterion-3 tension is REFUTED by direct measurement: 0 of the 358 violations are genuinely dynamic/cross-schema across four independent checks (.schema() calls, raw-SQL kind, "auth." references, and the extractor\'s literal-only table-name regex). All 4 success criteria are measurable with a named instrument. Two factual defects in the SD text need correction before PLAN arms the criteria: the allowlist path is wrong (SD says database/, real path is scripts/lint/), and the file-count baseline is wrong (SD says 4334, measured 4316). The as-scoped single PR bundling a 146-file/5-tree backlog burn-down with 3 independent CI-hardening mechanisms should be decomposed further per CLAUDE.md PR-size guidance. Spot-checked 6 comment/template-literal false positives (need an extractor fix, not an escape) and found one apparently genuine phantom-column bug (venture_resources.resource_url) worth explicit disposition.',
  justification: 'LEAD-phase VALIDATION for GATE_SUBAGENT_EVIDENCE ahead of LEAD-TO-PLAN. Re-ran the lint directly (--all --json) rather than trusting the worker\'s reported numbers, read all 4 lint-machinery source files in full, and exhaustively grepped every one of the 146 violation-carrying files for cross-schema (.schema()) calls, auth-schema references, and cross-DB client signatures to answer the adjudication question quantitatively. CONDITIONAL_PASS: the workstream premise and all 4 criteria hold and are measurable, but the SD text carries two factual errors (allowlist path, file-count baseline) and the current single-PR scope should be decomposed before EXEC.',
};

applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(results)
  .select('id')
  .single();

if (error) {
  console.error('INSERT ERROR', error);
  process.exit(1);
}

console.log('WROTE ROW ID:', data.id);
