/**
 * Integration tests for Stage 19 Replit Workflow API Endpoints.
 *
 * SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-3 / FR-5
 *
 * Covers:
 *   TS-A: POST register-deployment happy path returns 200, upserts venture_resources,
 *         emits build_mvp_build artifact
 *   TS-B: URL validation rejects malformed inputs (400 VALIDATION_FAILED)
 *   TS-C: Idempotent — re-submitting same payload returns 200, no duplicate artifact
 *   TS-D: Invalid ventureId UUID rejected (400 INVALID_VENTURE_ID)
 *
 * Mock pattern adapted from tests/integration/api-routes/stage18-endpoints.test.js
 * (buildSupabaseMock + createMockReq/Res + findRoute + runHandlerChain).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock writeArtifact so we can assert on its call args without touching a real DB.
const mockWriteArtifact = vi.fn();
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: (...args) => mockWriteArtifact(...args),
}));

// Mock validateUuid so we control validation independently of the regex impl.
vi.mock('../../../server/middleware/validate.js', () => ({
  isValidUuid: (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}));

// Mock asyncHandler to a passthrough so we can run handlers directly.
vi.mock('../../../lib/middleware/eva-error-handler.js', () => ({
  asyncHandler: (fn) => fn,
}));

// Mock the GET-side dependencies so module-load doesn't try to import their real
// graphs (formatter + the readiness resolver, which pulls in the seeder).
vi.mock('../../../lib/eva/bridge/replit-prompt-formatter.js', () => ({
  formatReplitOptimized: vi.fn(),
}));
vi.mock('../../../lib/eva/bridge/repo-readiness.js', () => ({
  resolveRepoReadiness: vi.fn(),
}));

const { default: router } = await import('../../../server/routes/stage19.js');
const { formatReplitOptimized } = await import('../../../lib/eva/bridge/replit-prompt-formatter.js');
const { resolveRepoReadiness } = await import('../../../lib/eva/bridge/repo-readiness.js');

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const VALID_REPO = 'https://github.com/owner/repo';
const VALID_DEPLOYMENT = 'https://my-app.example.replit.app';

function buildSupabaseMock({ upsertResult = null, upsertError = null } = {}) {
  const upsertSpy = vi.fn().mockReturnValue({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: upsertResult ?? { id: 'res-1' },
        error: upsertError,
      }),
    })),
  });
  return {
    from: vi.fn((table) => {
      if (table === 'venture_resources') {
        return { upsert: upsertSpy };
      }
      return { upsert: vi.fn() };
    }),
    _upsertSpy: upsertSpy,
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

describe('Stage 19 register-deployment endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteArtifact.mockResolvedValue('artifact-1');
  });

  describe('POST /:ventureId/register-deployment', () => {
    const handlers = findRoute('post', '/:ventureId/register-deployment');

    it('TS-A: happy path → 200, upserts venture_resources, emits build_mvp_build artifact (AC-FR3-3)', async () => {
      const supabase = buildSupabaseMock();
      const req = createMockReq(
        { ventureId: VALID_UUID },
        { repo_url: VALID_REPO, deployment_url: VALID_DEPLOYMENT },
        supabase,
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual(expect.objectContaining({
        ventureId: VALID_UUID,
        repo_url: VALID_REPO,
        deployment_url: VALID_DEPLOYMENT,
        resource_id: 'res-1',
        artifact_id: 'artifact-1',
        artifact_type: 'build_mvp_build',
      }));
      // Confirm venture_resources upsert payload includes both URL columns
      // and the resource_type discriminator that gives us idempotency.
      expect(supabase._upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          venture_id: VALID_UUID,
          resource_type: 'replit_deployment',
          resource_identifier: VALID_DEPLOYMENT,
          repo_url: VALID_REPO,
          deployment_url: VALID_DEPLOYMENT,
        }),
        expect.objectContaining({ onConflict: expect.any(String) }),
      );
      // Confirm artifact emit: lifecycle_stage=19, type=build_mvp_build, is_current dedup default
      expect(mockWriteArtifact).toHaveBeenCalledTimes(1);
      const [, opts] = mockWriteArtifact.mock.calls[0];
      expect(opts.ventureId).toBe(VALID_UUID);
      expect(opts.lifecycleStage).toBe(19);
      expect(opts.artifactType).toBe('build_mvp_build');
      expect(opts.artifactData).toEqual(expect.objectContaining({
        repo_url: VALID_REPO,
        deployment_url: VALID_DEPLOYMENT,
        registered_at: expect.any(String),
      }));
    });

    it('TS-B-1: rejects malformed repo_url with 400 VALIDATION_FAILED (AC-FR3-2)', async () => {
      const req = createMockReq(
        { ventureId: VALID_UUID },
        { repo_url: 'not-a-url', deployment_url: VALID_DEPLOYMENT },
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('VALIDATION_FAILED');
      expect(res.jsonData.invalid).toContain('repo_url');
      expect(mockWriteArtifact).not.toHaveBeenCalled();
    });

    it('TS-B-2: rejects http:// (insecure) deployment_url with 400 VALIDATION_FAILED', async () => {
      const req = createMockReq(
        { ventureId: VALID_UUID },
        { repo_url: VALID_REPO, deployment_url: 'http://insecure.example' },
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('VALIDATION_FAILED');
      expect(res.jsonData.invalid).toContain('deployment_url');
    });

    it('TS-B-3: rejects non-github.com repo URLs with 400 VALIDATION_FAILED', async () => {
      const req = createMockReq(
        { ventureId: VALID_UUID },
        { repo_url: 'https://gitlab.com/owner/repo', deployment_url: VALID_DEPLOYMENT },
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.invalid).toContain('repo_url');
    });

    it('TS-C: idempotent — re-submitting same payload still returns 200; writeArtifact dedup handles it (AC-FR3-5)', async () => {
      // Both calls use the same supabase mock; upsert returns the same row id;
      // writeArtifact returns the same artifact id (its is_current dedup is unit-tested
      // separately in artifact-persistence-service tests). Endpoint contract is: both
      // calls 200 with same payload.
      const supabase = buildSupabaseMock({ upsertResult: { id: 'res-1' } });
      const body = { repo_url: VALID_REPO, deployment_url: VALID_DEPLOYMENT };
      const req1 = createMockReq({ ventureId: VALID_UUID }, body, supabase);
      const res1 = createMockRes();
      await runHandlerChain(handlers, req1, res1);
      const req2 = createMockReq({ ventureId: VALID_UUID }, body, supabase);
      const res2 = createMockRes();
      await runHandlerChain(handlers, req2, res2);
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res1.jsonData.artifact_id).toBe(res2.jsonData.artifact_id);
      expect(res1.jsonData.resource_id).toBe(res2.jsonData.resource_id);
    });

    it('TS-D: rejects invalid UUID with 400 INVALID_VENTURE_ID', async () => {
      const req = createMockReq(
        { ventureId: 'not-a-uuid' },
        { repo_url: VALID_REPO, deployment_url: VALID_DEPLOYMENT },
      );
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('INVALID_VENTURE_ID');
      expect(mockWriteArtifact).not.toHaveBeenCalled();
    });

    it('rejects empty body fields with 400', async () => {
      const req = createMockReq({ ventureId: VALID_UUID }, {});
      const res = createMockRes();
      await runHandlerChain(handlers, req, res);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.code).toBe('VALIDATION_FAILED');
      expect(res.jsonData.invalid.sort()).toEqual(['deployment_url', 'repo_url']);
    });
  });
});

// SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-C — the GET route now ADDS a Claude-Code-ready
// readiness summary alongside the (still load-bearing) prompts payload. These assert the
// backward-compatible contract Child D consumes and Child E later trims.
describe('Stage 19 GET /:ventureId/replit-prompts readiness contract', () => {
  const handlers = findRoute('get', '/:ventureId/replit-prompts');

  // Build a GET request — the handler reads req.params + req.query (no body/app needed
  // since formatReplitOptimized + resolveRepoReadiness are both mocked here).
  const getReq = (ventureId, query = {}) => ({ params: { ventureId }, query });

  const PROMPTS_RESULT = {
    manifest: { ventureName: 'Canvas AI', mode: 'build-into', exportedAt: '2026-05-24T00:00:00.000Z' },
    planModePrompt: { content: 'PLAN MODE PROMPT' },
    featurePrompts: [{ title: 'Dashboard', content: 'build dashboard', storyPoints: 3, priority: 'high' }],
    warnings: ['heads up'],
  };
  const READINESS = {
    repoReady: true,
    seededArtifacts: ['CLAUDE.md', 'docs/build-tasks.md', '.replit'],
    buildPlanSummary: { orchestrator: 'Canvas AI build', childCount: 3, screenCount: 1, featureTaskCount: 1, source: 'screens' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    formatReplitOptimized.mockResolvedValue(PROMPTS_RESULT);
    resolveRepoReadiness.mockResolvedValue(READINESS);
  });

  it('TS-1: returns the existing prompts payload UNCHANGED plus a top-level readiness summary', async () => {
    const res = createMockRes();
    await runHandlerChain(handlers, getReq(VALID_UUID), res);

    expect(res.statusCode).toBe(200);
    // Existing prompts contract — every key the live ehg S19 UI relies on today.
    expect(res.jsonData).toEqual(expect.objectContaining({
      ventureName: 'Canvas AI',
      mode: 'build-into',
      planPrompt: 'PLAN MODE PROMPT',
      featurePrompts: [{ title: 'Dashboard', content: 'build dashboard', points: 3, priority: 'high' }],
      warnings: ['heads up'],
      generatedAt: '2026-05-24T00:00:00.000Z',
    }));
    // Additive readiness contract (Child D consumes this).
    expect(res.jsonData.readiness).toEqual(READINESS);
    expect(resolveRepoReadiness).toHaveBeenCalledWith(VALID_UUID);
  });

  it('still returns the prompts payload when the repo is not ready (additive — never blocks prompts)', async () => {
    resolveRepoReadiness.mockResolvedValue({
      repoReady: false,
      seededArtifacts: ['CLAUDE.md', 'docs/build-tasks.md', '.replit'],
      buildPlanSummary: { orchestrator: 'Venture build', childCount: 3, screenCount: 0, featureTaskCount: 1, source: 'skeleton' },
    });
    const res = createMockRes();
    await runHandlerChain(handlers, getReq(VALID_UUID), res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonData.planPrompt).toBe('PLAN MODE PROMPT'); // prompts still present
    expect(res.jsonData.featurePrompts).toHaveLength(1);
    expect(res.jsonData.readiness.repoReady).toBe(false);
  });

  it('rejects an invalid ventureId with 400 before resolving prompts or readiness', async () => {
    const res = createMockRes();
    await runHandlerChain(handlers, getReq('not-a-uuid'), res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.code).toBe('INVALID_VENTURE_ID');
    expect(formatReplitOptimized).not.toHaveBeenCalled();
    expect(resolveRepoReadiness).not.toHaveBeenCalled();
  });
});
