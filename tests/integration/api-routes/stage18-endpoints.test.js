/**
 * Integration tests for Stage 18 Marketing Copy Studio API Endpoints
 * Tests: POST /:ventureId/generate-copy, POST /:ventureId/regenerate/:section
 *
 * SD-MAN-FIX-WIRE-S18-S22-001 (CAPA 2: re-land unmerged interactivity)
 *
 * Coverage:
 *   TS-1: Happy path full generation (9 sections produced + persisted)
 *   TS-2: Idempotency on repeat generation
 *   TS-3: Per-section regenerate isolates side effects
 *   TS-4: Invalid section name rejected (400 INVALID_SECTION)
 *   TS-5: Invalid ventureId UUID rejected (400 INVALID_VENTURE_ID)
 *   TS-7: replit-repo-seeder writes marketing-copy.md (covered by direct seeder unit)
 *
 * TS-6 (auth required) is enforced at the app.use level via requireAuth middleware
 * registered in server/index.js, not at the router level — covered indirectly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyze = vi.fn();
vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js', () => ({
  analyzeStage18MarketingCopy: (...args) => mockAnalyze(...args),
}));

vi.mock('../../../server/middleware/validate.js', () => ({
  isValidUuid: (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}));

vi.mock('../../../lib/middleware/eva-error-handler.js', () => ({
  asyncHandler: (fn) => fn,
}));

const { default: router } = await import('../../../server/routes/stage18.js');

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

const FULL_RESULT = {
  tagline: { text: 'A tagline' },
  app_store_desc: { text: 'A description' },
  landing_hero: { headline: 'Hero', subheadline: 'Sub', cta_text: 'CTA' },
  email_welcome: { subject: 'Welcome', body: 'Hi' },
  email_onboarding: { subject: 'Onboarding', body: 'Step 1' },
  email_reengagement: { subject: 'Come back', body: 'Miss you' },
  social_posts: { twitter: 'tweet', linkedin: 'post' },
  seo_meta: { title: 'Title', description: 'Meta', keywords: ['k1'] },
  blog_draft: { title: 'Blog', intro: 'Intro' },
};

function buildSupabaseMock(upsertResult = { error: null }) {
  const upsertSpy = vi.fn().mockResolvedValue(upsertResult);
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
        upsert: upsertSpy,
      };
    }
    return { select: vi.fn(), upsert: vi.fn() };
  });
  return { from: fromSpy, _upsertSpy: upsertSpy };
}

function createMockReq(params = {}, supabase = buildSupabaseMock()) {
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

describe('Stage 18 API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyze.mockResolvedValue(FULL_RESULT);
  });

  describe('POST /:ventureId/generate-copy', () => {
    const handlers = findRoute('post', '/:ventureId/generate-copy');

    it('TS-1: returns 200 with all 9 sections on happy path', async () => {
      const req = createMockReq({ ventureId: VALID_UUID });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.status).toBe('success');
      expect(Object.keys(res.jsonData.data)).toHaveLength(9);
      expect(res.jsonData.data.tagline).toEqual({ text: 'A tagline' });
    });

    it('TS-1: persists 9 marketing_* artifacts via upsert', async () => {
      const supabase = buildSupabaseMock();
      const req = createMockReq({ ventureId: VALID_UUID }, supabase);
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(supabase._upsertSpy).toHaveBeenCalledTimes(1);
      const [rows, opts] = supabase._upsertSpy.mock.calls[0];
      expect(rows).toHaveLength(9);
      expect(rows.every((r) => r.artifact_type.startsWith('marketing_'))).toBe(true);
      expect(rows.every((r) => r.stage_number === 18)).toBe(true);
      expect(rows.every((r) => r.venture_id === VALID_UUID)).toBe(true);
      expect(opts).toEqual({ onConflict: 'venture_id,artifact_type' });
    });

    it('TS-2: idempotent — second call upserts with same onConflict key', async () => {
      const supabase = buildSupabaseMock();
      const req1 = createMockReq({ ventureId: VALID_UUID }, supabase);
      await runHandlerChain(handlers, req1, createMockRes());
      const req2 = createMockReq({ ventureId: VALID_UUID }, supabase);
      await runHandlerChain(handlers, req2, createMockRes());

      expect(supabase._upsertSpy).toHaveBeenCalledTimes(2);
      for (const call of supabase._upsertSpy.mock.calls) {
        expect(call[1]).toEqual({ onConflict: 'venture_id,artifact_type' });
      }
    });

    it('TS-5: returns 400 INVALID_VENTURE_ID for non-UUID', async () => {
      const req = createMockReq({ ventureId: 'not-a-uuid' });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_VENTURE_ID');
      expect(mockAnalyze).not.toHaveBeenCalled();
    });
  });

  describe('POST /:ventureId/regenerate/:section', () => {
    const handlers = findRoute('post', '/:ventureId/regenerate/:section');

    it('TS-3: regenerates a single section and upserts only that row', async () => {
      const supabase = buildSupabaseMock();
      const req = createMockReq({ ventureId: VALID_UUID, section: 'tagline' }, supabase);
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toEqual({ tagline: { text: 'A tagline' } });
      expect(supabase._upsertSpy).toHaveBeenCalledTimes(1);
      const [row] = supabase._upsertSpy.mock.calls[0];
      expect(row.artifact_type).toBe('marketing_tagline');
      expect(row.stage_number).toBe(18);
    });

    it('TS-4: returns 400 INVALID_SECTION for unknown section', async () => {
      const req = createMockReq({ ventureId: VALID_UUID, section: 'not_a_real_section' });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_SECTION');
      expect(mockAnalyze).not.toHaveBeenCalled();
    });

    it('TS-5: returns 400 INVALID_VENTURE_ID for non-UUID ventureId', async () => {
      const req = createMockReq({ ventureId: 'not-a-uuid', section: 'tagline' });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_VENTURE_ID');
    });

    it('returns 500 GENERATION_FAILED when analyzer returns no data for section', async () => {
      mockAnalyze.mockResolvedValueOnce({});
      const req = createMockReq({ ventureId: VALID_UUID, section: 'tagline' });
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.code).toBe('GENERATION_FAILED');
    });

    it('accepts every section in VALID_SECTIONS', async () => {
      const sections = [
        'tagline', 'app_store_desc', 'landing_hero',
        'email_welcome', 'email_onboarding', 'email_reengagement',
        'social_posts', 'seo_meta', 'blog_draft',
      ];
      for (const section of sections) {
        const req = createMockReq({ ventureId: VALID_UUID, section });
        const res = createMockRes();
        await runHandlerChain(handlers, req, res);
        expect(res.statusCode).toBe(200);
        expect(res.jsonData.data[section]).toBeDefined();
      }
    });
  });
});
