/**
 * Schema-reference lint CLI.
 * SD-LEO-INFRA-SCHEMA-REFERENCE-LINT-001 (FR-3).
 *
 * Blocks NEW code that references nonexistent tables/columns by comparing
 * extracted supabase/raw-SQL references against the committed snapshot
 * (database/schema-reference-snapshot.json) — offline, no DB access.
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with
 *       origin/main — the existing phantom backlog (~30 tables / 782 column
 *       refs found by the 2026-06-10 data-layer scan) never blocks a PR.
 *   --all: advisory full sweep of the runtime dirs.
 *   --json: machine output.
 *
 * Escapes (each documented in the failure output):
 *   - scripts/lint/schema-reference-allowlist.json — files (cross-DB clients,
 *     dynamic table names) and table names to skip.
 *   - inline pragma: any line containing `schema-lint-disable-line`.
 *
 * Exit: 1 when violations found, 0 otherwise. Snapshot >7 days old → warning
 * (never a failure).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { extractReferences, findViolations } from './schema-reference-extract.mjs';
// SD-LEO-INFRA-SCHEMA-LINT-DEGRADED-FAILOPEN-001: a degraded --diff run (unresolvable base ->
// whole-repo fallback) is ADVISORY and must not block; the pure helper encodes that exit rule.
import { computeExitCode } from './schema-lint-exit.mjs';

const SNAPSHOT_PATH = 'database/schema-reference-snapshot.json';
const ALLOWLIST_PATH = 'scripts/lint/schema-reference-allowlist.json';
const RUNTIME_DIRS = ['scripts', 'lib', 'src', 'server', 'api', 'app'];
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/;
const CODE_RE = /\.(js|cjs|mjs|ts|tsx|jsx)$/;
const STALE_DAYS = 7;

const args = process.argv.slice(2);
const mode = args.includes('--all') ? 'all' : 'diff';
const asJson = args.includes('--json');
// SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-C (FR-C1): OPT-IN breakage surfacing. Default OFF so
// pre-push CI behavior is byte-unchanged; when --alert is passed and drift is found, surface ONE
// schema-drift row to system_alerts via the shared fail-soft boundary (never changes the lint exit).
const alertOnDrift = args.includes('--alert');
// True when a --diff run could not resolve its git base and fell back to a full RUNTIME_DIRS sweep.
// A full sweep re-surfaces the pre-existing phantom backlog (not NEW drift), so we must NOT fire a
// critical schema-drift alert on it (adversarial-review finding) — only a genuine diff-scoped result is.
let degradedFallback = false;

function loadJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

const snapshot = loadJson(SNAPSHOT_PATH, null);
if (!snapshot) {
  console.error(`schema-reference-lint: snapshot missing at ${SNAPSHOT_PATH} — run: npm run schema:snapshot:lint`);
  process.exit(asJson ? 0 : 1); // missing snapshot is a setup error, fail loud in text mode
}

const allowlist = loadJson(ALLOWLIST_PATH, { files: [], tables: [] });
const allowedFiles = new Set((allowlist.files || []).map(f => f.replace(/\\/g, '/')));
const allowedTables = new Set(allowlist.tables || []);

// Staleness warning (never blocking).
const ageDays = (Date.now() - Date.parse(snapshot.generated_at || 0)) / 86400000;
if (Number.isFinite(ageDays) && ageDays > STALE_DAYS) {
  console.warn(`⚠️  schema snapshot is ${Math.floor(ageDays)} days old — regenerate with: npm run schema:snapshot:lint`);
}

/** Candidate files per mode. */
function candidateFiles() {
  if (mode === 'diff') {
    try {
      const base = process.env.SCHEMA_LINT_BASE || 'origin/main';
      // Committed changes vs the merge base + staged + working-tree changes —
      // the latter two are empty in CI but make local pre-push linting correct.
      const out = [
        execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`, { encoding: 'utf8', timeout: 30000 }),
        execSync('git diff --name-only --diff-filter=ACMR --cached', { encoding: 'utf8', timeout: 30000 }),
        execSync('git diff --name-only --diff-filter=ACMR', { encoding: 'utf8', timeout: 30000 }),
        execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', timeout: 30000 }),
      ].join('\n');
      return [...new Set(out.split('\n').map(s => s.trim()).filter(Boolean))]
        .filter(f => CODE_RE.test(f))
        .filter(f => RUNTIME_DIRS.includes(f.split('/')[0]))
        .filter(f => !SKIP_DIR_RE.test(f))
        .filter(f => f.split('/')[0] !== 'tests');
    } catch (e) {
      // Fail-soft: no diff base resolvable → advisory full sweep instead of a false block.
      console.warn(`⚠️  diff base unavailable (${e.message.split('\n')[0]}) — falling back to --all (advisory)`);
      degradedFallback = true; // mark the sweep degraded so the opt-in alert does not fire on the backlog
      return candidateFilesAll();
    }
  }
  return candidateFilesAll();
}

function candidateFilesAll() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name).replace(/\\/g, '/');
      if (SKIP_DIR_RE.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (CODE_RE.test(e.name)) out.push(p);
    }
  };
  for (const d of RUNTIME_DIRS) if (existsSync(d)) walk(d);
  return out;
}

const files = candidateFiles();
const allViolations = [];
for (const file of files) {
  if (allowedFiles.has(file)) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const refs = extractReferences(text, file);
  const violations = findViolations(refs, snapshot)
    .filter(v => !allowedTables.has(v.table));
  allViolations.push(...violations);
}

// FR-C1: opt-in breakage surfacing — emit ONE schema-drift system_alerts row ONLY for a genuine
// diff-scoped NEW drift (mode==='diff' and the diff base resolved). A full sweep (--all) or a degraded
// --diff fallback re-surfaces the pre-existing phantom backlog, NOT new drift, so it must not fire a
// critical alert (adversarial-review finding). Fail-soft: the boundary never throws, so the lint exit
// below is untouched regardless.
if (alertOnDrift && allViolations.length > 0 && mode === 'diff' && !degradedFallback) {
  const { createRequire } = await import('node:module');
  const { emitBreakageAlert } = createRequire(import.meta.url)('../../lib/breakage/emit-breakage-alert.cjs');
  await emitBreakageAlert('schema-drift', 'schema-reference-lint', {
    message: `schema-reference-lint (diff): ${allViolations.length} NEW schema-reference violation(s)`,
    sourceEntityId: allViolations[0] ? `${allViolations[0].file}:${allViolations[0].line}` : null,
    metadata: { violation_count: allViolations.length, mode: 'diff', first_violation: allViolations[0] || null },
  });
}

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ schema-reference-lint (${mode}): ${files.length} file(s) checked, 0 violations`);
} else if (degradedFallback) {
  // Degraded full-repo sweep (the --diff base was unresolvable): these are the pre-existing
  // backlog, NOT new drift, and the check is NON-BLOCKING (advisory). Print as a warning.
  console.warn(`⚠️  schema-reference-lint (advisory — DEGRADED full-repo sweep, diff base unresolvable): ${allViolations.length} pre-existing reference(s) across ${files.length} file(s) checked. NOT blocking this PR (no diff base to scope new drift).`);
  for (const v of allViolations) {
    console.warn(`   ${v.file}:${v.line}  missing ${v.missing}  (${v.kind})`);
  }
  console.warn(
    '\nThis is the known phantom backlog re-surfaced because the diff base could not be fetched; ' +
    'it does not reflect new drift introduced by this change. To clear the backlog: ' +
    'npm run schema:snapshot:lint (commit the result) or update ' + ALLOWLIST_PATH + '.'
  );
} else {
  console.error(`❌ schema-reference-lint (${mode}): ${allViolations.length} violation(s) in ${files.length} file(s) checked:\n`);
  for (const v of allViolations) {
    console.error(`   ${v.file}:${v.line}  missing ${v.missing}  (${v.kind})`);
  }
  console.error(
    '\nThese references do not exist in the live schema snapshot ' +
    `(${SNAPSHOT_PATH}, generated ${snapshot.generated_at}).\n` +
    'If the schema is newer than the snapshot: npm run schema:snapshot:lint (commit the result).\n' +
    'If this is a dynamic/cross-DB reference: add the file or table to ' + ALLOWLIST_PATH + '.\n' +
    'For a single intentional line: append a comment containing schema-lint-disable-line.'
  );
}

// FR-1: a degraded --diff run (unresolvable base) is advisory and exits 0; a resolvable-base run
// keeps full diff-scoped blocking. An explicit --all run keeps degradedFallback=false -> unchanged.
process.exitCode = computeExitCode({ violations: allViolations.length, degradedFallback });
