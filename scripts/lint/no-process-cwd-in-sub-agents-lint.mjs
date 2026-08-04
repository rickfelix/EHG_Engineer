// Driver for eslint-rules/no-process-cwd-in-sub-agents.js — SD-LEO-INFRA-ONE-GENUINELY-DEAD-001.
//
// WHY THIS FILE EXISTS. The rule module has existed since SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-4 and
// HAS NEVER INSPECTED A REAL FILE. Measured at LEAD: its only references anywhere in the repo were
// PROSE — a docstring in the sibling verdict-mutation driver and a comment in that driver's
// workflow, both citing it as the cautionary example. No import, no registration, no driver, no
// workflow, no npm alias. eslint.config.js registers none of the eslint-rules/* modules, and the
// eslintrc-format lib/sub-agents/.eslintrc.json that named this rule is ignored under flat config.
//
// A RAW GREP HIT COUNT GAVE THIS DEAD RULE THE SAME NUMBER OF REFERENCES AS THE LIVE ONES. That is
// the trap worth remembering: counting references is not measuring enforcement. A live rule is
// IMPORTED and REGISTERED; a dead one is MENTIONED.
//
// SCOPE NOTE, deliberate: seven sibling rules already fire through their own drivers. This SD wires
// ONLY the one that is genuinely dead. Wiring "all of them" would create redundant enforcement
// paths for guards that already work — a single-representation violation manufactured by acting on
// an unmeasured population claim, which is the exact failure this SD was filed to prevent.
//
// Usage:
//   node scripts/lint/no-process-cwd-in-sub-agents-lint.mjs          # changed files (default)
//   node scripts/lint/no-process-cwd-in-sub-agents-lint.mjs --all    # full sweep
//   node scripts/lint/no-process-cwd-in-sub-agents-lint.mjs --all --json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import rule from '../../eslint-rules/no-process-cwd-in-sub-agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The rule self-gates on /lib/sub-agents/, so scanning wider costs time and finds nothing:
// verified at LEAD by sweeping the whole lib tree (2260 files) and getting the same 5 results.
const SCAN_DIRS = ['lib/sub-agents'];
const EXCLUDE_DIR_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archived'];
const SOURCE_FILE_RE = /\.[cm]?js$/i;

const PLUGIN_NS = 'sub-agents';
const RULE_NAME = 'no-process-cwd-in-sub-agents';
const RULE_ID = `${PLUGIN_NS}/${RULE_NAME}`;

// Shapes this predicate knowingly does NOT catch. Printed every run so a zero-finding result is
// never mistaken for a zero-defect codebase.
const KNOWN_MISSED = [
  'indirect cwd: `const {cwd} = process; cwd()` — the member expression is destructured away, so the AST match cannot see it',
  'aliased: `const p = process; p.cwd()` — single-file AST does not track the alias',
  'dynamic: `process["cwd"]()` — computed member access is not matched',
  'helper-indirected: a wrapper in another file that itself calls process.cwd() — single-file AST cannot follow it',
  'files outside lib/sub-agents that a sub-agent imports at runtime — the rule is path-gated by design',
];

const FLAT_CONFIG = {
  files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      console: 'readonly', process: 'readonly', require: 'readonly', module: 'readonly',
      exports: 'readonly', __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly',
      setTimeout: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
    },
  },
  plugins: { [PLUGIN_NS]: { rules: { [RULE_NAME]: rule } } },
  rules: { [RULE_ID]: 'error' },
};

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (EXCLUDE_DIR_SEGMENTS.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (SOURCE_FILE_RE.test(e.name)) out.push(full);
  }
  return out;
}

function candidateFilesAll(root) {
  const out = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), out);
  return out;
}

/**
 * Changed files, from the broadest candidate set the sibling drivers use between them:
 * committed-vs-base, staged, unstaged, and untracked. A guard that only saw committed changes
 * would pass a violation that is sitting staged in the very commit being made.
 * execFileSync rather than execSync: no shell features are needed, so no shell is involved.
 */
