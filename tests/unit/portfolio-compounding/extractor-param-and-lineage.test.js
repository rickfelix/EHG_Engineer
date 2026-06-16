/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-4) — template-extractor gate parameterization
 * (backward-compatible default) + venture lineage write path (pure + fixture).
 */
import { describe, it, expect } from 'vitest';
import { resolveMinExtractStage, DEFAULT_MIN_EXTRACT_STAGE } from '../../../lib/eva/template-extractor.js';
import { buildLineagePatch, writeVentureLineage, LINEAGE_COLUMNS } from '../../../lib/governance/venture-lineage.js';

describe('resolveMinExtractStage — parameterized, default preserves prior behavior', () => {
  it('defaults to 26 (prior hard-coded value) when nothing is set', () => {
    expect(DEFAULT_MIN_EXTRACT_STAGE).toBe(26);
    expect(resolveMinExtractStage({}, {})).toBe(26);
  });
  it('honors opts.minStage, then env, in precedence order', () => {
    expect(resolveMinExtractStage({ minStage: 20 }, {})).toBe(20);
    expect(resolveMinExtractStage({}, { LEO_TEMPLATE_EXTRACT_MIN_STAGE: '18' })).toBe(18);
    expect(resolveMinExtractStage({ minStage: 22 }, { LEO_TEMPLATE_EXTRACT_MIN_STAGE: '5' })).toBe(22);
  });
  it('falls back to default on invalid / out-of-range overrides (no silent gate-disable)', () => {
    for (const bad of ['abc', '0', '99', '-3', '']) {
      expect(resolveMinExtractStage({}, { LEO_TEMPLATE_EXTRACT_MIN_STAGE: bad })).toBe(26);
    }
  });
});

describe('buildLineagePatch — pure, sanitized, no-clobber by default', () => {
  const UUID = '11111111-2222-4333-8444-555555555555';
  it('accepts only the 3 known uuid columns with valid uuid values', () => {
    const { patch, applied, rejected } = buildLineagePatch({}, { source_blueprint_id: UUID, vision_id: 'not-a-uuid', foo: UUID });
    expect(applied).toEqual(['source_blueprint_id']);
    expect(patch).toEqual({ source_blueprint_id: UUID });
    expect(rejected.find((r) => r.col === 'vision_id').reason).toBe('not_a_uuid');
    expect(LINEAGE_COLUMNS).toContain('architecture_plan_id');
  });
  it('does not clobber already-set columns unless overwrite=true', () => {
    const cur = { source_blueprint_id: UUID };
    expect(buildLineagePatch(cur, { source_blueprint_id: UUID }).applied).toEqual([]);
    expect(buildLineagePatch(cur, { source_blueprint_id: UUID }, { overwrite: true }).applied).toEqual(['source_blueprint_id']);
  });
});

describe('writeVentureLineage — IO wrapper', () => {
  const UUID = '11111111-2222-4333-8444-555555555555';
  it('is a no-op success when nothing derivable (dormant)', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {}, error: null }) }) }) }) };
    const r = await writeVentureLineage(supabase, 'v-1', {});
    expect(r).toMatchObject({ success: true, applied: [], noop: true });
  });
  it('applies a valid patch', async () => {
    let updated = null;
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: {}, error: null }) }) }),
        update: (patch) => ({ eq: async () => { updated = patch; return { error: null }; } }),
      }),
    };
    const r = await writeVentureLineage(supabase, 'v-1', { vision_id: UUID });
    expect(r.success).toBe(true);
    expect(r.applied).toEqual(['vision_id']);
    expect(updated).toEqual({ vision_id: UUID });
  });
});
