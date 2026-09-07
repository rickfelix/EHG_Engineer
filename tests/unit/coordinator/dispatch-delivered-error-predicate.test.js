/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001 FR-1: insertCoordinationRow signals a
 * DELIVERED-but-parked outcome via an ADDITIVE RETURN (never a throw) for exactly two cases --
 * DISPATCH_BACKPRESSURE with a successfully-parked row, and DISPATCH_ALREADY_DELIVERED (covered
 * in dispatch-correlation-dedupe.test.js). Every other throw path in the same function,
 * including a FAILED backpressure park (landed:false -- the message is genuinely lost), must
 * keep throwing unchanged.
 *
 * CRITICAL DESIGN CONSTRAINT (PLAN-TO-EXEC TESTING evidence 2abb19c9): isDeliveredDispatchError
 * is VALUE-keyed on `landed === true`, never CODE-keyed on `.code` membership alone --
 * dispatch.cjs's own `e.landed = parkedRowId != null` means a FAILED park yields landed:false on
 * a MATCHING DISPATCH_BACKPRESSURE code. A code-keyed predicate would misreport that lost
 * message as delivered, which is worse than today's defect (today a lost message at least
 * throws loudly).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isDeliveredDispatchError, insertCoordinationRow, BACKPRESSURE_UNANSWERED_LIMIT,
} = require('../../../lib/coordinator/dispatch.cjs');

const TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

describe('isDeliveredDispatchError (pure, value-keyed)', () => {
  it('is true for landed:true regardless of code', () => {
    expect(isDeliveredDispatchError({ code: 'DISPATCH_BACKPRESSURE', landed: true, parkedRowId: 'x' })).toBe(true);
    expect(isDeliveredDispatchError({ code: 'DISPATCH_ALREADY_DELIVERED', landed: true, parkedRowId: 'y' })).toBe(true);
  });

  // The exact scenario this predicate exists to get right: a MATCHING code with landed:false
  // (a failed backpressure park -- the message is genuinely lost) must NOT read as delivered.
  it('is false for a DISPATCH_BACKPRESSURE-shaped object with landed:false, even though the code matches', () => {
    expect(isDeliveredDispatchError({ code: 'DISPATCH_BACKPRESSURE', landed: false, parkedRowId: null })).toBe(false);
  });

  it('is false for any other throw code, an ordinary {data,error} result, null, or undefined', () => {
    expect(isDeliveredDispatchError({ code: 'DISPATCH_TARGET_UNKNOWN' })).toBe(false);
    expect(isDeliveredDispatchError({ data: {}, error: null })).toBe(false);
    expect(isDeliveredDispatchError(null)).toBe(false);
    expect(isDeliveredDispatchError(undefined)).toBe(false);
  });
});

describe('insertCoordinationRow: DISPATCH_BACKPRESSURE with a SUCCESSFUL park resolves, not throws', () => {
  function stubSupabaseSuccessfulPark() {
    const inserted = [];
    const candidateRows = Array.from({ length: BACKPRESSURE_UNANSWERED_LIMIT }, (_, i) => ({ id: `n-${i}`, payload: {} }));
    const sb = {
      from(table) {
        const chain = {
          _eq: null,
          select(cols) { chain._isBackpressureSelect = table === 'session_coordination' && cols === 'id, payload'; return chain; },
          eq(col, val) { chain._eq = val; return chain; },
          is() { return chain; },
          gt() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          maybeSingle() {
            if (table === 'claude_sessions') {
              return Promise.resolve({ data: chain._eq === TARGET ? { session_id: TARGET, status: 'active' } : null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          insert(r) { inserted.push(r); return chain; },
          single() { return Promise.resolve({ data: { id: 'parked-row-99' }, error: null }); },
          then(res, rej) {
            if (chain._isBackpressureSelect) {
              return Promise.resolve({ data: candidateRows, error: null }).then(res, rej);
            }
            return Promise.resolve({ data: null, error: null }).then(res, rej);
          },
        };
        return chain;
      },
    };
    return { sb, inserted };
  }

  it('resolves with landed:true and the real parkedRowId, additive to {data,error}, when assertSendBackpressures park insert succeeds', async () => {
    const { sb, inserted } = stubSupabaseSuccessfulPark();
    const result = await insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'routine', payload: { kind: 'coordinator_update' },
    }, { logger: silentLog });
    expect(result).toMatchObject({ code: 'DISPATCH_BACKPRESSURE', landed: true, parkedRowId: 'parked-row-99', data: null, error: null });
    // The park insert (inside assertSendBackpressure) is the only insert -- the caller's own
    // routine send never lands a SECOND row on top of the park.
    expect(inserted).toHaveLength(1);
  });

  it('isDeliveredDispatchError() classifies the resolved value as delivered', async () => {
    const { sb } = stubSupabaseSuccessfulPark();
    const result = await insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO',
      subject: 'routine', payload: { kind: 'coordinator_update' },
    }, { logger: silentLog });
    expect(isDeliveredDispatchError(result)).toBe(true);
  });
});

describe('insertCoordinationRow: the ordinary success path keeps its exact {data,error} shape (FR-1 additive-only contract)', () => {
  it('preserves both the `data` AND `error` keys unchanged -- FR-3 callers destructure `error` specifically, not just `data`', async () => {
    const insertedRow = { id: 'row-1', target_session: TARGET, payload: {} };
    const sb = {
      from(table) {
        const chain = {
          _eq: null,
          select() { return chain; },
          eq(col, val) { chain._eq = val; return chain; },
          is() { return chain; },
          gt() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          maybeSingle() {
            if (table === 'claude_sessions') {
              return Promise.resolve({ data: chain._eq === TARGET ? { session_id: TARGET, status: 'active' } : null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          insert() { return chain; },
          single() { return Promise.resolve({ data: insertedRow, error: null }); },
          then(res, rej) {
            if (table === 'session_coordination') return Promise.resolve({ data: [], error: null }).then(res, rej);
            return Promise.resolve({ data: null, error: null }).then(res, rej);
          },
        };
        return chain;
      },
    };
    const result = await insertCoordinationRow(sb, {
      sender_session: 'coord-1', target_session: TARGET, message_type: 'INFO', subject: 'ordinary', payload: {},
    }, { logger: silentLog, select: '*', single: true });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
    expect(result.error).toBeNull();
    expect(result.data).toEqual(insertedRow);
  });
});
