// SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001 (SEC-5): the phantom-test-audit CLI validates
// PHANTOM_AUDIT_BASE_REF (env) with the shared validateBaseRef before it reaches the safeGit
// string seam. Measured arbitrary-file-write via a --output= token in the parent SECURITY
// assessment. The validator already existed on the hardened runner; this test pins the reuse
// and the source-level wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateBaseRef } = require('../../lib/git/hardened-runner.cjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const auditSrc = fs.readFileSync(path.join(here, '../../scripts/phantom-test-audit.js'), 'utf8');

describe('validateBaseRef behaviour (the reused helper)', () => {
  it('throws HOSTILE_BASE_REF on a --output= token', () => {
    expect(() => validateBaseRef('--output=/tmp/x')).toThrow(/HOSTILE_BASE_REF/);
  });
  it('throws on other option-shaped / whitespace-injection tokens', () => {
    for (const hostile of ['--upload-pack=evil', 'origin/main --output=x', '; rm -rf /']) {
      expect(() => validateBaseRef(hostile)).toThrow(/HOSTILE_BASE_REF/);
    }
  });
  it('accepts a legitimate ref (the phantom-audit default and branch-shaped refs)', () => {
    expect(() => validateBaseRef('origin/main')).not.toThrow();
    expect(() => validateBaseRef('feature/my-branch')).not.toThrow();
    expect(() => validateBaseRef('a1b2c3d')).not.toThrow();
    // NOTE: the shared VALID_BASE_REF is deliberately conservative and rejects `~`/`^` revision
    // syntax (e.g. HEAD~3) — accepted limitation; phantom-audit's default origin/main passes and
    // widening the shared regex is out of scope for this SD.
    expect(() => validateBaseRef('HEAD~3')).toThrow(/HOSTILE_BASE_REF/);
  });
});

describe('phantom-test-audit CLI wires the validation before collectAndAudit', () => {
  it('imports validateBaseRef from the hardened runner', () => {
    expect(auditSrc).toMatch(/validateBaseRef.*from '\.\.\/lib\/git\/hardened-runner\.cjs'/);
  });
  it('calls validateBaseRef(baseRef) before collectAndAudit in the CLI path', () => {
    const idx = auditSrc.indexOf('const baseRef = process.env.PHANTOM_AUDIT_BASE_REF');
    const validateIdx = auditSrc.indexOf('validateBaseRef(baseRef)', idx);
    const collectIdx = auditSrc.indexOf('collectAndAudit(', idx);
    expect(idx).toBeGreaterThan(-1);
    expect(validateIdx).toBeGreaterThan(idx);
    expect(collectIdx).toBeGreaterThan(validateIdx); // validation precedes the git-touching call
  });
});
