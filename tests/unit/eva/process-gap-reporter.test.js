/**
 * Unit tests for process-gap-reporter.mjs
 * SD: SD-LEO-INFRA-VISION-PROCESS-GAP-FEEDBACK-001
 *
 * Covers:
 *   US-001: classifyGap() distinguishes process_gap vs dimension_gap
 *   US-003: syncProcessGaps() is a named export callable by the scheduler
 */

import { describe, it, expect, vi } from 'vitest';
import { classifyGap, syncProcessGaps } from '../../../scripts/eva/process-gap-reporter.mjs';

// ── US-001: classifyGap ──────────────────────────────────────────────────────

describe('classifyGap (US-001)', () => {
  it('returns dimension_gap for non-process dimension names', () => {
    const result = classifyGap({ name: 'V01', score: 30 });
    expect(result.type).toBe('dimension_gap');
  });

  it('returns process_gap for dimension containing "gate"', () => {
    const result = classifyGap({ name: 'gate_enforcement', score: 30 });
    expect(result.type).toBe('process_gap');
    expect(result.reason).toContain('gate');
  });

  it('returns process_gap for dimension containing "escalation"', () => {
    const result = classifyGap({ name: 'decision_escalation_path', score: 25 });
    expect(result.type).toBe('process_gap');
  });

  it('returns process_gap for dimension containing "dashboard"', () => {
    const result = classifyGap({ name: 'chairman_dashboard', score: 45 });
    expect(result.type).toBe('process_gap');
  });

  it('returns process_gap for dimension containing "enforcement"', () => {
    const result = classifyGap({ name: 'V03_enforcement_score', score: 42 });
    expect(result.type).toBe('process_gap');
  });

  it('is case-insensitive for keyword matching', () => {
    const result = classifyGap({ name: 'GATE_SCORING', score: 35 });
    expect(result.type).toBe('process_gap');
  });

  it('is deterministic (same input = same output)', () => {
    const r1 = classifyGap({ name: 'V01', score: 30 });
    const r2 = classifyGap({ name: 'V01', score: 30 });
    expect(r1).toEqual(r2);
  });

  it('handles empty name gracefully', () => {
    const result = classifyGap({ name: '', score: 20 });
    expect(result.type).toBe('dimension_gap');
  });

  it('returns reason string in all cases', () => {
    const r1 = classifyGap({ name: 'V01', score: 30 });
    const r2 = classifyGap({ name: 'gate', score: 30 });
    expect(typeof r1.reason).toBe('string');
    expect(typeof r2.reason).toBe('string');
  });
});

// ── US-003: syncProcessGaps is a named export ────────────────────────────────

describe('syncProcessGaps (US-003)', () => {
  it('is exported as a named function', () => {
    expect(typeof syncProcessGaps).toBe('function');
  });

  it('accepts (supabase, options) signature', async () => {
    // Minimal mock that returns no scores
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const mockSupabase = { from: vi.fn().mockReturnValue(mockChain) };

    const result = await syncProcessGaps(mockSupabase, { dryRun: true, lookbackDays: 7 });
    expect(result).toHaveProperty('gapsFound');
    expect(typeof result.gapsFound).toBe('number');
  });

  it('returns 0 gaps when no scores available', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const mockSupabase = { from: vi.fn().mockReturnValue(mockChain) };

    const result = await syncProcessGaps(mockSupabase);
    expect(result.gapsFound).toBe(0);
  });
});
