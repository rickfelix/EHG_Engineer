/**
 * Venture-role stage-binding reintroduction lint CLI.
 * SD-LEO-INFRA-REMOVE-EVERY-BINDING-001, FR-8.
 *
 * THE RULE: per chairman ruling deb0818c (2026-09-14), no venture AI agent is bound to a
 * pre-go-live workflow stage. This SD's FR-1/FR-2 deleted stage_ownership from every VP in
 * STANDARD_VENTURE_TEMPLATE (lib/agents/venture-ceo-factory.js) and deleted
 * can_advance_stage/requires_advisory_approval from the CEO's delegation_authority; FR-6 deleted
 * stage_ownership from lib/org/role-registry-resolver.mjs's ROLE_FIELD_KEYS. This lint prevents
 * any of the three from silently reappearing as an object key on a venture role definition, and
 * prevents a workflow-stage token (e.g. "S12") from reappearing inside the three prose fields
 * that used to encode a stage boundary in text (post_stage_mandate, honest_idle, duty_cycle).
 *
 * Two independent checks, both per-line (see KNOWN LIMITATION below):
 *   1. OBJECT-KEY check -- `stage_ownership:`, `can_advance_stage:`, or
 *      `requires_advisory_approval:` as an object-literal key, anywhere in a role definition.
 *   2. STAGE-TOKEN check -- a quoted string assigned to `post_stage_mandate:`, `honest_idle:`,
 *      or `duty_cycle:` on the SAME line that contains a bare workflow-stage token (\bS\d+\b,
 *      e.g. "S12", "S21").
 *
 * Cloned from scripts/lint/gate-stage-hardcoded-literal-lint.mjs's proven template (itself
 * cloned from stage-advancement-chokepoint-lint.mjs): diff-scoped by default, JSON file
 * allowlist, inline disable pragma, offline/no-DB-access, Shape B (git diff --name-only file
 * selection, then whole-file reads) so it needs no added-line-text.mjs import
 * (scanner-convention-lint.yml governs Shape A only).
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main.
 *   --all: advisory full sweep (confirms 0 violations against the live repo).
 *
 * Escapes (documented in the failure output):
 *   - scripts/lint/venture-role-stage-binding-lint-allowlist.json -- files with a pre-existing,
 *     individually-triaged use (none exist as of this SD; a future entry needs a written reason).
 *   - inline pragma: any line containing `venture-role-stage-binding-lint-disable-line`.
 *
 * KNOWN LIMITATION: matching is PER LINE, inherited from the donor lint's own documented blind
 * spot -- a key/value split across multiple lines (e.g. `post_stage_mandate:\n  'past S12...'`)
 * is not seen. Acceptable here since every known role definition in
 * lib/agents/venture-ceo-factory.js assigns each field on a single line.
 *
 * Exit: 1 when violations found outside the allowlist, 0 otherwise.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { isFixturePath, isFixtureEntry } from '../../lib/lint/added-line-text.mjs';

const ALLOWLIST_PATH = 'scripts/lint/venture-role-stage-binding-lint-allowlist.json';
const RUNTIME_DIRS = ['scripts', 'lib', 'tests'];
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/i;
const CODE_RE = /\.(js|cjs|mjs|ts|tsx|jsx)$/;
const DISABLE_PRAGMA = 'venture-role-stage-binding-lint-disable-line';

// TESTING sub-agent finding (EXEC-TO-PLAN): a QUOTED object key ('stage_ownership': ...) evaded
// the original \b(KEY)\s*: pattern -- \b matches fine on the opening quote side, but the pattern
// had no allowance for a closing quote BEFORE the colon. A role definition round-tripped through
// a JSON/DB payload always quotes its keys, so this was a real, likely reintroduction shape, not
// a theoretical one. The ['"\`]? after the key name is the fix; verified by the TESTING
// sub-agent's own probes (0/6 wrong after the fix, vs 3/6 wrong before it).
const BANNED_KEYS = ['stage_ownership', 'can_advance_stage', 'requires_advisory_approval'];
const KEY_RE = new RegExp(`\\b(${BANNED_KEYS.join('|')})['"\`]?\\s*:`);

const STAGE_TOKEN_FIELDS = ['post_stage_mandate', 'honest_idle', 'duty_cycle'];
const STAGE_TOKEN_FIELD_RE = new RegExp(`\\b(${STAGE_TOKEN_FIELDS.join('|')})['"\`]?\\s*:\\s*(['"\`])((?:(?!\\2).)*)\\2`);
const STAGE_TOKEN_RE = /\bS\d{1,3}\b/;

// A comment LINE (block-comment body, JSDoc line, or `//` line) referencing a banned key or a
// stage token in prose (e.g. this very file's own header) is not a live assignment -- skip.
const COMMENT_LINE_RE = /^\s*(\/\/|\*|\/\*|#)/;

const THE_RULE = 'No venture AI agent is bound to a pre-go-live workflow stage (chairman ruling deb0818c). A role definition must not carry stage_ownership/can_advance_stage/requires_advisory_approval as an object key, or a stage-number token (e.g. "S12") inside post_stage_mandate/honest_idle/duty_cycle -- see SD-LEO-INFRA-REMOVE-EVERY-BINDING-001.';

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
      const base = process.env.VENTURE_ROLE_STAGE_BINDING_LINT_BASE || 'origin/main';
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
  if (!BANNED_KEYS.some((k) => text.includes(k)) && !STAGE_TOKEN_FIELDS.some((k) => text.includes(k))) continue;
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes(DISABLE_PRAGMA)) return;
    if (COMMENT_LINE_RE.test(line)) return;

    const keyMatch = KEY_RE.exec(line);
    if (keyMatch) {
      allViolations.push({ file, line: idx + 1, identifier: keyMatch[1], snippet: line.trim().slice(0, 160) });
      return;
    }

    const stageFieldMatch = STAGE_TOKEN_FIELD_RE.exec(line);
    if (stageFieldMatch && STAGE_TOKEN_RE.test(stageFieldMatch[3])) {
      allViolations.push({ file, line: idx + 1, identifier: `${stageFieldMatch[1]} (stage token)`, snippet: line.trim().slice(0, 160) });
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ venture-role-stage-binding-lint (${mode}): ${files.length} file(s) checked, 0 violations`);
} else {
  console.error(`❌ venture-role-stage-binding-lint (${mode}): ${allViolations.length} violation(s) in ${files.length} file(s) checked:\n`);
  for (const v of allViolations) {
    console.error(`   ${v.file}:${v.line}  [${v.identifier}]  ${v.snippet}`);
  }
  console.error(
    `\nTHE RULE:\n"${THE_RULE}"\n\n` +
    `If this is a KNOWN, individually-triaged pre-existing use with a genuinely different meaning: add the file to ${ALLOWLIST_PATH} with a written reason.\n` +
    `For a single intentional line: append a comment containing ${DISABLE_PRAGMA}.\n` +
    'Otherwise, remove the stage binding -- no venture AI agent is bound to a pre-go-live workflow stage.'
  );
}

process.exitCode = allViolations.length === 0 ? 0 : 1;
