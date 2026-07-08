/**
 * SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001 (FR-2) — isDispatchAuthorized
 * OPT-IN wiring of SD-1's decision-binding primitive. No existing SD's dispatchability
 * changes as a result of this primitive: it only ever activates when an SD explicitly
 * sets metadata.dispatch_auth_required===true.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { recordDisposition } from '../../lib/decision-binding/disposition.js';
const require = createRequire(import.meta.url);
const { isDispatchAuthorized } = require('../../lib/fleet/claim-eligibility.cjs');

/** In-memory fake of the system_events surface disposition.js touches. */
function makeFakeSupabase() {
  const rows = [];
  let nextId = 1;
  return {
    _rows: rows,
    from(table) {
      if (table !== 'system_events') throw new Error(`unexpected table ${table}`);
      return {
        insert(row) {
          return {
            select: () => ({
              single: () => {
                if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
                  return Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } });
                }
                const stored = { id: `evt-${nextId++}`, created_at: new Date().toISOString(), ...row };
                rows.push(stored);
                return Promise.resolve({ data: stored, error: null });
              },
            }),
          };
        },
        select() {
          let filtered = [...rows];
          const builder = {
            eq(col, val) {
              filtered = filtered.filter((r) => r[col] === val);
              return builder;
            },
            maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
          };
          return builder;
        },
      };
    },
  };
}

describe('isDispatchAuthorized (FR-2)', () => {
  it('TS-7: returns authorized:true immediately (no DB lookup) for an SD without the opt-in flag', async () => {
    const sb = { from() { throw new Error('should never be called — no opt-in flag'); } };
    const result = await isDispatchAuthorized({ sd_key: 'SD-ORDINARY-1', metadata: {} }, sb);
    expect(result).toEqual({ authorized: true });
  });

  it('TS-5: denies an opted-in SD with no disposition row', async () => {
    const sb = makeFakeSupabase();
    const result = await isDispatchAuthorized({ sd_key: 'SD-OPT-1', metadata: { dispatch_auth_required: true } }, sb);
    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('dispatch_auth_pending');
  });

  it('TS-6: grants after a dispatch_auth disposition is recorded for that SD', async () => {
    const sb = makeFakeSupabase();
    await recordDisposition(sb, {
      decisionType: 'dispatch_auth',
      subject: { subject_id: 'SD-OPT-2', gate_type: 'dispatch' },
      authority: 'coordinator',
      answerPayload: { authorized: true },
    });
    const result = await isDispatchAuthorized({ sd_key: 'SD-OPT-2', metadata: { dispatch_auth_required: true } }, sb);
    expect(result).toEqual({ authorized: true });
  });

  it('is strict === true (a truthy non-boolean does not opt in)', async () => {
    const sb = { from() { throw new Error('should never be called'); } };
    const result = await isDispatchAuthorized({ sd_key: 'SD-STR-1', metadata: { dispatch_auth_required: 'true' } }, sb);
    expect(result).toEqual({ authorized: true });
  });
});
