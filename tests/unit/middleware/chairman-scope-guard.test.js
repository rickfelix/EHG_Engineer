/**
 * Tests for Chairman Scope Guard middleware
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-011 (V08: chairman_dashboard_scope)
 */

import { describe, it, expect, vi } from 'vitest';
import { createChairmanScopeGuard } from '../../../lib/middleware/chairman-scope-guard.js';

function createMockReqRes(path, method = 'GET') {
  const req = { path, method, originalUrl: `/api/chairman${path}` };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('Chairman Scope Guard — Blocking Mode', () => {
  const guard = createChairmanScopeGuard({ blocking: true });

  it('allows governance routes through', () => {
    const { req, res, next } = createMockReqRes('/decisions');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows portfolio routes', () => {
    const { req, res, next } = createMockReqRes('/portfolio/health');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks prohibited create routes with 403', () => {
    const { req, res, next } = createMockReqRes('/ventures/new');
    guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CHAIRMAN_SCOPE_VIOLATION' })
    );
  });

  it('blocks prohibited edit routes with 403', () => {
    const { req, res, next } = createMockReqRes('/sd/123/edit');
    guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows unknown routes through (not prohibited)', () => {
    const { req, res, next } = createMockReqRes('/some-custom-route');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows escalation routes', () => {
    const { req, res, next } = createMockReqRes('/escalations/pending');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows stakeholder-response routes (V02)', () => {
    const { req, res, next } = createMockReqRes('/stakeholder-response/abc');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('Chairman Scope Guard — Advisory Mode', () => {
  const guard = createChairmanScopeGuard({ blocking: false });

  it('lets prohibited routes through with warning (advisory)', () => {
    const { req, res, next } = createMockReqRes('/ventures/new');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('Chairman Scope Guard — Default Options', () => {
  const guard = createChairmanScopeGuard();

  it('defaults to blocking mode', () => {
    const { req, res, next } = createMockReqRes('/sd/456/edit');
    guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
