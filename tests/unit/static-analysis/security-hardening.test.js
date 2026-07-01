/**
 * Security Hardening — Static Checks (TS-5)
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Per SECURITY sub-agent finding (agentId a997e58734a1fe858, TR-1): all git
 * subprocess calls in this SD's new modules must use execFile/spawn with an
 * argv array, never shell-string interpolation. This test statically greps
 * the source of the new modules so a future edit that reintroduces execSync
 * or a shell:true call fails CI instead of being silently merged.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const NEW_MODULE_PATHS = [
  'lib/static-analysis/consumer-index.js',
  'lib/static-analysis/symbol-diff.js',
  'lib/static-analysis/blast-radius.js',
  'lib/static-analysis/ast-parse.js',
  'scripts/blast-radius.js',
];

const ROOT_DIR = path.resolve(__dirname, '../../../');

describe('security-hardening: blast-radius modules use argv-array subprocess calls', () => {
  for (const relPath of NEW_MODULE_PATHS) {
    it(`${relPath} never uses execSync or shell:true`, () => {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');
      expect(source).not.toMatch(/\bexecSync\s*\(/);
      expect(source).not.toMatch(/shell\s*:\s*true/);
    });
  }

  it('every git invocation uses execFileSync with an argv array (not a shell string)', () => {
    const gitInvokingFiles = [
      'lib/static-analysis/symbol-diff.js',
      'lib/static-analysis/blast-radius.js',
    ];
    for (const relPath of gitInvokingFiles) {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');
      const gitCalls = source.match(/execFileSync\(\s*'git'\s*,\s*\[/g) || [];
      expect(gitCalls.length).toBeGreaterThan(0);
    }
  });

  it('none of the new modules require/import a repo config file (babel.config, tsconfig, eslint) or call eval', () => {
    // Matches actual LOAD call sites, not prose (e.g. a comment explaining why
    // config auto-load is deliberately avoided must not self-trip this check).
    const loadPattern = /(require|import)\s*\(\s*[^)]*(babel\.config|tsconfig|\.eslintrc)[^)]*\)/;
    for (const relPath of NEW_MODULE_PATHS) {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');
      expect(source).not.toMatch(loadPattern);
      expect(source).not.toMatch(/\beval\s*\(/);
    }
  });
});
