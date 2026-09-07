#!/usr/bin/env node
/**
 * count-truncation-diff-lint.mjs — QF-20260728-427.
 *
 * The unbounded-.select()-silent-truncation class already has two mechanisms
 * (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001's inventory, SD-LEO-INFRA-LIVE-FLEET-SESSIONS-
 * ROWCAP-CANONICAL-001's fleet-liveness lint) but BOTH are advisory-only — the inventory's own
 * docstring says "Exit 0 always (audit, not gate)"; the liveness lint runs with
 * `continue-on-error: true` and its own comment says "once the baseline has settled" it should
 * flip to blocking, but it never did. That is why the class recurred 5x in one day after two
 * "completed" sweep SDs: a sweep clears a snapshot, nothing stops a NEW site from landing
 * needs-review. This closes that gap by BLOCKING on newly-added lines only (git diff vs
 * origin/main) — the pre-existing needs-review backlog stays tracked in
 * docs/audits/count-truncation-inventory.json and never blocks an unrelated PR.
 *
 * Reuses classifyChain/isNonLivePath/chainWindow verbatim from
 * scripts/audit/count-truncation-inventory.mjs — one classifier, not a second heuristic.
 * Exemptions flow through the same scripts/audit/count-truncation-overrides.json.
 *
 * SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 (FR-3, scanner-convention-lint): this reads `git diff -U0`
 * output, but ONLY to count +/- lines and resolve hunk-header line numbers
 * (parseAddedLineNumbers) — it never regex-matches the diff's ADDED-LINE TEXT itself. The actual
 * .select( pattern check always runs against whole-file content via chainWindow() (imported from
 * count-truncation-inventory.mjs) on the real file, never an isolated diff fragment, so the
 * mid-comment fragment-truncation hazard added-line-text.mjs exists to prevent cannot occur here.
 * isFixturePath is still adopted below as real defense-in-depth (closes a gap the plain
 * scripts/lib top-level + basename filters below leave open: a nested __tests__/ or tests/ dir).
 *
 * Usage: node scripts/lint/count-truncation-diff-lint.mjs [--all]
 *        npm run lint:count-truncation-diff
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { classifyChain, isNonLivePath, chainWindow, buildInventory, loadOverrides, resolveClassification } from '../audit/count-truncation-inventory.mjs';
import { isFixturePath } from '../../lib/lint/added-line-text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const EXCLUDE_FILE_RE = /(\.test\.|\.spec\.)/i;

function candidateFiles(base) {
  // --ignore-cr-at-eol: a checkout of an eol=lf-attributed path whose committed blob still
  // carries CRLF (the exact renormalization-dirty state eol-renormalization-lint.mjs detects via
  // `git ls-files --eol`) makes the working tree disagree with the index on line endings alone,
  // right after a fresh clone -- with no PR content involved. Without this flag, the plain
  // (no-ref) `git diff` below reports the WHOLE file as changed on any such path, which then
  // false-positives every `.select(` line in it as "newly added" in addedLineNumbers() below.
  const out = [
    execSync(`git diff --ignore-cr-at-eol --name-only --diff-filter=ACMR ${base}...HEAD`, { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT }),
    execSync('git diff --ignore-cr-at-eol --name-only --diff-filter=ACMR --cached', { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT }),
    execSync('git diff --ignore-cr-at-eol --name-only --diff-filter=ACMR', { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT }),
    execSync('git ls-files --others --exclude-standard', { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT }),
  ].join('\n');
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))]
    .filter((f) => SCAN_EXTENSIONS.has(path.extname(f)))
    .filter((f) => f.split('/')[0] === 'scripts' || f.split('/')[0] === 'lib')
    .filter((f) => !EXCLUDE_FILE_RE.test(path.basename(f)))
    .filter((f) => !isFixturePath(f));
}

/**
 * Pure: new-file line numbers a unified diff ADDS. No I/O — testable without git. Written to
 * handle real -U0 output (added/removed lines only) AND a hunk carrying context lines (git may
 * still emit some) — a context line occupies a position in the new file and must advance `cur`
 * even though it is not itself "added"; a removed line does not exist in the new file at all.
 */
export function parseAddedLineNumbers(diffText) {
  const added = new Set();
  let cur = 0;
  for (const line of String(diffText || '').split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) { cur = Number(hunk[1]); continue; }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('\\')) continue;
    if (line.startsWith('+')) { added.add(cur); cur += 1; }
    else if (!line.startsWith('-')) { cur += 1; } // context line — advances, not added
  }
  return added;
}

