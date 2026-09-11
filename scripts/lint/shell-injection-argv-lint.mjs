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
 * BLOCKING since SD-MAN-INFRA-FLIP-SHELL-INJECTION-001 (2026-09-11), made safe by B-3 reflow-safe
 * violation identity: in diff mode every HEAD violation carries violationKey() =
 * `file|selector|normalized full line` (NO line number), and is partitioned against the keys found
 * in the SAME file at the merge base (git show <mergeBase>:<oldPath>, renames mapped). Only NEW
 * keys set the exit code; pre-existing sites are REPORTED, never blocking — the measured backlog
 * (237 sites / 130 files at the flip, see the allowlist _scope_note) is a ledger that never becomes
 * the toucher's problem. Mirrors scripts/lint/schema-lint-scope.mjs's partition polarity (a null
 * baseline proves nothing pre-existing) with a LOCAL key — that module's violationKey is
 * schema-shaped (file|type|table|column|kind) and hard-coded inside its partition, so it is
 * mirrored, not imported. Accepted limit: two byte-identical violating lines in one file share a
 * key, so adding a duplicate of an already-present site reads as pre-existing (same trade-off as
 * the schema-lint precedent). --all is a whole-tree census with no baseline (every site "new", exit 1
 * on the backlog) — scripts/audit/control-seed-test.mjs:205 keys a registered control on exactly that.
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
import { makeHardenedGitRunner, VALID_BASE_REF } from '../../lib/git/hardened-runner.cjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'lint', 'shell-injection-argv-allowlist.json');
const PRAGMA = 'shell-injection-argv-disable-line';

/** Spawn-family callee for S1. execSync on any receiver; bare exec only (RegExp .exec collision). */
const S1_CALL = /(?:(?<![\w.])exec|execSync)\s*\(\s*([^)\n]*)/g;
/**
 * S2: a shell: option set to anything that is not a literal falsy off-switch.
 *
 * SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001 (SEC-1): this was /\bshell\s*:\s*true\b/ — the literal
 * only — so shell: process.platform==='win32' (the exact shape REAPER-GH flag d5c57a01 was about)
 * was invisible, and a --all census missed 3 live sites (phase3-execution.js:89,
 * control-seed-test.mjs:354, node-modules-autoheal.cjs:137). Widened to flag shell: followed by
 * anything except a literal `false` or `0` — a non-literal value (identifier, member, ternary) is
 * exactly the runtime-decided shell that cannot be judged safe by reading the source. String
 * literals and comments are already removed by stripForScan, so `shell:` inside a string cannot
 * reach here. The negative lookahead keeps shell:false / shell:0 clean (two-sided).
 */
