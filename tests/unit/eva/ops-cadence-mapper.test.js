/**
 * Tests for Ops Cadence Mapper
 * SD-MAN-ORCH-EVA-LIFECYCLE-COMPLETION-001-B
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getOpsCadenceDays,
  resolveOpsCadenceDays,
  getVentureHealthScore,
  _internal,
} from '../../../lib/eva/ops-cadence-mapper.js';

// ── US-001: getOpsCadenceDays ───────────────────────────────

describe('getOpsCadenceDays', () => {
  it('returns 7 (weekly) for critical health 0-25', () => {
    expect(getOpsCadenceDays(0)).toBe(7);
    expect(getOpsCadenceDays(10)).toBe(7);
    expect(getOpsCadenceDays(20)).toBe(7);
    expect(getOpsCadenceDays(25)).toBe(7);
  });

  it('returns 14 (biweekly) for health 26-50', () => {
    expect(getOpsCadenceDays(26)).toBe(14);
    expect(getOpsCadenceDays(35)).toBe(14);
    expect(getOpsCadenceDays(50)).toBe(14);
  });

  it('returns 30 (monthly) for health 51-75', () => {
    expect(getOpsCadenceDays(51)).toBe(30);
    expect(getOpsCadenceDays(60)).toBe(30);
    expect(getOpsCadenceDays(75)).toBe(30);
  });

  it('returns 90 (quarterly) for health 76-100', () => {
    expect(getOpsCadenceDays(76)).toBe(90);
    expect(getOpsCadenceDays(90)).toBe(90);
    expect(getOpsCadenceDays(100)).toBe(90);
  });

  it('returns 30 (monthly default) for null/undefined', () => {
    expect(getOpsCadenceDays(null)).toBe(30);
    expect(getOpsCadenceDays(undefined)).toBe(30);
  });

  it('returns 30 (monthly default) for NaN', () => {
    expect(getOpsCadenceDays(NaN)).toBe(30);
  });

  it('returns 30 (monthly default) for non-number types', () => {
    expect(getOpsCadenceDays('high')).toBe(30);
    expect(getOpsCadenceDays({})).toBe(30);
  });

  it('clamps values below 0 to tier 1 (weekly)', () => {
    expect(getOpsCadenceDays(-5)).toBe(7);
  });

  it('clamps values above 100 to tier 4 (quarterly)', () => {
    expect(getOpsCadenceDays(150)).toBe(90);
  });
});

// ── US-002: resolveOpsCadenceDays ───────────────────────────

describe('resolveOpsCadenceDays', () => {
  it('uses override when valid', () => {
    expect(resolveOpsCadenceDays({ ops_cadence_override: 'weekly' }, 90)).toBe(7);
    expect(resolveOpsCadenceDays({ ops_cadence_override: 'biweekly' }, 90)).toBe(14);
    expect(resolveOpsCadenceDays({ ops_cadence_override: 'monthly' }, 10)).toBe(30);
    expect(resolveOpsCadenceDays({ ops_cadence_override: 'quarterly' }, 10)).toBe(90);
  });

  it('ignores invalid override and falls back to health-based mapping', () => {
    expect(resolveOpsCadenceDays({ ops_cadence_override: 'invalid' }, 20)).toBe(7);
    expect(resolveOpsCadenceDays({ ops_cadence_override: 'daily' }, 90)).toBe(90);
  });

  it('falls back to health-based mapping when no override', () => {
    expect(resolveOpsCadenceDays({}, 20)).toBe(7);
    expect(resolveOpsCadenceDays({}, 90)).toBe(90);
  });

  it('handles null/undefined metadata', () => {
    expect(resolveOpsCadenceDays(null, 50)).toBe(14);
    expect(resolveOpsCadenceDays(undefined, 50)).toBe(14);
  });
});

// ── US-005: getVentureHealthScore ───────────────────────────

describe('getVentureHealthScore', () => {
  function createMockSupabase(data, error = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data, error }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
  }

  it('returns quality_score from most recent health_assessment', async () => {
    const supabase = createMockSupabase({ quality_score: 72 });
    const score = await getVentureHealthScore(supabase, 'venture-123');
    expect(score).toBe(72);
  });

  it('returns null when no health data exists', async () => {
    const supabase = createMockSupabase(null, { message: 'not found' });
    const score = await getVentureHealthScore(supabase, 'venture-123');
    expect(score).toBeNull();
  });

  it('returns null on database error without throwing', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('connection failed');
      }),
    };
    const score = await getVentureHealthScore(supabase, 'venture-123');
    expect(score).toBeNull();
  });

  it('returns null when quality_score is not a number', async () => {
    const supabase = createMockSupabase({ quality_score: 'high' });
    const score = await getVentureHealthScore(supabase, 'venture-123');
    expect(score).toBeNull();
  });
});