function addedLineNumbers(base, relFile) {
  // --ignore-cr-at-eol: see the matching comment in candidateFiles() above -- same false-positive
  // mechanism, and this is the function whose bare (no-ref) fallback actually manufactures the
  // spurious "every line added" result once a renormalization-dirty file is treated as a candidate.
  for (const cmd of [
    `git diff --ignore-cr-at-eol -U0 --diff-filter=ACMR ${base}...HEAD -- "${relFile}"`,
    `git diff --ignore-cr-at-eol -U0 --diff-filter=ACMR --cached -- "${relFile}"`,
    `git diff --ignore-cr-at-eol -U0 --diff-filter=ACMR -- "${relFile}"`,
  ]) {
    let diffText = '';
    try { diffText = execSync(cmd, { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT }); } catch { /* try next */ }
    if (diffText) return parseAddedLineNumbers(diffText);
  }
  return new Set();
}

function isUntracked(relFile) {
  try {
    execSync(`git ls-files --error-unmatch -- "${relFile}"`, { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
    return false;
  } catch { return true; }
}

/**
 * KNOWN LIMITATION: only the `.select(` line's OWN line number needs to be in `addedLines` for a
 * site to be checked — a PR that widens an EXISTING, unmodified `.select(...).limit(50)` chain by
 * changing only the `.limit(50)` line to `.limit(5000)` (or deletes the `.limit(` line entirely)
 * does not re-trigger classification of the untouched `.select(` line above it, since this control
 * does not walk the chain backward from a changed continuation line to find its owning `.select(`.
 * That class of edit is invisible to this control; the pre-existing inventory (advisory) is the
 * only mechanism that would eventually re-surface it on its own periodic re-run.
 */
/**
 * Discovered 2026-09-07 (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001): wrapping an EXISTING,
 * unmodified `.select(...)` chain in a new outer call (e.g. safeQuery(...)) necessarily
 * reformats the SURROUNDING lines (new indentation, an added wrapper token before the chain and
 * an added options object after it), which makes git diff report the `.select(` line as "added"
 * even though the query's own select-columns and predicate chain are byte-for-byte identical to
 * origin/main. addedLineNumbers() then flags it as a brand-new site, when the actual
 * count/truncation risk (if any) already existed and was never touched by this PR. A whole-window
 * text comparison does NOT survive this (the wrapper's added prefix/suffix lines differ), so
 * this matches on the `.select(` line's OWN trimmed text instead -- that exact line is rarely, if
 * ever, touched by a pure wrap -- and only suppresses the finding when the SAME text already
 * classified as 'needs-review' in the base file too (i.e. genuinely unbounded pre-PR, not newly
 * widened by this PR's edit).
 */
// A trimmed `.select(` line's own text, stripped of a trailing statement-terminator/
// argument-separator -- wrapping an existing statement in a new outer call (safeQuery(...),
// Promise.all([...])) turns its trailing `;` into a `,` (now an argument, not a standalone
// statement) with no other change to this one line. Exported so both the base-file indexer
// below and scanFile's own lookup key are guaranteed to normalize identically.
export function normalizeSelectLineKey(line) {
  return line.trim().replace(/[;,]\s*$/, '');
}

/**
 * Pure: builds the `.select(` text -> classifications-seen map for one file's content. No I/O,
 * no git -- takes the base file's raw text directly, so this is testable against a synthetic
 * fixture string without touching the filesystem or a git ref.
 */
export function baseSelectClassificationsFromContent(content, relFile) {
  const baseLines = content.split('\n');
  const nonLive = isNonLivePath(relFile);
  const byText = new Map();
  baseLines.forEach((line, i) => {
    if (!/\.select\s*\(/.test(line) || /\/\/|\/\*|^\s*\*/.test(line.slice(0, line.indexOf('.select')))) return;
    const key = normalizeSelectLineKey(line);
    const classification = nonLive ? 'non-live-path' : classifyChain(chainWindow(baseLines, i));
    // Same trimmed .select( text can legitimately appear more than once in a file (e.g. two
    // different gates reading the same columns) -- track the SET of classifications seen so a
    // definitely-bounded prior instance never masks a genuinely different, unbounded new one.
    if (!byText.has(key)) byText.set(key, new Set());
    byText.get(key).add(classification);
  });
  return byText;
}

/**
 * Discovered 2026-09-07 (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001): wrapping an EXISTING,
 * unmodified `.select(...)` chain in a new outer call (e.g. safeQuery(...)) necessarily
 * reformats the SURROUNDING lines (new indentation, an added wrapper token before the chain and
 * an added options object after it), which makes git diff report the `.select(` line as "added"
 * even though the query's own select-columns and predicate chain are byte-for-byte identical to
 * origin/main. addedLineNumbers() then flags it as a brand-new site, when the actual
 * count/truncation risk (if any) already existed and was never touched by this PR. A whole-window
 * text comparison does NOT survive this (the wrapper's added prefix/suffix lines differ), so
 * this matches on the `.select(` line's OWN trimmed text instead -- that exact line is rarely, if
 * ever, touched by a pure wrap -- and only suppresses the finding when the SAME text already
 * classified as 'needs-review' in the base file too (i.e. genuinely unbounded pre-PR, not newly
 * widened by this PR's edit).
 */
function baseSelectClassifications(base, relFile) {
  let content;
  try {
    // stdio ignores stderr: a genuinely new file (not present at `base`) is an EXPECTED, routine
    // case here, not a real error -- git's own "fatal: path ... exists on disk, but not in
    // <base>" would otherwise print on every such file and read as a build failure in CI logs.
    content = execSync(`git show ${base}:"${relFile}"`, { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null; // file didn't exist at base -- a genuinely new file, nothing to compare against
  }
  return baseSelectClassificationsFromContent(content, relFile);
}

function scanFile(relFile, addedLines, overrides, base) {
  const abs = path.join(REPO_ROOT, relFile);
  if (!fs.existsSync(abs)) return [];
  const nonLive = isNonLivePath(relFile);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const basePreExisting = baseSelectClassifications(base, relFile);
  const violations = [];
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (addedLines && !addedLines.has(lineNo)) return;
    if (!/\.select\s*\(/.test(line) || /\/\/|\/\*|^\s*\*/.test(line.slice(0, line.indexOf('.select')))) return;
    const auto = nonLive ? 'non-live-path' : classifyChain(chainWindow(lines, i));
    const lookupKey = normalizeSelectLineKey(line);
    if (auto === 'needs-review' && basePreExisting?.get(lookupKey)?.has('needs-review')) return; // already unbounded pre-PR, reformatted only
    // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: honor scripts/audit/count-truncation-overrides.json
    // here too -- this function's own error message already promised this escape hatch.
    const { classification } = resolveClassification(overrides, `${relFile}:${lineNo}`, line, auto);
    if (classification === 'needs-review') violations.push({ file: relFile, line: lineNo, snippet: line.trim().slice(0, 160) });
  });
  return violations;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--all')) {
    const inv = buildInventory({ root: REPO_ROOT });
    console.log(`count-truncation-diff-lint (--all, advisory): ${inv.by_classification['needs-review'] || 0} needs-review site(s) — see docs/audits/count-truncation-inventory.json`);
    process.exit(0);
  }

  const base = process.env.COUNT_TRUNCATION_LINT_BASE || 'origin/main';
  let files;
  try {
    files = candidateFiles(base);
  } catch (e) {
    console.warn(`⚠️  diff base unavailable (${e.message.split('\n')[0]}) — nothing to lint (advisory fallback)`);
    process.exit(0);
  }

  const overrides = loadOverrides();
  const violations = files.flatMap((f) => scanFile(f, isUntracked(f) ? null : addedLineNumbers(base, f), overrides, base));

  if (violations.length === 0) {
    console.log(`✅ count-truncation-diff-lint: 0 new needs-review select() site(s) across ${files.length} changed file(s)`);
    process.exit(0);
  }
  console.error(`❌ count-truncation-diff-lint: ${violations.length} new needs-review select() site(s)\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
  console.error(
    '\nA new unbounded select() read must be provably bounded: single()/maybeSingle(), an explicit limit(N<1000),' +
    '\nrange()/fetchAllPaginated for full reads, { count: "exact" }, or assertNotCapTruncated/warnIfCapTruncated' +
    '\n(lib/db/fetch-all-paginated.mjs) if a cap is expected and must be visible. Genuine exceptions: add a' +
    '\nnoted entry to scripts/audit/count-truncation-overrides.json.'
  );
  process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
