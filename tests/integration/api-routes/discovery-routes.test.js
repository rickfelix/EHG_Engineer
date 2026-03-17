/**
 * Integration tests for Discovery API Routes
 * Tests: POST /scan, GET /opportunities, GET /scans, POST /decision,
 *        GET /blueprints, GET /blueprints/:id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSupabase = { from: vi.fn() };

vi.mock('../../../server/config.js', () => ({
  dbLoader: { supabase: mockSupabase },
}));

// Mock the validation utilities
vi.mock('../../../server/middleware/validate.js', () => ({
  isValidUuid: (value) => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return typeof value === 'string' && UUID_REGEX.test(value);
  },
  validateUuidParam: (paramName = 'id') => (req, res, next) => {
    const value = req.params[paramName];
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!value || !UUID_REGEX.test(value)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Invalid ${paramName} format. Expected UUID.`,
        code: 'INVALID_UUID',
      });
    }
    next();
  },
  isValidStringLength: (value, maxLength = 1000) => {
    return typeof value === 'string' && value.length <= maxLength;
  },
  isValidEnum: (value, allowedValues) => allowedValues.includes(value),
}));

// Mock the discovery service via lazy-load
const mockRunScan = vi.fn();
const mockGetOpportunities = vi.fn();
const mockGetRecentScans = vi.fn();
const mockChairmanDecision = vi.fn();

vi.mock('../../../lib/discovery/opportunity-discovery-service.js', () => ({
  default: class MockOpportunityDiscoveryService {
    runScan(...args) { return mockRunScan(...args); }
    getOpportunities(...args) { return mockGetOpportunities(...args); }
    getRecentScans(...args) { return mockGetRecentScans(...args); }
    chairmanDecision(...args) { return mockChairmanDecision(...args); }
  },
}));

// ---------------------------------------------------------------------------
// Import router after mocks
// ---------------------------------------------------------------------------
const { default: router } = await import('../../../server/routes/discovery.js');

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

function findRoute(method, path) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath === path) {
        return layer.route.stack.map(s => s.handle);
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

async function runHandlerChain(handlers, req, res) {
  let idx = 0;
  const next = async (err) => {
    if (err) throw err;
    if (idx < handlers.length) {
      const fn = handlers[idx++];
      await fn(req, res, next);
    }
  };
  await next();
}

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Discovery Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // === POST /scan ===
  describe('POST /scan', () => {
    const handlers = findRoute('post', '/scan');

    it('triggers a discovery scan and returns result', async () => {
      const scanResult = { scan_id: 's-1', status: 'completed', opportunities_found: 3 };
      mockRunScan.mockResolvedValue(scanResult);

      const req = createMockReq({ scan_type: 'market', target_market: 'SaaS' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockRunScan).toHaveBeenCalledWith({
        scanType: 'market',
        targetUrl: undefined,
        targetMarket: 'SaaS',
        initiatedBy: 'chairman',
      });
      expect(res.jsonData).toEqual(scanResult);
    });

    it('returns 400 when scan_type is missing', async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('scan_type is required');
    });

    it('returns 400 when scan_type exceeds 50 characters', async () => {
      const req = createMockReq({ scan_type: 'a'.repeat(51) });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('scan_type is required');
    });

    it('returns 400 for competitor scan without target_url', async () => {
      const req = createMockReq({ scan_type: 'competitor' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('target_url is required for competitor scans');
    });

    it('returns 400 for invalid URL format', async () => {
      const req = createMockReq({ scan_type: 'competitor', target_url: 'not-a-url' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('target_url must be a valid URL');
    });

    it('accepts competitor scan with valid URL', async () => {
      mockRunScan.mockResolvedValue({ scan_id: 's-2' });

      const req = createMockReq({
        scan_type: 'competitor',
        target_url: 'https://example.com',
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.jsonData).toEqual({ scan_id: 's-2' });
    });

    it('returns 400 when target_market exceeds 500 characters', async () => {
      const req = createMockReq({
        scan_type: 'market',
        target_market: 'x'.repeat(501),
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('target_market must be under 500 characters');
    });
  });

  // === GET /opportunities ===
  describe('GET /opportunities', () => {
    const handlers = findRoute('get', '/opportunities');

    it('returns opportunities with count', async () => {
      const opps = [
        { id: 'opp-1', title: 'Opportunity 1', score: 85 },
        { id: 'opp-2', title: 'Opportunity 2', score: 72 },
      ];
      mockGetOpportunities.mockResolvedValue(opps);

      const req = createMockReq({}, {}, {});
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.jsonData.opportunities).toEqual(opps);
      expect(res.jsonData.count).toBe(2);
    });

    it('passes filter params to discovery service', async () => {
      mockGetOpportunities.mockResolvedValue([]);

      const req = createMockReq({}, {}, { box: 'hot', status: 'new', minScore: '70', scanId: 's-1' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockGetOpportunities).toHaveBeenCalledWith({
        box: 'hot',
        status: 'new',
        minScore: 70,
        scanId: 's-1',
      });
    });
  });

  // === GET /scans ===
  describe('GET /scans', () => {
    const handlers = findRoute('get', '/scans');

    it('returns recent scans with count', async () => {
      const scans = [{ scan_id: 's-1' }];
      mockGetRecentScans.mockResolvedValue(scans);

      const req = createMockReq({}, {}, {});
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.jsonData.scans).toEqual(scans);
      expect(res.jsonData.count).toBe(1);
      expect(mockGetRecentScans).toHaveBeenCalledWith(10); // default limit
    });

    it('respects limit query param', async () => {
      mockGetRecentScans.mockResolvedValue([]);

      const req = createMockReq({}, {}, { limit: '5' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockGetRecentScans).toHaveBeenCalledWith(5);
    });
  });

  // === POST /decision ===
  describe('POST /decision', () => {
    const handlers = findRoute('post', '/decision');

    it('processes approved decision', async () => {
      const result = { id: VALID_UUID, status: 'approved' };
      mockChairmanDecision.mockResolvedValue(result);

      const req = createMockReq({
        blueprint_id: VALID_UUID,
        decision: 'approved',
        feedback: 'Looks good',
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.blueprint).toEqual(result);
      expect(mockChairmanDecision).toHaveBeenCalledWith(VALID_UUID, 'approved', 'Looks good');
    });

    it('returns 400 when blueprint_id is missing', async () => {
      const req = createMockReq({ decision: 'approved' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('blueprint_id is required');
    });

    it('returns 400 when blueprint_id is not a valid UUID', async () => {
      const req = createMockReq({ blueprint_id: 'not-uuid', decision: 'approved' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('blueprint_id is required and must be a valid UUID');
    });

    it('returns 400 when decision is missing', async () => {
      const req = createMockReq({ blueprint_id: VALID_UUID });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('decision is required');
    });

    it('returns 400 when decision is not approved or rejected', async () => {
      const req = createMockReq({
        blueprint_id: VALID_UUID,
        decision: 'maybe',
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('decision must be "approved" or "rejected"');
    });

    it('returns 400 when feedback exceeds 5000 characters', async () => {
      const req = createMockReq({
        blueprint_id: VALID_UUID,
        decision: 'approved',
        feedback: 'x'.repeat(5001),
      });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toContain('feedback must be under 5000 characters');
    });
  });

  // === GET /blueprints ===
  describe('GET /blueprints', () => {
    const handlers = findRoute('get', '/blueprints');

    it('returns blueprints with count', async () => {
      const blueprints = [
        { id: VALID_UUID, title: 'Blueprint 1', confidence_score: 90 },
      ];

      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: blueprints, error: null }),
      });

      const req = createMockReq({}, {}, {});
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.jsonData.blueprints).toEqual(blueprints);
      expect(res.jsonData.count).toBe(1);
    });

    it('applies source filter when not "all"', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabase.from = vi.fn().mockReturnValue(chain);

      const req = createMockReq({}, {}, { source: 'ai_scan', box: 'hot', status: 'pending' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // eq is called for: is_active, source_type, opportunity_box, chairman_status
      expect(chain.eq).toHaveBeenCalledWith('is_active', true);
      expect(chain.eq).toHaveBeenCalledWith('source_type', 'ai_scan');
      expect(chain.eq).toHaveBeenCalledWith('opportunity_box', 'hot');
      expect(chain.eq).toHaveBeenCalledWith('chairman_status', 'pending');
    });

    it('skips source filter when source is "all"', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabase.from = vi.fn().mockReturnValue(chain);

      const req = createMockReq({}, {}, { source: 'all' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      // eq should be called for is_active only, NOT source_type
      const eqCalls = chain.eq.mock.calls.map(c => c[0]);
      expect(eqCalls).toContain('is_active');
      expect(eqCalls).not.toContain('source_type');
    });

    it('returns 500 on database error', async () => {
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
      });

      const req = createMockReq({}, {}, {});
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(500);
    });
  });

  // === GET /blueprints/:id ===
  describe('GET /blueprints/:id', () => {
    const handlers = findRoute('get', '/blueprints/:id');

    it('returns a single blueprint', async () => {
      const blueprint = { id: VALID_UUID, title: 'Test Blueprint', is_active: true };

      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: blueprint, error: null }),
      });

      const req = createMockReq({}, { id: VALID_UUID });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.jsonData).toEqual(blueprint);
    });

    it('returns 400 for invalid UUID param', async () => {
      const req = createMockReq({}, { id: 'bad-id' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_UUID');
    });

    it('returns 404 when blueprint not found', async () => {
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const req = createMockReq({}, { id: VALID_UUID });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({ error: 'Blueprint not found' });
    });
  });
});
