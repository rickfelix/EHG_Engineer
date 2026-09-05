#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent evidence for SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F, EXEC_TO_PLAN.
 *
 * POST-IMPLEMENTATION review of commit 9d04b71ae5b, performed by reading the actual diff and
 * the dependency source (not the PRD prose, and not the TESTING row's claims -- every
 * cross-cutting claim below was independently re-measured, see metadata.verification_commands).
 *
 * Scope of the security question asked at this handoff:
 *   1. Does re-throwing the raw Supabase error object, and recording err.message into an
 *      in-memory array that reaches console.log() and a CLI report, leak sensitive information?
 *   2. Does the new per-SD try/catch introduce an unhandled-rejection path, or silently bypass
 *      a security control elsewhere that depended on the old fail-open behavior?
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F';
const COMMIT = '9d04b71ae5b188d41f0f0b6ec6977f5ac35affc8';

const findings = [
  {
    id: 'sec-1-service-role-credential-surface-reduced',
    severity: 'INFO',
    summary:
      'SECURITY IMPROVEMENT (positive, and not merely a testability side effect). BEFORE: scripts/false-completion-census.mjs instantiated `const supabase = createSupabaseServiceClient()` at MODULE SCOPE, so any import of the module -- including an import from a unit test -- constructed a SERVICE-ROLE (RLS-bypassing) client and required SUPABASE_SERVICE_ROLE_KEY to be present in the environment at import time. AFTER: client construction moved inside main(), which is itself guarded by isMainModule(import.meta.url). Verified against lib/utils/is-main-module.js: the guard compares import.meta.url to pathToFileURL(process.argv[1]).href, so under vitest (argv[1] = the vitest binary) it is false and main() never runs. The new tests/unit/scripts/false-completion-census.test.js imports runFalseCompletionCensus/fetchAllCompleted/NAMED_TARGET_SDS and injects a hand-rolled mock -- so a privileged client is now never instantiated in the test context. Net effect: strictly fewer processes hold a service-role credential.',
  },
  {
    id: 'sec-2-stack-trace-disclosure-on-failure-reduced',
    severity: 'INFO',
    summary:
      'SECURITY IMPROVEMENT (positive). BEFORE: the script was a top-level-await ESM module with NO terminal catch -- any thrown Supabase error became a top-level rejection, and Node prints the full error object AND stack trace to stderr. AFTER: `main().catch((e) => { console.error(\'false-completion-census failed:\', e.message); process.exit(1); })` -- message only, no stack, no error-object dump. This is a reduction in incidental disclosure (absolute filesystem paths and module layout in a stack). Noting explicitly because the TESTING row files "throw error loses the stack" as a LOW defect: under a SECURITY lens on this specific script, NOT emitting the stack is the desirable default, and the two views should not be reconciled by adding stack emission to the CLI.',
  },
  {
    id: 'sec-3-detection-control-fail-open-closed',
    severity: 'INFO',
    summary:
      'THE SECURITY SUBSTANCE OF THE CHANGE: a silent-failure bypass in a verification control is closed. lib/quality/migration-data-presence.js had two sites that converted "I could not obtain the fact" into the affirmative verdict "the fact is: no gap". checkMigrationDataPresent() did `if (error) return null` (null == no gap). findEvidenceMigrationGaps() was worse -- it never destructured `error` at all, so a query error yielded `handoffs === undefined`, which flowed through `(handoffs || [])` into empty evidence text and a confirmed zero-gap result. Net: a completed SD whose own evidence named a migration whose data never landed could read as clean SOLELY because the verifying query failed. That is the classic fail-open detection-control defect class. Both sites now `throw error` (migration-data-presence.js:47 and :75). Pinned by 4 tests that would go red on any regression: migration-data-presence.test.js:86 (checkMigrationDataPresent rejects), :142 (findEvidenceMigrationGaps rejects on the handoffs query), :168 (inner throw PROPAGATES out of the per-migration loop -- the test that guards against a defensive try/catch being reintroduced at the wrong layer), plus the census TS-4 fixtures. Read the source directly to confirm: the loop in findEvidenceMigrationGaps() (lines 81-84) has no try/catch.',
  },
  {
    id: 'sec-4-no-security-control-depended-on-the-old-swallow',
    severity: 'INFO',
    summary:
      'BLAST-RADIUS RE-MEASURED INDEPENDENTLY (not taken from the TESTING row, which asserts the same conclusion). Repo-wide grep for `migration-data-presence` / `findEvidenceMigrationGaps` / `checkMigrationDataPresent` / `extractMigrationPaths` across *.js, *.mjs, *.cjs, *.ts, *.json, *.yml, *.yaml excluding node_modules and .git: exactly ONE non-test importer -- scripts/false-completion-census.mjs -- and it is the file that received the try/catch. SEPARATELY, and more load-bearing for the security question: false-completion-census.mjs is referenced by NO GitHub workflow, NO package.json script, and NO gate or handoff validator (only its own new test file, an archived retro script under scripts/archive/one-time/, and a .claude/auto-proceed-state.json status string). Therefore the fail-open -> throw change CANNOT cause any gate to newly fail-open, fail-closed, or crash, and the new try/catch CANNOT suppress an exception any security control was relying on. There is no authorization, authentication, RLS, or gate-decision surface downstream of either function.',
  },
  {
    id: 'sec-5-error-text-to-public-repo-disclosure-channel-analyzed',
    severity: 'LOW',
    summary:
      'THE PRIMARY QUESTION ASKED, ANSWERED WITH MEASUREMENT RATHER THAN ASSERTION. The disclosure chain is real and DEMONSTRABLY reaches a public surface: Supabase `error` -> `throw error` -> census catch -> `err?.message` -> couldNotVerify[].reason -> console.log -> CLI output -> (observed) hand-copied into scripts/one-off/schema-truth-001-f-exec-testing-evidence.mjs, which is committed to rickfelix/EHG_Engineer -- confirmed via `gh repo view` to be visibility=PUBLIC. That committed file literally contains two production error strings today: "Could not find the table \'public.sd_claims\' in the schema cache" and `invalid input syntax for type uuid: "sdKey"`. So this is not a hypothetical channel. WHAT CAN ACTUALLY TRAVEL IT, measured against the dependency source: (a) postgrest-js 2.103.0 builds network-error messages as `${fetchError.name}: ${fetchError.message}` and puts the STACK into `.details`, NOT `.message` (verified at node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:367-431) -- so no stack, no request URL, no headers, and never the apikey (which is a header, never a query param) can reach `.message`. (b) The error classes reachable from a read-only `.select(col).in(col, vals).limit(500)` are the identifier/schema and transient classes: PGRST205, 42P01, 42703, 22P02, 57014, plus fetch failures. CRITICALLY, the class that embeds ROW VALUES in its message -- constraint violations (23505 "Key (email)=(x@y.com) already exists") -- is UNREACHABLE here, because this path performs no writes (grep for .insert/.update/.upsert/.delete/.rpc across both changed production files: zero matches). (c) The one reachable class that echoes a value is 22P02, whose message embeds a `literalValue` parsed out of a repo-committed database/migrations/*.sql. I scanned all 1482 migration files: 340 are parseable by the naive INSERT regex and would yield literalValues; only 3 matched any secret-shaped pattern, and all 3 are false positives on inspection -- `venture_token_budgets` (a table name containing "token"), `default_webhook_secret` (a rule_name IDENTIFIER in leo_validation_rules, not a secret value), and `artifact://%s [%s tokens, expires %s]` (a format string). CONCLUSION: zero real secret material is reachable into the echo channel, and every literal that IS reachable is public-by-construction, since the migration that contains it lives in the same public repo. Schema/table names likewise -- public.sd_claims is created by a migration in this same public repo. NO REMEDIATION REQUIRED for this change. Rated LOW rather than INFO only because the channel itself is live and a future change could put a sensitive payload into it (see sec-6).',
  },
  {
    id: 'sec-6-thrown-object-carries-details-with-a-stack',
    severity: 'LOW',
    summary:
      'HARDENING NOTE for future consumers, non-blocking today. `throw error` propagates the RAW postgrest error object, whose `.details` field is populated with `fetchError.stack` (and, when a cause is present, `cause.stack` plus the cause message and code) on network failures -- see PostgrestBuilder.ts:371-392. The current sole consumer is safe because it projects narrowly: `err?.message || String(err)`, and the CLI prints only `cnv.reason` and `e.message`. But given sec-5 establishes that this text demonstrably reaches a PUBLIC repo, any FUTURE consumer that does `console.error(err)`, `JSON.stringify(err)`, or writes the error object into a DB evidence row would publish absolute filesystem paths and module layout. RECOMMENDATION (follow-up, not this SD): keep the throw, but have consumers continue projecting explicitly to `{ message, code }` rather than serializing the object -- and never write a raw postgrest error into an evidence artifact. The existing `{ sd_key, sd_id, reason }` shape already does this correctly and should be treated as the pattern to copy.',
  },
  {
    id: 'sec-7-no-unhandled-rejection-introduced',
    severity: 'INFO',
    summary:
      'UNHANDLED-REJECTION AUDIT of the new try/catch, verified by reading the loop rather than by assumption. The construct is `for (const sd of rows) { try { const gaps = await findEvidenceMigrationGaps(...); ... } catch (err) { couldNotVerify.push(...) } }` -- a `for...of` with the `await` INSIDE the try, which is the correct form; the classic defect here (a `.forEach(async ...)` whose rejections escape the try entirely) is NOT present. Every rejection from the awaited call is caught. The catch body itself cannot throw: `err?.message || String(err)` uses optional chaining, so a plain-object throw (which is exactly what `throw error` produces -- the Supabase error is a plain object, not an Error instance) is handled, and even `throw null` degrades to the string "null" rather than a TypeError. main() has a terminal `.catch` that also exits non-zero. Also confirmed: neither changed production file reads process.env directly, so no credential is re-derived or logged at either layer. No unhandled-rejection path is introduced.',
  },
  {
    id: 'sec-8-preexisting-taint-flow-reviewed-unchanged-and-bounded',
    severity: 'INFO',
    summary:
      'PRE-EXISTING TAINT FLOW reviewed because the change alters its error behavior, though not the flow itself. DB-sourced text (sd_phase_handoffs deliverables_manifest / completeness_report / executive_summary) -> extractMigrationPaths() -> path.join(REPO_ROOT, p) -> readFileSync(). PATH TRAVERSAL IS NOT REACHABLE: MIGRATION_PATH_RE = /database\\/migrations\\/[\\w.-]+\\.sql/g forbids `/` in the filename segment, so no `../` can appear after the fixed `database/migrations/` prefix; the reachable file set is exactly this repo\'s own migrations. The parsed `table` and `column` then feed supabase.from(table).select(column), but both are constrained to `\\w+` by /INSERT INTO\\s+(\\w+)\\s*\\(\\s*(\\w+)/i, so no PostgREST resource-path or select-param injection is possible. RESIDUAL THEORETICAL NOTE, unchanged by this commit and rated non-actionable: literalValues (captured by /\\(\\s*\'([^\']+)\'/g) are passed to .in(), and postgrest-js wraps a value in double quotes when it matches /[,()]/ WITHOUT escaping an embedded double quote (PostgrestFilterBuilder.ts:781-786) -- a literal containing both a double quote and one of , ( ) could break out of its quoted list item. The impact ceiling is widening or narrowing an IN list on a single-column read-only SELECT (no table change, no additional filter clause is reachable from inside the in.(...) parens), and the input source is repo-committed SQL, i.e. the same trust level as the executing code itself. Not introduced here, not exploitable by any non-committer. NO ACTION.',
  },
  {
    id: 'sec-9-committed-artifact-local-path-disclosure-preexisting',
    severity: 'LOW',
    summary:
      'FOR THE RECORD, pre-existing convention, NOT introduced by this change. The commit adds git-tracked .artifacts/testing-SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F-exec.json (9283 bytes), which is NOT gitignored (`git check-ignore` exits 1) and embeds absolute local paths of the form C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/... , because the vitest JSON reporter emits absolute test-file paths. In a PUBLIC repo this discloses the local username and directory layout. MARGINAL DISCLOSURE IS EFFECTIVELY ZERO: the disclosed username `rickfelix` is identical to the public repo owner name (rickfelix/EHG_Engineer), and 10 of the 39 already-tracked .artifacts/*.json files do exactly the same. .gitignore line 516 documents that .artifacts/ is deliberately NOT blanket-ignored so evidence files can be committed. Flagged so a reviewer does not mistake it for a new leak; no action recommended for this SD.',
  },
  {
    id: 'sec-10-standard-checklist-not-applicable-surfaces',
    severity: 'INFO',
    summary:
      'STANDARD CHECKLIST, explicitly walked rather than waived. AuthN/AuthZ: no authentication or authorization surface is added, changed, or removed -- no auth.uid(), no session handling, no route. RLS: no table is created, altered, or newly accessed; `git show --stat` confirms ZERO files under database/migrations/ in this commit, so no policy is added or weakened. The two tables read (strategic_directives_v2, sd_phase_handoffs) were already read by this same code path. Input validation / injection: covered in sec-8 -- no user input exists on this path at all (inputs are DB rows written by the LEO harness and repo-committed SQL files). XSS: not applicable, CLI stdout only, no HTML/DOM sink. Secrets: a targeted scan of all 7 changed files for service-role keys, JWTs (eyJ...), sk-/ghp_/xox tokens, AKIA identifiers, and inline apikey/password/secret assignments returned ZERO matches; neither changed production file reads process.env. Writes: zero -- grep for .insert/.update/.upsert/.delete/.rpc across both changed production files returns nothing, confirming the read-only reporting characterization. Test hermeticity: both new/edited test files use hand-rolled table-dispatching mock clients with no vi.mock, no network, and no DB, so CI never needs a credential to run them.',
  },
];

