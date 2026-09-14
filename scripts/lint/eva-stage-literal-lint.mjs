#!/usr/bin/env node
/**
 * EVA stage-literal lint.
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J (P5.1).
 *
 * THE RULE: lib/eva/** business logic references stage-key-registry.js's
 * STAGE_KEY_BY_NUMBER for ANY of the 27 stages, never a bare numeric literal -- a raw
 * `fromStage === 23` is exactly the class of bug SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H
 * fixed (stage-execution-worker.js's stale `fromStage === 23 && toStage === 24` choke
 * point, silently wrong after the 2026-08-25 renumber).
 *
 * SCOPE: the literals 1-27 -- the full range STAGE_KEY_BY_NUMBER covers as of this SD
 * (FR-10 acceptance criterion: "stage-key-registry.js covers all 27 stages"; the map
 * previously covered only 23-27, the renumbered cluster a DIFFERENT SD touched).
 * Extending the map's DATA did not require retrofitting every stage 1-22 TEMPLATE
 * file's opt-in `stageKey` declaration -- that stays a separate, still-deferred concern
 * documented in stage-key-registry.js's own header.
 *
 * A bare number in 1-27 is not, by itself, evidence of a stage reference --
 * `deficitPercent > 25`, `avgScore >= 25`, a clock-hour bound (`h > 23`) all live in
 * this same directory today, and the false-positive risk only grows as the range
 * widens to include small, heavily-overloaded numbers. So a line only counts when a
 * stage-shaped identifier ALSO appears on it (STAGE_IDENT_RE) -- see KNOWN LIMITATIONS
 * for what this costs.
 *
 * Modes:
 *   --diff (default in CI): lint ONLY files changed vs the merge base with origin/main.
 *   --all: advisory full sweep (used to confirm the allowlist covers the pre-existing
 *       census; not run in CI by default).
 *
 * Escapes:
 *   - scripts/lint/eva-stage-literal-lint-allowlist.json -- {file, line, snippet}
 *     entries. A snippet must match the CURRENT trimmed line text, so a moved or
 *     edited line automatically re-exposes itself rather than staying silently exempt.
 *   - inline pragma: a comment containing eva-stage-literal-lint-disable-line.
 *
 * KNOWN LIMITATION (loop bounds): a stage-counting loop bound with no stage-named
 * variable (`for (let i = 1; i <= 27; i++)`, three real instances in this repo today --
 * eva-master-scheduler.js, stage-registry.js, vision-governance-service.js) is NOT
 * caught -- STAGE_IDENT_RE requires a stage-shaped identifier ON THE SAME LINE as the
 * literal, and a loop counter named `i` carries none.
 *
 * KNOWN LIMITATION (keyed literals, the more consequential gap): a numeric stage
 * literal used as an OBJECT KEY or ARRAY ELEMENT with no comparison operator on that
 * line is entirely outside this detector's surface, by construction, regardless of
 * identifier naming -- LITERAL_CMP_RE only matches a comparison. Confirmed real:
 * lib/eva/contracts/stage-contracts.js's CROSS_STAGE_DEPS object (`23: [...]` through
 * `27: [...]`) is a documented REPEAT OFFENDER for exactly this bug class (its own
 * comments cite SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H FR-5 fixing a prior stale-key
 * shift there) and is invisible to this lint today. A same-file, enclosing-declaration-
 * aware second pass (flagging a bare 1-27 object key/array element within N lines of a
 * stage-shaped declaration name) was scoped out of this SD as a genuinely different
 * analysis class from a single-line comparison scan -- tracked as a deferred follow-up,
 * not silently absorbed into "the sweep is clean".
 *
 * Both limitations were measured, not assumed: catching every numeric literal 1-27
 * regardless of identifier was tried and rejected (multiplies false positives on
 * unrelated small-number thresholds throughout lib/eva/** for every real stage-literal
 * hit it would add).
 *
 * Mirrors scripts/lint/stage-advancement-chokepoint-lint.mjs's design (diff-scoped,
 * allowlist, inline pragma, offline/no-DB-access).
 *
 * Exit: 1 when violations found outside the allowlist, 0 otherwise.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isFixturePath, isFixtureEntry } from '../../lib/lint/added-line-text.mjs';

const ALLOWLIST_PATH = 'scripts/lint/eva-stage-literal-lint-allowlist.json';
const RUNTIME_DIRS = ['lib/eva'];
const REGISTRY_FILE = 'lib/eva/stage-templates/stage-key-registry.js';
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|coverage|\.next|archive|one-off|one-time|tmp|temp|fixtures?)(\/|$)/i;
const CODE_RE = /\.(js|mjs|cjs)$/;
const DISABLE_PRAGMA = 'eva-stage-literal-lint-disable-line';
const COMMENT_LINE_RE = /^\s*(\/\/|\*|\/\*)/;

const STAGE_IDENT_RE = /\b(from|to|current|target|next|prev|previous)?stage(number)?\b|current_lifecycle_stage|stage_number|stage_by/i;
// A bare integer 1-27 -- the full range STAGE_KEY_BY_NUMBER now covers (FR-10: "stage-key-
// registry.js covers all 27 stages"). `>` alone (never preceded by `-`) so an arrow `->`
// inside a comment/string (e.g. "23->24") is never misread as a greater-than comparison --
// measured false positive on orchestrator-trigger-types.js's "25-26 -> 26-27" trailing comment.
const STAGE_NUM_RE = '(?:[1-9]|1[0-9]|2[0-7])';
const LITERAL_CMP_RE = new RegExp(
  `(===|==|<=|>=|(?<!-)<|(?<!-)>)\\s*${STAGE_NUM_RE}\\b|\\b${STAGE_NUM_RE}\\s*(===|==|<=|>=|(?<!-)<|(?<!-)>)`
);

const THE_RULE = "lib/eva/** business logic references stage-key-registry.js's STAGE_KEY_BY_NUMBER for any of the 27 stages, never a bare numeric literal -- the exact class of bug SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H fixed.";

const args = process.argv.slice(2);
const mode = args.includes('--all') ? 'all' : 'diff';
const asJson = args.includes('--json');

function loadJson(p, fallback) {
  let text;
  try { text = readFileSync(p, 'utf8'); } catch { return fallback; }
  try { return JSON.parse(text); } catch (e) {
    // A missing file (ENOENT above) silently falls back to an empty allowlist -- fine, that's
    // the "no allowlist yet" state. A file that EXISTS but fails to parse is different: it
    // means the census was corrupted, and treating it as empty would silently re-surface the
    // full pre-existing backlog as "new" violations with no indication why. Say so loudly.
    console.error(`⚠️  ${p} exists but is not valid JSON (${e.message}) -- treating as empty. Every pre-existing census line will now appear as a violation.`);
    return fallback;
  }
}

const allowlist = loadJson(ALLOWLIST_PATH, { entries: [] });
const isAllowed = (file, line, snippet) =>
  (allowlist.entries || []).some((e) => e.file === file && e.line === line && e.snippet === snippet);

function candidateFiles() {
  if (mode === 'diff') {
    try {
      const base = process.env.EVA_STAGE_LITERAL_LINT_BASE || 'origin/main';
      const out = [
        execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], { encoding: 'utf8', timeout: 30000 }),
        execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', '--cached'], { encoding: 'utf8', timeout: 30000 }),
        execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8', timeout: 30000 }),
        execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', timeout: 30000 }),
      ].join('\n');
      return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))]
        .filter((f) => CODE_RE.test(f))
        .filter((f) => f.startsWith('lib/eva/'))
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
  if (file === REGISTRY_FILE) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes(DISABLE_PRAGMA)) return;
    if (COMMENT_LINE_RE.test(line)) return;
    if (!STAGE_IDENT_RE.test(line)) return;
    if (!LITERAL_CMP_RE.test(line)) return;
    const snippet = line.trim().slice(0, 160);
    if (isAllowed(file, idx + 1, snippet)) return;
    allViolations.push({ file, line: idx + 1, snippet });
  });
}

if (asJson) {
  console.log(JSON.stringify({ mode, files_checked: files.length, violations: allViolations }, null, 1));
} else if (allViolations.length === 0) {
  console.log(`✅ eva-stage-literal-lint (${mode}): ${files.length} file(s) checked, 0 violations`);
} else {
  console.error(`❌ eva-stage-literal-lint (${mode}): ${allViolations.length} violation(s) in ${files.length} file(s) checked:\n`);
  for (const v of allViolations) {
    console.error(`   ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(
    `\nTHE RULE:\n"${THE_RULE}"\n\n` +
    `If this is a KNOWN, pre-existing literal: add an entry to ${ALLOWLIST_PATH} with {file, line, snippet, reason}.\n` +
    `For a single intentional line: append a comment containing ${DISABLE_PRAGMA}.\n` +
    "Otherwise, reference lib/eva/stage-templates/stage-key-registry.js's STAGE_KEY_BY_NUMBER instead of the bare literal."
  );
}

process.exitCode = allViolations.length === 0 ? 0 : 1;
