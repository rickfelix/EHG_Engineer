#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent evidence for SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F, EXEC phase.
 *
 * Reviews the ACTUAL shipped diff at commit 57a30a445c1 (PR #8906, branch
 * feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F) rather than the SD plan: the stage-17
 * self-approval removal (C4.1), the new CI predicate, the two authored-not-applied
 * chairman-gated SQL files (C4.2), and the read-only uptime-probe reader wired into
 * stage-23's monitoring category (C4.3).
 *
 * READ-ONLY: this review issued no UPDATE/INSERT/DELETE against any table other than the
 * evidence row it writes here. C4.2 remains UNAPPLIED (verified live).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F';
const PHASE = 'EXEC';
const COMMIT = '57a30a445c1a5c63eb93c610ffb15a3ac37d600e';

const findings = [
  {
    id: 'diff-characterization-independently-confirmed',
    severity: 'INFO',
    summary: 'All five file characterizations in the EXEC brief were independently verified against `git show 57a30a445c1`, not accepted on trust. Each matched the shipped diff exactly. The commit touches 15 files, not 5 -- the additional 10 are the four one-off scripts (scripts/one-off/capa-001-f-*.mjs, venture-quality-capa-001-f-lead-validation-evidence.mjs), four test files, and .artifacts/capa-001-f-plan-baseline.json. All ten were also reviewed; none introduces a write path, credential, route, or external call beyond the established one-off/service-role pattern already used repo-wide.',
  },
  {
    id: 'c4-1-removed-write-was-provably-a-total-no-op',
    severity: 'HIGH',
    summary: 'C4.1 premise INDEPENDENTLY RE-CONFIRMED live, read-only: `select id, resolved_at from chairman_decisions limit 1` returns PostgREST 42703 "column chairman_decisions.resolved_at does not exist". A full `select *` enumerates 38 real columns (id, venture_id, lifecycle_stage, health_score, recommendation, decision, override_reason, ..., status, ..., decided_by, ..., approval_type, ...) with NO resolved_at. This matters more than "one bad field": PostgREST rejects the ENTIRE update payload when any column is unknown, so status=\'approved\' and decision=\'approve\' were never written either. The removed statement could not have approved anything under any code path or edge case. Removing it is a pure deletion of dead code, not a behavioural change.',
  },
  {
    id: 'c4-1-no-downstream-consumer-could-have-depended-on-the-write-or-its-error',
    severity: 'HIGH',
    summary: 'C4.1 downstream-dependency check CLEAN, per the explicit EXEC brief question. (a) ERROR-CODE SIGNAL: ruled out at the call site -- the removed line was `await supabase.from(...).update(...).eq(\'id\', decisionId);` with the resolved value DISCARDED (no `const { error } =` destructure, no .throwOnError()). supabase-js RESOLVES a failed update to {data,error} rather than rejecting, so the 42703 was never observable to any code: it did not reach the enclosing try/catch and was not inspected. Nothing could branch on it. (b) DB-STATE CONSUMERS: every reader of an approved decision reads DB state, not this call -- lib/eva/stage-execution-worker.js queries `.from(\'chairman_decisions\')...eq(\'status\',\'approved\')` at lines 859-861, 903-907, 1134-1143, 1316-1320, 1420-1424 and 2577-2582. Because the write never committed, those readers could only ever have observed the row as \'pending\'. Their behaviour post-removal is bit-identical. (c) CONTROL FLOW: the removed statement was the last in its try block; only the log line followed. No ordering or side-effect dependency existed. Conclusion: removing this dead write is NOT a security regression, and the removed false "auto-approved" INFO log was itself an operator-facing integrity defect (it asserted an approval that never happened).',
  },
  {
    id: 'c4-1-change-direction-is-security-tightening',
    severity: 'INFO',
    summary: 'C4.1 moves strictly toward less self-granted authority: it deletes a self-approval SHAPE (a module writing status=approved onto the very chairman_decisions row it just created) from the codebase, and deletes a log line that falsely claimed that approval occurred. createOrReusePendingDecision -- the legitimate pending-decision creation -- is unchanged and still runs before the deleted block, so the honest pending row is still persisted on every gate recommendation. No new write path was added anywhere in the diff.',
  },
  {
    id: 'ci-predicate-is-genuinely-enforced-not-a-printed-discriminator',
    severity: 'MEDIUM',
    summary: 'The new guard is ENFORCED, verified by execution rather than by reading the filename. tests/unit/ci/no-self-approval-chairman-decisions.test.js:88-92 calls scanDirectoryForSelfApproval() against the REAL lib/eva/stage-templates/analysis-steps/ directory and asserts zero offenders (not only against synthetic fixtures). `npx vitest run --project unit tests/unit/ci/no-self-approval-chairman-decisions.test.js` was run in this review: 10/10 tests pass, and the file resolved under the `unit` project, confirming it is inside the CI unit tier rather than orphaned. So a future reintroduction of the historical shape fails CI.',
  },
  {
    id: 'ci-predicate-evasion-surface-partial-assurance-only',
    severity: 'MEDIUM',
    summary: 'GUARD LIMITATION, measured not assumed. findSelfApprovalWrites() was exercised against five hand-built variants: FLAGGED = the historical shape, and a payload with a nested object placed BEFORE status (the regex correctly backtracks to the outer brace, so key reordering does NOT evade it). MISSED = (C) double-quoted keys `.update({ "status": "approved" })`, because the key pattern /status\\s*:/ does not tolerate a closing quote before the colon; (D) any case where more than 500 characters separate .from(\'chairman_decisions\') from .update( , because the scan window is hard-bounded at 500 chars; (E) an indirected value such as `{ status: APPROVED_CONST }`, which is out of scope by design. Additionally the scan covers only `.js` files DIRECTLY under the one target directory (no recursion, no .mjs/.ts). NOT A VULNERABILITY -- this is a defence-in-depth lint against ACCIDENTAL reintroduction, and the real authorization boundary is _handleChairmanGate plus the DB. But it should be documented as partial assurance so no future reader treats a green run as proof that no self-approval exists. Cheap hardening: allow optional quotes around the key (/["\\\']?status["\\\']?\\s*:/) and widen or remove the 500-char window.',
  },
  {
    id: 'c4-2-sql-files-confirmed-not-applied-and-not-auto-appliable',
    severity: 'HIGH',
    summary: 'C4.2 "authored only, never applied" CONFIRMED on five independent mechanisms, per the explicit EXEC brief question. (1) NOT APPLIED, live: `schema_migrations_applied` returns ZERO rows matching this migration path, and `venture_stages` still reads stage 24 = is_high_consequence FALSE (vs 3=true, 19=true, 25=true) -- the UP migration\'s effect is absent from the live DB. (2) TIER CLASSIFIER: classifyMigration() was executed read-only against BOTH files and returned tier 2 (chairman-gated) for each, reason "unrecognized_or_unsafe_statement", because UPDATE is in FORBIDDEN_TOPLEVEL (scripts/lib/migration-tier-classifier.mjs:44). Tier 1 (auto-apply-eligible) is an allow-list that these files cannot reach. (3) PATH EXCLUSION: scripts/apply-migration.js:133-134 rejects any path not matching /database/migrations/[^/]+\\.sql$ unless --allow-any-path is passed explicitly, so database/chairman-gated/ is outside the default apply path. (4) NO CI AUTO-APPLY: no workflow applies these files. drive-reports-ddl.yml -- the only workflow referencing the chairman-gated directory -- uses a LITERAL paths: allow-list that does not include either new file (so it does not even trigger), and provisions its own throwaway database; its own header states "The only path that applies these files for real is scripts/apply-migration.js --prod-deploy, behind a 3-factor token guard. Production only." (5) COMPLETION GATE: scripts/modules/complete-quick-fix/db-apply-state-gate.js:31-32 routes any file under database/chairman-gated/ to "chairman apply via the 3c ceremony". Consistent with all 139 existing files in that directory.',
  },
  {
    id: 'c4-2-when-applied-the-change-closes-an-auto-approval-bypass',
    severity: 'INFO',
    summary: 'C4.2 direction is security-TIGHTENING, traced to the consuming code. lib/eva/stage-execution-worker.js:2478-2500 (_handleChairmanGate) computes isHcGate = govGate.isHighConsequence(stageNumber) and, when true, SKIPS both auto-approval shortcuts: the autonomy L2+ `auto_approve` path and the _canAutoAdvance governance-override path. Stage 24 carries gate_type=\'kill\' with gate_label "KILL GATE: Launch readiness" yet is_high_consequence=false today, so a kill gate is currently reachable by those shortcuts. Setting it true removes that bypass. The worker\'s own comment (SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001, PR #6104) states the guard exists precisely so "a chairman-designated high-consequence stage must never be auto-approved away". Correctly, the worker did NOT self-apply this: designating a stage high-consequence is chairman-level governance state (cf. ratification b75ddfff), so routing it to the chairman ceremony rather than applying it in lane is the right call, not merely a procedural one.',
  },
  {
    id: 'c4-2-down-file-missing-chairman-gated-marker',
    severity: 'LOW',
    summary: 'MINOR, non-blocking. The DOWN file (..._stage24_DOWN.sql) carries NO `-- @chairman-gated` marker line and NO `-- @approved-by:` header, verified by running both regexes (check-migration-readiness.mjs:61 and migration-guards.js APPROVED_BY_RE) against the file; the UP file carries both. The missing @approved-by is FAIL-CLOSED and therefore safe -- checkApproverFactor rejects a file with no header, so the DOWN file cannot be applied at all until someone adds one deliberately. The missing @chairman-gated marker is the actual nit: scripts/check-migration-readiness.mjs grants its PASS_CHAIRMAN_GATED_PENDING exemption only on that literal marker (the file says "CHAIRMAN-GATED" in prose on a line beginning "-- SD-LEO-...", which the anchored regex does not match), so the readiness gate may flag the DOWN file as an ordinary unapplied migration. A process/CI-noise issue, not a security hole -- the directory-based gate in db-apply-state-gate.js still covers it. Suggest adding a bare `-- @chairman-gated` line to the DOWN file for consistency with the UP file.',
  },
  {
    id: 'no-injection-surface-introduced',
    severity: 'INFO',
    summary: 'INJECTION: none. The only new query is getLatestProbeStatus\'s `.from(\'venture_deployments\').select(\'url, metadata\').eq(\'venture_id\', ventureId)` -- PostgREST parameterizes .eq() values, and there is NO string interpolation into any SQL, filter, or RPC name anywhere in the diff. The two SQL files contain fully literal statements (`WHERE stage_number = 24`) with no parameters, no dynamic SQL, no EXECUTE, no DO block. The new CI script builds no queries at all. String interpolation in the diff occurs only in log lines and in the stage-23 `detail` display string, neither of which reaches a query.',
  },
  {
    id: 'no-authz-rls-or-credential-change',
    severity: 'INFO',
    summary: 'AUTHZ / SECRETS / ATTACK SURFACE: all confirmed unchanged. (a) No RLS or permission change: the diff contains no CREATE/ALTER/DROP POLICY, no ENABLE ROW LEVEL SECURITY, no GRANT/REVOKE, no role change, no auth.uid()/auth.jwt() logic. The only SQL is a single-column data UPDATE on one governance row. (b) No secrets: a pattern scan of every ADDED line (JWT `eyJ` prefixes, sk_live/sk_test, service_role_key/password/api_key/secret literal assignments, Bearer tokens, PEM headers) returned zero hits. The only process.env reads are the three one-off scripts\' standard `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)` -- environment-sourced, never hardcoded, matching the established repo pattern. (c) No new attack surface: no new route, endpoint, handler, webhook, listener, or outbound network call. getLatestProbeStatus performs a SELECT on venture_deployments, a table lib/ops/venture-uptime-probe.js already reads and writes, using the caller-supplied client -- no new table, no new credential, no privilege escalation. The new CI script touches only the local filesystem (fs.readdirSync/readFileSync) with no DB, network, or secret access.',
  },
  {
    id: 'c4-3-advisory-status-preserved-cannot-flip-a-kill-gate',
    severity: 'INFO',
    summary: 'C4.3 blast radius confirmed BOUNDED. The new `case \'monitoring\':` sets `status = \'advisory\'` unconditionally on BOTH the reachable and unreachable branches, and \'monitoring\' remains in ADVISORY_CATEGORIES, so verdict logic still ignores it when computing kill-gate fail. The change therefore alters DISPLAY TEXT only and cannot flip a launch-readiness verdict in either direction -- notably it cannot manufacture a false GREEN on a kill gate. The precompute checkVentureUptimeWired wraps getLatestProbeStatus in try/catch and returns null on any error, degrading to the pre-existing static "No automated producer; chairman attestation suffices" string, so a failed or missing venture_deployments read can never throw into the checklist build or block stage 23.',
  },
  {
    id: 'c4-3-last-error-interpolation-is-bounded-and-has-no-html-sink',
    severity: 'LOW',
    summary: 'MINOR DATA-FLOW NOTE. The new monitoring detail string interpolates ventureUptimeCheck.last_error, which is the only externally-influenced value in the diff: it originates in checkReachability (lib/ops/venture-uptime-probe.js:52) as `(err && err.message) || String(err)` from a fetch against the venture\'s own deployment URL. Assessed and cleared: (a) NO CREDENTIAL EXPOSURE -- the probe issues a bare `fetchFn(url, { method: \'GET\', signal })` with no auth header, cookie, or token, so no secret can appear in the error text; (b) NO RESPONSE-BODY CAPTURE -- only err.message is stored, never the response body, so a hostile endpoint cannot inject arbitrary content this way, only a bounded Node fetch/DNS/TLS/abort message; (c) NO PII -- the URL is the venture\'s own public deployment URL, already stored in plaintext in venture_deployments.url; (d) NO HTML SINK -- a grep for dangerouslySetInnerHTML across the client surfaces found no raw-HTML rendering of checklist detail. Recorded only because this field changes from a hardcoded constant to partly externally-derived text for the first time; if a future consumer renders checklist detail as raw HTML rather than escaped text, that consumer -- not this change -- would introduce the sink.',
  },
  {
    id: 'c4-3-helper-spreads-whole-probe-object',
    severity: 'LOW',
    summary: 'MINOR, style/forward-looking. getLatestProbeStatus returns `{ url: latest.url, ...latest.probe }`, spreading the entire metadata.probe object rather than picking named fields. Today probe carries exactly reachable/status_code/last_error/consecutive_failures/surfaced/last_checked_at, all benign and all documented in the JSDoc return type. But the spread means any field a future writer adds to metadata.probe is automatically exposed to every caller of this helper without review. Suggest an explicit field pick to keep the exposed surface intentional. No current exposure.',
  },
  {
    id: 'pre-existing-observation-approver-factor-provides-no-author-independence',
    severity: 'INFO',
    summary: 'PRE-EXISTING HARNESS PROPERTY, EXPLICITLY NOT A FINDING AGAINST THIS DIFF -- recorded so the chairman-gated ceremony is not over-read as stronger than it is. scripts/lib/migration-guards.js checkApproverFactor requires only that the `-- @approved-by: <email>` header MATCH the invoking session\'s `git config user.email`. The UP file here is pre-stamped `@approved-by: codestreetlabs@gmail.com`, which is also this commit\'s own author identity, so that factor supplies no independence between author and approver. This is the established convention, not a deviation: 35 of the 139 files already in database/chairman-gated/ carry the identical pre-filled header (the remainder use PENDING or deliberately omit it). The real control is the third factor -- MIGRATION_APPLY_TOKEN, a hashed, 1h-TTL, single-use token -- so the ceremony\'s independence rests on token issuance being a human act rather than on cryptographic separation from a worker session. This SD neither introduces, widens, nor relies on that property, and its files sit behind the same gate as every sibling. Flagged as an observation for the harness backlog, not as a defect of this change.',
  },
];