const warnings = [
  {
    severity: 'LOW',
    issue:
      'The error-message -> console.log -> committed-evidence -> PUBLIC repo channel (sec-5) is live and already carries production Postgres error text today. It is safe under measurement RIGHT NOW because this code path is read-only (so value-embedding constraint-violation messages are unreachable) and because the only value-echoing reachable class (22P02) can only echo literals that are themselves committed in the same public repo.',
    recommendation:
      'Preserve the two properties that make it safe rather than treating them as incidental: (1) keep this path read-only -- if a future change ever adds a write here, 23505/23503 messages embed row values and the analysis in sec-5 no longer holds; (2) keep consumers projecting to { message, code } and never serialize the raw postgrest error, whose .details carries a stack (sec-6). Neither is a blocker for this handoff.',
  },
  {
    severity: 'LOW',
    issue:
      'The TESTING row files "`throw error` throws a plain object, losing the stack" as a LOW defect. From a security standpoint the current CLI behavior (main().catch printing e.message only, never the stack) is the CORRECT default for a script whose output is demonstrably copied into a public repo.',
    recommendation:
      'If a future SD acts on that TESTING note by switching to `throw Object.assign(new Error(error.message), error)`, do NOT simultaneously change the CLI catch to print e.stack. Improve the throw shape for programmatic consumers if desired, but keep the human/CLI output projected to the message.',
  },
];

