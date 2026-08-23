/**
 * Gate-stage hardcoded-literal lint CLI.
 * SD-LEO-INFRA-MINUS-GATE-SSOT-001, FR-7.
 *
 * THE RULE: kill/promotion gate-stage membership has exactly one SSOT
 * (lib/eva/stage-governance.js's getStageGovernance()) since this SD's FR-1/FR-4 deleted the
 * hardcoded literals from lib/agents/modules/venture-state-machine/stage-gates.js and
 * lib/eva/devils-advocate.js. This lint prevents either from silently reintroducing a hardcoded
 * literal for the SAME 4 identifier names those files used to carry — the exact "0 callsites"
 * completion claim SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 (2026-05-12) made without a durable
 * artifact to check it against, which is why that claim silently went stale.
 *
 * NAME-BASED, NOT FILE-BASED (deliberately, per this SD's FR-4/TR-8 finding): a file-level
 * allowlist would be the WRONG mechanism for stage-gates.js specifically — it legitimately
 * retains 3 OTHER, untouched stage-set identifiers (ADVISORY_GATE_STAGES, SOFT_KILL_STAGES,
 * TASTE_GATE_STAGES) that must NOT be flagged, while the 2 banned names in the SAME file must be.
 * This lint therefore matches on the banned IDENTIFIER NAME being assigned a literal, not on
 * which file it appears in.
 *
 * Banned identifiers: KILL_GATE_STAGES, PROMOTION_GATE_STAGES, KILL_GATES, PROMOTION_GATES.
 *
 * A small FILE allowlist still exists (scripts/lint/gate-stage-hardcoded-literal-allowlist.json)
 * — but for an ORTHOGONAL reason: it names files with a pre-existing, individually-triaged use of
 * a banned name in a DIFFERENT semantic cluster (the lib/eva/experiments/ accuracy-correlation
 * constants and similar; see docs/architecture/stage-advancement-fr4-tr8-triage.md). It is NOT a
 * workaround for the same-file-different-identifier problem above — that is solved by the
 * name-based regex itself, with zero allowlist entries needed for stage-gates.js.
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main — a known,
 *       allowlisted pre-existing use never blocks an unrelated PR.
 *   --all: advisory full sweep (confirms the allowlist suppresses the known, pre-existing uses;
 *       not run in CI by default).
 *
 * Escapes (documented in the failure output):
 *   - scripts/lint/gate-stage-hardcoded-literal-allowlist.json — files with a pre-existing,
 *     individually-triaged use (see docs/architecture/stage-advancement-fr4-tr8-triage.md).
 *   - inline pragma: any line containing `gate-stage-lint-disable-line`.
 *
 * Mirrors scripts/lint/stage-advancement-chokepoint-lint.mjs's design (diff-scoped, allowlist,
 * inline pragma, offline/no-DB-access) — cloned per FR-7/TR-8.
 *
 * KNOWN LIMITATION: matching is PER LINE, so an assignment whose literal opens on a LATER line
 * than the `=` (e.g. `const KILL_GATE_STAGES =\n  new Set([3, 5, 13]);`) is not seen — inherited
 * from the donor lint's own documented blind spot #1. Acceptable here since every known offender
 * (this SD's own now-fixed files, plus the lib/eva/experiments/ cluster named in
 * docs/architecture/stage-advancement-fr4-tr8-triage.md) assigns on a single line; a future
 * reformatting to a multi-line literal would silently escape this check.
 *
 * Exit: 1 when violations found outside the allowlist, 0 otherwise.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { isFixturePath, isFixtureEntry } from '../../lib/lint/added-line-text.mjs';

const ALLOWLIST_PATH = 'scripts/lint/gate-stage-hardcoded-literal-allowlist.json';
const RUNTIME_DIRS = ['scripts', 'lib', 'tests'];
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/i;
const CODE_RE = /\.(js|cjs|mjs|ts|tsx|jsx)$/;
const DISABLE_PRAGMA = 'gate-stage-lint-disable-line';

// Matches `<BANNED_NAME> = [` or `<BANNED_NAME> = new Set([` (with an optional `const`/`export
// const`/`let` prefix already consumed by the caller having no anchor at line-start — this
// matches the assignment itself, wherever it starts on the line, e.g. inside a function body).
const BANNED_NAMES = ['KILL_GATE_STAGES', 'PROMOTION_GATE_STAGES', 'KILL_GATES', 'PROMOTION_GATES'];
const WRITE_PATTERN_RE = new RegExp(`\\b(${BANNED_NAMES.join('|')})\\s*=\\s*(new Set\\(|\\[)`);
// A comment LINE (block-comment body, JSDoc line, or `//` line) referencing a banned name in
// prose (e.g. this very file's own header, or gate-attach.js's documented-difference comment) is
// not a live assignment -- skip lines whose trimmed content opens with a comment marker.
const COMMENT_LINE_RE = /^\s*(\/\/|\*|\/\*|#)/;

const THE_RULE = 'Kill/promotion gate-stage membership has exactly one SSOT (lib/eva/stage-governance.js). A hardcoded KILL_GATE_STAGES/PROMOTION_GATE_STAGES/KILL_GATES/PROMOTION_GATES literal must not be reintroduced (SD-LEO-INFRA-MINUS-GATE-SSOT-001 FR-7) -- derive from getStageGovernance(supabase) instead.';

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
      const base = process.env.GATE_STAGE_LINT_BASE || 'origin/main';
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
      if (isFixtureEntry(p, e.isDirectory())) continue;
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
  if (!BANNED_NAMES.some((n) => text.includes(n))) continue;
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes(DISABLE_PRAGMA)) return;
    if (COMMENT_LINE_RE.test(line)) return;
    const match = WRITE_PATTERN_RE.exec(line);
    if (match) {
      allViolations.push({ file, line: idx + 1, identifier: match[1], snippet: line.trim().slice(0, 160) });
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ gate-stage-hardcoded-literal-lint (${mode}): ${files.length} file(s) checked, 0 violations`);
} else {
  console.error(`❌ gate-stage-hardcoded-literal-lint (${mode}): ${allViolations.length} violation(s) in ${files.length} file(s) checked:\n`);
  for (const v of allViolations) {
    console.error(`   ${v.file}:${v.line}  [${v.identifier}]  ${v.snippet}`);
  }
  console.error(
    `\nTHE RULE:\n"${THE_RULE}"\n\n` +
    `If this is a KNOWN, individually-triaged pre-existing use (a DIFFERENT semantic meaning from the governance SSOT, per docs/architecture/stage-advancement-fr4-tr8-triage.md): add the file to ${ALLOWLIST_PATH} AND add a row to that triage doc.\n` +
    `For a single intentional line: append a comment containing ${DISABLE_PRAGMA}.\n` +
    'Otherwise, derive gate-stage membership from lib/eva/stage-governance.js\'s getStageGovernance(supabase) instead of a hardcoded literal.'
  );
}

process.exitCode = allViolations.length === 0 ? 0 : 1;
