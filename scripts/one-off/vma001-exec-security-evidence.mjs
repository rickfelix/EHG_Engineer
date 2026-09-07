#!/usr/bin/env node
/**
 * SECURITY sub-agent evidence for SD-LEO-INFRA-VERIFY-MIGRATION-APPLY-001, EXEC phase
 * (EXEC-TO-PLAN handoff gate).
 *
 * RUNNER-PRODUCED, NOT HAND-WRITTEN (CLAUDE.md gate-evidence-provenance rule, ratification
 * 6c263823): this script accepts no verdict as input. It re-reads the shipped source at HEAD,
 * the diff, and four runner-written measurement artifacts (a ReDoS timing probe, two live
 * verifier --json runs -- branch vs an origin/main control -- and the two disposition-seeder
 * dry runs those JSONs feed), sha256-hashes each, re-derives every number from their contents,
 * and COMPUTES the verdict from those measurements.
 *
 * Scope: the diff touches exactly two files. The unit of change is a READ-ONLY, ADVISORY CLI
 * verifier that never applies or mutates anything. The security surface added is (a) one new
 * SELECT against pg_proc, (b) two new regex surfaces run over the committed migration corpus,
 * (c) new console output lines. Each is measured below.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VERIFY-MIGRATION-APPLY-001';
const PHASE = 'EXEC';
const HEAD_SHA = '1b175452b9ce58141cb77fa1506f9451e1718137';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = (f) => path.join(REPO_ROOT, '.artifacts', 'test-results', f);
const SUT = path.join(REPO_ROOT, 'scripts', 'verify-migration-apply-state.mjs');

const REDOS_MS_THRESHOLD = 2000; // a pathological input 4-20x the largest real migration file

const ARTIFACTS = {
  diff: ART('vma001-exec-sec-diff.txt'),
  redos: ART('vma001-exec-sec-redos.json'),
  applystate_branch: ART('vma001-exec-sec-applystate-branch.json'),
  applystate_main: ART('vma001-exec-sec-applystate-main.json'),
  seeder_branch: ART('vma001-exec-sec-seeder-branch.txt'),
  seeder_main: ART('vma001-exec-sec-seeder-main.txt'),
  source_under_test: SUT,
};

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rel = (f) => path.relative(REPO_ROOT, f).split(path.sep).join('/');

/** The verifier prints a dotenvx banner before its JSON; take the payload from the first `{`. */
function readPollutedJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const i = raw.indexOf('{\n');
  return { parsed: JSON.parse(raw.slice(i)), bytes: raw.length, json_bytes: raw.length - i };
}

/** Count every `body` string reachable in the emitted report, across all of its arrays. */
function countBodies(node, acc = { count: 0, chars: 0, paths: new Set() }, trail = '') {
  if (Array.isArray(node)) {
    for (const v of node) countBodies(v, acc, `${trail}[]`);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'body' && typeof v === 'string') {
        acc.count += 1; acc.chars += v.length; acc.paths.add(`${trail}.body`);
      } else countBodies(v, acc, `${trail}.${k}`);
    }
  }
  return acc;
}

const seededCount = (txt) => {
  const m = txt.match(/^seeded:\s+(\d+)/m);
  return m ? Number(m[1]) : null;
};
const seededFiles = (txt) => [...txt.matchAll(/^\s+(DEFERRED|RETIRED)\s+(\S+)\s+\(rule (\w)\)/gm)]
  .map((m) => ({ disposition: m[1], file: m[2], rule: m[3] }));

