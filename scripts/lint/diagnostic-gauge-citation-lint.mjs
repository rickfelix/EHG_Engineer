/**
 * Diagnostic-gauge citation lint CLI.
 * SD-LEO-INFRA-REWARD-SPINE-ONE-001-C.
 *
 * THE RULE (docs/architecture/reward-spine-ssot.md): "Anything that gates or routes behavior
 * must trace to L1, L2, or L3. Process gauges (retrospectives.quality_score, adherence-probe
 * pass-rate, raw gate pass-rate) are DIAGNOSTICS ONLY — they may inform investigation, but no
 * consumer may cite one as an optimization target or a gating threshold."
 *
 * Blocks NEW code that cites one of the three named diagnostic-only signals as a numeric
 * gating threshold, by scanning changed files for a comparison operator against a matching
 * identifier — offline, no DB access, mirrors scripts/lint/schema-reference-lint.mjs's design.
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main — the
 *       one confirmed pre-existing violation (retrospective-quality.js) never blocks an
 *       unrelated PR.
 *   --all: advisory full sweep of the runtime dirs (used to confirm the allowlist suppresses
 *       the known violation; not run in CI by default).
 *
 * Escapes (each documented in the failure output):
 *   - scripts/lint/diagnostic-gauge-citation-allowlist.json — files with a confirmed,
 *     accepted-debt pre-existing citation.
 *   - inline pragma: any line containing `diagnostic-gauge-lint-disable-line`.
 *
 * Exit: 1 when violations found outside the allowlist, 0 otherwise.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { CITATION_RE } from './diagnostic-gauge-citation-patterns.mjs';

const ALLOWLIST_PATH = 'scripts/lint/diagnostic-gauge-citation-allowlist.json';
const RUNTIME_DIRS = ['scripts', 'lib', 'src', 'server', 'api', 'app'];
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/;
const CODE_RE = /\.(js|cjs|mjs|ts|tsx|jsx)$/;
const DISABLE_PRAGMA = 'diagnostic-gauge-lint-disable-line';

const THE_RULE = 'Anything that gates or routes behavior must trace to L1, L2, or L3. Process gauges (retrospectives.quality_score, adherence-probe pass-rate, raw gate pass-rate) are DIAGNOSTICS ONLY — they may inform investigation, but no consumer may cite one as an optimization target or a gating threshold.';

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
      const base = process.env.DIAGNOSTIC_GAUGE_LINT_BASE || 'origin/main';
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
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes(DISABLE_PRAGMA)) return;
    if (CITATION_RE.test(line)) {
      allViolations.push({ file, line: idx + 1, snippet: line.trim().slice(0, 160) });
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ diagnostic-gauge-citation-lint (${mode}): ${files.length} file(s) checked, 0 violations`);
} else {
  console.error(`❌ diagnostic-gauge-citation-lint (${mode}): ${allViolations.length} violation(s) in ${files.length} file(s) checked:\n`);
  for (const v of allViolations) {
    console.error(`   ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(
    `\nTHE RULE (docs/architecture/reward-spine-ssot.md):\n"${THE_RULE}"\n\n` +
    `If this is the known, accepted pre-existing debt: add the file to ${ALLOWLIST_PATH}.\n` +
    `For a single intentional line: append a comment containing ${DISABLE_PRAGMA}.\n` +
    'Otherwise, this is a NEW citation of a diagnostic-only signal as a gating threshold — remove it, or trace the decision to a real L1/L2/L3 carrier instead.'
  );
}

process.exitCode = allViolations.length === 0 ? 0 : 1;
