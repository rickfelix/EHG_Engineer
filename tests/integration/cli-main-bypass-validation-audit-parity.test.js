import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const CLI_MAIN = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'cli', 'cli-main.js');

describe('Sibling A cli-main.js bypass_validation audit parity wiring', () => {
  const src = readFileSync(CLI_MAIN, 'utf8');

  it('imports emitValidationAuditLog helper', () => {
    expect(src).toContain('emit-validation-audit-log.mjs');
    expect(src).toMatch(/emitValidationAuditLog/);
  });

  it('writes bypass_ledger row inside the bypass execution block', () => {
    expect(src).toContain("from('bypass_ledger')");
  });

  it('FAIL-CLOSED on audit failure: returns success:false on audit emission error', () => {
    expect(src).toMatch(/BYPASS AUDIT EMISSION FAILED \(FAIL-CLOSED\)/);
    expect(src).toMatch(/return\s*\{\s*success:\s*false\s*\}/);
  });

  it('correlation_id propagated from bypass_ledger row to audit emission', () => {
    expect(src).toContain('correlation_id: ledgerRow.correlation_id');
  });

  it('updates bypass_ledger.audit_log_id after successful emission', () => {
    expect(src).toContain('audit_log_id: audit.id');
    expect(src).toContain('audit_log_written_at: audit.written_at');
  });

  it('preserves existing checkBypassRateLimits + validateBypassShape calls', () => {
    expect(src).toContain('await checkBypassRateLimits');
    expect(src).toContain('validateBypassShape');
  });
});
