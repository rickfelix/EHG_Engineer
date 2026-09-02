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

// SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-3): the emitValidationAuditLog call previously passed
// sd_id: null for ANY key-form (non-UUID) sdId, even though bypass_ledger's own insert
// (a few lines above) already correctly resolved key-vs-UUID for ITS sd_id/sd_key columns.
// validation_audit_log has no sd_key column at all, so that row landed completely unlinked
// to the SD for every key-invoked bypass -- the common CLI form. Structural (source-text)
// assertions, matching this file's own established convention for cli-main.js (a large CLI
// orchestrator not amenable to live invocation in a unit test).
describe('SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-3): validation_audit_log SD linkage for key-invoked bypasses', () => {
  const src = readFileSync(CLI_MAIN, 'utf8');

  it('resolves the SD identifier via resolveSdInputOrNull before either bypass write, keeping both the row id and the full row', () => {
    expect(src).toContain("await import('../../../lib/sd-id-resolver.js')");
    expect(src).toContain('resolveSdInputOrNull');
    expect(src).toContain('const { sdId: resolvedSdUuid, sd: resolvedSdRow } = await resolveSdInputOrNull(sdId, supabaseForBypassLedger);');
  });

  // SECURITY review finding S1 (EXEC-TO-PLAN evidence, measured 2026-09-02): resolvedSdUuid is
  // strategic_directives_v2.id, which is polymorphic (22.7% of live SDs carry a key-form id,
  // not a UUID string) -- unsafe for bypass_ledger.sd_id, a strict UUID column. resolvedSdRow.uuid_id
  // is always a real UUID and must be used there instead.
  it('bypass_ledger insert uses the guaranteed-UUID uuid_id for sd_id, not the polymorphic resolvedSdUuid', () => {
    const insertBlock = src.slice(src.indexOf("from('bypass_ledger')"), src.indexOf("from('bypass_ledger')") + 600);
    expect(insertBlock).toContain('sd_id: resolvedSdRow?.uuid_id');
    expect(insertBlock).not.toMatch(/sd_id:\s*resolvedSdUuid\b/);
  });

  it('a bypass_ledger insert failure fails the handoff closed (no silent warn-and-proceed)', () => {
    const insertBlock = src.slice(src.indexOf("from('bypass_ledger')"), src.indexOf("from('bypass_ledger')") + 1200);
    expect(insertBlock).toContain('BYPASS LEDGER WRITE FAILED (FAIL-CLOSED)');
    expect(insertBlock).toMatch(/if \(ledgerErr\) \{[\s\S]*?return \{ success: false \};/);
  });

  it('emitValidationAuditLog uses resolvedSdUuid (strategic_directives_v2.id\'s own convention; validation_audit_log.sd_id is VARCHAR(100) and accepts either shape)', () => {
    const auditCallIdx = src.indexOf('await emitValidationAuditLog({');
    expect(auditCallIdx).toBeGreaterThan(-1);
    const auditBlock = src.slice(auditCallIdx, auditCallIdx + 400);
    expect(auditBlock).toContain('sd_id: resolvedSdUuid');
    // The old bug pattern (a fresh UUID-regex test producing null for a key-form sdId) must
    // be gone from this specific call site.
    expect(auditBlock).not.toMatch(/sd_id:\s*typeof sdId === 'string'/);
  });
});
