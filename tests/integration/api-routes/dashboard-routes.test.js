/**
 * Integration tests for Dashboard API Routes
 * Tests: GET /status, /state, /sd, /sd/:id, /prd, /prd/:id, /ees, /context,
 *        /progress, /handoff, /metrics, /pr-reviews, /pr-reviews/metrics,
 *        /github/pr-review-webhook, /eva/status, /integrity-metrics, /prd-v3/:sd_id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route module
// ---------------------------------------------------------------------------

const mockDashboardState = {
  leoProtocol: { version: '4.3.3', activeRole: 'engineer', currentSD: 'SD-001', currentPRD: null, phase: 'EXEC' },
  context: { usage: 5000, total: 180000, breakdown: { code: 3000, docs: 2000 } },
  progress: { overall: 42, byPhase: { LEAD: 100, PLAN: 80, EXEC: 42 } },
  strategicDirectives: [
    { id: 'SD-001', title: 'First SD', status: 'active' },
    { id: 'SD-002', title: 'Second SD', status: 'draft' },
  ],
  prds: [
    { id: 'PRD-001', title: 'First PRD', sd_id: 'SD-001' },
    { id: 'PRD-002', title: 'Second PRD', sd_id: 'SD-002' },
  ],
  executionSequences: [{ id: 'EES-1', name: 'Sprint 1' }],
  handoffs: [{ id: 'H-1', from: 'PLAN', to: 'EXEC' }],
  application: {
    name: 'EHG_Engineer',
    version: '1.0.0',
    features: { dashboard: true, voiceAssistant: false, portfolio: false },
  },
};

// Mock dashboardState
vi.mock('../../../server/state.js', () => ({
  dashboardState: mockDashboardState,
}));

// Mock broadcastToClients
vi.mock('../../../server/websocket.js', () => ({
  broadcastToClients: vi.fn(),
}));

// Supabase query-builder mock helper
function createQueryChain(resolvedValue) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    then: (fn) => Promise.resolve(resolvedValue).then(fn),
  };
  // Allow chaining .from().select()... to resolve when awaited
  chain[Symbol.for('nodejs.util.inspect.custom')] = undefined;
  return chain;
}

const mockSupabase = {
  from: vi.fn(),
};

const mockLoadPRReviews = vi.fn();
const mockCalculatePRMetrics = vi.fn();
const mockSavePRReview = vi.fn();

vi.mock('../../../server/config.js', () => ({
  dbLoader: {
    supabase: mockSupabase,
    loadPRReviews: mockLoadPRReviews,
    calculatePRMetrics: mockCalculatePRMetrics,
    savePRReview: mockSavePRReview,
  },
}));

// ---------------------------------------------------------------------------
// Import the router AFTER mocks
// ---------------------------------------------------------------------------
const { default: router } = await import('../../../server/routes/dashboard.js');

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
    typeValue: null,
    sendData: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.jsonData = data; return this; },
    type(val) { this.typeValue = val; return this; },
    send(data) { this.sendData = data; return this; },
  };
  return res;
}

/**
 * Find a route handler in the Express router stack by method and path.
 * Returns { handler, keys } where handler is the final route callback
 * and keys are param names.
 */
