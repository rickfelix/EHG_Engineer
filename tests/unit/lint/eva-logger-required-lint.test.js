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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  hasExecutableLogic,
  isInstrumented,
  findIgnorePragma,
  classifyFile,
  candidateFilesDiff,
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
  afterEach(() => {
    delete process.env.LEO_DISABLE_EVA_LOGGER_LINT;
  });

  it('is read as a literal env value, not derived from classifyFile (classifyFile itself has no kill-switch awareness)', () => {
    // classifyFile is pure and always evaluates -- the kill-switch lives in main()'s CLI driver,
    // never inside the pure classification logic, so a bypass can never accidentally suppress a
    // unit-tested assertion. This test documents that boundary explicitly.
    process.env.LEO_DISABLE_EVA_LOGGER_LINT = '1';
    const v = classifyFile('export function foo() { return 1; }', 'lib/eva/foo.js');
    expect(v).not.toBeNull(); // still flags -- the bypass is a CLI-level concern, not a classifier concern
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
});
