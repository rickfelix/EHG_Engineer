/**
 * SD-LEO-FEAT-VISION-SCORER-NEVER-001 — the GATE_VISION_SCORE gate must AUTO-RUN the scorer
 * (bounded + awaited) for an unscored SD instead of blocking forever and telling a human to run
 * the scorer by hand. Fail-OPEN: on timeout/error the auto-score returns null and the gate falls
 * through to its existing hard block (no protection removed). Fakes only — zero DB / LLM.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  autoScoreUnscoredSD,
  validateVisionScore,
} from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js';

// Minimal supabase stub: eva_vision_scores fallback returns empty; audit-log insert is swallowed.
function stubSupabase() {
  return {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        insert() { return Promise.resolve({ data: null, error: null }); },
        update() { return chain; },
      };
      return chain;
    },
  };
}

describe('autoScoreUnscoredSD', () => {
  it('returns the score record when the injected scorer succeeds', async () => {
    const scoreSD = vi.fn().mockResolvedValue({ total_score: 88, threshold_action: 'accept', dimension_scores: { a: { score: 90 } } });
    const r = await autoScoreUnscoredSD('SD-X-001', stubSupabase(), { scoreSD });
    expect(r).toMatchObject({ total_score: 88, threshold_action: 'accept' });
    expect(scoreSD).toHaveBeenCalledWith(expect.objectContaining({ sdKey: 'SD-X-001' }));
  });

  it('returns null (fail-open) when the scorer REJECTS', async () => {
    const scoreSD = vi.fn().mockRejectedValue(new Error('no LLM key'));
    expect(await autoScoreUnscoredSD('SD-X-001', stubSupabase(), { scoreSD })).toBeNull();
  });

  it('returns null (fail-open) when the scorer exceeds the bounded timeout', async () => {
    const scoreSD = vi.fn(() => new Promise((res) => setTimeout(() => res({ total_score: 99 }), 50)));
    expect(await autoScoreUnscoredSD('SD-X-001', stubSupabase(), { scoreSD, timeoutMs: 5 })).toBeNull();
  });

  it('returns null when the scorer resolves without a numeric total_score', async () => {
    const scoreSD = vi.fn().mockResolvedValue({ summary: 'oops' });
    expect(await autoScoreUnscoredSD('SD-X-001', stubSupabase(), { scoreSD })).toBeNull();
  });

  it('returns null for a missing sdKey or supabase', async () => {
    expect(await autoScoreUnscoredSD(null, stubSupabase(), { scoreSD: vi.fn() })).toBeNull();
    expect(await autoScoreUnscoredSD('SD-X', null, { scoreSD: vi.fn() })).toBeNull();
  });
});

describe('validateVisionScore — auto-scores an unscored SD instead of blocking', () => {
  const baseSd = { sd_key: 'SD-FEAT-001', sd_type: 'infrastructure', vision_score: null, metadata: {} };

  it('PASSES when the auto-score returns a score above threshold (was: hard block)', async () => {
    // infrastructure threshold = 80; auto-score 92 → pass.
    const scoreSD = vi.fn().mockResolvedValue({ total_score: 92, threshold_action: 'accept', dimension_scores: null });
    const res = await validateVisionScore({ ...baseSd }, stubSupabase(), { scoreSD });
    expect(scoreSD).toHaveBeenCalledTimes(1);
    expect(res.passed).toBe(true);
  });

  it('still HARD-BLOCKS (fail-open) when the auto-score cannot complete', async () => {
    const scoreSD = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    const res = await validateVisionScore({ ...baseSd }, stubSupabase(), { scoreSD });
    expect(scoreSD).toHaveBeenCalledTimes(1);
    expect(res.passed).toBe(false);
    expect(res.remediation).toContain('vision-scorer.js');
  });

  it('does NOT auto-score an SD that already has a cached vision_score', async () => {
    const scoreSD = vi.fn();
    const res = await validateVisionScore({ ...baseSd, vision_score: 85 }, stubSupabase(), { scoreSD });
    expect(scoreSD).not.toHaveBeenCalled();
    expect(res.passed).toBe(true);
  });

  it('does NOT auto-score an orchestrator child (exempt, returns before scoring)', async () => {
    const scoreSD = vi.fn();
    const res = await validateVisionScore(
      { ...baseSd, metadata: { parent_orchestrator: 'SD-PARENT-001' } }, stubSupabase(), { scoreSD });
    expect(scoreSD).not.toHaveBeenCalled();
    expect(res.passed).toBe(true);
  });
});
