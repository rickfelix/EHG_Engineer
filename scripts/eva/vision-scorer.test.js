import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  resolveDefaultKeysFromSD,
  tierKeysFromSDKey,
  DEFAULT_VISION_KEY,
  DEFAULT_ARCH_KEY,
  _emitQualityCheckWarningIfNeeded,
} from './vision-scorer.js';

function fakeSupabase(row) {
  return {
    from() { return this; },
    select() { return this; },
    or() { return this; },
    maybeSingle: async () => ({ data: row, error: null })
  };
}

describe('resolveDefaultKeysFromSD', () => {
  it('returns nulls when sdKey is empty', async () => {
    const result = await resolveDefaultKeysFromSD(null, null);
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('returns nulls when SD has no metadata and no tier suffix', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('returns vision_key + arch_key from SD metadata (metadata wins)', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' });
  });

  it('returns nulls when row not found and no tier suffix', async () => {
    const supabase = fakeSupabase(null);
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-MISSING');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('exports L1 fallback constants', () => {
    expect(DEFAULT_VISION_KEY).toBe('VISION-EHG-L1-001');
    expect(DEFAULT_ARCH_KEY).toBe('ARCH-EHG-L1-001');
  });

  it('returns vision_key only when arch_key missing in metadata (metadata wins, no suffix fallback)', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: null });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetection (TS-4)
  it('falls back to suffix-derived L2 keys when metadata is null and sd_key matches /-L2-/', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-VISION-S17-SIMPLIFY-L2-001');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L2-001', arch_key: 'ARCH-EHG-L2-001' });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetection — L1 + L3
  it('falls back to suffix-derived L1 keys', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L1-001');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L1-001', arch_key: 'ARCH-EHG-L1-001' });
  });

  it('falls back to suffix-derived L3 keys', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L3-007');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L3-001', arch_key: 'ARCH-EHG-L3-001' });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetect MISS (TS-5)
  it('returns nulls when sd_key has no tier suffix', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-LEO-INFRA-FOO-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('does not match unrelated L4-L9 substrings', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L4-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('does not match without hyphen guards (e.g. L2 inside word)', async () => {
    const supabase = fakeSupabase({ metadata: null });
    // 'SD-XL2X-001' contains 'L2' but not bounded by hyphens — must NOT match
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-XL2X-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });
});

describe('tierKeysFromSDKey', () => {
  it('returns nulls for empty input', () => {
    expect(tierKeysFromSDKey('')).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey(null)).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey(undefined)).toEqual({ vision_key: null, arch_key: null, tier: null });
  });

  it('extracts L1 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-A-L1-001')).toEqual({
      vision_key: 'VISION-EHG-L1-001',
      arch_key: 'ARCH-EHG-L1-001',
      tier: 'L1'
    });
  });

  it('extracts L2 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-VISION-S17-SIMPLIFY-L2-001')).toEqual({
      vision_key: 'VISION-EHG-L2-001',
      arch_key: 'ARCH-EHG-L2-001',
      tier: 'L2'
    });
  });

  it('extracts L3 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-A-L3-042')).toEqual({
      vision_key: 'VISION-EHG-L3-001',
      arch_key: 'ARCH-EHG-L3-001',
      tier: 'L3'
    });
  });

  it('returns nulls when no tier suffix matches', () => {
    expect(tierKeysFromSDKey('SD-LEO-INFRA-FOO-001')).toEqual({
      vision_key: null,
      arch_key: null,
      tier: null
    });
  });

  it('rejects non-string input gracefully', () => {
    expect(tierKeysFromSDKey(42)).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey({})).toEqual({ vision_key: null, arch_key: null, tier: null });
  });
});

// SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001 (Option A NARROWED) — quality_checked
// wiring tests. Static-guard tests pin the SELECT projection literal in the
// source file (FR-1, FR-2). Behavior tests cover the warn helper directly
// (FR-3, FR-4) without spinning up the full scoreSD pipeline.

describe('SELECT projection regression-pin (FR-1, FR-2)', () => {
  const SCORER_SOURCE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'vision-scorer.js'),
    'utf8'
  );

  it('loadVisionDimensions SELECT includes quality_checked', () => {
    // Pin the eva_vision_documents .select() projection so a future refactor
    // cannot silently drop quality_checked observability.
    const visionSelectMatch = SCORER_SOURCE.match(
      /\.from\(['"]eva_vision_documents['"]\)[\s\S]*?\.select\(['"]([^'"]+)['"]\)/
    );
    expect(visionSelectMatch, 'eva_vision_documents .select() projection').not.toBeNull();
    expect(visionSelectMatch[1]).toContain('quality_checked');
    expect(visionSelectMatch[1]).toContain('quality_issues');
  });

  it('loadArchDimensions SELECT includes quality_checked', () => {
    // Symmetric pin for the eva_architecture_plans .select() projection.
    const archSelectMatch = SCORER_SOURCE.match(
      /\.from\(['"]eva_architecture_plans['"]\)[\s\S]*?\.select\(['"]([^'"]+)['"]\)/
    );
    expect(archSelectMatch, 'eva_architecture_plans .select() projection').not.toBeNull();
    expect(archSelectMatch[1]).toContain('quality_checked');
    expect(archSelectMatch[1]).toContain('quality_issues');
  });
});

describe('_emitQualityCheckWarningIfNeeded (FR-3, FR-4)', () => {
  function makeLogger() {
    return { warn: vi.fn() };
  }

  it('does NOT warn when both qc=true (FR-4)', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-X', true, true, logger);
    expect(emitted).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns once when vision qc=false, arch qc=true (FR-3)', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-X', false, true, logger);
    expect(emitted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const msg = logger.warn.mock.calls[0][0];
    expect(msg).toContain('[VisionScorer][QC-WARN]');
    expect(msg).toContain('sd_key=SD-X');
    expect(msg).toContain('vision_qc=false');
    expect(msg).toContain('arch_qc=true');
  });

  it('warns once when arch qc=false, vision qc=true', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-Y', true, false, logger);
    expect(emitted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('vision_qc=true');
    expect(logger.warn.mock.calls[0][0]).toContain('arch_qc=false');
  });

  it('warns ONCE (not twice) when both qc=false (FR-3 dedup)', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-Z', false, false, logger);
    expect(emitted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does NOT warn when qc is null/undefined (unknown is not actionable)', () => {
    const logger = makeLogger();
    expect(_emitQualityCheckWarningIfNeeded('SD-Q', null, null, logger)).toBe(false);
    expect(_emitQualityCheckWarningIfNeeded('SD-Q', undefined, undefined, logger)).toBe(false);
    expect(_emitQualityCheckWarningIfNeeded('SD-Q', null, true, logger)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back sd_key="unknown" when sdKey is empty string or null', () => {
    const logger = makeLogger();
    _emitQualityCheckWarningIfNeeded('', false, true, logger);
    _emitQualityCheckWarningIfNeeded(null, false, true, logger);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls[0][0]).toContain('sd_key=unknown');
    expect(logger.warn.mock.calls[1][0]).toContain('sd_key=unknown');
  });
});