const recommendations = [
  'APPROVE from a security standpoint. The change is a net security improvement, not merely a neutral refactor: it closes a fail-open silent-failure bypass in a verification control (sec-3), it reduces service-role credential instantiation surface by moving client construction behind an isMainModule guard (sec-1), and it reduces stack-trace disclosure on failure by adding a terminal catch that prints only the message (sec-2).',
  'The specific disclosure question raised at this handoff was measured, not assumed, and clears: no stack, URL, header, or apikey can reach err.message (postgrest-js puts the stack in .details); the row-value-embedding error class is unreachable because this path performs no writes; and the one value-echoing class that IS reachable (22P02) can only echo migration literals that are already published in the same public repo -- verified by scanning all 1482 migrations, where 3 secret-shaped hits were all false positives (a table name, a rule_name, and a format string).',
  'No security-relevant consumer depended on the old fail-open behavior: independent grep confirms one non-test importer, and the census script is wired into no workflow, no npm script, and no gate. The new try/catch therefore cannot mask an exception any control relied on, and the new throw cannot break one.',
  'Carry sec-6 (never serialize a raw postgrest error into an evidence artifact; project to { message, code }) into the deferred follow-up alongside the 22P02 error-class discrimination the TESTING row already raised. Note that from a security lens the 22P02 classification is in the SAFE direction -- surfacing rather than swallowing -- so it should be handled as a correctness/noise issue, not treated as a security regression.',
];

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 92,
    findings,
    warnings,
    recommendations,
    summary:
      `EXEC-phase post-implementation SECURITY review of ${SD_KEY} (commit ${COMMIT.slice(0, 11)}), performed by reading the actual diff, the changed production files in full, and the postgrest-js dependency source -- with every cross-cutting claim independently re-measured rather than inherited from the TESTING row. VERDICT: PASS, and the change is a net security IMPROVEMENT on three counts: (1) it closes a fail-open silent-failure bypass in a verification control -- findEvidenceMigrationGaps() did not even destructure its 'error' field, so a failed query became a confirmed "no gap found" verdict on a completed SD; (2) service-role credential surface is REDUCED, because createSupabaseServiceClient() moved from module scope (where any import, including a test import, instantiated an RLS-bypassing client) into main() behind an isMainModule guard; (3) stack-trace disclosure on failure is REDUCED, because the previously uncaught top-level-await rejection (which printed a full stack) is now a terminal catch printing only e.message. ON THE SPECIFIC DISCLOSURE QUESTION ASKED: the channel err.message -> couldNotVerify.reason -> console.log -> committed evidence -> PUBLIC repo (gh repo view confirms rickfelix/EHG_Engineer is PUBLIC, and production error strings are already committed in the sibling TESTING evidence script) is REAL but carries no sensitive payload. Measured: postgrest-js 2.103.0 puts the stack in error.details and never in error.message, so no stack/URL/header/apikey can travel it; the row-value-embedding error class (23505-style constraint violations) is UNREACHABLE because this path performs zero writes (verified by grep); and the only reachable value-echoing class, 22P02, can only echo literals parsed from repo-committed migrations -- a scan of all 1482 migration files found 340 parseable, of which just 3 matched a secret-shaped pattern and all 3 were false positives (a table name, a rule_name identifier, a printf format string). ON THE BYPASS QUESTION: an independent repo-wide grep confirms exactly ONE non-test importer of the changed module, and false-completion-census.mjs is referenced by no workflow, no package.json script, and no gate/handoff validator -- so neither the new throw nor the new try/catch can alter any security control decision. The try/catch uses for...of with await inside try (not the rejection-leaking forEach(async) form) and an optional-chained catch body, so no unhandled-rejection path is introduced. No AuthN/AuthZ/RLS surface is touched (zero files under database/migrations/), no secrets appear in any of the 7 changed files, and no user input reaches this path. Four LOW items are recorded, none blocking: the live-but-currently-benign public disclosure channel, the raw thrown object carrying a stack in .details for future consumers, the pre-existing committed-artifact local-path convention (marginal disclosure ~zero, username == public repo owner, 10 of 39 tracked artifacts already do it), and a note that the TESTING row\'s "restore the stack" suggestion must not be applied to the CLI output path.`,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      mode: 'post-implementation',
      commit_reviewed: COMMIT,
      review_method:
        'Read git show HEAD diff for both production files; read lib/quality/migration-data-presence.js and scripts/false-completion-census.mjs in full at HEAD; read node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts and PostgrestFilterBuilder.ts to establish what actually reaches error.message vs error.details and how .in() serializes values; independently re-ran the blast-radius and secret greps rather than citing the TESTING row.',
      changed_files_reviewed: [
        'lib/quality/migration-data-presence.js (production)',
        'scripts/false-completion-census.mjs (production)',
        'tests/unit/quality/migration-data-presence.test.js',
        'tests/unit/scripts/false-completion-census.test.js',
        'scripts/one-off/schema-truth-001-f-exec-testing-evidence.mjs',
        'scripts/one-off/schema-truth-001-f-lead-explore-evidence.mjs',
        '.artifacts/testing-SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F-exec.json',
      ],
      dependency_source_read: [
        'node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:367-431 (fetch-error message vs details construction)',
        'node_modules/@supabase/postgrest-js/src/PostgrestFilterBuilder.ts:36,768-790 (in() reserved-char quoting)',
        'lib/utils/is-main-module.js (entry-point guard semantics)',
      ],
      measurements: {
        repo_visibility: 'PUBLIC (rickfelix/EHG_Engineer, via gh repo view --json visibility)',
        write_operations_in_changed_production_files: 0,
        process_env_reads_in_changed_production_files: 0,
        secrets_found_in_changed_files: 0,
        non_test_importers_of_changed_module: 1,
        ci_workflow_or_npm_script_references_to_census: 0,
        migrations_total: 1482,
        migrations_parseable_by_naive_insert_regex: 340,
        migrations_with_secret_shaped_first_column_literals: 3,
        migrations_with_secret_shaped_literals_confirmed_false_positive: 3,
        tracked_artifacts_json_files: 39,
        tracked_artifacts_json_already_containing_local_paths: 10,
      },
      security_checklist: {
        authentication: 'N/A — no auth surface added, changed, or removed',
        authorization: 'N/A — no authorization decision on this path',
        rls: 'N/A — zero files under database/migrations/; no table created/altered; no newly accessed table',
        sensitive_data: 'Analyzed in depth (sec-5) — error-text disclosure channel is live but carries no sensitive payload; measured, not assumed',
        api_endpoints: 'N/A — CLI script, no endpoint',
        input_validation: 'No user input on this path; DB-row and repo-committed-SQL inputs reviewed for taint (sec-8), bounded by regex constraints',
        output_sanitization: 'N/A — stdout only, no HTML/DOM sink',
        sql_injection: 'Not reachable — PostgREST client, identifiers constrained to \\w+ by the parsing regex; residual .in() quoting note is pre-existing and non-exploitable by non-committers',
        secrets_management: 'PASS and IMPROVED — zero hardcoded secrets; no direct process.env reads; service-role client instantiation moved behind an isMainModule guard',
      },
      questions_asked_at_handoff: {
        q1_error_message_information_leak:
          'ANSWERED — NO leak. postgrest-js puts stack/cause into error.details, never error.message; the census records only .message. Value-embedding constraint-violation messages are unreachable (read-only path, zero write calls). The one reachable value-echoing class (22P02) echoes only migration literals already published in this same public repo — 1482 migrations scanned, 3 secret-shaped hits, all 3 false positives.',
        q2_unhandled_rejection_or_silent_bypass:
          'ANSWERED — NO on both. for...of with await inside try (not forEach(async)); optional-chained catch body; terminal main().catch. And no security control depended on the prior behavior: one non-test importer, zero workflow/npm/gate references, no auth/RLS/gate decision downstream.',
      },
    },
    metadata: {
      measured: true,
      post_implementation: true,
      phase: 'EXEC_TO_PLAN',
      commit_reviewed: COMMIT,
      verification_commands: [
        'gh repo view --json visibility,nameWithOwner',
        'git show HEAD -- lib/quality/migration-data-presence.js scripts/false-completion-census.mjs',
        "grep -rn 'migration-data-presence|findEvidenceMigrationGaps|checkMigrationDataPresent|extractMigrationPaths' --include=*.js --include=*.mjs --include=*.cjs --include=*.ts --include=*.json --include=*.yml --include=*.yaml . (excluding node_modules/.git)",
        "grep -nE '\\.(insert|update|upsert|delete|rpc)\\(' scripts/false-completion-census.mjs lib/quality/migration-data-presence.js  # -> zero matches",
        "grep -nE 'process\\.env' scripts/false-completion-census.mjs lib/quality/migration-data-presence.js  # -> zero matches",
        "node -e '<scan all database/migrations/*.sql: parseable-by-naive-regex count + secret-shaped first-column literal scan>'  # -> 1482 total / 340 parseable / 3 flagged, all false positives",
        'git check-ignore -v .artifacts/testing-SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F-exec.json  # -> exit 1, not ignored',
      ],
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'Chief Security Architect' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('EXEC SECURITY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase ?? stored.metadata?.phase);
  console.log('  measured:', stored.metadata?.measured);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  findings:', Array.isArray(stored.findings) ? stored.findings.length : 'n/a');
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
