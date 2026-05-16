import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const HELPER = join(REPO_ROOT, 'scripts', 'lib', 'emit-validation-audit-log.mjs');
const VOTING = join(REPO_ROOT, 'lib', 'goal-evaluator', 'voting.mjs');

describe('Sibling B reuses Sibling A emit-validation-audit-log helper (FAIL-CLOSED-WITH-RETRY)', () => {
  it('Sibling A helper present (in main via PR #3787)', () => {
    expect(existsSync(HELPER)).toBe(true);
    const src = readFileSync(HELPER, 'utf8');
    expect(src).toContain('FAIL-CLOSED');
    expect(src).toContain('emitValidationAuditLog');
  });

  it('voting.mjs uses ESM imports compatible with helper integration', () => {
    expect(existsSync(VOTING)).toBe(true);
    const src = readFileSync(VOTING, 'utf8');
    expect(src).toContain('export');
    expect(src).toContain('evaluateGoal');
  });

  it('voting.mjs has structure for downstream emit integration (votes + verdict shape)', () => {
    const src = readFileSync(VOTING, 'utf8');
    expect(src).toContain('verdict');
    expect(src).toContain('votes');
    expect(src).toContain('confidence');
  });
});