const warnings = [
  'The CI self-approval predicate provides PARTIAL assurance only: it misses double-quoted keys, a >500-char gap between .from() and .update(), and indirected values (all three measured). Treat a green run as "no accidental reintroduction of the historical shape", never as "no self-approval exists".',
  'The DOWN SQL file lacks the literal `-- @chairman-gated` marker, so check-migration-readiness.mjs will not grant it the expected-pending exemption and may report it as an ordinary unapplied migration. Fail-closed for apply (it also has no @approved-by header), so this is CI noise, not exposure.',
  'C4.2 remains UNAPPLIED and stage 24 therefore still carries is_high_consequence=false, meaning the kill-gate auto-approval bypass described in this evidence IS STILL OPEN in production until the chairman ceremony runs. The code change alone does not close it.',
];

const recommendations = [
  'Harden the CI predicate cheaply: allow optional quotes around the payload key and widen (or drop) the 500-character scan window, so the two mechanical evasions measured here are covered. Optional: recurse and include .mjs.',
  'Add a bare `-- @chairman-gated` line to the DOWN SQL file for parity with the UP file and with the readiness gate\'s marker regex.',
  'Consider an explicit field pick instead of `...latest.probe` in getLatestProbeStatus so the exposed field surface stays intentional as metadata.probe evolves.',
  'Track the chairman ceremony for C4.2 as the item that actually closes the stage-24 kill-gate bypass; the merged code change is a prerequisite, not the remediation.',
  'Harness backlog (not this SD): the chairman-gated @approved-by factor matches the invoker\'s own git identity and so provides no author/approver independence; only the apply token does. Worth a separate look at whether token issuance is meaningfully human-gated.',
];

