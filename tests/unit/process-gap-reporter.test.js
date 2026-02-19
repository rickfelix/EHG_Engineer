/**
 * Unit Tests: Process Gap Reporter
 * Part of SD-LEO-INFRA-VISION-PROCESS-GAP-FEEDBACK-001
 *
 * Tests: classifyGap(), reportProcessGaps() with feedback/queue insertion,
 *        syncProcessGaps() alias, dry-run mode, graceful degradation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyGap, reportProcessGaps, syncProcessGaps } from '../../scripts/eva/process-gap-reporter.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScoreRow(sdId, dimensions, daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    sd_id: sdId,
    dimension_scores: dimensions.map(([name, score]) => ({ dimension: name, score })),
    scored_at: d.toISOString(),
  };
}

function makeMockSupabase({ scores = [], feedbackInsertFails = false, queueInsertFails = false } = {}) {
  const feedbackInsertSpy = vi.fn().mockReturnValue({
    select: () => ({ single: () => Promise.resolve(feedbackInsertFails ? { data: null, error: { message: 'insert failed' } } : { data: { id: 'fb-123' }, error: null }) }),
  });
  const queueInsertSpy = vi.fn().mockResolvedValue({ error: queueInsertFails ? { message: 'queue failed' } : null });

  const scoresQuery = {
    select: () => scoresQuery,
    gte: () => scoresQuery,
    not: () => Promise.resolve({ data: scores, error: null }),
  };

  const supabase = {
    from: (table) => {
      if (table === 'eva_vision_scores') return scoresQuery;
      if (table === 'feedback') return { insert: feedbackInsertSpy };
      if (table === 'protocol_improvement_queue') return { insert: queueInsertSpy };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    },
    _spies: { feedbackInsert: feedbackInsertSpy, queueInsert: queueInsertSpy },
  };
  return supabase;
}

// ─── classifyGap ──────────────────────────────────────────────────────────────

describe('classifyGap', () => {
  it('classifies dimension containing "gate" as process_gap', () => {
    const result = classifyGap({ name: 'gate_enforcement', score: 45 });
    expect(result.type).toBe('process_gap');
    expect(result.reason).toContain('gate');
  });

  it('classifies dimension containing "routing" as process_gap', () => {
    const result = classifyGap({ name: 'routing_clarity', score: 50 });
    expect(result.type).toBe('process_gap');
  });

  it('classifies dimension containing "escalation" as process_gap', () => {
    const result = classifyGap({ name: 'escalation_path', score: 55 });
    expect(result.type).toBe('process_gap');
  });

  it('classifies non-keyword dimension as dimension_gap', () => {
    const result = classifyGap({ name: 'technical_architecture', score: 40 });
    expect(result.type).toBe('dimension_gap');
    expect(result.reason).toContain('SD-specific');
  });

  it('classifies "alignment" dimension as dimension_gap (not a process keyword)', () => {
    const result = classifyGap({ name: 'vision_alignment', score: 45 });
    expect(result.type).toBe('dimension_gap');
  });

  it('is case-insensitive for keywords', () => {
    const result = classifyGap({ name: 'GOVERNANCE_enforcement', score: 50 });
    expect(result.type).toBe('process_gap');
  });

  it('handles empty name gracefully', () => {
    const result = classifyGap({ name: '', score: 30 });
    expect(result.type).toBe('dimension_gap'); // fallback
  });
});

// ─── reportProcessGaps ────────────────────────────────────────────────────────

describe('reportProcessGaps', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 0 gaps when no scores exist', async () => {
    const supabase = makeMockSupabase({ scores: [] });
    const result = await reportProcessGaps(supabase, { dryRun: true });
    expect(result.gapsFound).toBe(0);
    expect(result.eventsPublished).toBe(0);
  });

  it('detects a gap when dimension scores below threshold across 2+ SDs', async () => {
    const scores = [
      makeScoreRow('SD-A', [['gate_enforcement', 50], ['alignment', 85]]),
      makeScoreRow('SD-B', [['gate_enforcement', 45], ['alignment', 90]]),
    ];
    const supabase = makeMockSupabase({ scores });
    const result = await reportProcessGaps(supabase, { dryRun: true });
    expect(result.gapsFound).toBe(1); // gate_enforcement is below threshold
  });

  it('does NOT detect a gap when only 1 SD is affected', async () => {
    const scores = [
      makeScoreRow('SD-A', [['gate_enforcement', 40]]),
    ];
    const supabase = makeMockSupabase({ scores });
    const result = await reportProcessGaps(supabase, { dryRun: true });
    expect(result.gapsFound).toBe(0); // MIN_OCCURRENCES = 2
  });

  it('inserts to feedback and queue for process_gap dimensions (non-dry-run)', async () => {
    const scores = [
      makeScoreRow('SD-A', [['gate_enforcement', 45]]),
      makeScoreRow('SD-B', [['gate_enforcement', 50]]),
    ];
    const supabase = makeMockSupabase({ scores });
    await reportProcessGaps(supabase, { dryRun: false });
    expect(supabase._spies.feedbackInsert).toHaveBeenCalledOnce();
    expect(supabase._spies.queueInsert).toHaveBeenCalledOnce();
  });

  it('does NOT insert to feedback/queue for dimension_gap dimensions', async () => {
    const scores = [
      makeScoreRow('SD-A', [['technical_architecture', 40]]),
      makeScoreRow('SD-B', [['technical_architecture', 45]]),
    ];
    const supabase = makeMockSupabase({ scores });
    await reportProcessGaps(supabase, { dryRun: false });
    expect(supabase._spies.feedbackInsert).not.toHaveBeenCalled();
    expect(supabase._spies.queueInsert).not.toHaveBeenCalled();
  });

  it('skips feedback/queue insert in dry-run mode', async () => {
    const scores = [
      makeScoreRow('SD-A', [['governance_oversight', 40]]),
      makeScoreRow('SD-B', [['governance_oversight', 45]]),
    ];
    const supabase = makeMockSupabase({ scores });
    await reportProcessGaps(supabase, { dryRun: true });
    expect(supabase._spies.feedbackInsert).not.toHaveBeenCalled();
    expect(supabase._spies.queueInsert).not.toHaveBeenCalled();
  });

  it('continues if feedback insert fails (fail-safe)', async () => {
    const scores = [
      makeScoreRow('SD-A', [['gate_enforcement', 45]]),
      makeScoreRow('SD-B', [['gate_enforcement', 50]]),
    ];
    const supabase = makeMockSupabase({ scores, feedbackInsertFails: true });
    // Should not throw
    await expect(reportProcessGaps(supabase, { dryRun: false })).resolves.toBeDefined();
  });

  it('continues if queue insert fails (fail-safe)', async () => {
    const scores = [
      makeScoreRow('SD-A', [['gate_enforcement', 45]]),
      makeScoreRow('SD-B', [['gate_enforcement', 50]]),
    ];
    const supabase = makeMockSupabase({ scores, queueInsertFails: true });
    await expect(reportProcessGaps(supabase, { dryRun: false })).resolves.toBeDefined();
  });

  it('publishes event for both process_gap and dimension_gap', async () => {
    const scores = [
      makeScoreRow('SD-A', [['gate_enforcement', 45], ['alignment', 42]]),
      makeScoreRow('SD-B', [['gate_enforcement', 50], ['alignment', 40]]),
    ];
    const supabase = makeMockSupabase({ scores });
    const result = await reportProcessGaps(supabase, { dryRun: false });
    expect(result.eventsPublished).toBe(2); // both gaps get events
  });
});

// ─── syncProcessGaps (US-003) ─────────────────────────────────────────────────

describe('syncProcessGaps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is an alias for reportProcessGaps — same result', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = makeMockSupabase({ scores: [] });
    const result = await syncProcessGaps(supabase, { dryRun: true });
    expect(result).toEqual({ gapsFound: 0, eventsPublished: 0 });
  });
});
