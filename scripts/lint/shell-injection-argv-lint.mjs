#!/usr/bin/env node
/**
 * shell-injection-argv-lint — SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-B.
 *
 * THE RULE (statically decidable on stripped added-line text; the git-name/provenance heuristic
 * was rejected after measuring a ~43% miss rate concentrated on the WORST sites):
 *   S1  exec / execSync whose first argument is NOT a plain string literal and NOT a
 *       no-substitution template literal. Covers template-literal interpolation
 *       (execSync(`git ${x}`)), bare-variable commands (execSync(cmd) — the exact shape the
 *       sibling SD had to remediate in phantom-test-audit.js), and literal-then-concat
 *       ('git ' + x). exec/execSync ALWAYS invoke a shell, so a non-literal command IS the sink.
 *   S2  shell: true in a spawn-family options object. The safe spawn shape is an argv array
 *       with no shell — see lib/git/hardened-runner.cjs, the published runner.
 *
 * ADVISORY-FIRST (FR-6 convention): the workflow runs with continue-on-error: true through the
 * dated soak (flip note in .github/workflows/shell-injection-argv-lint.yml). Pre-existing sites
 * are a LEDGER (see the allowlist _scope_note for the measured baseline), not a day-one block.
 *
 * DISCHARGES REAPER-GH flag d5c57a01 ("no lint covers shell:true anywhere in scripts/lint/;
 * prose-is-the-artefact, no gate reads it" — lib/claim/wip-detector.cjs:41-46 records the defect
 * that stayed live because of exactly that gap).
 *
 * KNOWN LIMITATION — shapes this predicate knowingly does NOT catch, so a zero-finding run is
 * never mistaken for a zero-defect diff:
 *   - member-call `.exec(` on arbitrary receivers (RegExp.prototype.exec collision; `execSync` is
 *     matched on ANY receiver, bare `exec` only as a standalone identifier)
 *   - aliased/dynamic access: `const e = execSync; e(cmd)`, `cp['execSync'](cmd)`
 *   - wrapper indirection (a helper in another file that shells out)
 *   - shell spawns that are neither exec* nor shell:true — measured population 2, recorded as
 *     named exclusions in the allowlist _scope_note: scripts/wiring-validators/lib/step-executors.js
 *     spawn('cmd.exe',['/c',…]) and spawn('bash',['-c',…])
 *   - pattern-shaped text inside TEMPLATE-LITERAL doc strings (quoted-string contents are
 *     stripped; template literals are the detection subject and stay intact)
 *   - new Function / eval (population 8) — a different defect class, out of scope
 *
 * Escape hatches: inline pragma `shell-injection-argv-disable-line` on the flagged line, or an
 * allowlist entry WITH a non-empty reason (loadAllowlist throws otherwise — ledger, not bypass).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFixturePath, stripComments, stripStringLiterals } from '../../lib/lint/added-line-text.mjs';
import { runHardenedGit, VALID_BASE_REF } from '../../lib/git/hardened-runner.cjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'lint', 'shell-injection-argv-allowlist.json');
const PRAGMA = 'shell-injection-argv-disable-line';

/** Spawn-family callee for S1. execSync on any receiver; bare exec only (RegExp .exec collision). */
const S1_CALL = /(?:(?<![\w.])exec|execSync)\s*\(\s*([^)\n]*)/g;
/** S2: an explicit shell: true in an options object. */
const S2_SHELL_TRUE = /\bshell\s*:\s*true\b/;

/**
 * Classify an S1 first-argument slice. SAFE: plain string literal (contents were stripped, the
 * delimiters remain) with no trailing concat; no-substitution template literal. UNSAFE: template
 * with ${, any identifier/member/call, literal-then-concat.
 */
