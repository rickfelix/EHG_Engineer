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
// SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 (FR-2). This scanner is the SD's RECORDED INSTANCE (3): it
// read fixtures across 7 suites plus two worked-example comments as live schema references. Shape B,
// so only isFixturePath — see the helper for why stripComments is shape-A-only.
import { isFixturePath, isFixtureEntry } from '../../lib/lint/added-line-text.mjs';
// QF-20260802-742: the new-vs-pre-existing split, kept pure so both polarities are fixture-testable.
import { violationKey, partitionViolations } from './schema-lint-scope.mjs';

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
// QF-20260802-742: the merge-base SHA a --diff run scoped itself to. Printed in every report so a
// disputed scan scope is auditable, and used as the baseline for the new-vs-pre-existing split.
let mergeBase = null;
// QF-20260802-742: in CI the working tree is not a developer's — it is a fresh checkout whose only
// "local modifications" are line-ending renormalisations. Scope to COMMITTED changes there.
// --committed-only forces it anywhere; --include-worktree opts back in for debugging a CI run.
const committedOnly = args.includes('--committed-only')
  || (!!process.env.CI && !args.includes('--include-worktree'));

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
      // QF-20260802-742: resolve the merge base EXPLICITLY instead of leaning on the `...`
      // shorthand. The SHA becomes printable, so two runs whose scope is disputed can be
      // compared directly — on PR #6738 the checked set drifted 79 -> 140 files across 24
      // minutes with the violation count pinned, and there was no way to tell which run was
      // right. An explicit two-dot diff from that SHA also cannot widen if origin/main
      // advances between the fetch and the diff.
      mergeBase = execSync(`git merge-base ${base} HEAD`, { encoding: 'utf8', timeout: 30000 }).trim();
      // QF-20260802-742: git merge-base exits 1 with no common ancestor (verified against a
      // deliberately shallowed clone), so the throw above normally covers it. This guard closes
      // the exit-0-but-empty case explicitly: a falsy mergeBase would make every baseline lookup
      // return null, and EVERY pre-existing violation would then read as new — the original bug,
      // silently restored. Routed into the same catch so it degrades to advisory, never blocks.
      if (!mergeBase) throw new Error(`merge-base ${base}..HEAD resolved empty (shallow clone?)`);
      const sources = [
        execSync(`git diff --name-only --diff-filter=ACMR ${mergeBase}..HEAD`, { encoding: 'utf8', timeout: 30000 }),
      ];
      // QF-20260802-742: the previous code ALWAYS unioned staged + working-tree + untracked
      // files, on the stated assumption that "the latter two are empty in CI". They are not.
      // CI checkout renormalises line endings, so every CRLF-affected file surfaces as an
      // unstaged modification and joins this PR's scope — the measured 5-file -> 33-file
      // inflation that blocked #6738 on 33 violations with ZERO in its own 12-file diff.
      // Locally they are genuinely wanted for pre-push linting, so they are dropped only
      // where the working tree is not the developer's: CI.
      if (!committedOnly) {
        sources.push(
          execSync('git diff --name-only --diff-filter=ACMR --cached', { encoding: 'utf8', timeout: 30000 }),
          execSync('git diff --name-only --diff-filter=ACMR', { encoding: 'utf8', timeout: 30000 }),
          execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', timeout: 30000 }),
        );
      }
      const out = sources.join('\n');
      return [...new Set(out.split('\n').map(s => s.trim()).filter(Boolean))]
        .filter(f => CODE_RE.test(f))
        .filter(f => RUNTIME_DIRS.includes(f.split('/')[0]))
        .filter(f => !SKIP_DIR_RE.test(f))
        // Supersedes the old top-level-only `split('/')[0] !== 'tests'`: that missed NESTED tests/,
        // __tests__/ and .test./.spec. files entirely — which is how instance (3) happened.
        .filter(f => !isFixturePath(f));
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
      // The --all sweep is a SECOND DOOR, and the diff path FALLS BACK to it when the base is
      // unresolvable — fixing only the diff filter would leave this one serving fixtures. Directories
      // need a trailing '/', which isFixtureEntry encodes so no call site has to remember it.
      if (isFixtureEntry(p, e.isDirectory())) continue;
      if (e.isDirectory()) walk(p);
      else if (CODE_RE.test(e.name)) out.push(p);
    }
  };
  for (const d of RUNTIME_DIRS) if (existsSync(d)) walk(d);
  return out;
}

