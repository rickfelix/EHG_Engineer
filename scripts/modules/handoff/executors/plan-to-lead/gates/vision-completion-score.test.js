/**
 * Tests for VISION_COMPLETION_SCORE's tolerated queries
 * (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2). This gate is documented as advisory-only —
 * it must keep passing (governed, not silent) even when its queries fail.
 */
import { describe, it, expect, vi } from 'vitest';
import { createVisionCompletionScoreGate } from './vision-completion-score.js';
import { createQueuedSupabaseMock } from '../../../../../../tests/factories/queued-supabase-mock.js';

const ctx = () => ({
  sd: { id: 'sd-1', sd_key: 'SD-1', metadata: { vision_key: 'VISION-1' } },
});

describe('VISION_COMPLETION_SCORE tolerated queries', () => {
  it('still passes (advisory) when the orchestrator-bypass query is broken', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const supabase = createQueuedSupabaseMock([
        { data: null, error: { message: 'timeout', code: '57014' } }, // childSDs query fails
        { data: [{ total_score: 80, dimension_scores: {}, scored_at: '2026-01-01' }], error: null }, // entryScores
        { data: [{ total_score: 82, dimension_scores: {}, scored_at: new Date().toISOString() }], error: null }, // recentScores (recent)
      ]);
      const gate = createVisionCompletionScoreGate(supabase);

      const result = await gate.validator(ctx());

      expect(result.passed).toBe(true);
      // The tolerated failure is GOVERNED — it is logged, not silent.
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[query-discipline] TOLERATED'));
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
