/**
 * Integration tests for V2 API Routes (Feature APIs)
 * Tests: naming-engine, financial-engine, content-forge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const VALID_VENTURE_ID = '11111111-1111-1111-1111-111111111111';

// Mock asyncHandler to just pass through
vi.mock('../../../lib/middleware/eva-error-handler.js', () => ({
  asyncHandler: (fn) => fn,
}));

// Mock feature API modules
const mockGenerateNames = vi.fn();
const mockGetSuggestions = vi.fn();
vi.mock('../../../src/api/naming-engine/index.js', () => ({
  generateNames: mockGenerateNames,
  getSuggestions: mockGetSuggestions,
}));

const mockCreateProjection = vi.fn();
const mockGetProjection = vi.fn();
const mockCreateScenario = vi.fn();
const mockExportToExcel = vi.fn();
const mockListModels = vi.fn();
vi.mock('../../../src/api/financial-engine/index.js', () => ({
  createProjection: mockCreateProjection,
  getProjection: mockGetProjection,
  createScenario: mockCreateScenario,
  exportToExcel: mockExportToExcel,
  listModels: mockListModels,
}));

const mockGenerateContent = vi.fn();
const mockListContent = vi.fn();
const mockCheckContentCompliance = vi.fn();
const mockGetBrandGenome = vi.fn();
vi.mock('../../../src/api/content-forge/index.js', () => ({
  generateContent: mockGenerateContent,
  listContent: mockListContent,
  checkContentCompliance: mockCheckContentCompliance,
  getBrandGenome: mockGetBrandGenome,
}));

// ---------------------------------------------------------------------------
// Import router after mocks
// ---------------------------------------------------------------------------
const { default: router } = await import('../../../server/routes/v2-apis.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReq(body = {}, params = {}, query = {}, headers = {}) {
  return { body, params, query, headers };
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
        // Return all handlers (middleware + final handler)
        return layer.route.stack.map(s => s.handle);
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/**
 * Run a chain of Express handlers (middleware + handler).
 * Calls each in sequence, passing next().
 */
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

describe('V2 API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Naming Engine ---
  describe('POST /naming-engine/generate', () => {
    const handlers = findRoute('post', '/naming-engine/generate');

    it('delegates to namingEngineAPI.generateNames', async () => {
      mockGenerateNames.mockImplementation((req, res) => {
        res.json({ names: ['Acme', 'Zenith'] });
      });

      const req = createMockReq({ brand_genome_id: 'bg-1', style: 'modern' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockGenerateNames).toHaveBeenCalled();
      expect(res.jsonData).toEqual({ names: ['Acme', 'Zenith'] });
    });
  });

  // --- Financial Engine ---
  describe('POST /financial-engine/project', () => {
    const handlers = findRoute('post', '/financial-engine/project');

    it('delegates to financialEngineAPI.createProjection', async () => {
      mockCreateProjection.mockImplementation((req, res) => {
        res.json({ model_id: 'fm-1', projection: {} });
      });

      const req = createMockReq({ venture_id: VALID_VENTURE_ID });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockCreateProjection).toHaveBeenCalled();
      expect(res.jsonData).toMatchObject({ model_id: 'fm-1' });
    });
  });

  describe('GET /financial-engine/:id', () => {
    const handlers = findRoute('get', '/financial-engine/:id');

    it('delegates to financialEngineAPI.getProjection', async () => {
      mockGetProjection.mockImplementation((req, res) => {
        res.json({ model_id: req.params.id });
      });

      const req = createMockReq({}, { id: 'fm-1' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockGetProjection).toHaveBeenCalled();
      expect(res.jsonData).toEqual({ model_id: 'fm-1' });
    });
  });

  // --- Content Forge ---
  describe('POST /content-forge/generate', () => {
    const handlers = findRoute('post', '/content-forge/generate');

    it('delegates to contentForgeAPI.generateContent', async () => {
      mockGenerateContent.mockImplementation((req, res) => {
        res.json({ content_id: 'cf-1', text: 'Generated content' });
      });

      const req = createMockReq({ type: 'blog', topic: 'AI' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockGenerateContent).toHaveBeenCalled();
      expect(res.jsonData).toMatchObject({ content_id: 'cf-1' });
    });
  });

  describe('GET /brand-genome/:id', () => {
    const handlers = findRoute('get', '/brand-genome/:id');

    it('delegates to contentForgeAPI.getBrandGenome', async () => {
      mockGetBrandGenome.mockImplementation((req, res) => {
        res.json({ id: req.params.id, name: 'Test Brand' });
      });

      const req = createMockReq({}, { id: 'bg-1' });
      const res = createMockRes();

      await runHandlerChain(handlers, req, res);

      expect(mockGetBrandGenome).toHaveBeenCalled();
      expect(res.jsonData).toEqual({ id: 'bg-1', name: 'Test Brand' });
    });
  });
});