const summary = 'EXEC-phase SECURITY review of the ACTUAL shipped diff at commit 57a30a445c1 (PR #8906), not the plan. VERDICT: PASS. All five characterizations in the EXEC brief were independently verified against `git show` and live read-only queries, and all five held. C4.1: the removed stage-17 write was provably a TOTAL no-op -- `select id,resolved_at from chairman_decisions` returns 42703 and a full `select *` shows 38 columns with no resolved_at, and because PostgREST rejects the whole payload on an unknown column, status=approved and decision=approve were never written either. The explicit downstream-dependency question is answered NO on all three axes: the call site DISCARDED the resolved value (no destructure, no throwOnError) and supabase-js resolves rather than rejects, so the 42703 was never observable to any code and nothing could branch on it as a signal; all six approved-status readers in stage-execution-worker.js read DB state that was always pending; and the statement was last in its try block so no control-flow dependency existed. Removing it is a pure deletion that also removes a FALSE "auto-approved" operator log -- strictly security-tightening. C4.2: "authored not applied" confirmed on five independent mechanisms -- zero rows in schema_migrations_applied, stage 24 still live-reads is_high_consequence=false, classifyMigration() returns TIER 2 for BOTH files (UPDATE is in FORBIDDEN_TOPLEVEL, so tier-1 auto-apply is unreachable), apply-migration.js:133 excludes any path outside database/migrations/ absent --allow-any-path, and no workflow applies these files (drive-reports-ddl.yml uses a literal paths allow-list that excludes them and builds its own throwaway DB). When the ceremony does run it CLOSES a real bypass: _handleChairmanGate skips both auto-approve shortcuts only for high-consequence stages, and stage 24 is a kill gate currently flagged false. C4.3/C4.4: the new reader is a parameterized read-only SELECT on an already-used table, try/catch-wrapped, and the monitoring case sets status=advisory on every branch, so it changes display text only and cannot flip a kill-gate verdict. Standard OWASP-adjacent sweep CLEAN: no string interpolation into any query (injection), no RLS/policy/GRANT/role change (authz), zero secret-pattern hits across all added lines with env-sourced credentials only, and no new route/endpoint/external call (attack surface). Concerns are ADVISORY follow-ups, not merge conditions: the new CI predicate gives partial assurance (measured: it catches the historical shape and key reordering but misses double-quoted keys, a >500-char from/update gap, and indirected values), the DOWN file lacks the literal @chairman-gated marker (fail-closed, CI noise only), and getLatestProbeStatus spreads the whole probe object. One PRE-EXISTING harness observation recorded explicitly as NOT a defect of this diff: the @approved-by factor matches the invoker\'s own git identity, so only the apply token supplies real control.';

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
    confidence_score: 93,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: PHASE,
      commit_reviewed: COMMIT,
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/8906',
      branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F',
      review_basis:
        'Shipped diff read via `git show 57a30a445c1` for all 15 changed files (the EXEC brief named 5; the other 10 are one-off scripts, tests, and an artifact JSON, all reviewed). Characterizations were verified independently, not accepted on trust.',
      read_only_attestation:
        'No UPDATE/INSERT/DELETE was issued against any table during this review other than this evidence row. C4.2 (venture_stages.is_high_consequence) was READ ONLY and remains UNAPPLIED pending the chairman ceremony; verified live that stage 24 still reads is_high_consequence=false.',
      owasp_adjacent_sweep: {
        injection:
          'CLEAN. Only new query is .from(\'venture_deployments\').select(\'url, metadata\').eq(\'venture_id\', ventureId) -- PostgREST-parameterized. No string interpolation into any SQL/filter/RPC name. SQL files are fully literal (WHERE stage_number = 24), no dynamic SQL/EXECUTE/DO block.',
        authn_authz:
          'CLEAN. No RLS policy, ENABLE ROW LEVEL SECURITY, GRANT/REVOKE, role, or auth.uid()/auth.jwt() change anywhere in the diff. The one SQL change is a single-column data UPDATE on a governance row, staged not applied. The C4.1 removal REDUCES self-granted authority.',
        secrets:
          'CLEAN. Pattern scan over every added line (eyJ JWT prefix, sk_live/sk_test, service_role_key/password/api_key/secret literal assignment, Bearer, PEM) returned zero hits. Only credential reads are process.env.SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the one-off scripts (environment-sourced, established pattern).',
        attack_surface:
          'CLEAN. No new route, endpoint, handler, webhook, listener, or outbound network call. New helper reads an existing table with the caller-supplied client; new CI script is filesystem-only (no DB, network, or secrets).',
        data_exposure:
          'LOW/accepted. stage-23 monitoring detail now interpolates last_error (bounded Node fetch error text from an unauthenticated GET to the venture\'s own public URL -- no credential, no response body, no PII) and status_code/last_checked_at. No raw-HTML sink found for checklist detail.',
      },
      live_queries_run: [
        "select id, resolved_at from chairman_decisions limit 1 -> ERROR 42703 'column chairman_decisions.resolved_at does not exist' (C4.1 premise re-confirmed independently)",
        'select * from chairman_decisions limit 1 -> 38 columns enumerated; resolved_at ABSENT; status and decision present',
        'select url, metadata, venture_id from venture_deployments limit 1 -> no error (the new helper\'s exact column set is valid)',
        'select migration_path, applied_at, success, applied_by from schema_migrations_applied where migration_path ilike %20260913_venture_stages_is_high_consequence_stage24% -> [] (ZERO rows: migration NOT applied)',
        'select stage_number, gate_type, is_high_consequence from venture_stages where stage_number in (3,19,24,25) -> 3:kill/true, 19:promotion/true, 24:kill/FALSE, 25:promotion/true (confirms unapplied AND confirms the kill-gate inconsistency premise)',
      ],
      local_checks_run: [
        'git show 57a30a445c1 --stat and per-file diffs for all 15 files',
        'classifyMigration() executed read-only on BOTH new SQL files -> tier 2 for each, reason "unrecognized_or_unsafe_statement" (UPDATE in FORBIDDEN_TOPLEVEL); tier-1 auto-apply unreachable',
        'chairman-gated marker + @approved-by regex applied to both SQL files -> UP: marker true, approved-by codestreetlabs@gmail.com; DOWN: marker FALSE, approved-by ABSENT',
        'npx vitest run --project unit tests/unit/ci/no-self-approval-chairman-decisions.test.js -> 10/10 PASS; test scans the REAL analysis-steps directory (line 88-92), so the guard is enforced',
        'findSelfApprovalWrites() exercised on 5 variants -> FLAGGED: historical shape, nested-object-before-status; MISSED: double-quoted keys, >500-char from/update gap, indirected value',
        'secret-pattern scan over `git show | grep "^+"` -> zero hits',
        'grep of .update/.insert/.upsert/.delete/.rpc in added lines -> only the PRD one-off patch and test-fixture STRINGS; no new production write path',
        'grep dangerouslySetInnerHTML across client surfaces -> no raw-HTML sink for checklist detail',
        'read apply-migration.js:133-134 (path restriction), migration-guards.js (3-factor + delegated-apply scope), db-apply-state-gate.js:31-32, drive-reports-ddl.yml (literal paths allow-list, self-provisioned DB)',
      ],
      artifacts_read: [
        'lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js (diff + surrounding context)',
        'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (diff + monitoring case + ADVISORY_CATEGORIES)',
        'lib/ops/venture-uptime-probe.js (getLatestProbeStatus + checkReachability:30-57)',
        'scripts/ci/no-self-approval-chairman-decisions.mjs (full)',
        'database/chairman-gated/20260913_venture_stages_is_high_consequence_stage24.sql and _DOWN.sql (full)',
        'tests/unit/ci/no-self-approval-chairman-decisions.test.js, tests/unit/ops/venture-uptime-probe.test.js and the two stage tests',
        'lib/eva/stage-execution-worker.js (_handleChairmanGate:2464-2530 + all chairman_decisions readers)',
        'scripts/apply-migration.js, scripts/lib/migration-guards.js, scripts/lib/migration-tier-classifier.mjs, scripts/check-migration-readiness.mjs',
        'scripts/modules/complete-quick-fix/db-apply-state-gate.js, .github/workflows/drive-reports-ddl.yml',
      ],
      brief_claim_verdicts: {
        '1_stage17_removal_is_pure_deletion_of_dead_write': 'CONFIRMED. 42703 verified live; whole-payload rejection means status/decision never written; no new write path added; createOrReusePendingDecision unchanged.',
        '2_ci_script_is_read_only_static_analysis': 'CONFIRMED. fs only, no DB/secrets/network. ALSO confirmed genuinely enforced (10/10 tests pass, scans the real directory) -- with a measured partial-assurance caveat.',
        '3_sql_files_authored_only_never_applied': 'CONFIRMED on five independent mechanisms (see finding c4-2-sql-files-confirmed-not-applied-and-not-auto-appliable). database/chairman-gated/ is excluded from the default apply path and from every auto-scan; both files classify TIER 2.',
        '4_new_helper_is_read_only_no_new_surface': 'CONFIRMED. Parameterized SELECT on an existing table, caller-supplied client, no new table/credential/external call.',
        '5_stage23_pure_read_and_string_formatting': 'CONFIRMED. status=advisory on every branch, try/catch degrades to the prior static string, no new writes or external calls. One LOW note on last_error interpolation (bounded, no sink).',
      },
      residual_risk:
        'The stage-24 kill-gate auto-approval bypass remains OPEN in production because C4.2 is correctly unapplied. The merged code does not close it; the chairman ceremony does. This is the intended design, recorded so the merge is not mistaken for the remediation.',
    },
    phase: PHASE,
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'Chief Security Architect' },
    results,
    { sdKey: SD_KEY, phase: PHASE, source: 'manual' },
  );

  console.log('SECURITY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