const S2_SHELL_NON_LITERAL_FALSE = /\bshell\s*:\s*(?!false\b|0\b)\S/;

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
  if (S2_SHELL_NON_LITERAL_FALSE.test(strippedLine)) {
    hits.push({ selector: 'S2', detail: 'shell: <non-false> — the argv array is handed to a shell (a runtime value like process.platform still spawns a shell on the true branch); drop the option, gate it to a safe spawn, or record a reasoned allowlist entry' });
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

const DIFF_MAX_BUFFER = 64 * 1024 * 1024;

/** Parse -U0 patch text into added-line entries for scannable files. Exported for the unit tests. */
export function parseAddedLines(patch) {
  const out = [];
  let file = null;
  let lineNo = 0;
  for (const line of String(patch || '').split('\n')) {
    if (line.startsWith('+++ b/')) {
      const p = line.slice(6).trim();
      // The ARCHIVE FENCE (allowlist _scope_note: scripts/archive/**, one-off/**, _deprecated/**,
      // archived-*) applied only to the --all walker before the flip; diff mode scanned those
      // paths anyway. Now that the check blocks, the documented fence holds in both modes.
      file = SCAN_EXT.test(p) && !SKIP_DIR.test(p) ? p : null;
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

/**
 * Parse `git diff --name-status -M` output into a Map of newPath -> oldPath for renames (R entries).
 * The precedent (schema-reference-lint.mjs:187) lists ACMR by name only and so reads a renamed
 * file's baseline at the NEW path, which does not exist at the merge base — every old site in a
 * renamed file would read as new. Exported for the unit tests.
 */
export function parseRenameMap(nameStatus) {
  const renames = new Map();
  for (const line of String(nameStatus || '').split('\n')) {
    const parts = line.split('\t');
    if (parts.length >= 3 && /^R\d*$/.test(parts[0])) renames.set(parts[2].trim(), parts[1].trim());
  }
  return renames;
}

/**
 * Diff mode collection: merge base resolved ONCE, added lines vs that base, rename map.
 * `baseRef` is validated by the CALLER (main hoists it out of the degrade path — FR-4); the
 * check here only guards direct callers. Throws when the base is unreachable (shallow clone,
 * no fetch) — main() turns that into the degraded-advisory verdict.
 */
export function collectDiff(baseRef, run) {
  if (!VALID_BASE_REF.test(baseRef)) throw new Error(`invalid base ref ${JSON.stringify(baseRef)}`);
  const mergeBase = String(run(['merge-base', baseRef, 'HEAD'])).trim();
  if (!mergeBase) throw new Error(`merge-base ${baseRef}..HEAD resolved empty (shallow clone?)`);
  // No git pathspec here ON PURPOSE: the published runner defaults --literal-pathspecs ON (its
  // whole point), which would treat '*.js' as a literal filename and silently scan NOTHING —
  // measured on this lint's own first committed run. Extension filtering happens in JS.
  const patch = run(['diff', '--unified=0', `${mergeBase}..HEAD`], { maxBuffer: DIFF_MAX_BUFFER });
  const nameStatus = run(['diff', '--name-status', '-M', `${mergeBase}..HEAD`], { maxBuffer: DIFF_MAX_BUFFER });
  return { mergeBase, entries: parseAddedLines(patch), renames: parseRenameMap(nameStatus) };
}

/**
 * Keys of the violations present in `file` at the merge base. Reads the blob at the OLD path
 * (renames mapped) via the single-token `<sha>:<path>` object-name form — no pathspec exists to
 * make literal. A missing blob (file is new) is an EMPTY baseline: all of its violations are
 * genuinely new. The file:line allowlist is NOT applied to the baseline (TR-3): it is keyed to
 * HEAD line numbers, and a HEAD violation that is allowlisted never reaches the partition anyway.
 */
export function baselineKeysForFile({ run, mergeBase, file, renames = new Map() }) {
  const oldPath = renames.get(file) || file;
  const r = run(['show', `${mergeBase}:${oldPath}`], { result: true, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: DIFF_MAX_BUFFER });
  if (!r || r.status !== 0) return new Set();
  const entries = String(r.stdout || '').split('\n').map((text, i) => ({ file, line: i + 1, text }));
  return new Set(findViolations(entries, {}).map((v) => v.key));
}

/**
 * The whole diff-mode verdict, side-effect free so the unit tests can drive it with an injected
 * git runner (the same seam lib/worktree-reaper/preserve-stage.js exposes). Baselines are read
 * LAZILY — only for files that actually carry a HEAD violation.
 * @returns {{mode:string, mergeBase:string|null, scanned:number, newViolations:Array, preExisting:Array, degradedReason?:string}}
 */
export function runDiffMode(baseRef, { run, allow = {} }) {
  let collected;
  try {
    collected = collectDiff(baseRef, run);
  } catch (e) {
    // SD-LEO-INFRA-SCHEMA-LINT-DEGRADED-FAILOPEN-001 rule: an UNRESOLVABLE base is advisory —
    // nothing scanned, nothing blocked, and (partition polarity) nothing proven pre-existing.
    return { mode: 'diff (degraded)', mergeBase: null, scanned: 0, newViolations: [], preExisting: [], degradedReason: String(e.message).split('\n')[0] };
  }
  const { mergeBase, entries, renames } = collected;
  const violations = findViolations(entries, allow);
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  const newViolations = [];
  const preExisting = [];
  for (const [file, list] of byFile) {
    const split = partitionByBaseline(list, baselineKeysForFile({ run, mergeBase, file, renames }));
    newViolations.push(...split.newViolations);
    preExisting.push(...split.preExisting);
  }
  return { mode: 'diff', mergeBase, scanned: entries.length, newViolations, preExisting };
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

/**
 * B-3 identity (SD-MAN-INFRA-FLIP-SHELL-INJECTION-001 FR-1): whitespace-collapsed FULL raw line.
 * NOT stripForScan output (string contents are part of a site's identity — `execSync('a'+x)` and
 * `execSync('b'+x)` must differ) and NOT the 120-char report excerpt below.
 */
export function normalizeLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** Reflow-safe key: file | selector | normalized full line. Deliberately excludes the line number. */
export function violationKey(v) {
  return `${v.file}|${v.selector}|${normalizeLine(v.rawText ?? v.text)}`;
}

/**
 * Split HEAD violations into NEW (block) vs pre-existing (report only). `baselineKeys === null`
 * means NO BASELINE IS AVAILABLE (--all, or a degraded --diff whose base could not be resolved):
 * nothing can be proven pre-existing, so everything is new — never "everything is pre-existing"
 * (schema-lint-scope.mjs:46-51 polarity, mirrored locally on purpose; see the header).
 */
export function partitionByBaseline(violations, baselineKeys) {
  if (!baselineKeys) return { newViolations: violations, preExisting: [] };
  const newViolations = [];
  const preExisting = [];
  for (const v of violations) (baselineKeys.has(v.key) ? preExisting : newViolations).push(v);
  return { newViolations, preExisting };
}

export function findViolations(entries, allow) {
  const violations = [];
  for (const { file, line, text } of entries) {
    if (isFixturePath(file)) continue;
    const hits = scanLine(stripForScan(text), text);
    for (const h of hits) {
      if (isAllowed(allow, file, line)) continue;
      violations.push({
        file, line, selector: h.selector, detail: h.detail,
        text: text.trim().slice(0, 120),
        key: violationKey({ file, selector: h.selector, rawText: text }),
      });
    }
  }
  return violations;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const wantAll = argv.includes('--all');
  const { allow } = loadAllowlist();

  if (wantAll) {
    // --all: whole-tree census, NO baseline (every site is "new"), exit 1 on the backlog — this is
    // diagnostic-only, never the CI entry point, and its exit semantics are load-bearing for the
    // registered control trial (scripts/audit/control-seed-test.mjs:205). Unchanged by the flip.
    const entries = collectAll();
    const violations = findViolations(entries, allow);
    if (asJson) {
      console.log(JSON.stringify({ mode: 'all', scanned: entries.length, merge_base: null, violations, newViolations: violations, preExisting: [] }, null, 2));
    } else {
      for (const v of violations) console.error(`  ${v.selector}  ${v.file}:${v.line}  ${v.detail}\n      ${v.text}`);
      console.log(`${violations.length === 0 ? '✅' : '❌'} shell-injection-argv-lint (all): ${entries.length} added line(s) scanned, ${violations.length} violation(s)`);
    }
    process.exit(violations.length === 0 ? 0 : 1);
  }

  // FR-4: the base-ref guard is HOISTED out of the degrade path. An option-shaped or garbage
  // SHELL_INJECTION_ARGV_BASE is a loud failure of the check, never "degraded, nothing scanned,
  // exit 0" — that would be a fail-open on exactly the day the check became load-bearing
  // (precedent: scripts/lint/schema-reference-lint.mjs hoists the same guard, on purpose).
  const baseRef = process.env.SHELL_INJECTION_ARGV_BASE || 'origin/main';
  if (typeof baseRef !== 'string' || !VALID_BASE_REF.test(baseRef)) {
    console.error(`❌ shell-injection-argv-lint: HOSTILE_BASE_REF — refusing SHELL_INJECTION_ARGV_BASE=${JSON.stringify(baseRef)} (must match ${VALID_BASE_REF}); not degrading, not scanning`);
    process.exit(2);
  }

  const run = makeHardenedGitRunner(REPO_ROOT);
  const result = runDiffMode(baseRef, { run, allow });
  const { mode, mergeBase, scanned, newViolations, preExisting } = result;
  if (result.degradedReason) {
    console.warn(`⚠️  diff base unavailable (${result.degradedReason}) — nothing scanned (advisory; NOT falling back to --all, which is diagnostic-only)`);
  }
  if (asJson) {
    console.log(JSON.stringify({ mode, scanned, merge_base: mergeBase, violations: newViolations, newViolations, preExisting }, null, 2));
  } else {
    for (const v of preExisting) {
      console.error(`  pre-existing  ${v.selector}  ${v.file}:${v.line}  (present at merge base ${mergeBase.slice(0, 8)} — reported, not blocking)\n      ${v.text}`);
    }
    for (const v of newViolations) {
      console.error(`  ${v.selector}  ${v.file}:${v.line}  ${v.detail}\n      ${v.text}`);
    }
    const verdict = newViolations.length === 0 ? '✅' : '❌';
    console.log(`${verdict} shell-injection-argv-lint (${mode}): ${scanned} added line(s) scanned, ${newViolations.length} new violation(s), ${preExisting.length} pre-existing (reported, not blocking)`);
  }
  process.exit(newViolations.length === 0 ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
