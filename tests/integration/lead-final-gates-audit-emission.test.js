import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const LEARNING_GATE = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors', 'lead-final-approval', 'gates', 'learning-or-bypass-resolved-gate.js');
const ACTIVATION_GATE = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors', 'lead-final-approval', 'gates', 'activation-invariant-gate.js');

describe('Sibling A LEAD-FINAL gates emit validation_audit_log on bypass branch', () => {
  it('learning-or-bypass-resolved-gate.js imports emitValidationAuditLog', () => {
    const src = readFileSync(LEARNING_GATE, 'utf8');
    expect(src).toContain('emit-validation-audit-log.mjs');
    expect(src).toMatch(/emitValidationAuditLog/);
  });

  it('learning-or-bypass-resolved-gate.js emits on Case C (bypass + no learning)', () => {
    const src = readFileSync(LEARNING_GATE, 'utf8');
    expect(src).toMatch(/validator_name:\s*'learning_or_bypass_resolved_gate'/);
  });

  it('activation-invariant-gate.js imports emitValidationAuditLog', () => {
    const src = readFileSync(ACTIVATION_GATE, 'utf8');
    expect(src).toContain('emit-validation-audit-log.mjs');
    expect(src).toMatch(/emitValidationAuditLog/);
  });

  it('activation-invariant-gate.js emits on bypass branch (ACTIV-CHAIN-DEFERRED)', () => {
    const src = readFileSync(ACTIVATION_GATE, 'utf8');
    expect(src).toMatch(/validator_name:\s*'activation_invariant_gate'/);
    expect(src).toContain('BYPASS_TOKEN');
  });

  it('Both gates use non-blocking try/catch for audit emission (gate verdict unchanged on audit failure)', () => {
    const learningSrc = readFileSync(LEARNING_GATE, 'utf8');
    const activationSrc = readFileSync(ACTIVATION_GATE, 'utf8');
    expect(learningSrc).toMatch(/non-blocking/);
    expect(activationSrc).toMatch(/non-blocking/);
  });
});