function candidateFilesDiff(root) {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const base = git(['merge-base', 'HEAD', 'origin/main']).trim();
  const names = new Set();
  for (const args of [
    ['diff', '--name-only', `${base}...HEAD`],
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    for (const n of git(args).split('\n').map((s) => s.trim()).filter(Boolean)) names.add(n);
  }
  return [...names]
    .filter((n) => SOURCE_FILE_RE.test(n) && SCAN_DIRS.some((d) => n.startsWith(`${d}/`)))
    .map((n) => path.join(root, n))
    .filter((p) => fs.existsSync(p));
}

function lintFile(linter, filePath, stats) {
  let code;
  try { code = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  let messages;
  try {
    messages = linter.verify(code, FLAT_CONFIG, { filename: filePath });
  } catch (e) {
    // A file the parser cannot read is NOT a clean file. Silence here and a genuine pass look
    // identical downstream, which is the defect class this whole SD exists to remove.
    //
    // AND THIS CATCH ONCE SWALLOWED A TOTAL GUARD FAILURE. A mis-registered rule does not produce
    // an ESLint MESSAGE — `linter.verify` THROWS ("Could not find plugin ..."), once per file. The
    // original version caught that, warned to stderr, returned [], and the run reported
    // `findings=0` with exit 0. A completely broken configuration looked exactly like a clean
    // codebase. Counting the skips is what makes that impossible; see the invariant in main().
    stats.skipped += 1;
    console.warn(`⚠️  skipped (parse/config): ${rel} — ${String(e.message).split('\n')[0]}`);
    return [];
  }

  const findings = messages
    .filter((m) => m.ruleId === RULE_ID)
    .map((m) => ({ filePath: rel, line: m.line, column: m.column, message: m.message }));

  // ─── THE ONE DELIBERATE DEPARTURE FROM THE SIBLING DRIVERS ───────────────────────────────────
  // Every sibling filters on `ruleId === RULE_ID` and DISCARDS everything else. That silently
  // swallows ESLint's `ruleId: null` diagnostics — including "Definition for rule ... was not
  // found", which is exactly what a MIS-REGISTERED rule emits, and "No matching configuration
  // found for <file>", which is what a path/config mismatch emits.
  //
  // Both were observed during this SD. A probe with a wrong filename returned zero findings for
  // every case INCLUDING its negative controls, and the only evidence was one discarded
  // ruleId:null message. A guard reporting nothing is indistinguishable from a guard finding
  // nothing — so these are surfaced as findings rather than dropped.
  // NOT EVERY ruleId:null MESSAGE MEANS THE GUARD IS BROKEN, and treating them alike makes the
  // signal worthless. Two distinct things arrive on this channel:
  //
  //   MISCONFIGURATION — "Definition for rule ... was not found" (the rule is not registered under
  //   the id the config names) or "No matching configuration found for <file>" (the file matched
  //   no config block). Either means THE GUARD IS NOT RUNNING. These BLOCK.
  //
  //   UNUSED DIRECTIVE — "Unused eslint-disable directive". For THIS rule that is the NORMAL state
  //   of a VALID pragma: the rule handles suppression itself in its Program visitor and returns
  //   early at the call site, so ESLint's own directive legitimately suppresses nothing. Blocking
  //   on it would fail every correctly-exempted site — which is how a useful guard becomes one
  //   people switch off. Warned, not blocked, so a genuinely stale pragma is still visible.
  const nullId = messages.filter((m) => m.ruleId === null);
  const misconfigured = nullId.filter((m) => /Definition for rule|No matching configuration/i.test(m.message));
  const unusedDirectives = nullId.filter((m) => /Unused eslint-disable directive/i.test(m.message));

  for (const m of unusedDirectives) {
    console.warn(`ℹ️  ${rel}:${m.line || 1} — ${m.message} (expected for a valid pragma on this rule: suppression happens at the call site, not via the directive)`);
  }

  const blockingDiagnostics = misconfigured.map((m) => ({
    filePath: rel,
    line: m.line || 1,
    column: m.column || 1,
    message: `THE GUARD ITSELF IS NOT RUNNING (not a code violation): ${m.message}`,
  }));

  return findings.concat(blockingDiagnostics);
}

function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const wantAll = argv.includes('--all');

  // Blocking by default and NOT env-downgradeable. The tree was measured clean at LEAD (5
  // violations, all resolved by this SD), so there is no backlog to warn around. A sibling guard
  // that requires an env var to block has 334 outstanding violations and consequently cannot fail
  // a merge — a posture worth avoiding when it is not needed.
  const blocking = true;

  let mode = 'diff';
  let scanned;
  if (wantAll) {
    mode = 'all';
    scanned = candidateFilesAll(REPO_ROOT);
  } else {
    try {
      scanned = candidateFilesDiff(REPO_ROOT);
    } catch (e) {
      console.warn(`⚠️  diff base unavailable (${String(e.message).split('\n')[0]}) — falling back to --all`);
      mode = 'all (degraded)';
      scanned = candidateFilesAll(REPO_ROOT);
    }
  }

  const linter = new Linter({ configType: 'flat' });
  const stats = { skipped: 0 };
  const findings = scanned.flatMap((f) => lintFile(linter, f, stats));

  // ─── THE INVARIANT THAT MAKES A BROKEN GUARD IMPOSSIBLE TO MISREAD ───────────────────────────
  // Derived from the OUTCOME rather than from matching an error message, because message patterns
  // are exactly the brittle thing that lets the next failure mode through unrecognised.
  //
  // If files were selected but NONE of them could actually be linted, the run has measured
  // nothing. Reporting "0 findings" there is the same lie as `search_performed: true` on a search
  // that never ran. Observed for real during this SD: mis-registering the rule made verify() throw
  // once per file, every file was skipped, and the driver printed findings=0 and exited 0.
  if (scanned.length > 0 && stats.skipped === scanned.length) {
    console.error(`❌ THE GUARD DID NOT RUN: all ${scanned.length} selected file(s) failed to lint. `
      + 'This is a configuration or registration failure, NOT a clean codebase. Findings below are meaningless.');
    process.exitCode = 1;
    return;
  }
  if (stats.skipped > 0) {
    console.warn(`⚠️  ${stats.skipped} of ${scanned.length} file(s) could not be linted — findings below cover only the remainder.`);
  }

  if (jsonMode) {
    console.log(JSON.stringify({ mode, scanned: scanned.length, findings, known_missed: KNOWN_MISSED }, null, 2));
  } else {
    console.log(`[no-process-cwd-lint] mode=${mode} scanned=${scanned.length} findings=${findings.length} enforcement=${blocking ? 'BLOCK' : 'warn'}`);
    for (const f of findings) console.log(`  ${f.filePath}:${f.line}:${f.column} — ${f.message}`);
    console.log('[no-process-cwd-lint] KNOWN-MISSED shapes (not covered by this predicate):');
    for (const k of KNOWN_MISSED) console.log(`  - ${k}`);
  }

  // process.exitCode rather than process.exit(): on Windows process.exit() can race a closing
  // libuv handle and produce a deterministic exit 127 that has nothing to do with the findings.
  process.exitCode = (findings.length > 0 && blocking) ? 1 : 0;
}

main();