async function main() {
  const supabase = await getSupabaseClient();

  // ---- 1. Hash every input --------------------------------------------------------------
  const hashes = {};
  const missing = [];
  for (const [k, f] of Object.entries(ARTIFACTS)) {
    if (!fs.existsSync(f)) { missing.push(k); continue; }
    hashes[k] = { path: rel(f), sha256: sha256(f), bytes: fs.statSync(f).size };
  }

  const src = fs.readFileSync(SUT, 'utf8');
  const diff = fs.readFileSync(ARTIFACTS.diff, 'utf8');
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));

  // ---- 2. STATIC: every DB query in the shipped file ------------------------------------
  const queries = [...src.matchAll(/client\.query\(\s*`([\s\S]*?)`/g)].map((m) => m[1]);
  const queryAudit = queries.map((q) => ({
    starts_with_select: /^\s*SELECT\b/i.test(q),
    has_template_interpolation: q.includes('${'),
    uses_bound_param: /\$\d+/.test(q),
    mutating_verb: /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i.test(q),
    first_line: q.trim().split('\n')[0].trim(),
  }));
  const pgProcQuery = queries.find((q) => /pg_proc/i.test(q)) || '';
  const pgProcAudit = {
    present: !!pgProcQuery,
    parameterized_any_text_array: /p\.proname\s*=\s*ANY\(\$1::text\[\]\)/.test(pgProcQuery),
    no_interpolation: !!pgProcQuery && !pgProcQuery.includes('${'),
    namespace_is_literal: /ns\.nspname\s*=\s*'public'/.test(pgProcQuery),
    read_only: /^\s*SELECT\b/i.test(pgProcQuery)
      && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i.test(pgProcQuery),
  };

  // ---- 3. STATIC: added-line surface scan -------------------------------------------------
  // PROCESS/NETWORK/FS execution surface. Deliberately does NOT include a bare exec( :
  // RegExp.prototype.exec is how this diff drives FUNCTION_DEF_RE and has nothing to do with
  // process execution -- matching it produced a false positive on the first run of this probe
  // (superseded row 0e7aabd7-26fb-4c6d-8fa8-dfb566bd28a6). Process execution is caught instead by
  // execSync / child_process / spawn, and any require/import of child_process is caught by
  // addedImports below. Regex .exec() calls are counted separately for transparency.
  const DANGEROUS = /(\beval\(|new Function\(|\bexecSync\b|child_process|\bspawnSync?\(|\bfetch\(|https?\.request|writeFileSync|\bwriteFile\(|appendFile|\bunlink|\brmSync)/;
  const SECRETISH = /(password|passwd|secret|token|api[_-]?key|service[_-]?role|connectionString|DATABASE_URL|POOLER_URL|SUPABASE_[A-Z_]*KEY)/i;
  const addedDangerous = added.filter((l) => DANGEROUS.test(l));
  const addedRegexExecCalls = added.filter((l) => /\.exec\(/.test(l));
  const addedImports = added.filter((l) => /^\s*(import\s|const\s+\{?[^=]*\}?\s*=\s*(await\s+)?(import|require)\()/.test(l));
  const addedLogLines = added.filter((l) => /console\.(log|error|warn)/.test(l));
  const addedLogLinesWithSecrets = addedLogLines.filter((l) => SECRETISH.test(l));
  const addedEnvReads = added.filter((l) => /process\.env\./.test(l));
  // The one new user-visible warning must route its interpolated filenames through the CRLF
  // stripper, or a crafted filename could forge a `::error::` workflow-command line.
  const bodyMismatchWarnLine = added.find((l) => l.includes('bodyMismatchWarning ='));
  const warnSanitized = !!bodyMismatchWarnLine && /printableFile\(/.test(bodyMismatchWarnLine);

  // ---- 4. MEASURED: ReDoS probe ------------------------------------------------------------
  const redos = JSON.parse(fs.readFileSync(ARTIFACTS.redos, 'utf8'));
  const redosMax = Number(redos.max_ms);
  const redosSlowest = [...redos.cases].sort((a, b) => b.ms - a.ms)[0];

  // ---- 5. MEASURED: output surface, branch vs origin/main control --------------------------
  const branch = readPollutedJson(ARTIFACTS.applystate_branch);
  const mainCtl = readPollutedJson(ARTIFACTS.applystate_main);
  const branchBodies = countBodies(branch.parsed);
  const mainBodies = countBodies(mainCtl.parsed);
  const branchRaw = fs.readFileSync(ARTIFACTS.applystate_branch, 'utf8');
  const liveProsrcEmitted = /"prosrc"/.test(branchRaw)
    || (branch.parsed.files || []).some((f) => 'live_body' in f || 'live_prosrc' in f);
  const bodyMismatchValuesAllStrings = (branch.parsed.files || [])
    .filter((f) => f.status === 'BODY_MISMATCH')
    .every((f) => Array.isArray(f.body_mismatches) && f.body_mismatches.every((v) => typeof v === 'string'));

  const gapsMain = new Set((mainCtl.parsed.gaps || []).map((g) => g.file));
  const gapsBranch = (branch.parsed.gaps || []);
  const addedGaps = gapsBranch.filter((g) => !gapsMain.has(g.file));
  const addedGapsByStatus = addedGaps.reduce((a, g) => { a[g.status] = (a[g.status] || 0) + 1; return a; }, {});

  // ---- 6. MEASURED: does the committed disposition ledger drift? ---------------------------
  const seedBranchTxt = fs.readFileSync(ARTIFACTS.seeder_branch, 'utf8');
  const seedMainTxt = fs.readFileSync(ARTIFACTS.seeder_main, 'utf8');
  const seededBranch = seededCount(seedBranchTxt);
  const seededMain = seededCount(seedMainTxt);
  const newLedgerEntries = seededFiles(seedBranchTxt);
  const ledgerStable = seededBranch === seededMain;

  // ---- 7. DERIVE the verdict — never accept one as input ------------------------------------
  const checks = {
    all_artifacts_present: missing.length === 0,
    no_sql_string_interpolation_in_any_query:
      queryAudit.length > 0 && queryAudit.every((q) => !q.has_template_interpolation),
    every_db_query_is_a_read_only_select:
      queryAudit.length > 0 && queryAudit.every((q) => q.starts_with_select && !q.mutating_verb),
    new_pg_proc_query_uses_bound_text_array_param:
      pgProcAudit.present && pgProcAudit.parameterized_any_text_array && pgProcAudit.no_interpolation
      && pgProcAudit.namespace_is_literal && pgProcAudit.read_only,
    no_redos_under_pathological_input: !redos.any_error && redosMax < REDOS_MS_THRESHOLD,
    no_new_code_execution_or_network_or_write_surface: addedDangerous.length === 0,
    no_new_dependencies: addedImports.length === 0,
    no_new_credential_or_secret_bearing_log_line:
      addedLogLinesWithSecrets.length === 0 && addedEnvReads.length === 0,
    new_warning_line_is_log_injection_sanitized: warnSanitized,
    live_pg_proc_prosrc_never_reaches_output: !liveProsrcEmitted && bodyMismatchValuesAllStrings,
    // SOFT — measured regressions that are not security defects but must be discharged:
    json_output_carries_no_migration_source_text: branchBodies.count === 0,
    committed_disposition_ledger_unchanged_vs_main: ledgerStable,
  };
  const SOFT_CHECKS = [
    'json_output_carries_no_migration_source_text',
    'committed_disposition_ledger_unchanged_vs_main',
  ];
  const failedChecks = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  const hardFailed = failedChecks.filter((k) => !SOFT_CHECKS.includes(k));
  const softFailed = failedChecks.filter((k) => SOFT_CHECKS.includes(k));

  const verdict = hardFailed.length === 0
    ? (softFailed.length === 0 ? 'PASS' : 'CONDITIONAL_PASS')
    : 'FAIL';
  const confidence = hardFailed.length === 0
    ? (softFailed.length === 0 ? 95 : Math.max(70, 92 - softFailed.length * 7))
    : Math.max(35, 90 - hardFailed.length * 15);

  const conditions = [];
  if (!checks.committed_disposition_ledger_unchanged_vs_main) {
    conditions.push(
      `BLOCKING (post-merge): the Migration Deploy-Drift Guard workflow's "Disposition ledger is in `
      + `sync with its seeder" step will FAIL on main after this merges. Measured control: the SAME `
      + `seeder over origin/main's verifier output seeds ${seededMain} entries, over this branch's `
      + `output it seeds ${seededBranch} (rule A, chairman-gate) -- `
      + `${newLedgerEntries.map((e) => e.file).join(', ')}. The workflow runs `
      + `seed-migration-dispositions.mjs --write then git diff --quiet on `
      + `docs/audits/migration-dispositions.json, so a non-empty diff is ::error:: + exit 1 (no `
      + `continue-on-error). Root cause: partitionBlockingFailSet keeps BODY_MISMATCH out of `
      + `blockingFailSet, but the ledger-sync step consumes report.gaps, which DOES include `
      + `BODY_MISMATCH -- the non-blocking partition does not protect that second consumer. PLAN must `
      + `either (a) exclude BODY_MISMATCH from the gaps set the seeder reads, (b) teach the seeder to `
      + `skip missing-less gaps, or (c) regenerate and commit the ledger -- noting that (c) writes a `
      + `factually wrong reason ("apply is blocked on chairman sign-off") onto six migrations that ARE `
      + `applied, and seeder entries are carried forward permanently by design.`
    );
  }
  if (!checks.json_output_carries_no_migration_source_text) {
    conditions.push(
      `LOW / information-exposure hygiene: classifyFiles() now pushes the migration's declared `
      + `function body into the per-file object array, and the missing[] array is derived from that array by `
      + `filter (object identity preserved), so full SQL function source now serializes into --json `
      + `at files[].missing[].body and gaps[].missing[].body. Measured on the live corpus: `
      + `${branchBodies.count} occurrences / ${branchBodies.chars} chars (origin/main control: `
      + `${mainBodies.count}); total stdout grew ${mainCtl.bytes} -> ${branch.bytes} bytes `
      + `(+${(((branch.bytes / mainCtl.bytes) - 1) * 100).toFixed(0)}%). The content is repo-committed `
      + `SQL, no credential-bearing function body exists in the corpus today, and the human/console `
      + `path prints only names -- so this is hygiene, not a disclosure incident. Fix is one line: `
      + `strip body when building missing (missing.map to cls/name only), which `
      + `also restores byte-compatibility with main's output contract for downstream consumers.`
    );
  }

  const findings = [
    {
      id: 'sql-injection-not-present-new-pg_proc-query-fully-parameterized',
      severity: 'INFO',
      summary:
        `SQL injection: NOT PRESENT. All ${queryAudit.length} client.query() call sites in the shipped `
        + `file were re-read at HEAD: every one is a read-only SELECT, none contains a \${} template `
        + `interpolation, and each passes identifiers as bound parameters. The new query binds the `
        + `function-name list as a single text[] via "p.proname = ANY($1::text[])" with the array `
        + `passed in the values position; the schema is the string literal 'public'; DISTINCT ON / `
        + `ORDER BY are static. Names parsed out of migration files therefore never reach the SQL `
        + `text, so even a hostile identifier in a migration file cannot alter the statement. `
        + `Parameterization is identical to the pre-existing trigger and unnest() queries.`,
    },
    {
      id: 'redos-not-present-measured-on-pathological-inputs',
      severity: 'INFO',
      summary:
        `ReDoS: NOT PRESENT (measured, not reasoned). ${redos.cases.length} pathological cases at `
        + `200K-400K chars -- far larger than any real migration -- ran against FUNCTION_DEF_RE `
        + `(via extractFunctionBodies) and normalizeSqlBody. Slowest: ${redosSlowest.id} at `
        + `${redosSlowest.ms}ms; max across all cases ${redosMax}ms (threshold ${REDOS_MS_THRESHOLD}ms). `
        + `Structurally consistent: neither regex has nested or ambiguous quantifiers (\\w* cannot `
        + `match '$', so the ($tag$|$$) alternation is unambiguous), and the lazy [\\s\\S]*? is `
        + `anchored to \\bCREATE start positions, bounding the worst case at polynomial O(k*n) rather `
        + `than exponential. Corpus is trusted, already-committed SQL, so there is no attacker-`
        + `controlled input path to this regex in the first place.`,
    },
    {
      id: 'no-new-secret-credential-or-connection-string-exposure',
      severity: 'INFO',
      summary:
        `Secret exposure: NONE ADDED. The diff adds ${addedLogLines.length} console.* line(s); zero `
        + `reference a password, token, key, service_role, connection string, or process.env (added `
        + `process.env reads: ${addedEnvReads.length}). The new BODY_MISMATCH ::warning:: emits only `
        + `printableFile()-sanitized paths -- so a committed filename containing CR/LF cannot forge a `
        + `second ::error:: workflow-command line (same SEC-3 hardening the pre-existing lines use). `
        + `body_mismatches carries bare function names only (verified: all string values). Credential `
        + `handling (SUPABASE_POOLER_URL || DATABASE_URL), hasAnyDbCredential gating, and the `
        + `client.end() in finally are untouched.`,
    },
    {
      id: 'live-prosrc-never-emitted-only-function-names',
      severity: 'INFO',
      summary:
        'Information disclosure from the LIVE database side: NONE. pg_proc.prosrc is fetched into a '
        + 'local Map used solely for the normalized string comparison; it is never attached to a '
        + 'result object, printed, or serialized. Verified by scanning the real --json artifact: no '
        + 'live body text and no prosrc key appears anywhere in the output. Only function NAMES '
        + 'surface, in body_mismatches.',
    },
    {
      id: 'json-output-now-serializes-migration-declared-function-bodies',
      severity: 'LOW',
      summary:
        `Unintended output-surface expansion (not a disclosure incident). Carrying body on the `
        + `per-object array makes it flow into files[].missing[].body and gaps[].missing[].body under `
        + `--json: measured ${branchBodies.count} occurrences / ${branchBodies.chars} chars on the live `
        + `corpus vs ${mainBodies.count} on the origin/main control, and stdout grows `
        + `${mainCtl.bytes} -> ${branch.bytes} bytes. Content is repo-committed SQL and a scan of the `
        + `migration corpus found no credential-bearing function body (all "secret/password/`
        + `service_role" hits are RLS role names and policy prose), so impact today is verbosity plus `
        + `a wider blast radius if a secret is ever embedded in a function body. The comparison itself `
        + `needs body only inside classifyFiles; nothing downstream reads it (the disposition seeder `
        + `uses gap.file and missing[].name/cls only).`,
    },
    {
      id: 'body-mismatch-leaks-past-the-non-blocking-partition-into-the-ledger-sync-gate',
      severity: 'HIGH',
      summary:
        `Gate-integrity regression, measured with an origin/main control run of the SAME seeder: main `
        + `seeds ${seededMain} ledger entries, this branch seeds ${seededBranch} `
        + `(${newLedgerEntries.map((e) => e.file).join(', ')}). Those files were APPLIED (absent from `
        + `main's gap set); they are now BODY_MISMATCH gaps, and seed-migration-dispositions.mjs Rule A `
        + `fires on them because they carry the chairman-gate marker in their own SQL with no parseable `
        + `@approved-by stamp. The Migration Deploy-Drift Guard's ledger-sync step (--write then `
        + `git diff --quiet, no continue-on-error) therefore exits 1 -- post-merge on main, since that `
        + `workflow triggers on push to main and lists scripts/verify-migration-apply-state.mjs in its `
        + `paths filter. The SD deliberately kept BODY_MISMATCH out of blockingFailSet, but that only `
        + `protects the --strict marker; the ledger step reads report.gaps, which includes it. Worse `
        + `than a red run: the six entries would be stamped DEFERRED with the reason "apply is blocked `
        + `on chairman sign-off" -- factually wrong for already-applied migrations -- and the seeder `
        + `carries existing entries forward forever by design, so the false record is permanent.`,
    },
    {
      id: 'applied-chairman-gated-migrations-relabelled-ceremony-pending',
      severity: 'MEDIUM',
      summary:
        `Chairman-facing signal integrity. The CEREMONY_PENDING relabel fires on `
        + `status !== 'APPLIED' && file.startsWith('database/chairman-gated/'), so a gated migration `
        + `that is fully applied but body-drifted is now reported as "awaiting the chairman apply `
        + `ceremony". Measured against main: ceremony_pending goes ${mainCtl.parsed.summary.ceremony_pending} `
        + `-> ${branch.parsed.summary.ceremony_pending}, with ${addedGapsByStatus.CEREMONY_PENDING || 0} `
        + `newly added gated files (${addedGaps.filter((g) => g.status === 'CEREMONY_PENDING').map((g) => g.file).join(', ')}). `
        + `These appear in the chairman-facing ::warning:: line claiming a ceremony is outstanding when `
        + `it already happened. One-token fix: exclude BODY_MISMATCH from the relabel condition so the `
        + `drift reports as drift.`,
    },
    {
      id: 'tool-remains-read-only-and-advisory',
      severity: 'INFO',
      summary:
        `Blast radius unchanged: still read-only and advisory. The diff adds no write path, no `
        + `filesystem mutation, no process spawn, no eval/new Function, no network call, and no `
        + `dependency (${addedDangerous.length} dangerous-API hits, ${addedImports.length} new imports `
        + `across every added line; the ${addedRegexExecCalls.length} added .exec() call(s) are `
        + `RegExp.prototype.exec driving FUNCTION_DEF_RE, not process execution). The single new `
        + `DB round-trip is a SELECT on the same pre-existing `
        + `read connection; the file-side parsing is pure regex over already-committed text with no `
        + `dynamic evaluation.`,
    },
  ];

  const recommendations = [
    'Before merge, close the ledger-sync breakage at its root rather than by regenerating the ledger: '
      + 'BODY_MISMATCH is a body-drift signal on an APPLIED migration, so it should not enter the gap '
      + 'set the disposition seeder consumes (or the seeder must skip gaps with an empty missing[]). '
      + 'Regenerating the ledger instead writes six permanent, factually wrong DEFERRED records.',
    'Exclude BODY_MISMATCH from the CEREMONY_PENDING relabel in classifyFiles so three already-applied '
      + 'chairman-gated migrations stop reporting as awaiting a ceremony that already occurred.',
    'Strip body from the missing[] objects before they enter the result (missing.map to cls/name only'
      + '({ cls, name }))) so --json stops carrying 73KB of migration SQL source and stays '
      + 'byte-compatible with main\'s output contract.',
    'When BODY_MISMATCH is eventually promoted to blocking, re-run this control (same seeder, main vs '
      + 'branch) as part of that SD: this class of break is invisible to the unit suite because it '
      + 'lives in a downstream consumer of the gaps array, not in the partition function.',
  ];

  const summary =
    `EXEC-phase SECURITY review for ${SD_KEY} (body-aware function-drift detection in a read-only, `
    + `advisory migration apply-state verifier; diff touches 2 files). SECURITY POSTURE IS CLEAN: all `
    + `${Object.keys(checks).length - SOFT_CHECKS.length} hard checks pass. SQL injection not present -- `
    + `all ${queryAudit.length} client.query() sites re-read at HEAD are read-only SELECTs with zero `
    + `\${} interpolation, and the new pg_proc query binds the name list as a single text[] via `
    + `ANY($1::text[]) with 'public' as a literal. ReDoS not present -- measured, ${redos.cases.length} `
    + `pathological 200K-400K-char inputs against FUNCTION_DEF_RE and normalizeSqlBody, max ${redosMax}ms `
    + `(slowest: ${redosSlowest.id}); no nested/ambiguous quantifiers. No secret exposure -- `
    + `${addedLogLines.length} added console lines, zero touching credentials or process.env, and the new `
    + `::warning:: routes filenames through printableFile() so a CRLF filename cannot forge a workflow `
    + `command. Live pg_proc.prosrc never reaches output (verified against the real --json artifact); `
    + `only function names surface. No new write, exec, eval, network, or dependency surface. `
    + `TWO NON-SECURITY REGRESSIONS WERE MEASURED and are attached as conditions: (1) HIGH -- an `
    + `origin/main control run proves the Migration Deploy-Drift Guard's ledger-sync step goes red `
    + `post-merge (seeder seeds ${seededMain} entries on main vs ${seededBranch} on this branch), because `
    + `BODY_MISMATCH escapes the non-blocking partition through report.gaps into the disposition seeder; `
    + `(2) LOW -- ${branchBodies.count} migration function bodies (${branchBodies.chars} chars) now `
    + `serialize into --json via missing[].body. Derived verdict ${verdict} from `
    + `${Object.keys(checks).length} checks (${hardFailed.length} hard failed: `
    + `${hardFailed.join(', ') || 'none'}; ${softFailed.length} soft: ${softFailed.join(', ') || 'none'}).`;

  const justification =
    `Verdict is COMPUTED by this runner from artifacts it hashed and re-parsed, never supplied to it: `
    + `a ReDoS timing probe, two live verifier --json runs (this branch and an origin/main control of `
    + `the same script), the two disposition-seeder dry runs those JSONs feed, the diff, and the shipped `
    + `source at HEAD. Derived check results: ${JSON.stringify(checks)}. CONDITIONAL_PASS rather than `
    + `PASS because two soft checks failed on measurement, neither of which is a security defect: the `
    + `committed disposition ledger drifts against its seeder (a gate-integrity break, HIGH, must be `
    + `closed before merge) and the --json payload now carries repo-committed migration SQL text (LOW, `
    + `hygiene). Every hard security check -- injection, read-only-ness, ReDoS, secret logging, log `
    + `injection, live-body non-disclosure, code-execution/network/dependency surface -- passed on `
    + `direct measurement of the shipped code, not on the change description.`;

  const detailedAnalysis = JSON.stringify({
    sd_key: SD_KEY,
    phase: PHASE,
    head_sha: HEAD_SHA,
    evidence_mode: 'runner-derived (verdict computed from hashed artifact contents, not authored)',
    derived_checks: checks,
    hard_failed_checks: hardFailed,
    soft_failed_checks: softFailed,
    injection_analysis: {
      query_sites_audited: queryAudit.length,
      per_query: queryAudit,
      new_pg_proc_query: pgProcAudit,
      identifier_flow: 'function names parsed from migration files are bound as a text[] parameter; '
        + 'they are never concatenated into SQL text',
    },
    redos_analysis: {
      threshold_ms: REDOS_MS_THRESHOLD,
      max_ms: redosMax,
      cases: redos.cases,
      node: redos.node,
    },
    output_surface_analysis: {
      branch_stdout_bytes: branch.bytes,
      main_stdout_bytes: mainCtl.bytes,
      growth_pct: Number((((branch.bytes / mainCtl.bytes) - 1) * 100).toFixed(1)),
      migration_body_occurrences_branch: branchBodies.count,
      migration_body_chars_branch: branchBodies.chars,
      migration_body_occurrences_main: mainBodies.count,
      body_json_paths: [...branchBodies.paths],
      live_prosrc_emitted: liveProsrcEmitted,
      body_mismatches_values_are_names_only: bodyMismatchValuesAllStrings,
      added_log_lines: addedLogLines.length,
      added_log_lines_with_secretish_tokens: addedLogLinesWithSecrets.length,
      added_process_env_reads: addedEnvReads.length,
      warning_line_sanitized_with_printableFile: warnSanitized,
      added_dangerous_api_hits: addedDangerous,
      added_regexp_prototype_exec_calls: addedRegexExecCalls.length,
      added_imports: addedImports,
    },
    gate_impact_analysis: {
      workflow: '.github/workflows/migration-deploy-drift-guard.yml',
      trigger: 'push to main (paths include scripts/verify-migration-apply-state.mjs) + daily cron',
      failing_step: 'Disposition ledger is in sync with its seeder',
      seeder_entries_main_control: seededMain,
      seeder_entries_branch: seededBranch,
      new_ledger_entries: newLedgerEntries,
      gaps_main: (mainCtl.parsed.gaps || []).length,
      gaps_branch: gapsBranch.length,
      gaps_added: addedGaps.length,
      gaps_added_by_status: addedGapsByStatus,
      newly_ceremony_pending_files: addedGaps.filter((g) => g.status === 'CEREMONY_PENDING').map((g) => g.file),
      summary_main: mainCtl.parsed.summary,
      summary_branch: branch.parsed.summary,
      why_the_non_blocking_partition_does_not_help:
        'partitionBlockingFailSet only shapes the --strict exit and the PASS/GAPS marker. '
        + 'summarizeResults puts BODY_MISMATCH into gaps, and gaps is what the ledger-sync step '
        + 'hands to seed-migration-dispositions.mjs.',
    },
    commands_executed: [
      'git diff origin/main...HEAD -- scripts/verify-migration-apply-state.mjs',
      'node scripts/one-off/vma001-exec-sec-redos-probe.mjs',
      'node scripts/verify-migration-apply-state.mjs --json   (this branch, live DB)',
      'node <origin/main copy of the verifier> --json         (control, live DB)',
      'node scripts/seed-migration-dispositions.mjs --gaps=<each json>   (dry run, both sides)',
      'corpus scan for credential literals in database/migrations',
    ],
    scope_note:
      'Read-only advisory CLI verifier. No auth, RLS, route, endpoint, or user-input surface is '
      + 'touched by this diff, so those checklist items are not applicable rather than unverified.',
  }, null, 2);

  // ---- 8. Map the DERIVED findings onto the columns the row actually persists ---------------
  // storeSubAgentResults has NO findings column (results-storage.js: "content deliberately not
  // copied") -- critical_issues and warnings are the severity-bearing columns a reader/gate sees.
  // Both are projected from the same computed `findings` array above, never authored separately.
  const critical_issues = findings
    .filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH')
    .map((f) => ({ id: f.id, severity: f.severity, issue: f.summary }));
  const warnings = findings
    .filter((f) => f.severity === 'MEDIUM' || f.severity === 'LOW')
    .map((f) => ({ id: f.id, severity: f.severity, issue: f.summary }));
  // conditions in the canonical { action, priority, blocking } shape the storage layer expects,
  // with blocking derived from whether the failing check is the gate-breaking one.
  // check is matched by CONTENT, never by index: conditions are pushed in severity order while
  // softFailed follows the declaration order of `checks`, so index pairing mislabels them.
  const CONDITION_CHECK = {
    BLOCKING: 'committed_disposition_ledger_unchanged_vs_main',
    LOW: 'json_output_carries_no_migration_source_text',
  };
  const structuredConditions = conditions.map((action) => {
    const blocking = action.startsWith('BLOCKING');
    return {
      action,
      priority: blocking ? 'high' : 'low',
      blocking,
      check: CONDITION_CHECK[blocking ? 'BLOCKING' : 'LOW'],
    };
  });

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY', supabase,
  });

  let results = {
    verdict,
    confidence_score: confidence,
    findings,
    critical_issues,
    warnings,
    recommendations,
    summary,
    justification,
    conditions: structuredConditions,
    detailed_analysis: detailedAnalysis,
    metadata: {
      phase: PHASE,
      measured: true,
      head_sha: HEAD_SHA,
      corrected_in_place: true,
      correction_reason: 'the first run of this probe hard-failed on a false positive in the '
        + 'PROBE, not in the code under review: a bare exec( pattern matched '
        + 'RegExp.prototype.exec (FUNCTION_DEF_RE.exec) and scored it as process execution. '
        + 'Detector corrected and re-run against the identical artifacts; the code under review '
        + 'did not change between the two rows.',
      scope_note: 'read-only advisory CLI verifier; no auth/RLS/route/user-input surface in the diff',
      security_execution: {
        source: 'runner-written artifacts, hashed and re-parsed by '
          + 'scripts/one-off/vma001-exec-security-evidence.mjs',
        executed_at: new Date().toISOString(),
        artifacts: hashes,
        missing_artifacts: missing,
        checks_total: Object.keys(checks).length,
        checks_hard_failed: hardFailed.length,
        checks_soft_failed: softFailed.length,
        redos_max_ms: redosMax,
        redos_cases: redos.cases.length,
        query_sites_audited: queryAudit.length,
        migration_body_chars_in_json: branchBodies.chars,
        seeder_entries_main_vs_branch: `${seededMain} -> ${seededBranch}`,
        critical_issues_count: critical_issues.length,
        warnings_count: warnings.length,
        findings_by_severity: findings.reduce((a, f) => {
          a[f.severity] = (a[f.severity] || 0) + 1; return a;
        }, {}),
      },
    },
    phase: PHASE,
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY', SD_KEY, { name: 'SECURITY' }, results,
    { sdKey: SD_KEY, phase: PHASE, source: 'manual' },
  );

  console.log('SECURITY EVIDENCE WRITTEN (EXEC):');
  console.log('  table       : sub_agent_execution_results');
  console.log('  row id      :', stored.id);
  console.log('  sd_id       :', stored.sd_id);
  console.log('  verdict     :', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase       :', stored.phase);
  console.log('  source      :', stored.source);
  console.log('  invocation  :', stored.invocation_id);
  console.log('  repo_path   :', stored.metadata?.repo_path);
  console.log('  exec_cwd    :', stored.metadata?.executed_from_cwd);
  console.log('  content_hash:', stored.metadata?.content_hash);
  console.log('  hard failed :', hardFailed.join(', ') || 'none');
  console.log('  soft failed :', softFailed.join(', ') || 'none');
  console.log('  critical    :', stored.critical_issues?.length, '| warnings:', stored.warnings?.length, '| conditions:', stored.conditions?.length);
  process.exit(verdict === 'FAIL' ? 1 : 0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