/** Violations already present in `file` at the merge base. null when there is no baseline. */
function baselineViolationKeys(file) {
  if (!mergeBase) return null; // --all sweep or degraded fallback: nothing to compare against
  let prev;
  try {
    prev = execSync(`git show ${mergeBase}:${file}`, {
      encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return new Set(); // file did not exist at the merge base -> every violation in it is genuinely new
  }
  return new Set(
    findViolations(extractReferences(prev, file), snapshot)
      .filter(v => !allowedTables.has(v.table))
      .map(violationKey)
  );
}

const files = candidateFiles();
const allViolations = [];   // NEW drift — blocks
const preExisting = [];     // present at the merge base — reported, never blocks
for (const file of files) {
  if (allowedFiles.has(file)) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const refs = extractReferences(text, file);
  const violations = findViolations(refs, snapshot)
    .filter(v => !allowedTables.has(v.table));
  if (violations.length === 0) continue;
  // QF-20260802-742: split per VIOLATION, not per file. A PR that legitimately touches a file
  // carrying old violations must not inherit them — that is how main's ~378-violation backlog
  // became individual PRs' problem. This also disarms the CRLF mechanism on its own: a merely
  // renormalised file has byte-identical violations at both ends, so all of them classify as
  // pre-existing and none block.
  const split = partitionViolations(violations, baselineViolationKeys(file));
  allViolations.push(...split.newViolations);
  preExisting.push(...split.preExisting);
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

// QF-20260802-742: the scan scope, stated on every run. Two runs of the same head+base must
// report the same merge_base and the same files_checked; when they do not, this line is the
// evidence. Without it the 79-vs-140 drift on #6738 was unfalsifiable from the logs alone.
const scope = `scope: merge_base=${mergeBase ? mergeBase.slice(0, 8) : 'none'} files=${files.length} committed_only=${committedOnly}`;

if (asJson) {
  console.log(JSON.stringify({
    mode, files_checked: files.length, merge_base: mergeBase, committed_only: committedOnly,
    violations: allViolations, pre_existing: preExisting,
  }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ schema-reference-lint (${mode}): ${files.length} file(s) checked, 0 new violations  [${scope}]`);
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

// QF-20260802-742: the pre-existing backlog gets its own NON-BLOCKING report. main is red at
// ~378 violations in --all mode, so before this split the workflow header's promise that the
// phantom backlog "never blocks a PR" was false in practice for any PR touching an affected file.
// Reported (not silenced) so the backlog stays visible and someone can still choose to clear it.
if (preExisting.length > 0 && !asJson) {
  console.warn(
    `\nℹ️  ${preExisting.length} PRE-EXISTING violation(s) in touched files — present at merge base ` +
    `${mergeBase ? mergeBase.slice(0, 8) : '?'}, NOT introduced by this change, NOT blocking:`
  );
  for (const v of preExisting) console.warn(`   ${v.file}:${v.line}  missing ${v.missing}  (${v.kind})`);
  console.warn(`   To clear the backlog: npm run schema:snapshot:lint (commit the result) or update ${ALLOWLIST_PATH}.`);
}

// FR-1: a degraded --diff run (unresolvable base) is advisory and exits 0; a resolvable-base run
// keeps full diff-scoped blocking. An explicit --all run keeps degradedFallback=false -> unchanged.
// QF-20260802-742: `allViolations` now counts NEW drift only — pre-existing violations are in
// `preExisting` and are deliberately absent from this decision.
process.exitCode = computeExitCode({ violations: allViolations.length, degradedFallback });
