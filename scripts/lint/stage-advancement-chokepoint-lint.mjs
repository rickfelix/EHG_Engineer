/**
 * Stage-advancement chokepoint lint CLI.
 * SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-5.
 *
 * THE RULE (docs/architecture/stage-advancement-path-census.md): a governance gate on ONE
 * advancement path is not a block -- every path that writes ventures.current_lifecycle_stage
 * must be censused and either gated, deliberately exempt (revert-only/initialization/manual
 * operator override), or documented as a deferred bypass. This lint prevents a NEW, uncensused
 * write from being silently introduced after this SD ships.
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main -- the
 *       known census (scripts/lint/stage-advancement-chokepoint-allowlist.json) never blocks
 *       an unrelated PR.
 *   --all: advisory full sweep (used to confirm the allowlist suppresses the known census; not
 *       run in CI by default).
 *
 * Escapes (documented in the failure output):
 *   - scripts/lint/stage-advancement-chokepoint-allowlist.json -- files with a censused,
 *     accepted write (docs/architecture/stage-advancement-path-census.md).
 *   - inline pragma: any line containing `stage-advancement-lint-disable-line`.
 *
 * Mirrors scripts/lint/diagnostic-gauge-citation-lint.mjs's design (diff-scoped, allowlist,
 * inline pragma, offline/no-DB-access).
 *
 * Exit: 1 when violations found outside the allowlist, 0 otherwise.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ALLOWLIST_PATH = 'scripts/lint/stage-advancement-chokepoint-allowlist.json';
const RUNTIME_DIRS = ['scripts', 'lib', 'database'];
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/i;
const SKIP_FILE_RE = /(_DOWN|_rollback)\.sql$/i;
const CODE_RE = /\.(js|cjs|mjs|ts|tsx|jsx|sql)$/;
const DISABLE_PRAGMA = 'stage-advancement-lint-disable-line';

// Matches a genuine WRITE: SQL `SET current_lifecycle_stage =`, trigger assignment
// `current_lifecycle_stage :=`, an UPSERT's EXCLUDED-column target, or a JS `.update({...
// current_lifecycle_stage: <expr>` object-literal key. Deliberately does NOT match a bare
// `ON x.current_lifecycle_stage = y.col` JOIN condition, a WHERE/SELECT read, or a JSDoc-style
// `current_lifecycle_stage: number` type annotation.
const WRITE_PATTERN_RE = /(\bSET\s+.*?\bcurrent_lifecycle_stage\s*=|current_lifecycle_stage\s*:=|current_lifecycle_stage\s*=\s*EXCLUDED\.current_lifecycle_stage|\.update\(\s*\{[^}]*current_lifecycle_stage\s*:\s*(?!number\b|string\b|integer\b))/;
const READ_CONTEXT_RE = /^\s*(SELECT|WHERE|--|\*|\/\/|AND|OR|LEFT JOIN|JOIN|ON\s)\b/i;

const THE_RULE = 'A governance gate on ONE advancement path is not a block -- every path that writes ventures.current_lifecycle_stage must be censused and either gated, deliberately exempt, or documented as a deferred bypass (docs/architecture/stage-advancement-path-census.md).';

const args = process.argv.slice(2);
const mode = args.includes('--all') ? 'all' : 'diff';
const asJson = args.includes('--json');

function loadJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

const allowlist = loadJson(ALLOWLIST_PATH, { files: [] });
const allowedFiles = new Set((allowlist.files || []).map((f) => f.replace(/\\/g, '/')));

function candidateFiles() {
  if (mode === 'diff') {
    try {
      const base = process.env.STAGE_ADVANCEMENT_LINT_BASE || 'origin/main';
      const out = [
        execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`, { encoding: 'utf8', timeout: 30000 }),
        execSync('git diff --name-only --diff-filter=ACMR --cached', { encoding: 'utf8', timeout: 30000 }),
        execSync('git diff --name-only --diff-filter=ACMR', { encoding: 'utf8', timeout: 30000 }),
        execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', timeout: 30000 }),
      ].join('\n');
      return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))]
        .filter((f) => CODE_RE.test(f))
        .filter((f) => RUNTIME_DIRS.includes(f.split('/')[0]))
        .filter((f) => !SKIP_DIR_RE.test(f))
        .filter((f) => !SKIP_FILE_RE.test(f))
        .filter((f) => f.split('/')[0] !== 'tests');
    } catch (e) {
      console.warn(`⚠️  diff base unavailable (${e.message.split('\n')[0]}) — falling back to --all (advisory)`);
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
      if (SKIP_DIR_RE.test(p) || SKIP_FILE_RE.test(p)) continue;
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
  if (!text.includes('current_lifecycle_stage')) continue;
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes(DISABLE_PRAGMA)) return;
    if (READ_CONTEXT_RE.test(line)) return;
    if (WRITE_PATTERN_RE.test(line)) {
      allViolations.push({ file, line: idx + 1, snippet: line.trim().slice(0, 160) });
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ stage-advancement-chokepoint-lint (${mode}): ${files.length} file(s) checked, 0 violations`);
} else {
  console.error(`❌ stage-advancement-chokepoint-lint (${mode}): ${allViolations.length} violation(s) in ${files.length} file(s) checked:\n`);
  for (const v of allViolations) {
    console.error(`   ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(
    `\nTHE RULE:\n"${THE_RULE}"\n\n` +
    `If this is a KNOWN, censused write: add the file to ${ALLOWLIST_PATH} AND add a row to docs/architecture/stage-advancement-path-census.md.\n` +
    `For a single intentional line: append a comment containing ${DISABLE_PRAGMA}.\n` +
    'Otherwise, this is a NEW, uncensused stage-advancement write -- route it through the artifact-gate chokepoint instead.'
  );
}

process.exitCode = allViolations.length === 0 ? 0 : 1;
