/**
 * Unit tests for scope-gate validateChange (pure function).
 * SD-LEO-INFRA-OPUS-MODULE-SCOPE-001 Module E.
 */

import { describe, it, expect } from 'vitest';
import { validateChange } from '../../scripts/modules/scope/scope-gate.js';

const mkScope = (overrides = {}) => ({
  found: true,
  sd_key: 'SD-TEST-001',
  mode: 'out_files_only',
  in_files: [],
  out_files: [],
  ...overrides,
});

describe('validateChange — guard clauses', () => {
  it('returns pass when scope is missing/not found', () => {
    const r = validateChange(null, ['a.js']);
    expect(r.passed).toBe(true);
    expect(r.reason).toBe('no_scope_enforcement');

    const r2 = validateChange({ found: false }, ['a.js']);
    expect(r2.passed).toBe(true);
    expect(r2.reason).toBe('no_scope_enforcement');
  });

  it('returns pass when stagedFiles is empty or non-array', () => {
    const scope = mkScope({ mode: 'strict', in_files: ['x.js'] });
    expect(validateChange(scope, []).passed).toBe(true);
    expect(validateChange(scope, []).reason).toBe('no_staged_files');
    expect(validateChange(scope, null).passed).toBe(true);
    expect(validateChange(scope, undefined).passed).toBe(true);
  });
});

describe('validateChange — out_files_only mode (default)', () => {
  const scope = mkScope({
    mode: 'out_files_only',
    in_files: ['lib/**/*.js'],
    out_files: ['scripts/dangerous/**', 'config/secrets.json'],
  });

  it('blocks file matching out_files pattern', () => {
    const r = validateChange(scope, ['scripts/dangerous/wipe.js']);
    expect(r.passed).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatchObject({
      file: 'scripts/dangerous/wipe.js',
      rule: 'out_files',
    });
    expect(r.violations[0].pattern).toBe('scripts/dangerous/**');
    expect(r.reason).toBe('violation_out_files_only');
  });

  it('blocks exact out_files match', () => {
    const r = validateChange(scope, ['config/secrets.json']);
    expect(r.passed).toBe(false);
    expect(r.violations[0].rule).toBe('out_files');
  });

  it('passes file NOT in out_files (in_files irrelevant)', () => {
    const r = validateChange(scope, ['random/path/file.js']);
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.reason).toBe('pass_out_files_only');
  });

  it('passes file even when in_files would not match (in_files ignored)', () => {
    const r = validateChange(scope, ['totally/unrelated.ts']);
    expect(r.passed).toBe(true);
  });
});

describe('validateChange — strict mode', () => {
  const scope = mkScope({
    mode: 'strict',
    in_files: ['lib/**/*.js', 'scripts/modules/scope/**'],
    out_files: ['lib/legacy/**'],
  });

  it('passes file in in_files', () => {
    const r = validateChange(scope, ['lib/foo/bar.js']);
    expect(r.passed).toBe(true);
    expect(r.reason).toBe('pass_strict');
  });

  it('blocks file NOT in in_files AND NOT in out_files', () => {
    const r = validateChange(scope, ['random/path.js']);
    expect(r.passed).toBe(false);
    expect(r.violations[0]).toMatchObject({
      file: 'random/path.js',
      rule: 'not_in_files',
    });
    expect(r.reason).toBe('violation_strict');
  });

  it('blocks file in out_files even if also matches in_files (out_files always wins)', () => {
    const r = validateChange(scope, ['lib/legacy/old.js']);
    expect(r.passed).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].rule).toBe('out_files');
    // Should NOT also report a not_in_files violation for the same file
    expect(r.violations.filter(v => v.file === 'lib/legacy/old.js')).toHaveLength(1);
  });

  it('multi-file mixed: reports each file separately with correct rules', () => {
    const r = validateChange(scope, [
      'lib/good.js',           // in_files → pass
      'random/bad.js',          // not in scope → not_in_files
      'lib/legacy/old.js',      // out_files → out_files
      'scripts/modules/scope/x.js', // in_files → pass
    ]);
    expect(r.passed).toBe(false);
    expect(r.violations).toHaveLength(2);
    const byFile = Object.fromEntries(r.violations.map(v => [v.file, v.rule]));
    expect(byFile['random/bad.js']).toBe('not_in_files');
    expect(byFile['lib/legacy/old.js']).toBe('out_files');
  });
});

describe('validateChange — advisory mode', () => {
  const scope = mkScope({
    mode: 'advisory',
    in_files: ['lib/**/*.js'],
    out_files: ['secrets/**'],
  });

  it('passes everything but warns on files outside in_files', () => {
    const r = validateChange(scope, ['random/path.js']);
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({
      file: 'random/path.js',
      rule: 'advisory_not_in_files',
    });
    expect(r.reason).toBe('pass_advisory');
  });

  it('out_files still produces violations even in advisory mode', () => {
    const r = validateChange(scope, ['secrets/keys.json']);
    expect(r.passed).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].rule).toBe('out_files');
  });

  it('files in in_files produce no warning', () => {
    const r = validateChange(scope, ['lib/clean.js']);
    expect(r.passed).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});

describe('validateChange — glob patterns', () => {
  it('matches recursive ** glob', () => {
    const scope = mkScope({
      mode: 'strict',
      in_files: ['scripts/**/*.js'],
    });
    expect(validateChange(scope, ['scripts/a.js']).passed).toBe(true);
    expect(validateChange(scope, ['scripts/a/b/c/deep.js']).passed).toBe(true);
    expect(validateChange(scope, ['lib/x.js']).passed).toBe(false);
  });

  it('matches dotfiles when patterns target them', () => {
    const scope = mkScope({
      mode: 'out_files_only',
      out_files: ['.husky/**'],
    });
    const r = validateChange(scope, ['.husky/pre-commit']);
    expect(r.passed).toBe(false);
  });

  it('handles empty in_files in strict mode (everything blocked unless out_files)', () => {
    const scope = mkScope({ mode: 'strict', in_files: [], out_files: [] });
    const r = validateChange(scope, ['anything.js']);
    expect(r.passed).toBe(false);
    expect(r.violations[0].rule).toBe('not_in_files');
  });

  it('handles empty out_files (out_files_only never blocks)', () => {
    const scope = mkScope({ mode: 'out_files_only', in_files: [], out_files: [] });
    const r = validateChange(scope, ['anything.js']);
    expect(r.passed).toBe(true);
  });
});
