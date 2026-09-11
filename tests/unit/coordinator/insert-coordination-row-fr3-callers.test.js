/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001 FR-3 regression coverage.
 *
 * lib/coordinator/coordination-events.cjs (4 sites) and lib/fleet/sweep-findings-sink.cjs (1
 * site) each did `return { ok: true, id: data.id }` right after an `if (error)` guard. Post
 * FR-1, a delivered/parked outcome returns `{data: null, error: null, landed: true, ...}` --
 * `data.id` on a null `data` THROWS, and the outer catch mis-reported that as `{ok: false}`.
 *
 * These 5 call sites don't set payload.correlation_id, so DISPATCH_ALREADY_DELIVERED is not
 * reachable through them today via the real dispatch.cjs logic (its dedupe check requires a
 * caller-supplied correlation_id) -- and DISPATCH_BACKPRESSURE requires simulating the live
 * unanswered-row cap. Both paths already have dedicated coverage in dispatch.test.js /
 * dispatch-send-backpressure.test.js / dispatch-correlation-dedupe.test.js. This suite mocks
 * dispatch.cjs directly to isolate exactly what changed here: correct handling of the FR-1
 * additive-return CONTRACT, independent of how/when dispatch.cjs produces it.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);

const DELIVERED = { data: null, error: null, landed: true, parkedRowId: 'park-1', code: 'DISPATCH_ALREADY_DELIVERED' };

// vi.mock does not intercept a plain CommonJS require() made from inside another .cjs file
// (verified: it only reliably rewires ESM import/import() call sites) -- both
// coordination-events.cjs and sweep-findings-sink.cjs load dispatch.cjs via require('./dispatch.cjs')
// and DESTRUCTURE insertCoordinationRow into a local const at their own require-time, so patching
// dispatchMod.insertCoordinationRow later would not reach their already-captured reference. Instead
// this installs one STABLE wrapper on the real module (before first requiring the dependent files)
// that delegates to a swappable `currentImpl`, so each test can redirect behavior without any
// dependent module needing to re-require.
const dispatchMod = require_('../../../lib/coordinator/dispatch.cjs');
const realInsertCoordinationRow = dispatchMod.insertCoordinationRow;
let currentImpl = async () => DELIVERED;
dispatchMod.insertCoordinationRow = (...args) => currentImpl(...args);
beforeEach(() => {
  currentImpl = vi.fn(async () => DELIVERED);
});
afterAll(() => {
  dispatchMod.insertCoordinationRow = realInsertCoordinationRow;
});

const {
  emitInertWorkerAlert, emitCompletionBoundaryExitAlert, emitNotificationWaitAlert, emitReaperStarvationAlert,
} = require_('../../../lib/coordinator/coordination-events.cjs');
const { emitFindingAlert } = require_('../../../lib/fleet/sweep-findings-sink.cjs');

/** No prior dupe alert on record — every emit* function checks this before inserting. */
function noDupesSupabase() {
  return {
    from() {
      return {
        select() { return this; }, eq() { return this; }, is() { return this; }, gt() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
      };
    },
  };
}

describe('coordination-events.cjs — FR-3: a delivered/parked outcome is never mis-surfaced as {ok:false}', () => {
  it('emitInertWorkerAlert resolves {ok:true, landed:true} instead of throwing on data.id', async () => {
    const res = await emitInertWorkerAlert(noDupesSupabase(), { aged_count: 1 }, { now: Date.now() });
    expect(res.ok).toBe(true);
    expect(res.landed).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('emitCompletionBoundaryExitAlert resolves {ok:true, landed:true}', async () => {
    const res = await emitCompletionBoundaryExitAlert(noDupesSupabase(), { exited_count: 1 }, { now: Date.now() });
    expect(res.ok).toBe(true);
    expect(res.landed).toBe(true);
  });

  it('emitNotificationWaitAlert resolves {ok:true, landed:true}', async () => {
    const res = await emitNotificationWaitAlert(noDupesSupabase(), { waiting_count: 1 }, { now: Date.now() });
    expect(res.ok).toBe(true);
    expect(res.landed).toBe(true);
  });

  it('emitReaperStarvationAlert resolves {ok:true, landed:true}', async () => {
    const res = await emitReaperStarvationAlert(noDupesSupabase(), { consecutive_refusals: 3, pool_used: 4, pool_cap: 5 }, { now: Date.now() });
    expect(res.ok).toBe(true);
    expect(res.landed).toBe(true);
  });
});

describe('sweep-findings-sink.cjs — FR-3: a delivered/parked outcome is never mis-surfaced as {ok:false}', () => {
  it('emitFindingAlert resolves {ok:true, landed:true} instead of throwing on data.id', async () => {
    const fakeSb = {
      from() {
        return {
          select() { return this; }, eq() { return this; }, gte() { return this; },
          limit() { return Promise.resolve({ data: [], error: null }); },
        };
      },
    };
    const res = await emitFindingAlert(fakeSb, { findingClass: 'SKIP_RESET', subject: 'x', summary: 'a finding' });
    expect(res.ok).toBe(true);
    expect(res.landed).toBe(true);
    expect(res.error).toBeUndefined();
  });
});