function findRoute(method, path) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath === path) {
        // The last function in the stack is the handler (after any middleware)
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

describe('Dashboard Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- GET /status ---
  describe('GET /status', () => {
    const handler = findRoute('get', '/status');

    it('returns leoProtocol, context, progress, and application', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual({
        leoProtocol: mockDashboardState.leoProtocol,
        context: mockDashboardState.context,
        progress: mockDashboardState.progress,
        application: mockDashboardState.application,
      });
    });
  });

  // --- GET /state ---
  describe('GET /state', () => {
    const handler = findRoute('get', '/state');

    it('returns full dashboard state', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toBe(mockDashboardState);
    });
  });

  // --- GET /sd ---
  describe('GET /sd', () => {
    const handler = findRoute('get', '/sd');

    it('returns all strategic directives', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual(mockDashboardState.strategicDirectives);
      expect(res.jsonData).toHaveLength(2);
    });
  });

  // --- GET /sd/:id ---
  describe('GET /sd/:id', () => {
    const handler = findRoute('get', '/sd/:id');

    it('returns SD when found', async () => {
      const req = createMockReq({}, { id: 'SD-001' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData).toEqual({ id: 'SD-001', title: 'First SD', status: 'active' });
    });

    it('returns 404 when SD not found', async () => {
      const req = createMockReq({}, { id: 'SD-NONEXISTENT' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({ error: 'Strategic Directive not found' });
    });
  });

  // --- GET /prd ---
  describe('GET /prd', () => {
    const handler = findRoute('get', '/prd');

    it('returns all PRDs', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual(mockDashboardState.prds);
      expect(res.jsonData).toHaveLength(2);
    });
  });

  // --- GET /prd/:id ---
  describe('GET /prd/:id', () => {
    const handler = findRoute('get', '/prd/:id');

    it('returns PRD when found', () => {
      const req = createMockReq({}, { id: 'PRD-001' });
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual({ id: 'PRD-001', title: 'First PRD', sd_id: 'SD-001' });
    });

    it('returns 404 when PRD not found', () => {
      const req = createMockReq({}, { id: 'PRD-NONEXISTENT' });
      const res = createMockRes();

      handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({ error: 'PRD not found' });
    });
  });

  // --- GET /ees ---
  describe('GET /ees', () => {
    const handler = findRoute('get', '/ees');

    it('returns execution sequences', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual([{ id: 'EES-1', name: 'Sprint 1' }]);
    });
  });

  // --- GET /context ---
  describe('GET /context', () => {
    const handler = findRoute('get', '/context');

    it('returns context state', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual(mockDashboardState.context);
    });
  });

  // --- GET /progress ---
  describe('GET /progress', () => {
    const handler = findRoute('get', '/progress');

    it('returns progress state', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual(mockDashboardState.progress);
    });
  });

  // --- GET /handoff ---
  describe('GET /handoff', () => {
    const handler = findRoute('get', '/handoff');

    it('returns handoffs', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual(mockDashboardState.handoffs);
    });
  });

  // --- GET /metrics ---
  describe('GET /metrics', () => {
    const handler = findRoute('get', '/metrics');

    it('returns mock metrics object', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData).toEqual({
        tests: { total: 0, passed: 0, failed: 0 },
        coverage: { lines: 0, branches: 0, functions: 0, statements: 0 },
        git: { branch: 'main', uncommittedChanges: 0, lastCommit: '' },
      });
    });
  });

  // --- GET /pr-reviews ---
  describe('GET /pr-reviews', () => {
    const handler = findRoute('get', '/pr-reviews');

    it('returns reviews from dbLoader', async () => {
      const reviews = [{ pr_number: 42 }];
      mockLoadPRReviews.mockResolvedValue(reviews);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData).toEqual(reviews);
    });

    it('returns 500 on dbLoader error', async () => {
      mockLoadPRReviews.mockRejectedValue(new Error('db fail'));

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({ error: 'Failed to load PR reviews' });
    });
  });

  // --- GET /pr-reviews/metrics ---
  describe('GET /pr-reviews/metrics', () => {
    const handler = findRoute('get', '/pr-reviews/metrics');

    it('returns metrics from dbLoader', async () => {
      const metrics = { totalToday: 5, passRate: 80 };
      mockCalculatePRMetrics.mockResolvedValue(metrics);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData).toEqual(metrics);
    });

    it('returns fallback defaults when dbLoader returns null', async () => {
      mockCalculatePRMetrics.mockResolvedValue(null);

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData).toEqual({
        totalToday: 0,
        passRate: 0,
        avgTime: 0,
        falsePositiveRate: 0,
        complianceRate: 0,
      });
    });
  });

  // --- POST /github/pr-review-webhook ---
  describe('POST /github/pr-review-webhook', () => {
    const handler = findRoute('post', '/github/pr-review-webhook');

    it('saves review and returns success', async () => {
      mockSavePRReview.mockResolvedValue();

      const body = { pr_number: 123, status: 'approved' };
      const req = createMockReq(body);
      const res = createMockRes();

      await handler(req, res);

      expect(mockSavePRReview).toHaveBeenCalledWith(body);
      expect(res.jsonData).toEqual({ success: true, pr_number: 123 });
    });

    it('returns 500 on save failure', async () => {
      mockSavePRReview.mockRejectedValue(new Error('write error'));

      const req = createMockReq({ pr_number: 999 });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({ error: 'Failed to process webhook' });
    });
  });

  // --- GET /eva/status ---
  describe('GET /eva/status', () => {
    const handler = findRoute('get', '/eva/status');

    it('returns EVA status', () => {
      const req = createMockReq();
      const res = createMockRes();

      handler(req, res);

      expect(res.jsonData.enabled).toBe(false);
      expect(res.jsonData.message).toContain('OpenAI Realtime API');
    });
  });

  // --- GET /prd-v3/:sd_id ---
  describe('GET /prd-v3/:sd_id', () => {
    const handler = findRoute('get', '/prd-v3/:sd_id');

    it('returns PRD v3 as JSON by default', async () => {
      const prdRow = {
        prd_id: 'prd-v3-1',
        sd_id: 'SD-001',
        version: 2,
        status: 'approved',
        content_json: { sections: [] },
        content_md: '# PRD',
        generated_at: '2026-01-01',
        import_run_id: 'run-1',
        notes: 'test',
      };

      const chainMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: prdRow, error: null }),
      };
      mockSupabase.from = vi.fn().mockReturnValue(chainMock);

      const req = createMockReq({}, { sd_id: 'SD-001' }, { format: 'json' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData).toMatchObject({ prd_id: 'prd-v3-1', sd_id: 'SD-001', version: 2 });
    });

    it('returns 404 when PRD v3 not found (PGRST116)', async () => {
      const chainMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      mockSupabase.from = vi.fn().mockReturnValue(chainMock);

      const req = createMockReq({}, { sd_id: 'SD-MISSING' }, {});
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({ error: 'PRD not found for this SD' });
    });

    it('returns markdown when format=md', async () => {
      const prdRow = {
        prd_id: 'prd-v3-1',
        sd_id: 'SD-001',
        version: 1,
        status: 'approved',
        content_json: {},
        content_md: '# My PRD Markdown',
        generated_at: '2026-01-01',
        import_run_id: null,
        notes: null,
      };
      const chainMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: prdRow, error: null }),
      };
      mockSupabase.from = vi.fn().mockReturnValue(chainMock);

      const req = createMockReq({}, { sd_id: 'SD-001' }, { format: 'md' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.typeValue).toBe('text/markdown');
      expect(res.sendData).toBe('# My PRD Markdown');
    });
  });

  // --- GET /integrity-metrics ---
  describe('GET /integrity-metrics', () => {
    const handler = findRoute('get', '/integrity-metrics');

    it('returns backlog and ideation metrics', async () => {
      const backlogRows = [{ id: 1, source: 'backlog-integrity' }];
      const ideationRows = [{ id: 2, source: 'vh-ideation' }];

      // Each call to from() returns a fresh chain; we track call order
      let callCount = 0;
      mockSupabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        const data = callCount === 1 ? backlogRows : ideationRows;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data, error: null }),
        };
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData).toEqual({ backlog: backlogRows, ideation: ideationRows });
    });

    it('returns 500 when supabase query fails', async () => {
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
      });

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({ error: 'Failed to load integrity metrics' });
    });
  });
});
