/**
 * SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001 — behavioral tests for the ID-form-normalization
 * class fix at the handoff boundary. The existing
 * tests/integration/plan-to-lead-db-content-parity-audit.test.js is a PURE source-pin test
 * (readFileSync + regex on source text) — it never calls validateDbContentParity or
 * createDbContentParityGate. These tests exercise the actual behavior:
 *   - FR-1: BaseExecutor's validationContext carries both sdKey and sdUuid
 *   - FR-2: plan-to-lead orchestrator-child detection resolves identically for sd_key/UUID form
 *   - FR-3: db-content-parity-gate resolves sd_key from ctx.sd first
 *   - FR-4: an ID-resolution failure is tagged with a category distinct from db_content_drift
 */
import { describe, it, expect, vi } from 'vitest';
import { validateDbContentParity } from '../../../scripts/modules/handoff/gates/db-content-parity-gate.js';

/** Filter-aware fake supabase client for strategic_directives_v2 lookups by sd_key. */
function makeSdLookupSupabase(rowsBySdKey) {
  return {
    from(table) {
      if (table !== 'strategic_directives_v2') {
        // sd_verification_results insert (persistResult) — accept and no-op.
        return { insert: () => Promise.resolve({ error: null }) };
      }
      const chain = {
        _filters: {},
        select() { return chain; },
        eq(col, val) { chain._filters[col] = val; return chain; },
        maybeSingle() {
          const sdKey = chain._filters.sd_key;
          const row = rowsBySdKey[sdKey];
          return Promise.resolve({ data: row || null, error: null });
        },
      };
      return chain;
    },
  };
}

describe('FR-3/FR-4: validateDbContentParity — behavioral (not source-pin)', () => {
  it('a resolvable sd_key with no assertions returns pass:true, skipped:true, no idResolutionError', async () => {
    const supabase = makeSdLookupSupabase({
      'SD-EXAMPLE-001': { id: 'uuid-1', metadata: {} },
    });
    const result = await validateDbContentParity('SD-EXAMPLE-001', supabase);
    expect(result.pass).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.idResolutionError).toBeUndefined();
    expect(result.sd_uuid).toBe('uuid-1');
  });

  it('FR-4: an unresolvable sd_key sets idResolutionError:true, distinct from a real assertion mismatch', async () => {
    const supabase = makeSdLookupSupabase({}); // no rows at all
    const result = await validateDbContentParity('SD-DOES-NOT-EXIST-001', supabase);
    expect(result.pass).toBe(false);
    expect(result.idResolutionError).toBe(true);
    expect(result.sd_uuid).toBeNull();
  });
});

describe('FR-3: createDbContentParityGate().validator — resolves sd_key from ctx.sd first', () => {
  it('when ctx.sdId is a UUID but ctx.sd.sd_key is populated, the gate resolves the CORRECT sd_key (not the UUID)', async () => {
    // Simulate BaseExecutor's validationContext: ctx.sdId is a UUID (as it can legitimately
    // be when the CLI was invoked with a UUID argument), but ctx.sd is the full fetched row.
    const ctx = {
      sdId: 'uuid-1',
      sdKey: null, // dead-by-construction pre-FR-1 shape; still possible if FR-1 caller omits it
      sd: { id: 'uuid-1', sd_key: 'SD-EXAMPLE-001', metadata: {} },
    };

    // vi.mock is not used here because createDbContentParityGate's internal
    // validateDbContentParity call only falls back to createSupabaseServiceClient() when no
    // client is injected — but the gate's own validator hardcodes that internal call. So this
    // test asserts the RESOLVED sdKey value indirectly: a lookup keyed on the WRONG value
    // (the raw UUID) would 404, keyed on the right value succeeds. We inject via module mock.
    vi.doMock('../../../lib/supabase-client.js', () => ({
      createSupabaseServiceClient: () => makeSdLookupSupabase({
        'SD-EXAMPLE-001': { id: 'uuid-1', metadata: {} },
      }),
    }));
    vi.resetModules();
    const { createDbContentParityGate: freshGate } = await import('../../../scripts/modules/handoff/gates/db-content-parity-gate.js');

    const gate = freshGate();
    const result = await gate.validator(ctx);

    expect(result.skipped).toBe(true); // no assertions declared -> pass/skip, meaning the SD WAS found
    expect(result.pass).toBe(true);

    vi.doUnmock('../../../lib/supabase-client.js');
    vi.resetModules();
  });

  it('FR-4: a genuinely unresolvable ctx.sd.sd_key produces failure_category id_resolution_error, not db_content_drift', async () => {
    const ctx = {
      sdId: 'uuid-ghost',
      sdKey: null,
      sd: { id: 'uuid-ghost', sd_key: 'SD-GHOST-001', metadata: {} },
    };

    vi.doMock('../../../lib/supabase-client.js', () => ({
      createSupabaseServiceClient: () => makeSdLookupSupabase({}), // nothing resolves
    }));
    // emit-validation-audit-log is dynamically imported inside the gate on failure; mock it so
    // the test doesn't need a live/writable audit sink, and so we can inspect what was emitted.
    const emitSpy = vi.fn(async () => {});
    vi.doMock('../../../scripts/lib/emit-validation-audit-log.mjs', () => ({
      emitValidationAuditLog: emitSpy,
    }));
    vi.resetModules();
    const { createDbContentParityGate: freshGate } = await import('../../../scripts/modules/handoff/gates/db-content-parity-gate.js');

    const gate = freshGate();
    const result = await gate.validator(ctx);

    expect(result.pass).toBe(false);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0].failure_category).toBe('id_resolution_error');

    vi.doUnmock('../../../lib/supabase-client.js');
    vi.doUnmock('../../../scripts/lib/emit-validation-audit-log.mjs');
    vi.resetModules();
  });
});

describe('FR-1: BaseExecutor validationContext carries sdKey and sdUuid (source contract check)', () => {
  it('the validationContext object literal includes sdKey and sdUuid keys derived from sd', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
    const src = readFileSync(join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors', 'BaseExecutor.js'), 'utf8');
    expect(src).toMatch(/sdKey:\s*sd\?\.sd_key/);
    expect(src).toMatch(/sdUuid:\s*sd\?\.id/);
  });
});

describe('FR-2: plan-to-lead orchestrator-child detection uses the normalized UUID (source contract check)', () => {
  it('the fallback child-detection query uses sd?.id || sdId, not the raw sdId alone', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
    const src = readFileSync(join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors', 'plan-to-lead', 'index.js'), 'utf8');
    expect(src).toMatch(/\.eq\('parent_sd_id',\s*sd\?\.id\s*\|\|\s*sdId\)/);
  });
});
