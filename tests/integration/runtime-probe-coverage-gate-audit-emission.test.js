import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const GATE = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors', 'lead-final-approval', 'gates', 'runtime-probe-coverage-gate.js');

describe('runtime-probe-coverage-gate emits audit on every decision (recursive-failure-mode mitigation)', () => {
  const src = readFileSync(GATE, 'utf8');

  it('emits validation_audit_log via Sibling A helper', () => {
    expect(src).toMatch(/emitValidationAuditLog/);
    expect(src).toMatch(/validator_name:\s*'runtime_probe_coverage_gate'/);
  });

  it('audit emission wrapped in try/catch (non-blocking on failure)', () => {
    expect(src).toMatch(/non-blocking/);
  });

  it('audit metadata includes coverage_ratio + threshold + enforce_flag', () => {
    expect(src).toContain('coverage_ratio');
    expect(src).toContain('threshold');
    expect(src).toContain('enforce_flag');
  });

  it('failure_category distinguishes pass/block/warn', () => {
    expect(src).toContain("'coverage_pass'");
    expect(src).toContain("'coverage_block'");
    expect(src).toContain("'coverage_warn'");
  });
});
