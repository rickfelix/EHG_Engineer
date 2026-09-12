// SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-145 — covers TS-1..TS-11 from the PRD.
//
// KNOWN LIMITATION (of this test file, not just the rule itself): candidateFilesDiff/
// candidateFilesAll are exercised indirectly via classifyFile/hasExecutableLogic/
// isInstrumented/findIgnorePragma directly (pure-function unit tests); the git-dependent CLI
// driver (main(), resolveMergeBase) is covered by the control-seed-specs.json fixtures-form
// entry (a real seeded-defect trial), not by this file.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  hasExecutableLogic,
  isInstrumented,
  findIgnorePragma,
  classifyFile,
  candidateFilesDiff,
  EVA_FILE_RE,
} from '../../../scripts/lint/eva-logger-required-lint.mjs';

const LOGGER_IMPORT = "import { createLogger } from '../logger.js';\n";
const TRACER_IMPORT = "import { createOrchestratorTracer } from '../eva/observability.js';\n";

describe('hasExecutableLogic', () => {
  it('detects a function declaration', () => {
    expect(hasExecutableLogic('export function foo() { return 1; }')).toBe(true);
  });
  it('detects a class declaration', () => {
    expect(hasExecutableLogic('export class Foo {}')).toBe(true);
  });
  it('detects an arrow function', () => {
    expect(hasExecutableLogic('export const foo = (x) => x + 1;')).toBe(true);
  });
  it('returns false for type/constants-only exports (TS-4 precondition)', () => {
    expect(hasExecutableLogic("export const X = { a: 1, b: 2 };\nexport const Y = 'literal';")).toBe(false);
  });

  // EXEC-phase TESTING sub-agent evidence (row 3d991407): FR-3 over-exempted 14 real files
  // whose only logic is object/class method-shorthand syntax -- the dominant idiom in
  // lib/eva/services/** and lib/eva/stage-templates/**.
  it('detects object method-shorthand syntax (real shape: createService({ ... executeFn(context) {...} }))', () => {
    expect(hasExecutableLogic("export const svc = createService({\n  name: 'x',\n  executeFn(context) {\n    return context.data;\n  },\n});")).toBe(true);
  });
  it('detects async method-shorthand syntax', () => {
    expect(hasExecutableLogic('const TEMPLATE = {\n  async computeDerived(data) {\n    return data;\n  },\n};')).toBe(true);
  });

  // EXEC-phase TESTING sub-agent evidence: lib/eva/workers/index.js has no function/class/
  // arrow/method-shorthand anywhere -- it is a top-level imperative script (if-guards, `new
  // WorkerScheduler()`, direct calls) that still has real, worth-instrumenting logic.
  it('detects top-level imperative script code via a constructor call (real shape: workers/index.js)', () => {
    const src = "import { createClient } from '@supabase/supabase-js';\nconst supabase = createClient(url, key);\nconst scheduler = new WorkerScheduler();\nif (!url) { process.exit(1); }\nscheduler.startAll();";
    expect(hasExecutableLogic(src)).toBe(true);
  });
  it('a keyword mentioned only inside a comment does not count as executable logic', () => {
    const src = '// example: if (x) { new Foo(); }\nexport const X = { a: 1 };';
    expect(hasExecutableLogic(src)).toBe(false);
  });
});

describe('isInstrumented', () => {
  it('recognizes createLogger usage (TS-2)', () => {
    const src = `${LOGGER_IMPORT}const logger = createLogger('X');\nlogger.info('hi');`;
    expect(isInstrumented(src)).toBe(true);
  });
  it('recognizes OrchestratorTracer usage (TS-5)', () => {
    const src = `${TRACER_IMPORT}const tracer = createOrchestratorTracer();`;
    expect(isInstrumented(src)).toBe(true);
  });
  it('TS-8: console.*-only usage does NOT satisfy the standard', () => {
    const src = "export function foo() { console.log('hi'); }";
    expect(isInstrumented(src)).toBe(false);
  });
  it('TS-8 adversarial twin: "logger" appearing only in a comment/string does not count', () => {
    const src = "// this file uses a logger somewhere, I promise\nexport function foo() { return 'logger'; }";
    expect(isInstrumented(src)).toBe(false);
  });
  it('TS-8 adversarial: the standard doc\'s own example snippet pasted into a BLOCK COMMENT does not count (EXEC-phase TESTING finding)', () => {
    const src = "/**\n * Example: import { createLogger } from '../logger.js';\n * const logger = createLogger('X');\n */\nexport function foo() { console.log('x'); }";
    expect(isInstrumented(src)).toBe(false);
  });
  it('TS-8 adversarial: the same snippet embedded in a STRING LITERAL does not count', () => {
    const src = "const example = \"import { createLogger } from '../logger.js'\";\nexport function foo() { createLogger('X'); }";
    expect(isInstrumented(src)).toBe(false);
  });
  it('TS-8 adversarial: a COMMENTED-OUT import + call does not count', () => {
    const src = "// import { createLogger } from '../logger.js';\n// const logger = createLogger('X');\nexport function foo() { console.log('hi'); }";
    expect(isInstrumented(src)).toBe(false);
  });
  it('a createLogger call with no matching import does not count (no accompanying import)', () => {
    const src = "export function foo() { return createLogger('X'); }"; // no import statement
    expect(isInstrumented(src)).toBe(false);
  });
});

