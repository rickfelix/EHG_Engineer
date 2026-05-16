import { describe, it, expect } from 'vitest';
import { emitValidationAuditLog } from '../../scripts/lib/emit-validation-audit-log.mjs';

function makeMockSupabase({ failFirst = 0, returnedId = 'audit-row-id', returnedAt = '2026-05-16T13:00:00Z' } = {}) {
  let calls = 0;
  return {
    callCount: () => calls,
    from(table) {
      return {
        insert(row) {
          calls++;
          return {
            select() {
              return {
                single: async () => {
                  if (calls <= failFirst) {
                    return { data: null, error: { message: `mock failure attempt ${calls}` } };
                  }
                  return { data: { id: returnedId, created_at: returnedAt }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const minimal = (supabase) => ({
  supabase,
  correlation_id: '11111111-2222-3333-4444-555555555555',
  validator_name: 'unit-test',
  failure_reason: 'unit test reason',
  failure_category: 'bypass',
  metadata: { source: 'unit test' },
  execution_context: 'audit-log-emission-helper.test.js',
});

describe('emitValidationAuditLog FAIL-CLOSED-WITH-RETRY', () => {
  it('succeeds on first attempt and returns row id + written_at', async () => {
    const mock = makeMockSupabase({ failFirst: 0 });
    const res = await emitValidationAuditLog(minimal(mock));
    expect(res.id).toBe('audit-row-id');
    expect(res.written_at).toBe('2026-05-16T13:00:00Z');
    expect(mock.callCount()).toBe(1);
  });

  it('retries up to 3 times with backoff before giving up', async () => {
    const mock = makeMockSupabase({ failFirst: 2 });
    const start = Date.now();
    const res = await emitValidationAuditLog(minimal(mock), { backoff_ms: [10, 20, 30] });
    const elapsed = Date.now() - start;
    expect(res.id).toBe('audit-row-id');
    expect(mock.callCount()).toBe(3);
    expect(elapsed).toBeGreaterThanOrEqual(30); // 10 + 20 between retries
  });

  it('THROWS after 3 retry exhaustion — caller MUST rollback (FAIL-CLOSED)', async () => {
    const mock = makeMockSupabase({ failFirst: 999 });
    await expect(
      emitValidationAuditLog(minimal(mock), { backoff_ms: [1, 1, 1] })
    ).rejects.toThrow(/FAIL-CLOSED after 3 retries/);
    expect(mock.callCount()).toBe(3);
  });

  it('rejects when required fields missing', async () => {
    const mock = makeMockSupabase({ failFirst: 0 });
    await expect(emitValidationAuditLog({ supabase: mock })).rejects.toThrow(/correlation_id required/);
    await expect(emitValidationAuditLog({ supabase: mock, correlation_id: 'x' })).rejects.toThrow(/validator_name required/);
    await expect(emitValidationAuditLog({ supabase: mock, correlation_id: 'x', validator_name: 'v' })).rejects.toThrow(/failure_reason required/);
    await expect(emitValidationAuditLog({ supabase: mock, correlation_id: 'x', validator_name: 'v', failure_reason: 'r' })).rejects.toThrow(/failure_category required/);
  });

  it('propagates correlation_id into row metadata', async () => {
    let captured = null;
    const supabase = {
      from() {
        return {
          insert(row) {
            captured = row;
            return { select: () => ({ single: async () => ({ data: { id: 'x', created_at: 'y' }, error: null }) }) };
          },
        };
      },
    };
    await emitValidationAuditLog(minimal(supabase));
    expect(captured.correlation_id).toBe('11111111-2222-3333-4444-555555555555');
    expect(captured.metadata.correlation_id).toBe('11111111-2222-3333-4444-555555555555');
    expect(captured.metadata.emit_helper_version).toBe('1.0.0');
  });

  it('rejects invalid backoff_ms shape', async () => {
    const mock = makeMockSupabase({ failFirst: 0 });
    await expect(
      emitValidationAuditLog(minimal(mock), { backoff_ms: [10, 20] })
    ).rejects.toThrow(/backoff_ms must be array of exactly 3/);
  });
});
