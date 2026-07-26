/**
 * Integration tests for the venture full-teardown endpoints + master-reset refactor.
 *
 * SD: SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-B (Phase 2)
 *
 * FR-5 regression guard: the refactored master-reset (now looping the shared
 * deleteVentureFully helper) still produces the same aggregate teardown result
 * — all ventures torn down, repos counted, orphan stage_zero_requests cleaned,
 * and the response { success, count, message, cleanup } shape preserved.
 *
 * Also covers the two new endpoints (single full-delete, bulk full-delete).
 *
 * Route-test pattern adapted from tests/integration/api-routes/stage19-endpoints.test.js
 * (mock asyncHandler passthrough + findRoute + runHandlerChain + injected supabase).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// asyncHandler → passthrough so we can run handlers directly.
vi.mock('../../lib/middleware/eva-error-handler.js', () => ({
  asyncHandler: (fn) => fn,
}));

// validate middleware → passthrough (we exercise the handler, not UUID regex).
vi.mock('../../server/middleware/validate.js', () => ({
  validateUuidParam: () => (req, res, next) => next(),
  isValidUuid: () => true,
  isValidStringLength: () => true,
}));

// config.js → dummy dbLoader so module-load does not open a real connection.
vi.mock('../../server/config.js', () => ({ dbLoader: { supabase: {} } }));

// The shared teardown helper — mocked so no real teardown/DB/shell happens.
import { issueToken, CONFIRM_ACK_PHRASE } from '../../lib/destructive-confirmation.js';

/**
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-1 added a confirmation gate to all three
 * destructive handlers, so requests that previously executed now refuse with 428 unless
 * confirmed. The parity/aggregation assertions below are NOT weakened by that change —
 * they still guard exactly what they were written to guard. Each request simply supplies
 * a valid confirmation first, so the handler reaches the teardown logic under test.
 *
 * The gate itself is covered separately (tests/unit/destructive-confirmation.test.js for
 * the logic, tests/unit/ventures-destructive-gate.test.js for the wiring on both mounts);
 * this file keeps its original job of guarding the master-reset refactor.
 */
const CONFIRM_SECRET = 'parity-test-secret';

/** Build a request body carrying a valid confirmation for the given target set. */
function confirmed(operation, targetIds, extra = {}) {
  return {
    ...extra,
    confirmation_token: issueToken({ operation, targetIds, issuedAtMs: Date.now(), secret: CONFIRM_SECRET }),
    acknowledgement: CONFIRM_ACK_PHRASE,
    expected_count: targetIds.length,
  };
}

const deleteVentureFullyMock = vi.fn();
vi.mock('../../lib/deleteVentureFully.js', () => ({
  deleteVentureFully: (...a) => deleteVentureFullyMock(...a),
  PROTECTED_REPOS: new Set(['rickfelix/ehg']),
}));

const { default: router } = await import('../../server/routes/ventures.js');

function okResult(id, { repo = 'deleted', registry = true } = {}) {
  return {
    success: true,
    venture: { id, name: `name-${id}` },
    phases: {
      teardown: { success: true, providers: {} },
      resources_marked: 1,
      credentials: { revoked: [{ id: 'c' }], failed: [], skipped: [] },
      db: { success: true, count: 1 },
      github_repo: { slug: `rickfelix/${id}`, status: repo },
      registry: { cleaned: registry },
    },
  };
}
function failResult(id) {
  return {
    success: false,
    venture: { id, name: null },
    phases: { db: { success: false, error: 'cascade blocked' }, github_repo: { status: 'none' }, credentials: { revoked: [], failed: [], skipped: [] }, registry: { cleaned: false } },
  };
}

function buildSupabaseMock({ ventures = [], orphans = [] } = {}) {
  const orphanSelect = vi.fn(() => Promise.resolve({ data: orphans, error: null }));
  const orphanIs = vi.fn(() => ({ select: orphanSelect }));
  const orphanDelete = vi.fn(() => ({ is: orphanIs }));
  const venturesSelect = vi.fn(() => Promise.resolve({ data: ventures, error: null }));
  // SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-3 added audit rows around the teardown.
  // Without this branch every handler here would refuse — correctly, since a failed audit
  // write fails closed — so the mock now covers the audit sink and captures the rows.
  const auditRows = [];
  const auditInsert = vi.fn((row) => { auditRows.push(row); return Promise.resolve({ error: null }); });
  return {
    from: vi.fn((table) => {
      if (table === 'ventures') return { select: venturesSelect };
      if (table === 'stage_zero_requests') return { delete: orphanDelete };
      if (table === 'operations_audit_log') return { insert: auditInsert };
      return {};
    }),
    _orphanDelete: orphanDelete,
    _auditRows: auditRows,
  };
}