describe('findIgnorePragma', () => {
  it('parses a documented escape-hatch reason (TS-7)', () => {
    const p = findIgnorePragma('// eva-logger-lint-ignore: pure formatting helper, no side effects');
    expect(p).toEqual({ present: true, reason: 'pure formatting helper, no side effects' });
  });
  it('flags a blank reason as invalid (not simply absent)', () => {
    const p = findIgnorePragma('// eva-logger-lint-ignore: ');
    expect(p.present).toBe(true);
    expect(p.reason).toBe('');
  });
  it('returns null when no pragma is present', () => {
    expect(findIgnorePragma('export function foo() {}')).toBeNull();
  });
});

describe('classifyFile — end-to-end scenarios', () => {
  it('TS-1: new file with executable logic and zero instrumentation is flagged', () => {
    const v = classifyFile('export function foo() { return 1; }', 'lib/eva/foo.js');
    expect(v).not.toBeNull();
    expect(v.reason).toBe('NOT_INSTRUMENTED');
    expect(v.message).toContain('lib/eva/foo.js');
  });

  it('TS-2: same file after adding createLogger usage passes', () => {
    const src = `${LOGGER_IMPORT}const logger = createLogger('Foo');\nexport function foo() { logger.info('x'); return 1; }`;
    expect(classifyFile(src, 'lib/eva/foo.js')).toBeNull();
  });

  it('TS-4: type-only/constants-only file is exempt', () => {
    expect(classifyFile('export const X = { a: 1 };', 'lib/eva/types.js')).toBeNull();
  });

  it('TS-5: OrchestratorTracer-instrumented file is exempt from the createLogger requirement', () => {
    const src = `${TRACER_IMPORT}const tracer = createOrchestratorTracer();\nexport function run() { tracer.start(); }`;
    expect(classifyFile(src, 'lib/eva/stage-runner.js')).toBeNull();
  });

  it('TS-6: reachability canary always fires (proves classifyFile has not silently regressed)', () => {
    const canary = 'export function doSomething(x) { return x + 1; }'; // zero instrumentation, deliberately
    const v = classifyFile(canary, 'lib/eva/__fixtures__/eva-logger-canary.js');
    expect(v).not.toBeNull();
    expect(v.reason).toBe('NOT_INSTRUMENTED');
  });

  it('TS-7: documented escape-hatch pragma is honored', () => {
    const src = '// eva-logger-lint-ignore: pure formatting helper, no side effects worth logging\nexport function format(x) { return String(x); }';
    expect(classifyFile(src, 'lib/eva/format.js')).toBeNull();
  });

  it('TS-7 (negative): a blank escape-hatch reason is rejected -- still flagged', () => {
    const src = '// eva-logger-lint-ignore: \nexport function foo() { return 1; }';
    const v = classifyFile(src, 'lib/eva/foo.js');
    expect(v).not.toBeNull();
    expect(v.reason).toBe('BLANK_ESCAPE_HATCH_REASON');
  });

  it('TS-8: a console.*-only file (with executable logic) is still flagged', () => {
    const v = classifyFile("export function foo() { console.log('hi'); }", 'lib/eva/bar.js');
    expect(v).not.toBeNull();
    expect(v.reason).toBe('NOT_INSTRUMENTED');
  });
});

