/**
 * Tier-rank direct-comparison lint CLI.
 * SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 (FR-2 acceptance criterion).
 *
 * THE RULE: min_tier_rank vs a worker's tier rank has exactly ONE shared predicate --
 * tierRankVerdict() in lib/fleet/tier-ladder.cjs. It is the SOLE place that knows about ruling 1B
 * (metadata.min_tier_rank_reason -> advisory vs binding) and the TIER_FLOOR_PROVENANCE_ADVISORY
 * reversal switch. A hand-rolled `minRank > workerRank`-shaped comparison anywhere else silently
 * reintroduces always-binding behavior for that one call site, producing exactly the
 * half-advisory-floor failure mode this SD's own review caught once already (a coordinator review
 * question on tier_stamp_missing, verified in tests/unit/fleet/tier-backlog-reservation.test.js).
 *
 * Detection: flags a line containing the literal `min_tier_rank` alongside a numeric comparison
 * operator (>, <, >=, <=), outside lib/fleet/tier-ladder.cjs (the SSOT itself) and outside any line
 * that already calls tierRankVerdict(. Deliberately narrow and line-scoped (matches the sibling
 * gemini-pin-lint's design) -- a bare read/coercion of metadata.min_tier_rank with no comparison
 * operator on the same line is NOT a violation.
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main.
 *   --all: full sweep.
 *
 * Escapes:
 *   - scripts/lint/tier-rank-direct-comparison-allowlist.json — categorized, file:line-keyed exceptions.
 *   - inline pragma: any line containing `tier-rank-comparison-lint-disable-line`.
 *
 * KNOWN LIMITATION: matching is PER LINE and textual, not AST-based (mirrors gemini-pin-lint's
 * design). A comparison split across multiple lines (e.g. `if (\n  sd.metadata.min_tier_rank >\n
 * workerRank\n)`), or one reached through an intermediate variable whose OWN assignment line
 * carries neither `min_tier_rank` nor the operator on the same line, is not seen. A destructured
 * or renamed alias (`const { min_tier_rank: x } = sd.metadata; if (x > workerRank)`) also evades
 * detection, since the literal token `min_tier_rank` no longer appears on the comparison line.
 *
 * Exit: 1 when unallowlisted violations are found, 0 otherwise.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { isFixturePath, isFixtureEntry } from '../../lib/lint/added-line-text.mjs';

const ALLOWLIST_PATH = 'scripts/lint/tier-rank-direct-comparison-allowlist.json';
const RUNTIME_DIRS = ['scripts', 'lib', 'tests'];
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/i;
const CODE_RE = /\.(js|cjs|mjs|ts|tsx|jsx)$/;
const DISABLE_PRAGMA = 'tier-rank-comparison-lint-disable-line';
const SSOT_FILE = 'lib/fleet/tier-ladder.cjs';

// A line mentioning min_tier_rank together with a comparison operator. Deliberately textual/line-
// scoped (matches sibling lints in this dir) rather than AST-based -- the known false-positive class
// (a bare property read, e.g. `row.metadata.min_tier_rank`, or an object literal `{ min_tier_rank: 4 }`)
// has no comparison operator on the same line and is excluded by construction.
const MENTIONS_MIN_TIER_RANK_RE = /min_tier_rank/;
// Excludes the two-char `->` (postgrest JSON-arrow accessor, e.g. metadata->>min_tier_rank) and
// bare `<`/`>` inside a trailing `//` comment or CLI help string (e.g. `--min-tier-rank <N>`), by
// scrubbing those BEFORE testing rather than trying to fold them into one regex.
const COMPARISON_OP_RE = /(>=|<=|[<>])/;
const COMMENT_LINE_RE = /^\s*(\/\/|\*|\/\*|#)/;

/** Strip a trailing `//` line-comment and any `->` JSON-arrow accessors before operator-testing,
 *  so neither trips a false-positive comparison-operator match. Naive (doesn't understand string
 *  literals containing `//`), matching this lint family's deliberately line-scoped, not AST-based,
 *  detection style. */
function codePartOf(line) {
  // ->>  (postgrest double-arrow), ->  (postgrest/member arrow), =>  (JS arrow function) all
  // contain a bare > or < that is not a numeric comparison.
  const noArrow = line.replace(/->>?/g, '').replace(/=>/g, '');
  const idx = noArrow.indexOf('//');
  return idx === -1 ? noArrow : noArrow.slice(0, idx);
}

const THE_RULE = 'min_tier_rank vs a worker tier rank has exactly one shared predicate: tierRankVerdict() in lib/fleet/tier-ladder.cjs (SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001). A hand-rolled comparison elsewhere silently bypasses ruling 1B\'s provenance-advisory branch and the TIER_FLOOR_PROVENANCE_ADVISORY reversal switch -- call tierRankVerdict(workerRank, minRank, { hasProvenance }) instead, or reuse tierBlocks()/classifyDispatchIneligibility() which already delegate to it.';

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
    const base = process.env.TIER_RANK_COMPARISON_LINT_BASE || 'origin/main';
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

const files = candidateFiles();
const allViolations = [];
for (const file of files) {
  if (file === SSOT_FILE) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (!MENTIONS_MIN_TIER_RANK_RE.test(text)) continue;
  const lines = text.split('\n');
  const allowedLines = allowedByFile.get(file);
  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;
    if (line.includes(DISABLE_PRAGMA)) return;
    if (COMMENT_LINE_RE.test(line)) return;
    if (line.includes('tierRankVerdict(')) return; // the call site IS the reuse
    if (allowedLines && allowedLines.has(lineNumber)) return;
    const codePart = codePartOf(line);
    if (MENTIONS_MIN_TIER_RANK_RE.test(codePart) && COMPARISON_OP_RE.test(codePart)) {
      allViolations.push({ file, line: lineNumber, snippet: line.trim().slice(0, 160) });
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ tier-rank-direct-comparison-lint (${mode}): ${files.length} file(s) checked, 0 unallowlisted violations`);
} else {
  console.error(`❌ tier-rank-direct-comparison-lint (${mode}): ${allViolations.length} unallowlisted violation(s) in ${files.length} file(s) checked:\n`);
  for (const v of allViolations) {
    console.error(`   ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(
    `\nTHE RULE:\n"${THE_RULE}"\n\n` +
    `If this is a genuinely non-comparison mention that trips the pattern: append a comment containing ${DISABLE_PRAGMA}, ` +
    `or add a { file, line, note } entry to ${ALLOWLIST_PATH}.`
  );
}

process.exitCode = allViolations.length === 0 ? 0 : 1;
