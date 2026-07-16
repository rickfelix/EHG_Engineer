/**
 * Unit Tests: GATE_VISION_SCORE determinism + rich dimension_scores handling
 * QF-20260713-713 (retro f555deb9-1b91-4a3b-9888-b63a981d69e6, RCA feedback
 * 16560e8a-d929-4fb2-bb44-934277589020)
 *
 * Two bugs made the gate non-deterministic across consecutive runs:
 *  1. scoreSD() syncs only the SCALAR sd.vision_score back to the SD row, and
 *     the gate fetched eva_vision_scores dimension context ONLY when that
 *     scalar was null — so every post-first-run evaluation lost dimension
 *     context and a floor-rule/dynamic-threshold PASS flipped to a hard BLOCK.
 *  2. Addressability matching compared SD-type patterns against
 *     dimension_scores KEYS (opaque A01/V01 IDs) instead of each value's .name,
 *     and typeof === 'number' checks missed rich { name, score, ... } values.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateVisionScore,
} from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js';
import {
  getAddressableDimNames,
  countAddressableDimensions,
  dimScoreOf,
  dimNameOf,
} from '../../../lib/handoff/threshold-resolver.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Rich scorer shape: keyed by opaque IDs, values carry { name, score, ... }. */
const RICH_DIMS = {
  A01: { name: 'stateless_architecture', score: 80, weight: 0.1, source: 'architecture' },
  A02: { name: 'reliability_first', score: 80, weight: 0.1, source: 'architecture' },
  V01: { name: 'automation_by_default', score: 80, weight: 0.1, source: 'vision' },
  V02: { name: 'security_posture', score: 80, weight: 0.1, source: 'vision' },
  V03: { name: 'market_fit', score: 40, weight: 0.1, source: 'vision' },
  V04: { name: 'brand_presence', score: 40, weight: 0.1, source: 'vision' },
  V05: { name: 'customer_delight', score: 40, weight: 0.1, source: 'vision' },
  V06: { name: 'revenue_expansion', score: 40, weight: 0.1, source: 'vision' },
  V07: { name: 'community_growth', score: 40, weight: 0.1, source: 'vision' },
  V08: { name: 'partner_ecosystem', score: 40, weight: 0.1, source: 'vision' },
};

function makeSupabase(record) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: record ? [record] : [] }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

// ─── Resolver: rich-value addressability (bug 2) ─────────────────────────────

describe('threshold-resolver rich dimension_scores handling', () => {
  it('dimScoreOf extracts numbers from flat and rich values', () => {
    expect(dimScoreOf(85)).toBe(85);
    expect(dimScoreOf({ name: 'x', score: 42 })).toBe(42);
    expect(dimScoreOf({ name: 'x' })).toBeNull();
    expect(dimScoreOf(null)).toBeNull();
  });

  it('dimNameOf prefers .name on rich values, falls back to the key', () => {
    expect(dimNameOf('A01', { name: 'automation_by_default', score: 1 })).toBe('automation_by_default');
    expect(dimNameOf('reliability', 80)).toBe('reliability');
  });

  it('type-pattern matching works against rich values keyed by opaque IDs', () => {
    // infrastructure patterns include architecture/reliability/automation/security
    const keys = getAddressableDimNames('infrastructure', RICH_DIMS, null);
    expect(keys.sort()).toEqual(['A01', 'A02', 'V01', 'V02']);
    // Returned strings are KEYS so callers can index back into dimensionScores.
    expect(RICH_DIMS[keys[0]]).toBeDefined();
  });

  it('null-pattern carve-out auto-detects addressable dims from rich .score values', () => {
    const keys = getAddressableDimNames('feature', RICH_DIMS, null);
    // NARROW_FEATURE_DIM_FLOOR = 50 → only the four 80-scored dims qualify
    expect(keys.sort()).toEqual(['A01', 'A02', 'V01', 'V02']);
  });

  it('manual override patterns match rich value names', () => {
    const keys = getAddressableDimNames('feature', RICH_DIMS, { vision_addressable_dimensions: ['automation'] });
    expect(keys).toEqual(['V01']);
  });

  it('legacy flat { name: score } shape is unchanged', () => {
    const flat = { reliability: 80, market_fit: 40 };
    expect(getAddressableDimNames('bugfix', flat, null)).toEqual(['reliability']);
    expect(countAddressableDimensions('bugfix', flat, null)).toEqual({ addressable: 1, total: 2 });
  });
});

// ─── Gate: retry determinism (bug 1) ──────────────────────────────────────────

describe('validateVisionScore retry determinism (QF-20260713-713)', () => {
  const scoreRow = {
    total_score: 71,
    threshold_action: 'gap_closure_sd',
    dimension_scores: RICH_DIMS,
    scored_at: new Date().toISOString(),
  };

  it('first run (no cached scalar) passes via dynamic threshold narrowing', async () => {
    const supabase = makeSupabase(scoreRow);
    const sd = { sd_key: 'SD-TEST-DET-001', sd_type: 'infrastructure', vision_score: null };
    const result = await validateVisionScore(sd, supabase);
    // 4/10 addressable → threshold max(80*0.4, 80*0.6) = 48 → 71 passes
    expect(result.passed).toBe(true);
  });

  it('retry (cached scalar, no SD dimension column) re-fetches dimension context and returns the SAME verdict', async () => {
    const supabase = makeSupabase(scoreRow);
    // scoreSD() synced the scalar back; strategic_directives_v2 has no dimension_scores column.
    const sd = { sd_key: 'SD-TEST-DET-001', sd_type: 'infrastructure', vision_score: 71, vision_score_action: 'gap_closure_sd' };
    const result = await validateVisionScore(sd, supabase);
    // Pre-fix: dims stayed null → {0,0} addressable → threshold 80 → 71 hard-BLOCKED.
    expect(result.passed).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('eva_vision_scores');
  });

  it('cached scalar is NOT overwritten by the dimension-context fetch', async () => {
    const supabase = makeSupabase({ ...scoreRow, total_score: 5 });
    const sd = { sd_key: 'SD-TEST-DET-002', sd_type: 'infrastructure', vision_score: 71, vision_score_action: 'gap_closure_sd' };
    const result = await validateVisionScore(sd, supabase);
    // The fetch fills ONLY the missing dimension context; the cached 71 stands.
    expect(result.details).toContain('71/100');
  });

  it('rich low-scoring dimensions surface as named warnings on a pass', async () => {
    const supabase = makeSupabase(scoreRow);
    const sd = { sd_key: 'SD-TEST-DET-003', sd_type: 'infrastructure', vision_score: 71, vision_score_action: 'gap_closure_sd' };
    const result = await validateVisionScore(sd, supabase);
    expect(result.passed).toBe(true);
    // Pre-fix getDimensionWarnings silently muted rich values (typeof object).
    expect(result.warnings.some(w => w.includes('market_fit'))).toBe(true);
  });
});