describe('TS-9: LEO_DISABLE_EVA_LOGGER_LINT kill-switch (mirrors mechanism-claim-verifier.test.js:130-146)', () => {
  const SCRIPT = path.join(__dirname, '../../../scripts/lint/eva-logger-required-lint.mjs');

  it('classifyFile itself has no kill-switch awareness (the bypass is a CLI-level concern only)', () => {
    process.env.LEO_DISABLE_EVA_LOGGER_LINT = '1';
    try {
      const v = classifyFile('export function foo() { return 1; }', 'lib/eva/foo.js');
      expect(v).not.toBeNull();
    } finally {
      delete process.env.LEO_DISABLE_EVA_LOGGER_LINT;
    }
  });

  it('main() exits 0 and prints an explicit BYPASSED message -- never a bare "0 violations" (real CLI invocation)', () => {
    const r = spawnSync('node', [SCRIPT, '--all'], {
      encoding: 'utf8',
      env: { ...process.env, LEO_DISABLE_EVA_LOGGER_LINT: '1' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('BYPASSED');
    expect(r.stdout).not.toContain('0 violation(s) -- clean');
  });

  it('is not sticky -- clearing the env var restores real enforcement on the next invocation', () => {
    const r = spawnSync('node', [SCRIPT, '--all'], {
      encoding: 'utf8',
      env: { ...process.env, LEO_DISABLE_EVA_LOGGER_LINT: '' },
    });
    // Real repo tree -- expect it to actually scan (not bypassed), regardless of pass/fail count.
    expect(r.stdout).not.toContain('BYPASSED');
  });
});

describe('TS-3: diff-scope excludes an untouched legacy file and includes a newly-added one (real git repo)', () => {
  it('candidateFilesDiff picks up only the file changed vs the merge-base', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-logger-lint-ts3-'));
    try {
      const evaDir = path.join(dir, 'lib', 'eva');
      fs.mkdirSync(evaDir, { recursive: true });
      fs.writeFileSync(path.join(evaDir, 'legacy-zero-logging.js'), 'export function legacy() { return 1; }\n');

      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });

      // Diverge onto a feature branch -- staying ON main would make merge-base(main, HEAD)
      // equal to HEAD itself, diffing a branch against its own tip (always empty).
      execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir });
      fs.writeFileSync(path.join(evaDir, 'new-file.js'), 'export function fresh() { return 2; }\n');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'add new-file'], { cwd: dir });

      // No origin/main in this scratch repo -- resolveMergeBase falls back to 'main', which
      // DOES exist here (created via -b main above), so this exercises the real fallback path.
      const files = candidateFilesDiff(dir).map((f) => path.relative(dir, f).split(path.sep).join('/'));
      expect(files).toContain('lib/eva/new-file.js');
      expect(files).not.toContain('lib/eva/legacy-zero-logging.js');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('.test.js files are excluded even when changed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-logger-lint-ts3b-'));
    try {
      const evaDir = path.join(dir, 'lib', 'eva');
      fs.mkdirSync(evaDir, { recursive: true });
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
      fs.writeFileSync(path.join(evaDir, 'seed.js'), '// seed\n');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });

      execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir });
      fs.writeFileSync(path.join(evaDir, 'foo.test.js'), 'export function shouldNotBeScanned() { return 1; }\n');
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-q', '-m', 'add test file'], { cwd: dir });

      const files = candidateFilesDiff(dir).map((f) => path.relative(dir, f).split(path.sep).join('/'));
      expect(files).not.toContain('lib/eva/foo.test.js');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('TS-10: unresolvable merge-base fails loud, never silently reports zero violations', () => {
  it('candidateFilesDiff throws a NO_MERGE_BASE error in a scratch repo with no origin/main and no HEAD', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-logger-lint-test-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      // Deliberately no commit, no origin/main, no main -- mirrors control-seed-test.mjs's
      // own scratch-dir shape (mkdtempSync + git init + git add, never a commit).
      let thrown = null;
      try {
        candidateFilesDiff(dir);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).not.toBeNull();
      expect(thrown.code).toBe('NO_MERGE_BASE');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('TS-11: CI workflow paths stay consistent with the rule\'s own scan scope', () => {
  it('.github/workflows/eva-logger-required-lint.yml triggers on exactly lib/eva/**/*.js and *.mjs (matching EVA_FILE_RE)', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '../../../.github/workflows/eva-logger-required-lint.yml'),
      'utf8'
    );
    expect(workflow).toContain("'lib/eva/**/*.js'");
    expect(workflow).toContain("'lib/eva/**/*.mjs'");
    expect(workflow).toContain('fetch-depth: 0'); // required for merge-base resolution (TS-10)
  });

  // Tied to the regex ITSELF, not bare string containment -- if EVA_FILE_RE is ever widened
  // (e.g. to include .ts), this test fails until the workflow's paths: filter is updated too,
  // which is the drift this scenario exists to catch (EXEC-phase TESTING finding: the
  // string-containment version above cannot detect that drift on its own).
  it('EVA_FILE_RE accepts exactly the extensions the workflow triggers on, and nothing wider', () => {
    expect(EVA_FILE_RE.test('lib/eva/foo.js')).toBe(true);
    expect(EVA_FILE_RE.test('lib/eva/foo.mjs')).toBe(true);
    expect(EVA_FILE_RE.test('lib/eva/foo.ts')).toBe(false);
    expect(EVA_FILE_RE.source).toBe('^lib\\/eva\\/.+\\.(?:js|mjs)$');
  });
});
