/**
 * Tests for EVA Post-Stage Hook API Route
 * SD: SD-MAN-ORCH-CLI-FRONTEND-PIPELINE-001-C
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing route
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() }))
}));

vi.mock('../../lib/eva/bridge/stitch-provisioner.js', () => ({
  provisionStitchProject: vi.fn().mockResolvedValue({ status: 'ok' })
}));

vi.mock('../../lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js', () => ({
  generateDocs: vi.fn().mockResolvedValue({ vision: {}, archPlan: {}, errors: [] })
}));

vi.mock('../../lib/eva/lifecycle-sd-bridge.js', () => ({
  convertSprintToSDs: vi.fn().mockResolvedValue({ created: true, orchestratorKey: 'SD-TEST-001', childKeys: [], grandchildKeys: [], errors: [] })
}));

// Build a minimal Express-like test harness
function createMockReqRes(overrides = {}) {
  const req = {
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'}` },
    body: { venture_id: 'v-123', stage_number: 15, stage_context: {} },
    ...overrides
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
  return { req, res };
}

describe('EVA Post-Stage Hook Route', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-1234567890');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  });

  it('should export a router', async () => {
    const mod = await import('../../server/routes/eva-post-stage-hook.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function'); // Express Router is a function
  });

  describe('Input Validation', () => {
    it('rejects missing venture_id', async () => {
      const { req, res } = createMockReqRes({ body: { stage_number: 15 } });
      // Simulate calling the route handler directly
      const mod = await import('../../server/routes/eva-post-stage-hook.js');
      const layers = mod.default.stack.filter(l => l.route?.path === '/');
      const postLayer = layers.find(l => l.route?.methods?.post);
      const handlers = postLayer.route.stack.map(s => s.handle);
      // Run auth middleware first
      const next = vi.fn();
      handlers[0](req, res, next);
      if (next.mock.calls.length > 0) {
        // Auth passed, run route handler
        handlers[1](req, res);
      }
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('MISSING_VENTURE_ID');
    });

    it('rejects missing stage_number', async () => {
      const { req, res } = createMockReqRes({ body: { venture_id: 'v-123' } });
      const mod = await import('../../server/routes/eva-post-stage-hook.js');
      const layers = mod.default.stack.filter(l => l.route?.path === '/');
      const postLayer = layers.find(l => l.route?.methods?.post);
      const handlers = postLayer.route.stack.map(s => s.handle);
      const next = vi.fn();
      handlers[0](req, res, next);
      if (next.mock.calls.length > 0) {
        handlers[1](req, res);
      }
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('MISSING_STAGE_NUMBER');
    });
  });

  describe('Auth Validation', () => {
    it('rejects requests without auth header', async () => {
      const { req, res } = createMockReqRes({ headers: {} });
      const mod = await import('../../server/routes/eva-post-stage-hook.js');
      const layers = mod.default.stack.filter(l => l.route?.path === '/');
      const postLayer = layers.find(l => l.route?.methods?.post);
      const authMiddleware = postLayer.route.stack[0].handle;
      authMiddleware(req, res, vi.fn());
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('NO_AUTH_HEADER');
    });

    it('rejects invalid service role key', async () => {
      const { req, res } = createMockReqRes({
        headers: { authorization: 'Bearer wrong-key-that-is-long-enough' }
      });
      // Make keys same length to avoid early length check
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'correct-key-that-is-long-enoug');
      const mod = await import('../../server/routes/eva-post-stage-hook.js');
      const layers = mod.default.stack.filter(l => l.route?.path === '/');
      const postLayer = layers.find(l => l.route?.methods?.post);
      const authMiddleware = postLayer.route.stack[0].handle;
      authMiddleware(req, res, vi.fn());
      expect(res.statusCode).toBe(401);
    });

    it('accepts valid service role key', async () => {
      const { req, res } = createMockReqRes({
        headers: { authorization: 'Bearer test-service-role-key-1234567890' }
      });
      const mod = await import('../../server/routes/eva-post-stage-hook.js');
      const layers = mod.default.stack.filter(l => l.route?.path === '/');
      const postLayer = layers.find(l => l.route?.methods?.post);
      const authMiddleware = postLayer.route.stack[0].handle;
      const next = vi.fn();
      authMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('202 Response', () => {
    it('returns 202 for valid hook stage (S15)', async () => {
      const { req, res } = createMockReqRes();
      const mod = await import('../../server/routes/eva-post-stage-hook.js');
      const layers = mod.default.stack.filter(l => l.route?.path === '/');
      const postLayer = layers.find(l => l.route?.methods?.post);
      const handlers = postLayer.route.stack.map(s => s.handle);
      const next = vi.fn();
      handlers[0](req, res, next);
      if (next.mock.calls.length > 0) {
        handlers[1](req, res);
      }
      expect(res.statusCode).toBe(202);
      expect(res.body.status).toBe('accepted');
      expect(res.body.has_handler).toBe(true);
    });

    it('returns 202 for non-hook stage with has_handler=false', async () => {
      const { req, res } = createMockReqRes({ body: { venture_id: 'v-123', stage_number: 10, stage_context: {} } });
      const mod = await import('../../server/routes/eva-post-stage-hook.js');
      const layers = mod.default.stack.filter(l => l.route?.path === '/');
      const postLayer = layers.find(l => l.route?.methods?.post);
      const handlers = postLayer.route.stack.map(s => s.handle);
      const next = vi.fn();
      handlers[0](req, res, next);
      if (next.mock.calls.length > 0) {
        handlers[1](req, res);
      }
      expect(res.statusCode).toBe(202);
      expect(res.body.has_handler).toBe(false);
    });
  });
});
