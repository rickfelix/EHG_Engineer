/**
 * Symbol Diff — Unit Tests
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001 (TS-2, TS-4)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectModifiedExports } from '../../../lib/static-analysis/symbol-diff.js';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function initRepo(tmpDir) {
  git(['init', '-q'], tmpDir);
  git(['config', 'user.email', 'test@example.com'], tmpDir);
  git(['config', 'user.name', 'Test'], tmpDir);
}

describe('symbol-diff', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbol-diff-test-'));
    initRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('identifies a changed export via AST comparison, ignoring unrelated formatting elsewhere (TS-2)', () => {
    const filePath = path.join(tmpDir, 'a.js');
    fs.writeFileSync(filePath, [
      'export function foo() {',
      '  return 1;',
      '}',
      '',
      '// a comment above bar',
      'export function bar() {',
      '  return 2;',
      '}',
    ].join('\n'));
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    // Modify foo's body AND reformat the comment above bar (unrelated to bar's own span).
    fs.writeFileSync(filePath, [
      'export function foo() {',
      '  return 100;',
      '}',
      '',
      '// a COMPLETELY REWORDED comment above bar',
      'export function bar() {',
      '  return 2;',
      '}',
    ].join('\n'));
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'change'], tmpDir);

    const { modifiedExports, warnings } = detectModifiedExports(baseRef, ['a.js'], tmpDir);
    expect(warnings).toEqual([]);

    const names = modifiedExports.map((e) => `${e.exportName}:${e.changeType}`);
    expect(names).toContain('foo:modified');
    expect(names).not.toContain('bar:modified');
  });

  it('flags a removed export as changeType removed', () => {
    const filePath = path.join(tmpDir, 'a.js');
    fs.writeFileSync(filePath, 'export function foo() { return 1; }\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    fs.writeFileSync(filePath, '// foo removed\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'remove foo'], tmpDir);

    const { modifiedExports } = detectModifiedExports(baseRef, ['a.js'], tmpDir);
    expect(modifiedExports).toEqual([{ file: 'a.js', exportName: 'foo', changeType: 'removed' }]);
  });

  it('flags a brand-new export as changeType added, not modified', () => {
    const filePath = path.join(tmpDir, 'a.js');
    fs.writeFileSync(filePath, 'export function foo() { return 1; }\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    fs.writeFileSync(filePath, 'export function foo() { return 1; }\nexport function newFn() { return 2; }\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'add newFn'], tmpDir);

    const { modifiedExports } = detectModifiedExports(baseRef, ['a.js'], tmpDir);
    expect(modifiedExports).toEqual([{ file: 'a.js', exportName: 'newFn', changeType: 'added' }]);
  });

  it('treats a brand-new file as all-added exports (no prior version to diff against)', () => {
    const filePath = path.join(tmpDir, 'empty.js');
    fs.writeFileSync(filePath, '// nothing yet\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    const newFilePath = path.join(tmpDir, 'brand-new.js');
    fs.writeFileSync(newFilePath, 'export function created() { return 1; }\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'new file'], tmpDir);

    const { modifiedExports, warnings } = detectModifiedExports(baseRef, ['brand-new.js'], tmpDir);
    expect(warnings).toEqual([]);
    expect(modifiedExports).toEqual([{ file: 'brand-new.js', exportName: 'created', changeType: 'added' }]);
  });

  it('does not flag a export as modified when only line-ending style differs (CRLF working tree vs LF git-show)', () => {
    // git show reads LF-normalized content straight from the object store;
    // a real Windows checkout (core.autocrlf=true) writes CRLF to the working
    // tree. Reproduce that mismatch directly without depending on this test
    // runner's own autocrlf setting.
    const filePath = path.join(tmpDir, 'a.js');
    const lfContent = 'export function foo() {\n  return 1;\n}\n';
    fs.writeFileSync(filePath, lfContent);
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    // Same logical content, CRLF line endings — simulates a checked-out
    // working tree on Windows with autocrlf=true.
    fs.writeFileSync(filePath, lfContent.replace(/\n/g, '\r\n'));

    const { modifiedExports, warnings } = detectModifiedExports(baseRef, ['a.js'], tmpDir);
    expect(warnings).toEqual([]);
    expect(modifiedExports).toEqual([]);
  });

  it('skips an oversized working-tree file without throwing (TS-4)', () => {
    const filePath = path.join(tmpDir, 'a.js');
    fs.writeFileSync(filePath, 'export function foo() { return 1; }\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    fs.writeFileSync(filePath, `// ${'a'.repeat(2 * 1024 * 1024 + 1)}\nexport function foo() { return 1; }\n`);

    expect(() => {
      const { warnings } = detectModifiedExports(baseRef, ['a.js'], tmpDir);
      expect(warnings.some((w) => w.includes('a.js') && w.includes('cap'))).toBe(true);
    }).not.toThrow();
  });
});
