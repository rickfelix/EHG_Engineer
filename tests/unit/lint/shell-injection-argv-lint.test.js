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

describe('TS-7/TS-10: advisory flip contract on PARSED YAML, self-enforcing deadline', () => {
  const WF = path.join(ROOT, '.github', 'workflows', 'shell-injection-argv-lint.yml');
  const FLIP_DEADLINE = Date.parse('2026-09-09T23:59:59Z');
  it('workflow is advisory (continue-on-error: true as a parsed property) with the dated note', () => {
    const doc = parseYaml(fs.readFileSync(WF, 'utf8'));
    const steps = doc.jobs['shell-injection-argv'].steps;
    const lintStep = steps.find((s) => s.run && s.run.includes('shell-injection-argv-lint.mjs'));
    expect(lintStep['continue-on-error']).toBe(true);
    expect(fs.readFileSync(WF, 'utf8')).toContain('2026-09-09');
  });
  it('B-2: once the soak deadline passes, advisory mode FAILS this test — the flip has an actor', () => {
    const doc = parseYaml(fs.readFileSync(WF, 'utf8'));
    const steps = doc.jobs['shell-injection-argv'].steps;
    const lintStep = steps.find((s) => s.run && s.run.includes('shell-injection-argv-lint.mjs'));
    const stillAdvisory = lintStep['continue-on-error'] === true;
    if (Date.now() > FLIP_DEADLINE) {
      expect(stillAdvisory, 'the 2026-09-09 soak has ended: flip the workflow to blocking (remove continue-on-error) or extend the dated note WITH a recorded reason').toBe(false);
    } else {
      expect(stillAdvisory).toBe(true);
    }
  });
});

describe('TS-11: reflow precondition (B-3) — same content on a new line is scanned again', () => {
  it('DOCUMENTS the resurfacing behavior: added-line scoping re-presents moved latent sites; this is a NAMED FLIP PRECONDITION, not a silent surprise', () => {
    // The lint scans whatever the diff marks as added — a moved pre-existing violation IS
    // re-scanned (schema-lint-scope.test.js:34,64 solves this with violationKey identity; adopt
    // that shape at flip time). While advisory, resurfacing costs an annotation, not a block.
    const moved = { file: 'lib/moved.js', line: 99, text: 'execSync(cmd);' };
    expect(findViolations([moved], {}).length).toBe(1);
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
