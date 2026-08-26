// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — creative-brief seam tests.
// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A adds: mandatory venture existence (FR-2) and
// private storage-path persistence (FR-3), both injectable via deps to keep these unit tests
// DB- and network-free.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestCreativeAsset, CreativeAssetsTableNotLiveError, QualityGateRejectedError, VentureNotFoundError } from './creative-brief.js';

const ORIGINAL_ENV = { ...process.env };

function makeSupabaseMock({ insertResult }) {
  const single = vi.fn().mockResolvedValue(insertResult);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { supabase: { from }, from, insert, select, single };
}

// Default deps for tests that aren't specifically exercising the venture-existence or
// storage-persistence behavior — keeps the ventureExists/persist calls DB- and network-free.
const passthroughDeps = {
  ventureExistsFn: vi.fn().mockResolvedValue(true),
  persistAssetPrivatelyFn: vi.fn().mockResolvedValue('v1/image-stub-path'),
};

describe('requestCreativeAsset', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); });

  it('throws VentureNotFoundError and never generates when ventureId is missing', async () => {
    const { supabase, from } = makeSupabaseMock({ insertResult: { data: null, error: null } });
    await expect(
      requestCreativeAsset(supabase, { capability: 'image', prompt: 'x' }, passthroughDeps)
    ).rejects.toThrow(VentureNotFoundError);
    expect(from).not.toHaveBeenCalled();
  });

  it('throws VentureNotFoundError when ventureExistsFn resolves false (well-formed but nonexistent venture)', async () => {
    const generateAssetFn = vi.fn();
    const { supabase } = makeSupabaseMock({ insertResult: { data: null, error: null } });
    await expect(
      requestCreativeAsset(
        supabase,
        { ventureId: 'nonexistent-v', capability: 'image', prompt: 'x' },
        { ...passthroughDeps, generateAssetFn, ventureExistsFn: vi.fn().mockResolvedValue(false) }
      )
    ).rejects.toThrow(VentureNotFoundError);
    expect(generateAssetFn).not.toHaveBeenCalled(); // rejected before any provider request
  });

  it('rejects with QualityGateRejectedError and never writes when the gate fails', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;

    const { supabase, from } = makeSupabaseMock({ insertResult: { data: null, error: null } });

    await expect(
      requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'a hero image' }, passthroughDeps)
    ).rejects.toThrow(QualityGateRejectedError);

    expect(from).not.toHaveBeenCalled(); // never persists a gate-rejected asset
  });

  it('persists via the injected deps when the gate genuinely passes, including the private storage_path (FR-3)', async () => {
    const generateAssetFn = vi.fn().mockResolvedValue({
      asset: { kind: 'generated' },
      provenance: { generator: 'gemini', testMode: false },
      cost: 0.02,
    });
    const runQualityGateFn = vi.fn().mockReturnValue({ pass: true, stages: {} });
    const persistAssetPrivatelyFn = vi.fn().mockResolvedValue('v1/image-abc123');
    const { supabase, from, insert, single } = makeSupabaseMock({
      insertResult: { data: { id: 'asset-1', capability: 'image', generator: 'gemini' }, error: null },
    });

    const result = await requestCreativeAsset(
      supabase,
      { ventureId: 'v1', capability: 'image', prompt: 'a hero image', brandSourceRefs: ['s17-1'] },
      { ...passthroughDeps, generateAssetFn, runQualityGateFn, persistAssetPrivatelyFn }
    );

    expect(result).toEqual({ id: 'asset-1', capability: 'image', generator: 'gemini' });
    expect(generateAssetFn).toHaveBeenCalledWith('v1', 'image', { prompt: 'a hero image' }, {}, expect.anything());
    expect(persistAssetPrivatelyFn).toHaveBeenCalledWith(supabase, 'v1', 'image', expect.objectContaining({ asset: { kind: 'generated' } }), expect.anything());
    expect(from).toHaveBeenCalledWith('creative_assets');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      venture_id: 'v1', capability: 'image', generator: 'gemini', cost: 0.02, storage_path: 'v1/image-abc123',
    }));
    expect(single).toHaveBeenCalled();
  });

  it('throws CreativeAssetsTableNotLiveError (distinct, honest) on a 42P01 undefined_table error', async () => {
    const generateAssetFn = vi.fn().mockResolvedValue({ asset: {}, provenance: { generator: 'gemini' }, cost: 0 });
    const runQualityGateFn = vi.fn().mockReturnValue({ pass: true, stages: {} });
    const { supabase } = makeSupabaseMock({
      insertResult: { data: null, error: { code: '42P01', message: 'relation "creative_assets" does not exist' } },
    });

    await expect(
      requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'x' }, { ...passthroughDeps, generateAssetFn, runQualityGateFn })
    ).rejects.toThrow(CreativeAssetsTableNotLiveError);
  });

  it('propagates a non-42P01 DB error as-is (a real write failure, not the table-not-live case)', async () => {
    const generateAssetFn = vi.fn().mockResolvedValue({ asset: {}, provenance: { generator: 'gemini' }, cost: 0 });
    const runQualityGateFn = vi.fn().mockReturnValue({ pass: true, stages: {} });
    const { supabase } = makeSupabaseMock({
      insertResult: { data: null, error: { code: '23514', message: 'check constraint violation' } },
    });

    let thrown;
    try {
      await requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'x' }, { ...passthroughDeps, generateAssetFn, runQualityGateFn });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown).not.toBeInstanceOf(CreativeAssetsTableNotLiveError);
    expect(thrown.code).toBe('23514');
  });
});
