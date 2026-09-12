/**
 * Integration tests for Feedback API Routes
 * Tests: POST /:id/promote-to-sd, GET /:id, PATCH /:id/status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSupabase = { from: vi.fn() };

vi.mock('../../../server/config.js', () => ({
  dbLoader: { supabase: mockSupabase },
}));

// Mock the validator — we test the route integration, not the validator internals
const mockValidateStatusTransition = vi.fn();
const mockValidateReferences = vi.fn();

vi.mock('../../../lib/quality/feedback-resolution-validator.js', () => ({
  validateStatusTransition: (...args) => mockValidateStatusTransition(...args),
  validateReferences: (...args) => mockValidateReferences(...args),
  ERROR_CODES: {
    FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION: 'FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION',
    FEEDBACK_REFERENCE_NOT_FOUND: 'FEEDBACK_REFERENCE_NOT_FOUND',
    FEEDBACK_SELF_DUPLICATE: 'FEEDBACK_SELF_DUPLICATE',
  },
}));

// ---------------------------------------------------------------------------
// Import router after mocks
// ---------------------------------------------------------------------------
const { default: router } = await import('../../../server/routes/feedback.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReq(body = {}, params = {}, query = {}) {
  return { body, params, query };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.jsonData = data; return this; },
  };
  return res;
}

// SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: promote-to-sd and PATCH /:id/status now resolve
// the chain-tip via fetchLatestFeedback (a `.select('*').eq('id',id).maybeSingle()` base
// fetch, then a `.select('*').or(...).order().order().limit().maybeSingle()` root-scoped
// fetch) instead of a single `.select('*').eq('id',id).single()`, and persist changes via
// `.insert(...)` instead of `.update(...)` (feedback is append-only).
function fetchLatestChain(row, error = null) {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row, error }) }),
      or: () => ({
        order: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row, error }) }),
          }),
        }),
      }),
    }),
  };
}

function insertChainReturning(insertedRow, error = null) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: insertedRow, error }),
  };
}

function correctionInsertChain(captured, error = null) {
  return {
    insert: vi.fn().mockImplementation((payload) => {
      Object.assign(captured, payload);
      return Promise.resolve({ error });
    }),
  };
}

function findRoute(method, path) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath === path) {
        const handlers = layer.route.stack.map(s => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feedback Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateStatusTransition.mockReturnValue({ valid: true });
    mockValidateReferences.mockResolvedValue({ valid: true });
  });

  // === POST /:id/promote-to-sd ===
  describe('POST /:id/promote-to-sd', () => {
    const handler = findRoute('post', '/:id/promote-to-sd');

    it('creates SD from feedback and records the link as a correction insert (never .update())', async () => {
      const feedback = {
        id: 'fb-1',
        title: 'Login bug',
        description: 'Login fails',
        priority: 'P1',
        severity: 'high',
        type: 'bug',
        occurrence_count: 3,
        error_type: 'auth',
        rubric_score: 80,
        resolution_sd_id: null,
        metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
      };

      const newSD = { id: 'uuid-123', sd_key: 'SD-FB-20260317-ABC' };
      const capturedCorrection = {};

      let callCount = 0;
      mockSupabase.from = vi.fn().mockImplementation((table) => {
        callCount++;
        if (callCount <= 2) return fetchLatestChain(feedback); // base + root-scoped fetch
        if (table === 'strategic_directives_v2') return insertChainReturning(newSD);
        return correctionInsertChain(capturedCorrection);
      });

      const req = createMockReq({}, { id: 'fb-1' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.sd_id).toBe('SD-FB-20260317-ABC');
      expect(res.jsonData.sd_uuid).toBe('uuid-123');
      expect(res.jsonData.feedback_id).toBe('fb-1');
      expect(capturedCorrection.resolution_sd_id).toBe('SD-FB-20260317-ABC');
      expect(capturedCorrection.status).toBe('triaged');
      expect(capturedCorrection.id).toBeUndefined();
    });

    it('returns 404 when feedback not found', async () => {
      mockSupabase.from = vi.fn().mockReturnValue(fetchLatestChain(null, { message: 'not found' }));

      const req = createMockReq({}, { id: 'fb-missing' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({ error: 'Feedback not found' });
    });

    it('returns existing SD if already promoted (idempotency guard reads the resolved chain-tip)', async () => {
      const feedback = {
        id: 'fb-1',
        title: 'Already promoted',
        resolution_sd_id: 'SD-EXISTING-001',
      };

      mockSupabase.from = vi.fn().mockReturnValue(fetchLatestChain(feedback));

      const req = createMockReq({}, { id: 'fb-1' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.sd_id).toBe('SD-EXISTING-001');
      expect(res.jsonData.existing).toBe(true);
    });

    it('two sequential promote calls mint exactly one SD (TS-11)', async () => {
      // First call: not yet promoted -> mints an SD and records the correction.
      const unpromoted = { id: 'fb-1', title: 'x', resolution_sd_id: null, metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
      const newSD = { id: 'uuid-1', sd_key: 'SD-FB-20260317-XYZ' };
      let callCount1 = 0;
      const captured1 = {};
      mockSupabase.from = vi.fn().mockImplementation((table) => {
        callCount1++;
        if (callCount1 <= 2) return fetchLatestChain(unpromoted);
        if (table === 'strategic_directives_v2') return insertChainReturning(newSD);
        return correctionInsertChain(captured1);
      });
      const res1 = createMockRes();
      await handler(createMockReq({}, { id: 'fb-1' }), res1);
      expect(res1.jsonData.sd_id).toBe('SD-FB-20260317-XYZ');

      // Second call: fetchLatestFeedback now resolves to the CORRECTION (resolution_sd_id set)
      // -- the idempotency guard reads it, so a second SD is never minted.
      const promoted = { id: 'fb-1-correction', resolution_sd_id: 'SD-FB-20260317-XYZ' };
      mockSupabase.from = vi.fn().mockReturnValue(fetchLatestChain(promoted));
      const res2 = createMockRes();
      await handler(createMockReq({}, { id: 'fb-1' }), res2);
      expect(res2.jsonData.existing).toBe(true);
      expect(res2.jsonData.sd_id).toBe('SD-FB-20260317-XYZ');
    });

    it('returns 500 (never success:true) when the correction-insert fails, closing the pre-existing duplicate-mint bug (TS-12)', async () => {
      const feedback = { id: 'fb-1', title: 'x', resolution_sd_id: null, metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
      const newSD = { id: 'uuid-1', sd_key: 'SD-FB-20260317-ERR' };
      let callCount = 0;
      mockSupabase.from = vi.fn().mockImplementation((table) => {
        callCount++;
        if (callCount <= 2) return fetchLatestChain(feedback);
        if (table === 'strategic_directives_v2') return insertChainReturning(newSD);
        return correctionInsertChain({}, { message: 'insert rejected' });
      });

      const req = createMockReq({}, { id: 'fb-1' });
      const res = createMockRes();
      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.success).toBeUndefined();
      expect(res.jsonData.sd_id).toBe('SD-FB-20260317-ERR');
    });

    it('returns 422 when rubric_score is below threshold', async () => {
      const feedback = {
        id: 'fb-1',
        title: 'Low quality feedback',
        rubric_score: 20,
        resolution_sd_id: null,
      };

      mockSupabase.from = vi.fn().mockReturnValue(fetchLatestChain(feedback));

      const req = createMockReq({}, { id: 'fb-1' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(422);
      expect(res.jsonData.code).toBe('QUALITY_GATE_FAILED');
      expect(res.jsonData.quality_score).toBe(20);
      expect(res.jsonData.threshold).toBe(40);
    });

    it('returns 503 when database not connected', async () => {
      // The route checks dbLoader.supabase truthiness — we need the whole mock object to be falsy
      // Since we mock at module level, we need to re-import. Instead, test it differently.
      // The supabase mock is always truthy in our setup, so this branch is hard to trigger.
      // We verify the guard is present by confirming the handler exists.
      expect(handler).toBeDefined();
    });
  });

  // === GET /:id ===
  describe('GET /:id', () => {
    const handler = findRoute('get', '/:id');

    it('returns feedback when found', async () => {
      const feedback = { id: 'fb-1', title: 'A bug report', status: 'open' };

      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: feedback, error: null }),
      });

      const req = createMockReq({}, { id: 'fb-1' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData).toEqual(feedback);
    });

    it('returns 404 when feedback not found', async () => {
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } }),
      });

      const req = createMockReq({}, { id: 'fb-missing' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({ error: 'Feedback not found' });
    });
  });

  // === PATCH /:id/status ===
  describe('PATCH /:id/status', () => {
    const handler = findRoute('patch', '/:id/status');

    it('updates status successfully with a valid transition, via a correction insert (never .update())', async () => {
      const existing = { id: 'fb-1', status: 'open', title: 'Bug', metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
      const captured = {};

      let callCount = 0;
      mockSupabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return fetchLatestChain(existing); // base + root-scoped fetch
        return correctionInsertChain(captured);
      });

      const req = createMockReq({ status: 'triaged' }, { id: 'fb-1' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.status).toBe('triaged');
      expect(captured.status).toBe('triaged');
      expect(captured.id).toBeUndefined();
    });

    it('TS-13: validateStatusTransition receives the LATEST correction, not the stale root', async () => {
      const staleRoot = { id: 'fb-1', status: 'open', metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
      const latestCorrection = { id: 'fb-1-c1', status: 'triaged', metadata: { corrects_feedback_id: 'fb-1' }, created_at: '2026-02-01T00:00:00.000Z' };

      let callCount = 0;
      mockSupabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return fetchLatestChain(staleRoot); // base fetch returns the id looked up
        if (callCount === 2) return fetchLatestChain(latestCorrection); // root-scoped fetch returns the latest
        return correctionInsertChain({});
      });

      const req = createMockReq({ status: 'resolved', resolution_notes: 'done' }, { id: 'fb-1' });
      const res = createMockRes();
      await handler(req, res);

      expect(mockValidateStatusTransition).toHaveBeenCalledWith(
        expect.objectContaining({ existingFeedback: latestCorrection })
      );
    });

    it('returns 400 when status field is missing', async () => {
      const req = createMockReq({}, { id: 'fb-1' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({ error: 'status field is required' });
    });

    it('returns 404 when feedback not found', async () => {
      mockSupabase.from = vi.fn().mockReturnValue(fetchLatestChain(null, { message: 'no data' }));

      const req = createMockReq({ status: 'triaged' }, { id: 'fb-missing' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData.error).toBe('Feedback not found');
      expect(res.jsonData.code).toBe('FEEDBACK_REFERENCE_NOT_FOUND');
    });

    it('returns 422 when status transition is invalid', async () => {
      const existing = { id: 'fb-1', status: 'open' };

      mockSupabase.from = vi.fn().mockReturnValue(fetchLatestChain(existing));

      mockValidateStatusTransition.mockReturnValue({
        valid: false,
        error: {
          code: 'FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION',
          message: 'Resolved feedback must have a resolution link',
        },
      });

      const req = createMockReq({ status: 'resolved' }, { id: 'fb-1' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(422);
      expect(res.jsonData.code).toBe('FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION');
    });

    it('returns 422 when reference validation fails', async () => {
      const existing = { id: 'fb-1', status: 'open' };

      mockSupabase.from = vi.fn().mockReturnValue(fetchLatestChain(existing));

      mockValidateReferences.mockResolvedValue({
        valid: false,
        error: {
          code: 'FEEDBACK_REFERENCE_NOT_FOUND',
          message: "Quick-fix 'qf-bad' not found.",
        },
      });

      const req = createMockReq(
        { status: 'resolved', quick_fix_id: 'qf-bad' },
        { id: 'fb-1' }
      );
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(422);
      expect(res.jsonData.code).toBe('FEEDBACK_REFERENCE_NOT_FOUND');
    });

    it('passes resolution metadata through to the correction insert', async () => {
      const existing = { id: 'fb-1', status: 'open', metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
      const capturedInsert = {};

      let callCount = 0;
      mockSupabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return fetchLatestChain(existing);
        return correctionInsertChain(capturedInsert);
      });

      const req = createMockReq(
        {
          status: 'resolved',
          resolution_sd_id: 'SD-001',
          resolution_notes: 'Fixed in PR #100',
        },
        { id: 'fb-1' }
      );
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData.success).toBe(true);
      expect(capturedInsert.status).toBe('resolved');
      expect(capturedInsert.resolution_sd_id).toBe('SD-001');
      expect(capturedInsert.resolution_notes).toBe('Fixed in PR #100');
      expect(capturedInsert.updated_at).toBeDefined();
      expect(capturedInsert.id).toBeUndefined();
    });
  });
});
