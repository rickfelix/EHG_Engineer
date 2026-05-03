/**
 * Stage 18 fallback metadata persistence — unit tests
 *
 * SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001 / FR-2 / TS-3, TS-4, TS-5
 *
 * Validates that storeMarketingArtifacts and the regenerate handler write
 * `metadata.is_fallback` derived from `result.metadata.llmFallbackCount`
 * to every persisted venture_artifacts row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyze = vi.fn();
vi.mock('../../lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js', () => ({
  analyzeStage18MarketingCopy: (...args) => mockAnalyze(...args),
}));

vi.mock('../../server/middleware/validate.js', () => ({
  isValidUuid: (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}));

vi.mock('../../lib/middleware/eva-error-handler.js', () => ({
  asyncHandler: (fn) => fn,
}));

const { default: router } = await import('../../server/routes/stage18.js');

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

const COPY_SECTIONS = [
  'tagline', 'app_store_desc', 'landing_hero',
  'email_welcome', 'email_onboarding', 'email_reengagement',
  'social_posts', 'seo_meta', 'blog_draft',
];

function buildResult(llmFallbackCount) {
  const result = { metadata: { llmFallbackCount } };
  for (const s of COPY_SECTIONS) result[s] = { text: `${s} content`, persona_target: 'Tester' };
  return result;
}

function buildSupabase() {
  const insertSpy = vi.fn().mockResolvedValue({ error: null });
  const updateChain = {
    update: vi.fn(() => updateChain),
    eq: vi.fn(() => updateChain),
    in: vi.fn(() => updateChain),
    then: undefined,
  };
  // mark-not-current update returns { error: null } when awaited at the end of the chain
  // We make the chain thenable on the final .eq() call by returning a resolved promise.
  // Simpler: route mark-not-current through a function that returns { error: null }.
  const fromSpy = vi.fn((table) => {
    if (table === 'ventures') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { name: 'Test Venture' }, error: null }),
          })),
        })),
      };
    }
    if (table === 'venture_artifacts') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
        })),
        insert: insertSpy,
      };
    }
    return {};
  });
  return { from: fromSpy, _insertSpy: insertSpy };
}

function createMockReq(params = {}, supabase = buildSupabase()) {
  return { params, app: { locals: { supabase } } };
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

describe('Stage 18 fallback metadata persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /:ventureId/generate-copy', () => {
    const handlers = findRoute('post', '/:ventureId/generate-copy');

    it('TS-3: writes metadata.is_fallback=true on every row when llmFallbackCount=1', async () => {
      mockAnalyze.mockResolvedValueOnce(buildResult(1));
      const supabase = buildSupabase();
      await runHandlerChain(handlers, createMockReq({ ventureId: VALID_UUID }, supabase), createMockRes());

      expect(supabase._insertSpy).toHaveBeenCalledTimes(1);
      const [rows] = supabase._insertSpy.mock.calls[0];
      expect(rows).toHaveLength(9);
      for (const r of rows) {
        expect(r.metadata).toEqual({ is_fallback: true });
        expect(r.artifact_type.startsWith('marketing_')).toBe(true);
        expect(r.lifecycle_stage).toBe(18);
      }
    });

    it('TS-4: writes metadata.is_fallback=false on every row when llmFallbackCount=0', async () => {
      mockAnalyze.mockResolvedValueOnce(buildResult(0));
      const supabase = buildSupabase();
      await runHandlerChain(handlers, createMockReq({ ventureId: VALID_UUID }, supabase), createMockRes());

      expect(supabase._insertSpy).toHaveBeenCalledTimes(1);
      const [rows] = supabase._insertSpy.mock.calls[0];
      for (const r of rows) {
        expect(r.metadata).toEqual({ is_fallback: false });
      }
    });

    it('handles missing metadata.llmFallbackCount as is_fallback=false (graceful degradation)', async () => {
      mockAnalyze.mockResolvedValueOnce({ ...buildResult(0), metadata: undefined });
      const supabase = buildSupabase();
      await runHandlerChain(handlers, createMockReq({ ventureId: VALID_UUID }, supabase), createMockRes());

      const [rows] = supabase._insertSpy.mock.calls[0];
      for (const r of rows) {
        expect(r.metadata).toEqual({ is_fallback: false });
      }
    });
  });

  describe('POST /:ventureId/regenerate/:section', () => {
    const handlers = findRoute('post', '/:ventureId/regenerate/:section');

    it('TS-5: writes metadata.is_fallback=true on regenerated row when llmFallbackCount>0', async () => {
      mockAnalyze.mockResolvedValueOnce(buildResult(1));
      const supabase = buildSupabase();
      await runHandlerChain(handlers, createMockReq({ ventureId: VALID_UUID, section: 'tagline' }, supabase), createMockRes());

      expect(supabase._insertSpy).toHaveBeenCalledTimes(1);
      const [row] = supabase._insertSpy.mock.calls[0];
      expect(row.artifact_type).toBe('marketing_tagline');
      expect(row.metadata).toEqual({ is_fallback: true });
    });

    it('writes metadata.is_fallback=false on regenerated row when llmFallbackCount=0', async () => {
      mockAnalyze.mockResolvedValueOnce(buildResult(0));
      const supabase = buildSupabase();
      await runHandlerChain(handlers, createMockReq({ ventureId: VALID_UUID, section: 'blog_draft' }, supabase), createMockRes());

      const [row] = supabase._insertSpy.mock.calls[0];
      expect(row.artifact_type).toBe('marketing_blog_draft');
      expect(row.metadata).toEqual({ is_fallback: false });
    });
  });
});
