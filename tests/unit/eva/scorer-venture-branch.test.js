/**
 * Tests for scripts/eva/vision-evidence-scorer.js — venture/EHG branch.
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-1 / TS-12, TS-13, TS-14).
 */
import { describe, it, expect, vi } from 'vitest';
import { isEhgVisionKey, selectRubricMap } from '../../../scripts/eva/vision-evidence-scorer.js';

const fakeSupabase = {}; // selectRubricMap never touches it directly — only the injected deps do.
const fakeVision = { extracted_dimensions: [{ name: 'd1' }], content_hash: 'vhash1' };
const fakeArch = { extracted_dimensions: [{ name: 'a1' }], content_hash: 'phash1' };

describe('isEhgVisionKey', () => {
  it('accepts VISION-EHG-L1-001', () => {
    expect(isEhgVisionKey('VISION-EHG-L1-001')).toBe(true);
  });
  it('accepts VISION-EHG_FOO (underscore variant)', () => {
    expect(isEhgVisionKey('VISION-EHG_FOO')).toBe(true);
  });
  it('accepts case-insensitive vision-ehg-l1-001', () => {
    expect(isEhgVisionKey('vision-ehg-l1-001')).toBe(true);
  });
  it('rejects VISION-CRONGENIUS-API-L2-001', () => {
    expect(isEhgVisionKey('VISION-CRONGENIUS-API-L2-001')).toBe(false);
  });
  it('rejects undefined / non-string', () => {
    expect(isEhgVisionKey(undefined)).toBe(false);
    expect(isEhgVisionKey(null)).toBe(false);
    expect(isEhgVisionKey(123)).toBe(false);
  });
});

describe('selectRubricMap', () => {
  it('TS-12: EHG vision-key triggers loadAllRubrics; never calls cache/generator', async () => {
    const ehgMap = new Map([['V01', { id: 'V01' }]]);
    const deps = {
      loadAllRubrics: vi.fn().mockResolvedValue(ehgMap),
      computeCacheKey: vi.fn(),
      getCachedRubrics: vi.fn(),
      setCachedRubrics: vi.fn(),
      generateVentureRubrics: vi.fn(),
    };
    const { rubrics, source } = await selectRubricMap({
      visionKey: 'VISION-EHG-L1-001',
      planKey: 'ARCH-EHG-L1-001',
      vision: fakeVision, arch: fakeArch, supabase: fakeSupabase, targetPath: '/x',
      deps,
    });
    expect(rubrics).toBe(ehgMap);
    expect(source).toContain('EHG');
    expect(deps.loadAllRubrics).toHaveBeenCalledTimes(1);
    expect(deps.computeCacheKey).not.toHaveBeenCalled();
    expect(deps.getCachedRubrics).not.toHaveBeenCalled();
    expect(deps.generateVentureRubrics).not.toHaveBeenCalled();
    expect(deps.setCachedRubrics).not.toHaveBeenCalled();
  });

  it('TS-13: venture vision-key with cache HIT uses cached map; skips generator + setCachedRubrics', async () => {
    const cachedMap = new Map([['V01', { id: 'V01', name: 'cached' }]]);
    const deps = {
      loadAllRubrics: vi.fn(),
      computeCacheKey: vi.fn().mockReturnValue('cachekey_abcdef'),
      getCachedRubrics: vi.fn().mockResolvedValue(cachedMap),
      setCachedRubrics: vi.fn(),
      generateVentureRubrics: vi.fn(),
    };
    const { rubrics, source } = await selectRubricMap({
      visionKey: 'VISION-CRONGENIUS-API-L2-001',
      planKey: 'ARCH-CRONGENIUS-001',
      vision: fakeVision, arch: fakeArch, supabase: fakeSupabase, targetPath: '/venture',
      deps,
    });
    expect(rubrics).toBe(cachedMap);
    expect(source).toContain('cache');
    expect(deps.computeCacheKey).toHaveBeenCalledWith({
      vision_key: 'VISION-CRONGENIUS-API-L2-001',
      plan_key: 'ARCH-CRONGENIUS-001',
      vision_content_hash: 'vhash1',
      plan_content_hash: 'phash1',
    });
    expect(deps.getCachedRubrics).toHaveBeenCalledTimes(1);
    expect(deps.loadAllRubrics).not.toHaveBeenCalled();
    expect(deps.generateVentureRubrics).not.toHaveBeenCalled();
    expect(deps.setCachedRubrics).not.toHaveBeenCalled();
  });

  it('TS-14: venture vision-key with cache MISS generates + persists; subsequent caller hits cache', async () => {
    let stored = null;
    const genMap = new Map([['V01', { id: 'V01', name: 'generated' }]]);
    const deps = {
      loadAllRubrics: vi.fn(),
      computeCacheKey: vi.fn().mockReturnValue('cachekey_xyz'),
      getCachedRubrics: vi.fn().mockImplementation(async () => stored),
      setCachedRubrics: vi.fn().mockImplementation(async (sb, key, rubrics) => { stored = rubrics; }),
      generateVentureRubrics: vi.fn().mockResolvedValue({ rubrics: genMap, meta: { generator_model: 'mock-llm' } }),
    };
    const first = await selectRubricMap({
      visionKey: 'VISION-CRONGENIUS-API-L2-001',
      planKey: 'ARCH-CRONGENIUS-001',
      vision: fakeVision, arch: fakeArch, supabase: fakeSupabase, targetPath: '/venture',
      deps,
    });
    expect(first.rubrics).toBe(genMap);
    expect(first.source).toContain('Generated');
    expect(first.source).toContain('mock-llm');
    expect(deps.generateVentureRubrics).toHaveBeenCalledTimes(1);
    expect(deps.setCachedRubrics).toHaveBeenCalledTimes(1);
    expect(deps.loadAllRubrics).not.toHaveBeenCalled();

    // Second call hits the (mock) cache via stored
    const second = await selectRubricMap({
      visionKey: 'VISION-CRONGENIUS-API-L2-001',
      planKey: 'ARCH-CRONGENIUS-001',
      vision: fakeVision, arch: fakeArch, supabase: fakeSupabase, targetPath: '/venture',
      deps,
    });
    expect(second.rubrics).toBe(genMap);
    expect(deps.generateVentureRubrics).toHaveBeenCalledTimes(1); // not called again
    expect(deps.setCachedRubrics).toHaveBeenCalledTimes(1); // not called again
  });
});
