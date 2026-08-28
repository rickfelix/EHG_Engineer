/**
 * Gemini model-pin lint CLI.
 * SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-B (child 1 of 8).
 *
 * THE RULE: Gemini model selection has exactly one SSOT — lib/config/model-config.js's
 * getGoogleModel(purpose) accessor. A literal "gemini-<version>" string outside that file is a
 * routing pin that bypasses the purpose-keyed registry (recon confirmed ~60 such occurrences,
 * heaviest offenders lib/ai/multimodal-client.js and lib/testing/vision-qa-agent.js).
 *
 * NOT every literal is a routing pin, though — only ~24-26 of the ~60 grep hits are (VALIDATION
 * sub-agent finding on the parent SD). The rest are pricing tables (inverse direction: model ->
 * price, not purpose -> model), cost-governor fallback ladders (literal-on-both-sides by design),
 * provider family regexes, provenance stamps that must NOT track the current model, test
 * fixtures, and comments. Those are individually triaged into gemini-pin-allowlist.json by
 * file:line, not blanket-exempted by file — a stale allowlist entry (line content drifted off a
 * gemini- literal) is warned, not silently trusted (see checkAllowlistFreshness).
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main.
 *   --all: full sweep — the precondition for flipping the CI workflow from allow-fail to
 *       blocking is that --all reports zero unallowlisted violations against main.
 *
 * Escapes:
 *   - scripts/lint/gemini-pin-allowlist.json — categorized, file:line-keyed exceptions.
 *   - inline pragma: any line containing `gemini-pin-lint-disable-line`.
 *
 * Mirrors scripts/lint/gate-stage-hardcoded-literal-lint.mjs's design (diff-scoped, allowlist,
 * inline pragma, offline/no-DB-access).
 *
 * KNOWN LIMITATION: matching is PER LINE — a literal split across lines is not seen.
 *
 * Exit: 1 when unallowlisted violations are found, 0 otherwise.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { isFixturePath, isFixtureEntry } from '../../lib/lint/added-line-text.mjs';

const ALLOWLIST_PATH = 'scripts/lint/gemini-pin-allowlist.json';
const RUNTIME_DIRS = ['scripts', 'lib', 'tests'];
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/i;
const CODE_RE = /\.(js|cjs|mjs|ts|tsx|jsx)$/;
const DISABLE_PRAGMA = 'gemini-pin-lint-disable-line';
const MODEL_CONFIG_FILE = 'lib/config/model-config.js';

// Matches a literal "gemini-<digit...>" string inside quotes, e.g. 'gemini-2.5-flash',
// "gemini-3.7-pro-preview". Requires a leading digit after the hyphen to avoid matching
// unrelated identifiers like "gemini-ladder" or "GEMINI_MODEL_*" env var names.
const GEMINI_LITERAL_RE = /['"`]gemini-\d[\w.-]*['"`]/;
const COMMENT_LINE_RE = /^\s*(\/\/|\*|\/\*|#)/;

const THE_RULE = 'Gemini model selection has exactly one SSOT (lib/config/model-config.js getGoogleModel(purpose)). A literal gemini-<version> string outside that file is a routing pin and must not be reintroduced (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-B) -- resolve via getGoogleModel(purpose) instead, or add a triaged allowlist entry if this is a non-routing occurrence (pricing table, fallback ladder, family regex, provenance stamp, fixture).';

const args = process.argv.slice(2);
const mode = args.includes('--all') ? 'all' : 'diff';
const asJson = args.includes('--json');

function loadJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

const allowlist = loadJson(ALLOWLIST_PATH, { entries: [] });
const allowedByFile = new Map();
for (const e of allowlist.entries || []) {
  const file = String(e.file || '').replace(/\\/g, '/');
  if (!file) continue;
  if (!allowedByFile.has(file)) allowedByFile.set(file, new Map());
  allowedByFile.get(file).set(e.line, e);
}

function candidateFilesAll() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name).replace(/\\/g, '/');
      if (SKIP_DIR_RE.test(p)) continue;
      if (isFixtureEntry(p, e.isDirectory())) continue;
      if (e.isDirectory()) walk(p);
      else if (CODE_RE.test(e.name)) out.push(p);
    }
  };
  for (const d of RUNTIME_DIRS) if (existsSync(d)) walk(d);
  return out;
}

function candidateFiles() {
  if (mode !== 'diff') return candidateFilesAll();
  try {
    const base = process.env.GEMINI_PIN_LINT_BASE || 'origin/main';
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
      .filter((f) => !isFixturePath(f));
  } catch (e) {
    console.warn(`⚠️  diff base unavailable (${e.message.split('\n')[0]}) — falling back to --all (advisory)`);
    return candidateFilesAll();
  }
}

/** Warn (not fail the gate) when an allowlist entry's expected line no longer holds a Gemini
 *  literal — a stale entry that would otherwise silently mask a REAL future violation on that
 *  same line number after unrelated edits shifted content around. */
