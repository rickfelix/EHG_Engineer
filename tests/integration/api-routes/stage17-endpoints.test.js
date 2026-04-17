/**
 * Integration tests for Stage 17 Design Refinement API Endpoints
 * Tests: POST /stage17/archetypes, /select, /refine, /approve, /qa, /upload
 *
 * SD-FIX-S17-WIRING-GAPS-ORCH-001-A
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — S17 modules
// ---------------------------------------------------------------------------

const mockGenerateArchetypes = vi.fn();
const mockArchetypeGenerationError = class extends Error {
  constructor(msg) { super(msg); this.name = 'ArchetypeGenerationError'; }
};

vi.mock('../../../lib/eva/stage-17/archetype-generator.js', () => ({
  generateArchetypes: (...args) => mockGenerateArchetypes(...args),
  ArchetypeGenerationError: mockArchetypeGenerationError,
}));

const mockSubmitPass1Selection = vi.fn();
const mockSubmitPass2Selection = vi.fn();
const mockIsDesignPassComplete = vi.fn();
const mockSelectionError = class extends Error {
  constructor(msg) { super(msg); this.name = 'SelectionError'; }
};

vi.mock('../../../lib/eva/stage-17/selection-flow.js', () => ({
  submitPass1Selection: (...args) => mockSubmitPass1Selection(...args),
  submitPass2Selection: (...args) => mockSubmitPass2Selection(...args),
  isDesignPassComplete: (...args) => mockIsDesignPassComplete(...args),
  SelectionError: mockSelectionError,
}));

const mockRunQARubric = vi.fn();
const mockUploadToGitHub = vi.fn();
const mockUploadError = class extends Error {
  constructor(msg, gaps) { super(msg); this.name = 'UploadError'; this.gaps = gaps; }
};

vi.mock('../../../lib/eva/stage-17/qa-rubric.js', () => ({
  runQARubric: (...args) => mockRunQARubric(...args),
  uploadToGitHub: (...args) => mockUploadToGitHub(...args),
  UploadError: mockUploadError,
}));

// Mock bridge modules (already in stitch.js imports)
vi.mock('../../../lib/eva/bridge/stitch-exporter.js', () => ({
  exportStitchArtifacts: vi.fn(),
}));
vi.mock('../../../lib/eva/bridge/stitch-metrics.js', () => ({
  getVentureMetrics: vi.fn(),
  getFleetHealth: vi.fn(),
  detectDegradation: vi.fn(),
}));
vi.mock('../../../lib/eva/bridge/stitch-provisioner.js', () => ({
  checkCurationStatus: vi.fn(),
}));

// Mock validation
vi.mock('../../../server/middleware/validate.js', () => ({
  isValidUuid: (value) => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return typeof value === 'string' && UUID_REGEX.test(value);
  },
}));

// Mock error handler
vi.mock('../../../lib/middleware/eva-error-handler.js', () => ({
  asyncHandler: (fn) => fn,
}));

// ---------------------------------------------------------------------------
// Import router after mocks
// ---------------------------------------------------------------------------
const { default: router } = await import('../../../server/routes/stitch.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const VALID_ARTIFACT_ID = '11111111-2222-3333-4444-555555555555';
const mockSupabase = { from: vi.fn() };

function createMockReq(body = {}, params = {}, query = {}) {
  return {
    body,
    params,
    query,
    app: { locals: { supabase: mockSupabase } },
  };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stage 17 API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // === POST /:ventureId/stage17/archetypes ===
  describe('POST /:ventureId/stage17/archetypes', () => {
    const handlers = findRoute('post', '/:ventureId/stage17/archetypes');

    it('generates archetypes and returns result', async () => {
      const result = { screenCount: 3, artifactIds: ['a1', 'a2', 'a3'] };
      mockGenerateArchetypes.mockResolvedValue(result);

      const req = createMockReq({}, { ventureId: VALID_UUID });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual(result);
      expect(mockGenerateArchetypes).toHaveBeenCalledWith(VALID_UUID, mockSupabase);
    });

    it('returns 400 for invalid ventureId', async () => {
      const req = createMockReq({}, { ventureId: 'not-a-uuid' });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_VENTURE_ID');
    });

    it('returns 400 when ArchetypeGenerationError thrown', async () => {
      // Use unique UUID to avoid rate limiter interference from prior tests
      const uniqueUuid = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
      mockGenerateArchetypes.mockRejectedValue(new mockArchetypeGenerationError('No source artifacts'));

      const req = createMockReq({}, { ventureId: uniqueUuid });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('ARCHETYPE_GENERATION_FAILED');
    });

    it('returns 429 on rate limit (second call within 10s)', async () => {
      // Use unique UUID so prior tests don't interfere with rate limiter
      const rateLimitUuid = 'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa';
      mockGenerateArchetypes.mockResolvedValue({ screenCount: 1, artifactIds: ['a1'] });

      const req1 = createMockReq({}, { ventureId: rateLimitUuid });
      const res1 = createMockRes();
      await runHandlerChain(handlers, req1, res1);
      expect(res1.statusCode).toBe(200);

      const req2 = createMockReq({}, { ventureId: rateLimitUuid });
      const res2 = createMockRes();
      await runHandlerChain(handlers, req2, res2);
      expect(res2.statusCode).toBe(429);
      expect(res2.jsonData.code).toBe('RATE_LIMITED');
      expect(res2.jsonData.retryAfter).toBeGreaterThan(0);
    });
  });

  // === POST /:ventureId/stage17/select ===
  describe('POST /:ventureId/stage17/select', () => {
    const handlers = findRoute('post', '/:ventureId/stage17/select');

    it('submits pass 1 selection and returns refined IDs', async () => {
      mockSubmitPass1Selection.mockResolvedValue(['r1', 'r2', 'r3', 'r4']);

      const req = createMockReq(
        { screenId: 'screen-home', selectedIds: ['a1', 'a2'] },
        { ventureId: VALID_UUID }
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.refinedArtifactIds).toHaveLength(4);
      expect(mockSubmitPass1Selection).toHaveBeenCalledWith(VALID_UUID, 'screen-home', ['a1', 'a2'], mockSupabase);
    });

    it('returns 400 when selectedIds count is not 2', async () => {
      const req = createMockReq(
        { screenId: 'screen-home', selectedIds: ['a1'] },
        { ventureId: VALID_UUID }
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_SELECTION_COUNT');
    });

    it('returns 400 when screenId is missing', async () => {
      const req = createMockReq(
        { selectedIds: ['a1', 'a2'] },
        { ventureId: VALID_UUID }
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('MISSING_SCREEN_ID');
    });

    it('returns 400 on SelectionError', async () => {
      mockSubmitPass1Selection.mockRejectedValue(new mockSelectionError('Invalid selection'));

      const req = createMockReq(
        { screenId: 'screen-home', selectedIds: ['a1', 'a2'] },
        { ventureId: VALID_UUID }
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('SELECTION_ERROR');
    });
  });

  // === POST /:ventureId/stage17/refine ===
  describe('POST /:ventureId/stage17/refine', () => {
    const handlers = findRoute('post', '/:ventureId/stage17/refine');

    it('submits pass 2 selection and returns approved artifact', async () => {
      mockSubmitPass2Selection.mockResolvedValue(VALID_ARTIFACT_ID);

      const req = createMockReq(
        { screenId: 'screen-home', platform: 'mobile', artifactId: VALID_ARTIFACT_ID },
        { ventureId: VALID_UUID }
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.approvedArtifactId).toBe(VALID_ARTIFACT_ID);
      expect(mockSubmitPass2Selection).toHaveBeenCalledWith(
        VALID_UUID, 'screen-home', 'mobile', VALID_ARTIFACT_ID, mockSupabase
      );
    });

    it('returns 400 for invalid platform', async () => {
      const req = createMockReq(
        { screenId: 'screen-home', platform: 'tablet', artifactId: VALID_ARTIFACT_ID },
        { ventureId: VALID_UUID }
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_PLATFORM');
    });

    it('returns 400 when artifactId is missing', async () => {
      const req = createMockReq(
        { screenId: 'screen-home', platform: 'desktop' },
        { ventureId: VALID_UUID }
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('MISSING_ARTIFACT_ID');
    });
  });

  // === POST /:ventureId/stage17/approve ===
  describe('POST /:ventureId/stage17/approve', () => {
    const handlers = findRoute('post', '/:ventureId/stage17/approve');

    it('returns design pass completeness status', async () => {
      mockIsDesignPassComplete.mockResolvedValue({ complete: false, threshold: 14, current: 8 });

      const req = createMockReq({}, { ventureId: VALID_UUID });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.complete).toBe(false);
      expect(res.jsonData.threshold).toBe(14);
      expect(mockIsDesignPassComplete).toHaveBeenCalledWith(VALID_UUID, mockSupabase);
    });

    it('returns 400 for invalid ventureId', async () => {
      const req = createMockReq({}, { ventureId: 'bad-id' });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_VENTURE_ID');
    });
  });

  // === POST /:ventureId/stage17/qa ===
  describe('POST /:ventureId/stage17/qa', () => {
    const handlers = findRoute('post', '/:ventureId/stage17/qa');

    it('runs QA rubric and returns 3-layer results', async () => {
      const qaResult = {
        layers: { base: { score: 100 }, product: { score: 85 }, venture: { score: 92 } },
        overallScore: 92,
        counts: { pass: 12, warn: 2, fail: 0 },
      };
      mockRunQARubric.mockResolvedValue(qaResult);

      const req = createMockReq({}, { ventureId: VALID_UUID });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.overallScore).toBe(92);
      expect(res.jsonData.layers).toBeDefined();
      expect(mockRunQARubric).toHaveBeenCalledWith(VALID_UUID, mockSupabase);
    });

    it('returns 400 for invalid ventureId', async () => {
      const req = createMockReq({}, { ventureId: 'invalid' });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  // === POST /:ventureId/stage17/upload ===
  describe('POST /:ventureId/stage17/upload', () => {
    const handlers = findRoute('post', '/:ventureId/stage17/upload');

    it('uploads to GitHub and returns commit info', async () => {
      mockUploadToGitHub.mockResolvedValue({ filesUploaded: 14, commitSha: 'abc123' });

      const req = createMockReq({}, { ventureId: VALID_UUID });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.filesUploaded).toBe(14);
      expect(res.jsonData.commitSha).toBe('abc123');
      expect(mockUploadToGitHub).toHaveBeenCalledWith(VALID_UUID, mockSupabase, {});
    });

    it('returns 400 when UploadError thrown (QA gaps)', async () => {
      const gaps = [{ severity: 'HIGH', description: 'Brand color mismatch' }];
      mockUploadToGitHub.mockRejectedValue(new mockUploadError('Upload blocked', gaps));

      const req = createMockReq({}, { ventureId: VALID_UUID });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('UPLOAD_BLOCKED');
      expect(res.jsonData.gaps).toEqual(gaps);
    });

    it('returns 500 on unexpected error', async () => {
      mockUploadToGitHub.mockRejectedValue(new Error('GitHub API timeout'));

      const req = createMockReq({}, { ventureId: VALID_UUID });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.code).toBe('UPLOAD_ERROR');
    });
  });

  // === Auth enforcement (all endpoints require requireAuth at mount level) ===
  describe('Auth enforcement', () => {
    it('all 6 S17 routes exist in the router', () => {
      const s17Paths = [
        '/:ventureId/stage17/archetypes',
        '/:ventureId/stage17/select',
        '/:ventureId/stage17/refine',
        '/:ventureId/stage17/approve',
        '/:ventureId/stage17/qa',
        '/:ventureId/stage17/upload',
      ];

      for (const path of s17Paths) {
        expect(() => findRoute('post', path)).not.toThrow();
      }
    });
  });
});