export function classifyFirstArg(argSlice) {
  const s = String(argSlice || '').trim();
  if (s === '') return 'safe'; // no argument — not a command execution we can judge; skip
  if (/^(['"])(?:\\.|[^\\])*?\1\s*\+/.test(s)) return 'unsafe'; // 'git ' + x
  if (/^(['"])/.test(s)) return 'safe';                          // plain string literal
  if (s.startsWith('`')) {
    const closing = s.indexOf('`', 1);
    const body = closing === -1 ? s.slice(1) : s.slice(1, closing);
    return body.includes('${') ? 'unsafe' : 'safe';
  }
  return 'unsafe'; // identifier, member expression, call result, etc.
}

/** Scan one line of stripped text; raw line consulted only for the pragma. */
export function scanLine(strippedLine, rawLine) {
  if (String(rawLine || '').includes(PRAGMA)) return [];
  const hits = [];
  for (const m of String(strippedLine || '').matchAll(S1_CALL)) {
    if (classifyFirstArg(m[1]) === 'unsafe') {
      hits.push({ selector: 'S1', detail: 'exec/execSync with a non-literal command — always a shell; use execFileSync/spawnSync with an argv array (lib/git/hardened-runner.cjs for git)' });
      break; // one S1 report per line
    }
  }
  if (S2_SHELL_TRUE.test(strippedLine)) {
    hits.push({ selector: 'S2', detail: 'shell: true — the argv array is handed to a shell; drop the option or record a reasoned allowlist entry' });
  }
  return hits;
}

/** Strip pipeline for scanning: comments first, then quoted-string contents (B-1, two-sided). */
export function stripForScan(text) {
  return stripStringLiterals(stripComments(text));
}

export function loadAllowlist(file = ALLOWLIST_PATH) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const allow = raw.allow || {};
  for (const [key, reason] of Object.entries(allow)) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(`shell-injection-argv-allowlist: entry ${JSON.stringify(key)} has no non-empty reason — an unexplained escape is a silent bypass, not a ledger`);
    }
  }
  return { allow, doc: raw._doc, scopeNote: raw._scope_note };
}

function isAllowed(allow, file, line) {
  return Object.prototype.hasOwnProperty.call(allow, `${file}:${line}`)
    || Object.prototype.hasOwnProperty.call(allow, file);
}

const SCAN_EXT = /\.(?:js|cjs|mjs)$/;
const SKIP_DIR = /(?:^|\/)(?:node_modules|\.worktrees|archive|one-off|_deprecated|archived-[\w-]+)(?:\/|$)/;

/** Diff mode: added lines vs merge-base, parsed from -U0 patch text. */
function collectDiffAdded(baseRef) {
  if (!VALID_BASE_REF.test(baseRef)) throw new Error(`invalid base ref ${JSON.stringify(baseRef)}`);
  const mergeBase = runHardenedGit(['merge-base', baseRef, 'HEAD'], { cwd: REPO_ROOT }).trim();
  // No git pathspec here ON PURPOSE: the published runner defaults --literal-pathspecs ON (its
  // whole point), which would treat '*.js' as a literal filename and silently scan NOTHING —
  // measured on this lint's own first committed run. Extension filtering happens in JS below.
  const patch = runHardenedGit(
    ['diff', '--unified=0', `${mergeBase}..HEAD`],
    { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  const out = [];
  let file = null;
  let lineNo = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ b/')) {
      const p = line.slice(6).trim();
      file = SCAN_EXT.test(p) ? p : null;
      continue;
    }
    if (line.startsWith('@@')) {
      const m = /\+(\d+)/.exec(line);
      lineNo = m ? Number(m[1]) : 0;
      continue;
    }
    if (file && line.startsWith('+') && !line.startsWith('+++')) {
      out.push({ file, line: lineNo, text: line.slice(1) });
      lineNo += 1;
    }
  }
  return out;
}

/** --all mode: whole-tree ledger census. Diagnostic only — NEVER the CI entry point. */
function collectAll() {
  const out = [];
  const roots = ['lib', 'scripts', 'server', 'tests'];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(REPO_ROOT, full).replace(/\\/g, '/');
      if (SKIP_DIR.test(rel + (e.isDirectory() ? '/' : ''))) continue;
      if (e.isDirectory()) { walk(full); continue; }
      if (!SCAN_EXT.test(e.name)) continue;
      const lines = fs.readFileSync(full, 'utf8').split('\n');
      lines.forEach((text, i) => out.push({ file: rel, line: i + 1, text }));
    }
  };
  for (const r of roots) walk(path.join(REPO_ROOT, r));
  return out;
}

export function findViolations(entries, allow) {
  const violations = [];
  for (const { file, line, text } of entries) {
    if (isFixturePath(file)) continue;
    const hits = scanLine(stripForScan(text), text);
    for (const h of hits) {
      if (isAllowed(allow, file, line)) continue;
      violations.push({ file, line, selector: h.selector, detail: h.detail, text: text.trim().slice(0, 120) });
    }
  }
  return violations;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const wantAll = argv.includes('--all');
  const { allow } = loadAllowlist();

  let entries;
  let mode = 'diff';
  if (wantAll) {
    mode = 'all';
    entries = collectAll();
  } else {
    try {
      entries = collectDiffAdded(process.env.SHELL_INJECTION_ARGV_BASE || 'origin/main');
    } catch (e) {
      console.warn(`⚠️  diff base unavailable (${String(e.message).split('\n')[0]}) — nothing scanned (advisory; NOT falling back to --all, which is diagnostic-only)`);
      entries = [];
      mode = 'diff (degraded)';
    }
  }

  const violations = findViolations(entries, allow);
  if (asJson) {
    console.log(JSON.stringify({ mode, scanned: entries.length, violations }, null, 2));
  } else {
    for (const v of violations) {
      console.error(`  ${v.selector}  ${v.file}:${v.line}  ${v.detail}\n      ${v.text}`);
    }
    const verdict = violations.length === 0 ? '✅' : '❌';
    console.log(`${verdict} shell-injection-argv-lint (${mode}): ${entries.length} added line(s) scanned, ${violations.length} violation(s)`);
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
