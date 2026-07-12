// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — creative-brief seam tests.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestCreativeAsset, CreativeAssetsTableNotLiveError, QualityGateRejectedError } from './creative-brief.js';

const ORIGINAL_ENV = { ...process.env };

function makeSupabaseMock({ insertResult }) {
  const single = vi.fn().mockResolvedValue(insertResult);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { supabase: { from }, from, insert, select, single };
}

describe('requestCreativeAsset', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); });

  it('rejects with QualityGateRejectedError and never writes when the gate fails (the real, currently-always-true case)', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;

    const { supabase, from } = makeSupabaseMock({ insertResult: { data: null, error: null } });

    await expect(
      requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'a hero image' })
    ).rejects.toThrow(QualityGateRejectedError);

    expect(from).not.toHaveBeenCalled(); // never persists a gate-rejected asset
  });

  it('persists via the injected gate/generate deps when the gate genuinely passes (proves the write path is correct, independent of FR-2s current fail-closed state)', async () => {
    const generateAssetFn = vi.fn().mockResolvedValue({
      asset: { kind: 'generated' },
      provenance: { generator: 'gemini', testMode: false },
      cost: 0.02,
    });
    const runQualityGateFn = vi.fn().mockReturnValue({ pass: true, stages: {} });
    const { supabase, from, insert, single } = makeSupabaseMock({
      insertResult: { data: { id: 'asset-1', capability: 'image', generator: 'gemini' }, error: null },
    });

    const result = await requestCreativeAsset(
      supabase,
      { ventureId: 'v1', capability: 'image', prompt: 'a hero image', brandSourceRefs: ['s17-1'] },
      { generateAssetFn, runQualityGateFn }
    );

    expect(result).toEqual({ id: 'asset-1', capability: 'image', generator: 'gemini' });
    expect(from).toHaveBeenCalledWith('creative_assets');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      venture_id: 'v1', capability: 'image', generator: 'gemini', cost: 0.02,
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
      requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'x' }, { generateAssetFn, runQualityGateFn })
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
      await requestCreativeAsset(supabase, { ventureId: 'v1', capability: 'image', prompt: 'x' }, { generateAssetFn, runQualityGateFn });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown).not.toBeInstanceOf(CreativeAssetsTableNotLiveError);
    expect(thrown.code).toBe('23514');
  });
});