function createMockReq(params = {}, body = {}, supabase = buildSupabaseMock()) {
  return { params, body, app: { locals: { supabase } } };
}
function createMockRes() {
  return {
    statusCode: 200, jsonData: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.jsonData = d; return this; },
  };
}
function findRoute(method, path) {
  for (const layer of router.stack) {
    if (layer.route && Object.keys(layer.route.methods)[0] === method && layer.route.path === path) {
      return layer.route.stack.map((s) => s.handle);
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}
async function runHandlerChain(handlers, req, res) {
  let idx = 0;
  const next = async (err) => {
    if (err) throw err;
    if (idx < handlers.length) await handlers[idx++](req, res, next);
  };
  await next();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DESTRUCTIVE_CONFIRM_SECRET = CONFIRM_SECRET;
  deleteVentureFullyMock.mockImplementation((id) => Promise.resolve(okResult(id)));
});

describe('master-reset refactor (FR-5 regression guard)', () => {
  const handlers = findRoute('post', '/master-reset');

  it('loops the helper once per venture, sweeps orphans, and preserves the response shape', async () => {
    const supabase = buildSupabaseMock({
      ventures: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }],
      orphans: [{ id: 'o1' }, { id: 'o2' }],
    });
    const req = createMockReq({}, confirmed('master-reset', ['v1', 'v2', 'v3']), supabase);
    const res = createMockRes();

    await runHandlerChain(handlers, req, res);

    // Helper looped once per venture
    expect(deleteVentureFullyMock).toHaveBeenCalledTimes(3);
    expect(deleteVentureFullyMock).toHaveBeenCalledWith('v1', { supabase });
    expect(deleteVentureFullyMock).toHaveBeenCalledWith('v3', { supabase });
    // Orphan stage_zero_requests cleanup preserved
    expect(supabase._orphanDelete).toHaveBeenCalledTimes(1);
    // Response shape preserved (success, count, message, cleanup)
    expect(res.statusCode).toBe(200);
    expect(res.jsonData).toEqual(expect.objectContaining({
      success: true,
      count: 3,
      message: '3 venture(s) and all related data deleted.',
      cleanup: expect.objectContaining({
        repos_deleted: 3,
        repos_failed: 0,
        credentials_revoked: 3,
        registry_cleaned: true,
        orphans_cleaned: 2,
      }),
    }));
  });

  it('reports an empty portfolio as count 0 without error', async () => {
    const supabase = buildSupabaseMock({ ventures: [], orphans: [] });
    const req = createMockReq({}, confirmed('master-reset', []), supabase);
    const res = createMockRes();
    await runHandlerChain(handlers, req, res);
    expect(deleteVentureFullyMock).not.toHaveBeenCalled();
    expect(res.jsonData.count).toBe(0);
    expect(res.jsonData.success).toBe(true);
  });

  // SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-1. Every other test in this file now
  // supplies a confirmation, which would let the gate be deleted entirely without any of
  // them failing. This one pins the new contract in the same file that guards these
  // routes: an UNCONFIRMED request must refuse and must not reach the teardown.
  it('refuses an UNCONFIRMED master-reset and never reaches the teardown', async () => {
    const supabase = buildSupabaseMock({ ventures: [{ id: 'v1' }, { id: 'v2' }], orphans: [] });
    const req = createMockReq({}, {}, supabase);
    const res = createMockRes();

    await runHandlerChain(handlers, req, res);

    expect(res.statusCode).toBe(428);
    expect(res.jsonData.code).toBe('CONFIRMATION_REQUIRED');
    expect(deleteVentureFullyMock).not.toHaveBeenCalled();
  });
});

describe('POST /:id/full-delete', () => {
  const handlers = findRoute('post', '/:id/full-delete');

  it('delegates to deleteVentureFully and returns 200 on success', async () => {
    const req = createMockReq({ id: 'v1' }, confirmed('full-delete', ['v1']));
    const res = createMockRes();
    await runHandlerChain(handlers, req, res);
    expect(deleteVentureFullyMock).toHaveBeenCalledWith('v1', { supabase: req.app.locals.supabase });
    expect(res.statusCode).toBe(200);
    expect(res.jsonData.success).toBe(true);
  });

  it('returns 500 when the helper reports failure', async () => {
    deleteVentureFullyMock.mockResolvedValueOnce(failResult('v9'));
    const req = createMockReq({ id: 'v9' }, confirmed('full-delete', ['v9']));
    const res = createMockRes();
    await runHandlerChain(handlers, req, res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonData.success).toBe(false);
  });
});

describe('POST /bulk-full-delete', () => {
  const handlers = findRoute('post', '/bulk-full-delete');

  it('aggregates per-venture results and tolerates partial failure', async () => {
    deleteVentureFullyMock.mockImplementation((id) =>
      Promise.resolve(id === 'bad' ? failResult(id) : okResult(id)));
    const req = createMockReq({}, confirmed('bulk-full-delete', ['v1', 'bad', 'v2'], { ids: ['v1', 'bad', 'v2'] }));
    const res = createMockRes();
    await runHandlerChain(handlers, req, res);
    expect(deleteVentureFullyMock).toHaveBeenCalledTimes(3);
    expect(res.jsonData).toEqual(expect.objectContaining({ success: false, succeeded: 2, failed: 1 }));
    expect(res.jsonData.results).toHaveLength(3);
  });

  it('rejects an empty/missing ids[] with 400', async () => {
    const req = createMockReq({}, {});
    const res = createMockRes();
    await runHandlerChain(handlers, req, res);
    expect(res.statusCode).toBe(400);
    expect(deleteVentureFullyMock).not.toHaveBeenCalled();
  });
});
