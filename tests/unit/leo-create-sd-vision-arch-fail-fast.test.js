/**
 * Tests for QF-20260509-171 (closes feedback 92ff36a1).
 *
 * Verifies that scripts/leo-create-sd.js
 *   1. enrichFromVisionArch returns {enriched, missing} where missing.{vision,arch}
 *      flags are set true when a supplied key resolves to no row.
 *   2. The /leo create direct-args caller refuses INSERT (process.exit non-zero
 *      with diagnostic) when missing.vision or missing.arch is true. Pinned via
 *      source-text guard since the caller path uses process.exit which is hard
 *      to assert behaviorally without spawning a child process.
 *
 * Background — feedback 92ff36a1 (2026-04-27): leo-create-sd produced
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001 with metadata.vision_key=
 * VISION-EVA-SUPPORT-CLI-L2-001 and metadata.arch_key=ARCH-EVA-SUPPORT-CLI-001
 * even though those keys had no row in eva_vision_documents /
 * eva_architecture_plans. LEAD evaluation could not trace strategic provenance
 * because the metadata FK-by-string was an orphan.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Mock the supabase client so importing leo-create-sd.js doesn't try to
// connect at module load (mirrors leo-create-sd-plan-dup-guard.test.js).
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: vi.fn() }),
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');

/**
 * Minimal mock Supabase chain for enrichFromVisionArch.
 * Allows preconfiguring per-table responses to .maybeSingle().
 */
function mkMockSb({ visionRow, archRow }) {
  return {
    from(table) {
      const data =
        table === 'eva_vision_documents' ? visionRow :
        table === 'eva_architecture_plans' ? archRow :
        null;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data, error: null }),
          }),
        }),
      };
    },
  };
}

describe('enrichFromVisionArch — return shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns {enriched: null, missing: {vision: false, arch: false}} when no keys supplied', async () => {
    const { enrichFromVisionArch } = await import('../../scripts/leo-create-sd.js');
    const sb = mkMockSb({});
    const result = await enrichFromVisionArch(null, null, sb);
    expect(result).toEqual({ enriched: null, missing: { vision: false, arch: false } });
  });

  it('flags missing.vision=true when --vision-key resolves to no row', async () => {
    const { enrichFromVisionArch } = await import('../../scripts/leo-create-sd.js');
    const sb = mkMockSb({ visionRow: null });
    const result = await enrichFromVisionArch('VISION-DOES-NOT-EXIST-001', null, sb);
    expect(result.missing.vision).toBe(true);
    expect(result.missing.arch).toBe(false);
    expect(result.enriched).toBeNull();
  });

  it('flags missing.arch=true when --arch-key resolves to no row', async () => {
    const { enrichFromVisionArch } = await import('../../scripts/leo-create-sd.js');
    const sb = mkMockSb({ archRow: null });
    const result = await enrichFromVisionArch(null, 'ARCH-DOES-NOT-EXIST-001', sb);
    expect(result.missing.arch).toBe(true);
    expect(result.missing.vision).toBe(false);
    expect(result.enriched).toBeNull();
  });

  it('flags both missing when both keys resolve to no row', async () => {
    const { enrichFromVisionArch } = await import('../../scripts/leo-create-sd.js');
    const sb = mkMockSb({ visionRow: null, archRow: null });
    const result = await enrichFromVisionArch('V-NONE', 'A-NONE', sb);
    expect(result.missing).toEqual({ vision: true, arch: true });
    expect(result.enriched).toBeNull();
  });

  it('returns enriched fields and missing.{vision,arch}=false when keys resolve', async () => {
    const { enrichFromVisionArch } = await import('../../scripts/leo-create-sd.js');
    const sb = mkMockSb({
      visionRow: {
        sections: {
          executive_summary: 'A solid summary.',
          problem_statement: 'A clear problem.',
          success_criteria: ['Ship it', 'Measure it'],
        },
      },
      archRow: {
        sections: {
          implementation_phases: ['Phase 1', 'Phase 2'],
        },
      },
    });
    const result = await enrichFromVisionArch('VISION-OK', 'ARCH-OK', sb);
    expect(result.missing).toEqual({ vision: false, arch: false });
    expect(result.enriched).not.toBeNull();
    expect(result.enriched.description).toBe('A solid summary.');
    expect(result.enriched.rationale).toBe('A clear problem.');
    expect(result.enriched.scope).toContain('Phase 1');
  });
});

// Static guard: pin the fail-fast block at the direct-args caller so a future
// refactor of the async caller doesn't quietly drop the orphan check.
describe('QF-20260509-171: direct-args caller fail-fast on unresolved key', () => {
  it('leo-create-sd.js direct-args path refuses INSERT when missing.vision is true', () => {
    const src = readFileSync(resolve(repoRoot, 'scripts', 'leo-create-sd.js'), 'utf8');
    expect(src).toMatch(/enrichResult\.missing\.vision/);
    expect(src).toMatch(/--vision-key.*not found in eva_vision_documents/);
  });

  it('leo-create-sd.js direct-args path refuses INSERT when missing.arch is true', () => {
    const src = readFileSync(resolve(repoRoot, 'scripts', 'leo-create-sd.js'), 'utf8');
    expect(src).toMatch(/enrichResult\.missing\.arch/);
    expect(src).toMatch(/--arch-key.*not found in eva_architecture_plans/);
  });
});
