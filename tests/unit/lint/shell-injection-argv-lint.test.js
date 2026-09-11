/**
 * shell-injection-argv-lint suite — SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-B (TS-1..TS-12).
 *
 * FIXTURE CONVENTION (scanner-convention-lint.test.js template): every forbidden shape below is an
 * INLINE SINGLE-QUOTED STRING assembled with BT (backtick) and D (dollar) constants — this test
 * file therefore contains zero real template-literal exec calls, and the lint scanning the repo
 * can never see these fixtures as code. No fixture files on disk. Entries are fed to the pure
 * exported functions via injected arrays — nothing touches git or the filesystem.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsyaml from 'js-yaml';
const parseYaml = (s) => jsyaml.load(s);
import {
  classifyFirstArg, scanLine, stripForScan, findViolations, loadAllowlist,
  normalizeLine, violationKey, partitionByBaseline, parseAddedLines, parseRenameMap,
  baselineKeysForFile, runDiffMode, collectDiff,
} from '../../../scripts/lint/shell-injection-argv-lint.mjs';
import { stripStringLiterals, scannableText } from '../../../lib/lint/added-line-text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BT = String.fromCharCode(96);
const D = '$';

const TPL_INTERP = 'execSync(' + BT + 'git checkout ' + D + '{branch}' + BT + ')';
const TPL_STATIC = 'execSync(' + BT + 'git status' + BT + ')';
const ENCODED_CMD = 'execSync(' + BT + 'powershell -NoProfile -EncodedCommand ' + D + '{encoded}' + BT + ')';
const WORST_SHAPE = 'execSync(' + BT + 'start "" "' + D + '{fileUrl}"' + BT + ', { shell: true })';

describe('TS-1/TS-5: template-literal interpolation flags', () => {
  it('interpolated git command flags S1', () => {
    const hits = scanLine(stripForScan(TPL_INTERP), TPL_INTERP);
    expect(hits.map((h) => h.selector)).toEqual(['S1']);
  });
  it('EncodedCommand builder flags S1 (the class the git-name heuristic missed)', () => {
    expect(scanLine(stripForScan(ENCODED_CMD), ENCODED_CMD).map((h) => h.selector)).toEqual(['S1']);
  });
  it('worst shape (template + shell:true) flags BOTH selectors', () => {
    const sel = scanLine(stripForScan(WORST_SHAPE), WORST_SHAPE).map((h) => h.selector);
    expect(sel).toContain('S1');
    expect(sel).toContain('S2');
  });
});

describe('TS-2: bare-variable command flags (third selector — the phantom-test-audit shape)', () => {
  it('execSync(cmd) flags S1', () => {
    const line = 'return execSync(cmd, { encoding: "utf8" });';
    expect(scanLine(stripForScan(line), line).map((h) => h.selector)).toEqual(['S1']);
  });
  it('literal-then-concat flags S1', () => {
    const line = 'execSync(' + "'git ' + args" + ');';
    expect(scanLine(stripForScan(line), line).map((h) => h.selector)).toEqual(['S1']);
  });
  it('member execSync on any receiver flags', () => {
    const line = 'cp.execSync(userInput);';
    expect(scanLine(stripForScan(line), line).map((h) => h.selector)).toEqual(['S1']);
  });
});

describe('TS-3: safe shapes pass clean (controls)', () => {
  const safe = [
    'execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });',
    'spawnSync("git", args, { cwd, windowsHide: true });',
    'execSync("git status");',
    TPL_STATIC + ';',
    'RE.exec(line);',
    'pattern.exec(text) || [];',
    'runHardenedGit(["diff", "--name-only"]);',
  ];
  for (const line of safe) {
    it(`clean: ${line.slice(0, 50)}`, () => {
      expect(scanLine(stripForScan(line), line)).toEqual([]);
    });
  }
});

describe('TS-4/TS-12: stripping is two-sided', () => {
  it('a COMMENT mentioning shell:true does not flag; a real one does', () => {
    const comment = '// never pass shell: true here — argv only';
    const real = 'spawnSync(bin, args, { shell: true });';
    expect(scanLine(stripForScan(comment), comment)).toEqual([]);
    expect(scanLine(stripForScan(real), real).map((h) => h.selector)).toEqual(['S2']);
  });
  it('a STRING literal containing exec-shaped text does not flag; a real bare-variable call still does (B-1)', () => {
    const stringy = 'console.error(' + "'never use execSync(" + BT + 'git ...' + BT + ") in scripts'" + ');';
    const real = 'const out = execSync(command);';
    expect(scanLine(stripForScan(stringy), stringy)).toEqual([]);
    expect(scanLine(stripForScan(real), real).map((h) => h.selector)).toEqual(['S1']);
  });
  it('stripStringLiterals preserves delimiters and template literals (shared-helper contract)', () => {
    expect(stripStringLiterals("x('abc') + \"def\"")).toBe("x('') + \"\"");
    const tpl = BT + 'kept ' + D + '{x}' + BT;
    expect(stripStringLiterals(tpl)).toBe(tpl);
  });
  it('scannableText stripStrings opt-in leaves default consumers byte-identical', () => {
    const file = { path: 'lib/x.js', added: 'a("s") // c' };
    expect(scannableText(file)).toBe('a("s")  ');
    expect(scannableText(file, { stripStrings: true })).toBe('a("")  ');
  });
});

describe('pragma + allowlist filtering', () => {
  it('pragma-carrying line is exempt', () => {
    const line = 'execSync(cmd); // shell-injection-argv-disable-line — reviewed: static config value';
    expect(scanLine(stripForScan(line), line)).toEqual([]);
  });
  it('findViolations respects file:line and bare-file allowlist keys', () => {
    const entries = [
      { file: 'lib/a.js', line: 10, text: 'execSync(cmd);' },
      { file: 'lib/b.js', line: 5, text: 'execSync(cmd);' },
      { file: 'lib/c.js', line: 7, text: 'execSync(cmd);' },
    ];
    const allow = { 'lib/a.js:10': 'reviewed — static input', 'lib/b.js': 'whole-file escape with reason' };
    const v = findViolations(entries, allow);
    expect(v.map((x) => x.file)).toEqual(['lib/c.js']);
  });
  it('fixture paths are skipped entirely', () => {
    const v = findViolations([{ file: 'tests/unit/x.test.js', line: 1, text: 'execSync(cmd);' }], {});
    expect(v).toEqual([]);
  });
});

describe('TS-6: allowlist reasons are enforced (ledger, not bypass)', () => {
  const tmp = path.join(ROOT, '.artifacts', `allowlist-fixture-${process.pid}.json`);
  const write = (allow) => { fs.mkdirSync(path.dirname(tmp), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify({ _doc: 'x', _scope_note: 'y', allow })); };
  it('empty and whitespace-only reasons both throw', () => {
    try {
      write({ 'lib/a.js': '' });
      expect(() => loadAllowlist(tmp)).toThrow(/non-empty reason/);
      write({ 'lib/a.js': '   ' });
      expect(() => loadAllowlist(tmp)).toThrow(/non-empty reason/);
      write({ 'lib/a.js': 'a real reason' });
      expect(() => loadAllowlist(tmp)).not.toThrow();
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    }
  });
  it('the shipped allowlist parses and every entry carries a reason', () => {
    expect(() => loadAllowlist()).not.toThrow();
  });
});

describe('TS-7/TS-10: BLOCKING flip contract on PARSED YAML (SD-MAN-INFRA-FLIP-SHELL-INJECTION-001)', () => {
  const WF = path.join(ROOT, '.github', 'workflows', 'shell-injection-argv-lint.yml');
  // FLIPPED 2026-09-11: the advisory soak (2026-08-10 → extended to 2026-10-09 by QF-20260911-228)
  // ended when B-3 landed — violationKey identity + merge-base baseline partition in the lint. The
  // self-enforcing contract now guards the BLOCKING state: the step carries an EXPLICIT
  // continue-on-error: false (grep-pinnable, mirroring schema-reference-lint.yml) and the dated
  // advisory note is gone. tests/unit/shell-injection-argv-lint-workflow-blocking.test.js pins the
  // header prose; this block pins the parsed property so a YAML reflow cannot fool a regex.
  it('workflow lint step is blocking (continue-on-error: false as a parsed property)', () => {
    const doc = parseYaml(fs.readFileSync(WF, 'utf8'));
    const steps = doc.jobs['shell-injection-argv'].steps;
    const lintStep = steps.find((s) => s.run && s.run.includes('shell-injection-argv-lint.mjs'));
    expect(lintStep['continue-on-error']).toBe(false);
  });
  it('the dated advisory-soak note is retired from the workflow', () => {
    const src = fs.readFileSync(WF, 'utf8');
    expect(src).not.toContain('2026-09-09');
    expect(src).not.toMatch(/continue-on-error:\s*true/);
  });
});

describe('TS-11: B-3 reflow-safe identity — a moved pre-existing site is PRE-EXISTING, not new', () => {
  it('violationKey ignores the line number and surrounding whitespace', () => {
    const a = violationKey({ file: 'lib/a.js', selector: 'S1', text: '  execSync(cmd);', line: 99 });
    const b = violationKey({ file: 'lib/a.js', selector: 'S1', text: 'execSync(cmd);', line: 278 });
    expect(a).toBe(b);
    expect(a).not.toMatch(/\|\d+$/);
    expect(normalizeLine('  execSync(  cmd );\t')).toBe('execSync( cmd );');
  });
  it('violationKey is content-sensitive (string contents are part of the identity, unlike stripForScan)', () => {
    const a = violationKey({ file: 'lib/a.js', selector: 'S1', text: "execSync('a' + x);" });
    const b = violationKey({ file: 'lib/a.js', selector: 'S1', text: "execSync('b' + x);" });
    expect(a).not.toBe(b);
    expect(violationKey({ file: 'lib/a.js', selector: 'S1', text: 'x' })).not.toBe(violationKey({ file: 'lib/b.js', selector: 'S1', text: 'x' }));
  });
  it('findViolations carries key = violationKey(v) built from the FULL raw line, not the 120-char excerpt', () => {
    const longTail = 'execSync(cmd, { encoding: "utf8" }); // ' + 'x'.repeat(150) + ' END';
    const [v] = findViolations([{ file: 'lib/a.js', line: 3, text: longTail }], {});
    expect(v.key).toBe(violationKey({ file: 'lib/a.js', selector: 'S1', rawText: longTail }));
    expect(v.key.endsWith('END')).toBe(true);
    expect(v.text.length).toBeLessThanOrEqual(120);
  });
  it('the SAME site moved to a new line partitions as pre-existing; a new site in the same file is new', () => {
    const baseline = new Set([violationKey({ file: 'lib/moved.js', selector: 'S1', text: 'execSync(cmd);' })]);
    const moved = findViolations([{ file: 'lib/moved.js', line: 99, text: 'execSync(cmd);' }], {});
    const fresh = findViolations([{ file: 'lib/moved.js', line: 120, text: 'execSync(other);' }], {});
    const split = partitionByBaseline([...moved, ...fresh], baseline);
    expect(split.preExisting.map((v) => v.line)).toEqual([99]);
    expect(split.newViolations.map((v) => v.line)).toEqual([120]);
  });
  it('a NULL baseline (no merge base) proves nothing pre-existing — everything is new, never the reverse', () => {
    const v = findViolations([{ file: 'lib/moved.js', line: 99, text: 'execSync(cmd);' }], {});
    expect(partitionByBaseline(v, null)).toEqual({ newViolations: v, preExisting: [] });
    expect(partitionByBaseline(v, new Set()).newViolations).toHaveLength(1);
  });
});

/** Injected git runner for runDiffMode: `script` maps a regex on args.join(' ') to a result. */
function makeRunner(script) {
  const calls = [];
  const run = (args, opts = {}) => {
    calls.push({ args, opts });
    const cmd = args.join(' ');
    for (const s of script) {
      if (s.match.test(cmd)) {
        if (s.throws) throw new Error(s.throws);
        return opts.result ? { status: s.status ?? 0, stdout: s.stdout ?? '', stderr: s.stderr ?? '' } : (s.stdout ?? '');
      }
    }
    return opts.result ? { status: 0, stdout: '', stderr: '' } : '';
  };
  run.calls = calls;
  return run;
}
const MB = 'abc123def4560000000000000000000000000000';
const patchFor = (file, added) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n`
  + added.map(([line, text]) => `@@ -${line},0 +${line},1 @@\n+${text}`).join('\n') + '\n';

describe('TS-2/TS-3/TS-4/TS-5: merge-base baseline partition through the git-runner seam (FR-2/FR-3)', () => {
  it('TS-2: a touch-only change above a baseline site reports it pre-existing and blocks nothing', () => {
    const run = makeRunner([
      { match: /^merge-base /, stdout: MB + '\n' },
      { match: /^diff --unified=0/, stdout: patchFor('lib/x.js', [[1, '// comment inserted above'], [12, 'execSync(cmd);']]) },
      { match: /^diff --name-status/, stdout: 'M\tlib/x.js\n' },
      { match: new RegExp('^show ' + MB + ':lib/x.js$'), stdout: 'const a = 1;\nexecSync(cmd);\n' },
    ]);
    const r = runDiffMode('origin/main', { run, allow: {} });
    expect(r.mode).toBe('diff');
    expect(r.mergeBase).toBe(MB);
    expect(r.newViolations).toHaveLength(0);
    expect(r.preExisting.map((v) => v.line)).toEqual([12]);
    // the baseline read is argv-only, single-token object name, non-throwing, stderr silenced
    const show = run.calls.find((c) => c.args[0] === 'show');
    expect(show.args).toEqual(['show', `${MB}:lib/x.js`]);
    expect(show.opts.result).toBe(true);
    expect(show.opts.stdio).toEqual(['ignore', 'pipe', 'ignore']);
  });
  it('TS-3: a genuinely new site in the same touched file blocks; the moved site stays pre-existing', () => {
    const run = makeRunner([
      { match: /^merge-base /, stdout: MB },
      { match: /^diff --unified=0/, stdout: patchFor('lib/x.js', [[12, 'execSync(cmd);'], [20, 'execSync(' + BT + 'git ' + D + '{x}' + BT + ');']]) },
      { match: /^diff --name-status/, stdout: 'M\tlib/x.js\n' },
      { match: new RegExp('^show ' + MB + ':lib/x.js$'), stdout: 'execSync(cmd);\n' },
    ]);
    const r = runDiffMode('origin/main', { run, allow: {} });
    expect(r.newViolations.map((v) => v.line)).toEqual([20]);
    expect(r.preExisting.map((v) => v.line)).toEqual([12]);
  });
  it('TS-4: a renamed file reads its baseline at the OLD path (the precedent would have read every old site as new)', () => {
    const run = makeRunner([
      { match: /^merge-base /, stdout: MB },
      { match: /^diff --unified=0/, stdout: patchFor('lib/new.js', [[5, 'execSync(cmd);']]) },
      { match: /^diff --name-status/, stdout: 'R100\tlib/old.js\tlib/new.js\n' },
      { match: new RegExp('^show ' + MB + ':lib/old.js$'), stdout: 'execSync(cmd);\n' },
      { match: new RegExp('^show ' + MB + ':lib/new.js$'), status: 128, stderr: 'fatal: path does not exist' },
    ]);
    const r = runDiffMode('origin/main', { run, allow: {} });
    expect(r.newViolations).toHaveLength(0);
    expect(r.preExisting).toHaveLength(1);
    expect(parseRenameMap('R100\tlib/old.js\tlib/new.js\nM\tlib/x.js\nA\tlib/fresh.js\n')).toEqual(new Map([['lib/new.js', 'lib/old.js']]));
  });
  it('TS-5: a file absent at the merge base has an EMPTY baseline — its violation is new', () => {
    const run = makeRunner([
      { match: /^merge-base /, stdout: MB },
      { match: /^diff --unified=0/, stdout: patchFor('lib/fresh.js', [[1, 'execSync(cmd);']]) },
      { match: /^diff --name-status/, stdout: 'A\tlib/fresh.js\n' },
      { match: /^show /, status: 128, stderr: 'fatal: path does not exist' },
    ]);
    const r = runDiffMode('origin/main', { run, allow: {} });
    expect(r.newViolations).toHaveLength(1);
    expect(r.preExisting).toHaveLength(0);
    expect(baselineKeysForFile({ run, mergeBase: MB, file: 'lib/fresh.js' })).toEqual(new Set());
  });
  it('baselines are read lazily — only files carrying a HEAD violation hit git show', () => {
    const run = makeRunner([
      { match: /^merge-base /, stdout: MB },
      { match: /^diff --unified=0/, stdout: patchFor('lib/clean.js', [[1, 'const ok = 1;']]) + patchFor('lib/x.js', [[3, 'execSync(cmd);']]) },
      { match: /^diff --name-status/, stdout: 'M\tlib/clean.js\nM\tlib/x.js\n' },
      { match: /^show /, stdout: '' },
    ]);
    runDiffMode('origin/main', { run, allow: {} });
    const shows = run.calls.filter((c) => c.args[0] === 'show').map((c) => c.args[1]);
    expect(shows).toEqual([`${MB}:lib/x.js`]);
  });
  it('the archive fence (scripts/one-off, archive, _deprecated) applies in diff mode too, matching --all and the _scope_note', () => {
    const patch = patchFor('scripts/one-off/x.mjs', [[1, 'execSync(cmd);']]) + patchFor('scripts/archive/y.js', [[1, 'execSync(cmd);']]) + patchFor('lib/z.js', [[1, 'execSync(cmd);']]);
    expect(parseAddedLines(patch).map((e) => e.file)).toEqual(['lib/z.js']);
  });
});

describe('TS-6: base-ref guard is LOUD, unresolvable merge base is DEGRADED-advisory (FR-4)', () => {
  it('an unreachable base degrades: nothing scanned, nothing blocked, nothing proven pre-existing', () => {
    const run = makeRunner([{ match: /^merge-base /, throws: 'fatal: Not a valid object name refs/no/such' }]);
    const r = runDiffMode('refs/no/such', { run, allow: {} });
    expect(r.mode).toBe('diff (degraded)');
    expect(r.mergeBase).toBeNull();
    expect(r.scanned).toBe(0);
    expect(r.newViolations).toEqual([]);
    expect(r.preExisting).toEqual([]);
    expect(r.degradedReason).toMatch(/Not a valid object name/);
  });
  it('an empty merge-base (shallow clone) also degrades rather than reading baselines against ""', () => {
    const run = makeRunner([{ match: /^merge-base /, stdout: '\n' }]);
    expect(runDiffMode('origin/main', { run, allow: {} }).mode).toBe('diff (degraded)');
  });
  it('an option-shaped base ref is refused by collectDiff BEFORE any git call (main() hoists the same guard and exits 2)', () => {
    const run = makeRunner([]);
    expect(() => collectDiff('--upload-pack=x', run)).toThrow(/invalid base ref/);
    expect(run.calls).toHaveLength(0);
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'lint', 'shell-injection-argv-lint.mjs'), 'utf8');
    // The guard must sit OUTSIDE runDiffMode's degrade path: main validates, then exits 2, before runDiffMode.
    expect(src).toMatch(/HOSTILE_BASE_REF[\s\S]*process\.exit\(2\)[\s\S]*runDiffMode\(baseRef/);
  });
});

describe('TS-8: d5c57a01 discharge reader — BEHAVIORAL (B-6)', () => {
  it('the lint exists and FIRES on a shell:true seed (not a source grep)', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts', 'lint', 'shell-injection-argv-lint.mjs'))).toBe(true);
    const seed = 'spawn(bin, args, { shell: true }); // seeded discharge probe';
    // The pragma-free seed must produce an S2 finding — the flag d5c57a01 premise ("no lint
    // covers shell:true") is now false BEHAVIORALLY, which is what a discharge must prove.
    const hits = scanLine(stripForScan(seed), 'spawn(bin, args, opts);');
    expect(hits.map((h) => h.selector)).toEqual(['S2']);
  });
});

describe('classifyFirstArg unit coverage', () => {
  it('classifies every measured shape', () => {
    expect(classifyFirstArg("'git status'")).toBe('safe');
    expect(classifyFirstArg('"git status"')).toBe('safe');
    expect(classifyFirstArg(BT + 'git status' + BT)).toBe('safe');
    expect(classifyFirstArg(BT + 'git ' + D + '{x}' + BT)).toBe('unsafe');
    expect(classifyFirstArg('cmd')).toBe('unsafe');
    expect(classifyFirstArg('this.command')).toBe('unsafe');
    expect(classifyFirstArg("'git ' + x")).toBe('unsafe');
    expect(classifyFirstArg('')).toBe('safe');
  });
});

// SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001 (SEC-1): S2 widened from the literal shell:true to any
// non-literal-false shell: value. The 3 live sites were shell: process.platform==='win32'.
describe('SEC-1: S2 flags shell: with any non-literal-false value (two-sided)', () => {
  it('flags shell: process.platform === "win32" (the shape the literal regex missed)', () => {
    const line = "spawn('npx', args, { shell: process.platform === 'win32' });";
    expect(scanLine(stripForScan(line), line).map((h) => h.selector)).toContain('S2');
  });
  it('flags a bare-identifier shell: value', () => {
    const line = 'spawnSync(bin, args, { shell: useShell });';
    expect(scanLine(stripForScan(line), line).map((h) => h.selector)).toContain('S2');
  });
  it('still flags the literal shell: true (no regression)', () => {
    const line = 'spawnSync(bin, args, { shell: true });';
    expect(scanLine(stripForScan(line), line).map((h) => h.selector)).toContain('S2');
  });
  it('does NOT flag shell: false or shell: 0 (the off-switches)', () => {
    for (const off of ['shell: false', 'shell:false', 'shell: 0']) {
      const line = 'spawnSync(bin, args, { ' + off + ' });';
      expect(scanLine(stripForScan(line), line).map((h) => h.selector)).not.toContain('S2');
    }
  });
});
