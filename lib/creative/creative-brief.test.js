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

  it('propagates a non-42P01 DB error as-is, and best-effort removes the already-uploaded object (SEC-09 orphan fix)', async () => {
    const generateAssetFn = vi.fn().mockResolvedValue({ asset: {}, provenance: { generator: 'gemini' }, cost: 0 });
    const runQualityGateFn = vi.fn().mockReturnValue({ pass: true, stages: {} });
    const removeStorageObjectFn = vi.fn().mockResolvedValue({});
    const { supabase } = makeSupabaseMock({
      insertResult: { data: null, error: { code: '23514', message: 'check constraint violation' } },
    });

    let thrown;
    try {
      await requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'x' }, { ...passthroughDeps, generateAssetFn, runQualityGateFn, removeStorageObjectFn });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown).not.toBeInstanceOf(CreativeAssetsTableNotLiveError);
    expect(thrown.code).toBe('23514');
    expect(removeStorageObjectFn).toHaveBeenCalled();
  });

  it('a cleanup failure never masks the real DB error', async () => {
    const generateAssetFn = vi.fn().mockResolvedValue({ asset: {}, provenance: { generator: 'gemini' }, cost: 0 });
    const runQualityGateFn = vi.fn().mockReturnValue({ pass: true, stages: {} });
    const removeStorageObjectFn = vi.fn().mockRejectedValue(new Error('cleanup also failed'));
    const { supabase } = makeSupabaseMock({
      insertResult: { data: null, error: { code: '23514', message: 'check constraint violation' } },
    });
    await expect(
      requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'x' }, { ...passthroughDeps, generateAssetFn, runQualityGateFn, removeStorageObjectFn })
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('SECURITY correction (SEC-09): falls back to provenance.provider when .generator is absent (Runway shape)', async () => {
    const generateAssetFn = vi.fn().mockResolvedValue({
      asset: { kind: 'generated', url: 'https://dnznrvs05pmza.cloudfront.net/x.mp4' },
      provenance: { provider: 'runway', testMode: false, prompt: 'a clean product video' },
      cost: null,
    });
    const runQualityGateFn = vi.fn().mockReturnValue({ pass: true, stages: {} });
    const { supabase, insert } = makeSupabaseMock({
      insertResult: { data: { id: 'asset-2', capability: 'video', generator: 'runway' }, error: null },
    });

    await requestCreativeAsset(
      supabase,
      { ventureId: 'v1', capability: 'video', prompt: 'a clean product video' },
      { ...passthroughDeps, generateAssetFn, runQualityGateFn }
    );

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ generator: 'runway' }));
  });

  it('the default venture-existence resolver treats a malformed (non-UUID) ventureId as not-found, not a raw DB error', async () => {
    const generateAssetFn = vi.fn();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from };

    await expect(
      requestCreativeAsset(supabase, { ventureId: 'not-a-uuid', capability: 'image', prompt: 'x' }, { generateAssetFn })
    ).rejects.toThrow(VentureNotFoundError);
    expect(generateAssetFn).not.toHaveBeenCalled();
  });
});

describe('requestCreativeAsset — end-to-end wire test (real generateAsset + real quality gate + real storage)', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); });

  it('a real Gemini-shaped success flows through generation, the MVP quality gate, and private storage', async () => {
    const geminiProvider = {
      name: 'gemini',
      isConfigured: () => true,
      generate: vi.fn().mockResolvedValue({
        asset: { kind: 'generated', capability: 'image', raw: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('px').toString('base64'), mimeType: 'image/png' } }] } }] } },
        provenance: { generator: 'gemini', testMode: false, prompt: 'a mountain landscape' },
        cost: 0.01,
      }),
    };
    const uploadPrivateAndSignFn = vi.fn().mockResolvedValue({ path: 'v1/image-e2e', signedUrl: 'https://signed.example/x' });
    const getBucketFn = vi.fn().mockResolvedValue({ data: { public: false }, error: null });
    const { supabase, insert } = makeSupabaseMock({
      insertResult: { data: { id: 'asset-e2e', capability: 'image', generator: 'gemini' }, error: null },
    });

    const result = await requestCreativeAsset(
      supabase,
      { ventureId: 'v1', capability: 'image', prompt: 'a mountain landscape', brandSourceRefs: ['s17-1'] },
      { ventureExistsFn: vi.fn().mockResolvedValue(true), routes: { image: [geminiProvider] }, uploadPrivateAndSignFn, getBucketFn }
    );

    expect(result).toEqual({ id: 'asset-e2e', capability: 'image', generator: 'gemini' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ generator: 'gemini', storage_path: 'v1/image-e2e' }));
  });
});
