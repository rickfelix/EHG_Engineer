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
  return {
    from: vi.fn((table) => {
      if (table === 'ventures') return { select: venturesSelect };
      if (table === 'stage_zero_requests') return { delete: orphanDelete };
      return {};
    }),
    _orphanDelete: orphanDelete,
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
  deleteVentureFullyMock.mockImplementation((id) => Promise.resolve(okResult(id)));
});

describe('master-reset refactor (FR-5 regression guard)', () => {
  const handlers = findRoute('post', '/master-reset');

  it('loops the helper once per venture, sweeps orphans, and preserves the response shape', async () => {
    const supabase = buildSupabaseMock({
      ventures: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }],
      orphans: [{ id: 'o1' }, { id: 'o2' }],
    });
    const req = createMockReq({}, {}, supabase);
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
    const req = createMockReq({}, {}, supabase);
    const res = createMockRes();
    await runHandlerChain(handlers, req, res);
    expect(deleteVentureFullyMock).not.toHaveBeenCalled();
    expect(res.jsonData.count).toBe(0);
    expect(res.jsonData.success).toBe(true);
  });
});

describe('POST /:id/full-delete', () => {
  const handlers = findRoute('post', '/:id/full-delete');

  it('delegates to deleteVentureFully and returns 200 on success', async () => {
    const req = createMockReq({ id: 'v1' });
    const res = createMockRes();
    await runHandlerChain(handlers, req, res);
    expect(deleteVentureFullyMock).toHaveBeenCalledWith('v1', { supabase: req.app.locals.supabase });
    expect(res.statusCode).toBe(200);
    expect(res.jsonData.success).toBe(true);
  });

  it('returns 500 when the helper reports failure', async () => {
    deleteVentureFullyMock.mockResolvedValueOnce(failResult('v9'));
    const req = createMockReq({ id: 'v9' });
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
    const req = createMockReq({}, { ids: ['v1', 'bad', 'v2'] });
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