function checkAllowlistFreshness() {
  const staleWarnings = [];
  for (const e of allowlist.entries || []) {
    const file = String(e.file || '').replace(/\\/g, '/');
    if (!file || !existsSync(file)) {
      staleWarnings.push(`${file || '(missing file field)'}:${e.line} — file does not exist`);
      continue;
    }
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    const lineText = lines[(e.line || 0) - 1];
    if (lineText === undefined || !GEMINI_LITERAL_RE.test(lineText)) {
      staleWarnings.push(`${file}:${e.line} — line no longer contains a gemini- literal (category: ${e.category || 'unknown'})`);
    }
  }
  return staleWarnings;
}

const files = candidateFiles();
const allViolations = [];
for (const file of files) {
  if (file === MODEL_CONFIG_FILE) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (!/gemini-\d/.test(text)) continue;
  const lines = text.split('\n');
  const allowedLines = allowedByFile.get(file);
  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    if (line.includes(DISABLE_PRAGMA)) return;
    if (COMMENT_LINE_RE.test(line)) return;
    if (allowedLines && allowedLines.has(lineNumber)) return;
    if (GEMINI_LITERAL_RE.test(line)) {
      allViolations.push({ file, line: lineNumber, snippet: line.trim().slice(0, 160) });
    }
  });
}

const staleAllowlistEntries = checkAllowlistFreshness();

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations, stale_allowlist_entries: staleAllowlistEntries }, null, 1));
} else {
  if (staleAllowlistEntries.length > 0) {
    console.warn(`⚠️  ${staleAllowlistEntries.length} stale allowlist entr${staleAllowlistEntries.length === 1 ? 'y' : 'ies'}:`);
    for (const w of staleAllowlistEntries) console.warn(`   ${w}`);
  }
  if (allViolations.length === 0) {
    console.log(`✅ gemini-pin-lint (${mode}): ${files.length} file(s) checked, 0 unallowlisted violations`);
  } else {
    console.error(`❌ gemini-pin-lint (${mode}): ${allViolations.length} unallowlisted violation(s) in ${files.length} file(s) checked:\n`);
    for (const v of allViolations) {
      console.error(`   ${v.file}:${v.line}  ${v.snippet}`);
    }
    console.error(
      `\nTHE RULE:\n"${THE_RULE}"\n\n` +
      `If this is a KNOWN, individually-triaged non-routing use (pricing table, fallback ladder, family regex, provenance stamp, fixture): add a { file, line, category, note } entry to ${ALLOWLIST_PATH}.\n` +
      `For a single intentional line: append a comment containing ${DISABLE_PRAGMA}.\n` +
      'Otherwise, resolve via lib/config/model-config.js\'s getGoogleModel(purpose) instead of a hardcoded literal.'
    );
  }
}

process.exitCode = allViolations.length === 0 ? 0 : 1;
